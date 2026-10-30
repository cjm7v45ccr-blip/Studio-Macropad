import { ActiveRepeatJob, MacroStepConfig, TextMacroRepeatConfig } from '../types/studio';
import {
  buildFirmwareShortcut,
  compileMacroConfigForHardware,
  formatTextRepeatSummary,
  sanitizeSerialString,
  stepToFirmwareAction
} from '../data/firmwareCatalog';
import { usbHardware } from './usbHardwareService';

type JobListener = (job: ActiveRepeatJob | null) => void;

/**
 * Executes multi-step macro sequences and repeatable Text + Follow-up Button sequences
 * with custom millisecond delays over the live PadLink USB connection (or dry-run timing preview).
 * - Emits activeStepIndex & activeStepPhase ('action' | 'delay') for live timeline visualization
 * - Supports finite repeat counts (1..999) and continuous Loop-until-stopped mode
 * - Cancels cleanly on Stop click, second physical press, or USB disconnect
 */
class RepeatMacroRunner {
  private currentJob: ActiveRepeatJob | null = null;
  private abortController: AbortController | null = null;
  private listeners = new Set<JobListener>();

  constructor() {
    usbHardware.onConnectionChange(info => {
      if (!info.connected && this.currentJob && !this.currentJob.id.startsWith('sim-')) {
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

  private updateStepProgress(stepIndex?: number, phase?: 'action' | 'delay') {
    if (!this.currentJob) return;
    this.currentJob = {
      ...this.currentJob,
      activeStepIndex: stepIndex,
      activeStepPhase: phase
    };
    this.emit();
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

  private async executeStepList(
    steps: MacroStepConfig[],
    signal: AbortSignal,
    dryRun: boolean,
    skipFirstActionOnce = false
  ): Promise<void> {
    let skippedFirst = false;

    for (let idx = 0; idx < steps.length; idx++) {
      if (signal.aborted) throw new Error('aborted');
      const step = steps[idx];
      const stepRepeats = Math.max(1, Math.min(999, step.repeatCount || 1));
      const stepDelay = Math.max(0, step.delayMs || 0);
      const isLastStep = idx === steps.length - 1;

      if (step.actionType === 'delay') {
        const totalWait = stepDelay * stepRepeats;
        this.updateStepProgress(idx, 'delay');
        if (totalWait > 0) {
          await this.sleep(totalWait, signal);
        } else if (dryRun) {
          await this.sleep(120, signal);
        }
        continue;
      }

      const fwAction = stepToFirmwareAction(step);

      for (let sr = 0; sr < stepRepeats; sr++) {
        if (signal.aborted) throw new Error('aborted');
        this.updateStepProgress(idx, 'action');

        if (skipFirstActionOnce && !skippedFirst) {
          skippedFirst = true;
        } else if (fwAction && !dryRun) {
          await usbHardware.testAction(fwAction);
        } else if (dryRun) {
          // Brief visual dwell so instantaneous actions remain legible during preview
          await this.sleep(160, signal);
        }

        const hasMoreIntraStepRepeats = sr < stepRepeats - 1;
        const shouldWaitAfter =
          stepDelay > 0 && (hasMoreIntraStepRepeats || !isLastStep);

        if (shouldWaitAfter) {
          this.updateStepProgress(idx, 'delay');
          await this.sleep(stepDelay, signal);
        }
      }
    }
  }

  private async executeSingleCycle(
    cfg: TextMacroRepeatConfig,
    signal: AbortSignal,
    dryRun = false
  ): Promise<void> {
    if (signal.aborted) throw new Error('aborted');

    if (cfg.steps && cfg.steps.length > 0) {
      await this.executeStepList(cfg.steps, signal, dryRun, false);
      return;
    }

    const hasNativeEnter =
      cfg.text.length > 0 && cfg.followUpKey === 'enter' && cfg.keyDelayMs <= 0;
    const cleanText = sanitizeSerialString(cfg.text, hasNativeEnter ? 122 : 123);

    if (cleanText.length > 0) {
      this.updateStepProgress(0, 'action');
      if (hasNativeEnter) {
        if (!dryRun) {
          await usbHardware.testAction(`TEXT:${cleanText}\n`);
        } else {
          await this.sleep(180, signal);
        }
        return;
      }
      if (!dryRun) {
        await usbHardware.testAction(`TEXT:${cleanText}`);
      } else {
        await this.sleep(180, signal);
      }
      if (cfg.followUpKey) {
        if (cfg.keyDelayMs > 0) {
          this.updateStepProgress(0, 'delay');
          await this.sleep(cfg.keyDelayMs, signal);
        }
        if (signal.aborted) throw new Error('aborted');
        this.updateStepProgress(1, 'action');
        if (!dryRun) {
          await usbHardware.testAction(buildFirmwareShortcut([], cfg.followUpKey));
        } else {
          await this.sleep(160, signal);
        }
      }
      return;
    }

    if (cfg.followUpKey) {
      this.updateStepProgress(0, 'action');
      if (!dryRun) {
        await usbHardware.testAction(buildFirmwareShortcut([], cfg.followUpKey));
      } else {
        await this.sleep(160, signal);
      }
    }
  }

  /**
   * Dry-run visual simulation on the timeline (works offline without USB hardware connected)
   */
  public async simulateInUi(cfg: TextMacroRepeatConfig): Promise<void> {
    this.stop();
    const ac = new AbortController();
    this.abortController = ac;

    const total = cfg.loopUntilStopped ? null : Math.max(1, Math.min(999, cfg.repeatCount || 1));
    const delayMs = Math.max(10, cfg.repeatDelayMs || 0);
    const label = formatTextRepeatSummary(cfg).fullLabel;

    this.currentJob = {
      id: `sim-${Date.now()}`,
      label,
      currentIteration: 1,
      totalIterations: total,
      delayMs,
      activeStepIndex: 0,
      activeStepPhase: 'action'
    };
    this.emit();

    try {
      let iter = 1;
      for (;;) {
        if (ac.signal.aborted) break;
        this.currentJob = {
          ...this.currentJob,
          currentIteration: iter
        };
        this.emit();

        await this.executeSingleCycle(cfg, ac.signal, true);

        if (total !== null && iter >= total) {
          break;
        }
        this.updateStepProgress(undefined, 'delay');
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
      delayMs,
      activeStepIndex: 0,
      activeStepPhase: 'action'
    };
    this.emit();

    try {
      let iter = 1;
      for (;;) {
        if (ac.signal.aborted) break;
        this.currentJob = {
          ...this.currentJob,
          currentIteration: iter
        };
        this.emit();

        await this.executeSingleCycle(cfg, ac.signal, false);

        if (total !== null && iter >= total) {
          break;
        }
        this.updateStepProgress(undefined, 'delay');
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
   * - Otherwise, completes remaining steps / repeats for Iteration 1 (since hardware already
   *   ran the base slot action once) and runs Iterations `2..N` (or loops) at `repeatDelayMs`.
   */
  public async handleHardwareSlotTrigger(
    slotKey: string,
    cfg: TextMacroRepeatConfig
  ): Promise<'stopped' | 'completed' | 'noop'> {
    if (!usbHardware.info.connected) return 'noop';

    if (this.currentJob && this.currentJob.slotKey === slotKey) {
      this.stop();
      return 'stopped';
    }

    const compiled = compileMacroConfigForHardware(cfg);
    if (compiled.standaloneComplete) {
      return 'noop';
    }

    const total = cfg.loopUntilStopped ? null : Math.max(1, Math.min(999, cfg.repeatCount || 1));
    const hasMoreRepeats = total === null || total > 1;

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
      delayMs,
      activeStepIndex: 0,
      activeStepPhase: 'action'
    };
    this.emit();

    try {
      // Only stream remaining steps of Iteration 1 when Pass 1 did NOT fit standalone in NVS
      if (!compiled.singleCycleStandalone) {
        if (cfg.steps && cfg.steps.length > 0) {
          await this.executeStepList(cfg.steps, ac.signal, false, true);
        } else {
          const needsDeferredKeyForIter1 =
            cfg.text.length > 0 &&
            Boolean(cfg.followUpKey) &&
            (cfg.followUpKey !== 'enter' || cfg.keyDelayMs > 0);
          if (needsDeferredKeyForIter1 && cfg.followUpKey) {
            if (cfg.keyDelayMs > 0) {
              this.updateStepProgress(0, 'delay');
              await this.sleep(cfg.keyDelayMs, ac.signal);
            }
            if (!ac.signal.aborted) {
              this.updateStepProgress(1, 'action');
              await usbHardware.testAction(buildFirmwareShortcut([], cfg.followUpKey));
            }
          }
        }
      }

      if (!hasMoreRepeats) {
        return 'completed';
      }

      let iter = 2;
      for (;;) {
        this.updateStepProgress(undefined, 'delay');
        await this.sleep(delayMs, ac.signal);
        if (ac.signal.aborted) break;

        this.currentJob = {
          ...this.currentJob,
          slotKey,
          label,
          currentIteration: iter,
          totalIterations: total,
          delayMs
        };
        this.emit();

        await this.executeSingleCycle(cfg, ac.signal, false);

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

