import { ActiveRepeatJob, TextMacroRepeatConfig } from '../types/studio';
import {
  buildFirmwareShortcut,
  formatTextRepeatSummary,
  sanitizeSerialString
} from '../data/firmwareCatalog';
import { usbHardware } from './usbHardwareService';

type JobListener = (job: ActiveRepeatJob | null) => void;

/**
 * Executes repeatable Text + Follow-up Button sequences with custom millisecond delays
 * over the live PadLink USB connection (`/api/test/action`).
 * - Supports finite repeat counts (1..999) and continuous Loop-until-stopped mode
 * - Avoids double-executing Iteration 1 when triggered by a physical pad press
 * - Cancels cleanly on Stop click, second physical press, or USB disconnect
 */
class RepeatMacroRunner {
  private currentJob: ActiveRepeatJob | null = null;
  private abortController: AbortController | null = null;
  private listeners = new Set<JobListener>();

  constructor() {
    usbHardware.onConnectionChange(info => {
      if (!info.connected && this.currentJob) {
        this.stop();
      }
    });
  }

  public get activeJob(): ActiveRepeatJob | null {
    return this.currentJob;
  }

  public onJobChange(fn: JobListener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    const snap = this.currentJob ? { ...this.currentJob } : null;
    this.listeners.forEach(fn => fn(snap));
  }

  public stop(): boolean {
    if (!this.abortController && !this.currentJob) return false;
    this.abortController?.abort();
    this.abortController = null;
    this.currentJob = null;
    this.emit();
    return true;
  }

  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error('aborted'));
        return;
      }
      const timer = window.setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        window.clearTimeout(timer);
        reject(new Error('aborted'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private async executeSingleCycle(
    cfg: TextMacroRepeatConfig,
    signal: AbortSignal
  ): Promise<void> {
    if (signal.aborted) throw new Error('aborted');

    const hasNativeEnter =
      cfg.text.length > 0 && cfg.followUpKey === 'enter' && cfg.keyDelayMs <= 0;
    const cleanText = sanitizeSerialString(cfg.text, hasNativeEnter ? 122 : 123);

    if (cleanText.length > 0) {
      if (hasNativeEnter) {
        await usbHardware.testAction(`TEXT:${cleanText}\n`);
        return;
      }
      await usbHardware.testAction(`TEXT:${cleanText}`);
      if (cfg.followUpKey) {
        if (cfg.keyDelayMs > 0) {
          await this.sleep(cfg.keyDelayMs, signal);
        }
        if (signal.aborted) throw new Error('aborted');
        await usbHardware.testAction(buildFirmwareShortcut([], cfg.followUpKey));
      }
      return;
    }

    if (cfg.followUpKey) {
      await usbHardware.testAction(buildFirmwareShortcut([], cfg.followUpKey));
    }
  }

  /**
   * Run all iterations `1..N` (or loop) when user clicks "Test on Pad" in the UI
   */
  public async runFromUiTest(cfg: TextMacroRepeatConfig): Promise<void> {
    if (!usbHardware.info.connected) {
      throw new Error('Connect MacroPad via USB to run macro sequences.');
    }

    this.stop();
    const ac = new AbortController();
    this.abortController = ac;

    const total = cfg.loopUntilStopped ? null : Math.max(1, Math.min(999, cfg.repeatCount || 1));
    const delayMs = Math.max(10, cfg.repeatDelayMs || 0);
    const label = formatTextRepeatSummary(cfg).fullLabel;

    this.currentJob = {
      id: `ui-${Date.now()}`,
      label,
      currentIteration: 1,
      totalIterations: total,
      delayMs
    };
    this.emit();

    try {
      let iter = 1;
      for (;;) {
        if (ac.signal.aborted) break;
        this.currentJob = {
          id: this.currentJob.id,
          label,
          currentIteration: iter,
          totalIterations: total,
          delayMs
        };
        this.emit();

        await this.executeSingleCycle(cfg, ac.signal);

        if (total !== null && iter >= total) {
          break;
        }
        await this.sleep(delayMs, ac.signal);
        iter++;
      }
    } catch (err: any) {
      if (err?.message !== 'aborted') {
        throw err;
      }
    } finally {
      if (this.abortController === ac) {
        this.abortController = null;
        this.currentJob = null;
        this.emit();
      }
    }
  }

  /**
   * Triggered when a physical key/dial press event arrives from the pad over USB.
   * - If the same slot is already repeating/looping, pressing it again stops it!
   * - Otherwise, completes any deferred follow-up key for Iteration 1 (since ESP32 already
   *   ran the base slot action once) and runs Iterations `2..N` (or loops) at `repeatDelayMs`.
   */
  public async handleHardwareSlotTrigger(
    slotKey: string,
    cfg: TextMacroRepeatConfig
  ): Promise<'stopped' | 'completed' | 'noop'> {
    if (!usbHardware.info.connected) return 'noop';

    // Pressing the same physical button again stops an active loop/repeat!
    if (this.currentJob && this.currentJob.slotKey === slotKey) {
      this.stop();
      return 'stopped';
    }

    const needsDeferredKeyForIter1 =
      cfg.text.length > 0 &&
      Boolean(cfg.followUpKey) &&
      (cfg.followUpKey !== 'enter' || cfg.keyDelayMs > 0);
    const total = cfg.loopUntilStopped ? null : Math.max(1, Math.min(999, cfg.repeatCount || 1));
    const hasMoreRepeats = total === null || total > 1;

    if (!needsDeferredKeyForIter1 && !hasMoreRepeats) {
      return 'noop';
    }

    this.stop();
    const ac = new AbortController();
    this.abortController = ac;

    const delayMs = Math.max(10, cfg.repeatDelayMs || 0);
    const label = formatTextRepeatSummary(cfg).fullLabel;

    this.currentJob = {
      id: `hw-${Date.now()}`,
      slotKey,
      label,
      currentIteration: 1,
      totalIterations: total,
      delayMs
    };
    this.emit();

    try {
      // Complete Iteration 1's follow-up key if it wasn't baked into `TEXT:...\n`
      if (needsDeferredKeyForIter1 && cfg.followUpKey) {
        if (cfg.keyDelayMs > 0) {
          await this.sleep(cfg.keyDelayMs, ac.signal);
        }
        if (!ac.signal.aborted) {
          await usbHardware.testAction(buildFirmwareShortcut([], cfg.followUpKey));
        }
      }

      if (!hasMoreRepeats) {
        return 'completed';
      }

      let iter = 2;
      for (;;) {
        await this.sleep(delayMs, ac.signal);
        if (ac.signal.aborted) break;

        this.currentJob = {
          id: this.currentJob.id,
          slotKey,
          label,
          currentIteration: iter,
          totalIterations: total,
          delayMs
        };
        this.emit();

        await this.executeSingleCycle(cfg, ac.signal);

        if (total !== null && iter >= total) {
          break;
        }
        iter++;
      }
      return 'completed';
    } catch {
      return 'stopped';
    } finally {
      if (this.abortController === ac) {
        this.abortController = null;
        this.currentJob = null;
        this.emit();
      }
    }
  }
}

export const repeatMacroRunner = new RepeatMacroRunner();
