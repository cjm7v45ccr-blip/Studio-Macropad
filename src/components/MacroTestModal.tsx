import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Eye, Play, Square, X } from 'lucide-react';
import { ActionBinding, ActiveRepeatJob, DeviceConnectionInfo } from '../types/studio';
import { getActionTestAvailability } from '../data/firmwareCatalog';
import { usbHardware } from '../services/usbHardwareService';
import { repeatMacroRunner } from '../services/repeatMacroRunner';
import { buildMacroPreview, testTargetKey } from '../utils/macroPreview';

interface Props {
  binding: ActionBinding;
  connection: DeviceConnectionInfo;
  activeJob: ActiveRepeatJob | null;
  onClose: () => void;
  onRun: (binding: ActionBinding) => void;
}

const seconds = (ms: number) => `${(ms / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 })}s`;

/** Reviewing and animating this dialog never sends commands to the pad. */
export function MacroTestModal({ binding, connection, activeJob, onClose, onRun }: Props) {
  const preview = useMemo(() => buildMacroPreview(binding), [binding]);
  const [confirmedTarget, setConfirmedTarget] = useState<string | null>(null);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const previewJobId = useRef<string | null>(null);
  const target = testTargetKey(connection);
  const targetLabel = `${connection.deviceName || 'BertoPad'}${connection.telemetry?.activeProfile ? ` · ${connection.telemetry.activeProfile}` : ''}`;
  const isDemo = connection.transport === 'demo';
  const availability = getActionTestAvailability(binding.value, connection);
  const ownsPreview = Boolean(activeJob && activeJob.id === previewJobId.current);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      if (previewJobId.current === repeatMacroRunner.activeJob?.id) repeatMacroRunner.stop();
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    setConfirmedTarget(null);
  }, [target]);

  useEffect(() => {
    // Disabling the focused Dry run button can move focus to the page body.
    // Keep Escape and the focus trap working as preview controls change.
    if (!dialogRef.current?.contains(document.activeElement)) dialogRef.current?.focus();
  }, [activeJob]);

  const handlePreview = () => {
    const runningJob = repeatMacroRunner.activeJob;
    if (runningJob || !preview.timeline.length) return;
    setError('');
    const running = repeatMacroRunner.simulateInUi(preview.simulationConfig);
    previewJobId.current = repeatMacroRunner.activeJob?.id || null;
    running.catch(() => setError('Preview could not finish. No actions were sent.'));
  };

  const handleRun = () => {
    // Recheck the live service, not just the rendered button: a disconnect or a
    // different device must invalidate a previously checked confirmation.
    const live = repeatMacroRunner.activeJob;
    if (live || !availability.canTest || confirmedTarget !== target || testTargetKey(usbHardware.info) !== confirmedTarget) return;
    onRun(binding);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="macro-test-title"
        aria-describedby="macro-test-description"
        tabIndex={-1}
        className="w-full max-w-xl max-h-[90dvh] flex flex-col rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-panel)] shadow-2xl outline-none"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            if (ownsPreview) repeatMacroRunner.stop();
            else onClose();
          }
          if (e.key === 'Tab') {
            const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') || []);
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
              e.preventDefault(); last?.focus();
            } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
              e.preventDefault(); first?.focus();
            }
          }
        }}
      >
        <header className="p-4 sm:p-5 border-b border-[var(--border-subtle)] flex items-start justify-between gap-3">
          <div>
            <h2 id="macro-test-title" className="text-base font-semibold">Preview & test</h2>
            <p id="macro-test-description" className="text-xs text-[var(--text-secondary)] mt-1">Review the timeline first. Dry run works offline and sends no keystrokes or device commands.</p>
          </div>
          <button type="button" aria-label="Close preview" onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--bg-input)] cursor-pointer"><X className="w-4 h-4" /></button>
        </header>

        <div className="p-4 sm:p-5 overflow-y-auto min-h-0 space-y-4">
          <div className="rounded-xl bg-[var(--bg-input)] p-3 text-xs space-y-1">
            <p className="font-semibold">{preview.timeline.length} steps · {preview.loop ? 'Loops until stopped' : `${preview.cycles} cycle${preview.cycles === 1 ? '' : 's'}`}</p>
            <p className="text-[var(--text-secondary)]">Configured waits: {seconds(preview.cycleWaitMs)} per cycle{preview.totalWaitMs !== null && preview.cycles > 1 ? ` · ${seconds(preview.totalWaitMs)} total` : ''}.</p>
            {(preview.loop || preview.cycles > 1) && <p className="text-[var(--text-secondary)]">Wait {seconds(preview.repeatDelayMs)} between cycles. Dry run previews one cycle only.</p>}
            <p className="text-[var(--text-muted)]">Offsets below show configured waits only; typing and device response add time. Instant actions pause briefly in dry run for readability.</p>
          </div>

          <ol aria-label="Dry-run timeline" className="space-y-2">
            {preview.timeline.map(({ step, label, startMs, waitMs, repeats }, index) => {
              const current = ownsPreview && activeJob?.activeStepIndex === index;
              return (
                <li key={`${step.id}-${index}`} aria-current={current ? 'step' : undefined} className={`rounded-xl border p-3 flex gap-3 text-xs ${current ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border-subtle)]'}`}>
                  <span className="font-mono text-[var(--text-muted)] shrink-0">{String(index + 1).padStart(2, '0')}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium break-words whitespace-pre-wrap [overflow-wrap:anywhere]">{label}{repeats > 1 ? ` × ${repeats}` : ''}</p>
                    <p className="text-[var(--text-secondary)] mt-1">At +{seconds(startMs)}{waitMs > 0 ? ` · ${seconds(waitMs)} configured wait${step.actionType !== 'delay' ? ' after / between actions' : ''}` : ' · no configured wait'}{current ? ` · ${activeJob?.activeStepPhase === 'delay' ? 'Waiting' : 'Previewing'}` : ''}</p>
                  </div>
                </li>
              );
            })}
          </ol>
          {preview.timeline.length === 0 && <p className="text-xs text-[var(--text-muted)]">Assign an action to preview it.</p>}

          <div className="flex items-center gap-2">
            <button type="button" disabled={Boolean(activeJob) || !preview.timeline.length} onClick={handlePreview} className="flex items-center gap-2 rounded-lg px-3 py-2 bg-[var(--bg-input)] text-xs font-semibold disabled:opacity-40 cursor-pointer"><Eye className="w-4 h-4" />Dry run · no output</button>
            {ownsPreview && <button type="button" onClick={() => repeatMacroRunner.stop()} className="flex items-center gap-1 rounded-lg px-3 py-2 bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-semibold cursor-pointer"><Square className="w-3 h-3" />Stop preview (Esc)</button>}
          </div>
          <p role="status" className="text-xs text-[var(--text-secondary)]">{ownsPreview ? 'Dry run in progress — no actions are being sent.' : activeJob ? 'Another sequence is running. Stop it before previewing or testing.' : 'Dry run is safe, even with a device connected.'}</p>
          {error && <p role="alert" className="text-xs text-[var(--accent)]">{error}</p>}

          <section className="border-t border-[var(--border-subtle)] pt-4 space-y-3">
            <div className="flex gap-2 text-xs text-[var(--text-secondary)]">
              <AlertTriangle className="w-4 h-4 shrink-0 text-[var(--accent)]" />
              <p>{isDemo ? 'Demo test simulates actions only. No physical device receives them.' : `Live test sends real actions through ${targetLabel} to its active target, not necessarily this browser. Text can be typed and shortcuts can change or delete data. Stop cannot undo actions already sent.`}</p>
            </div>
            {connection.connected && <p className="text-xs font-medium">Test target: {isDemo ? 'Demo device — no physical output' : targetLabel}</p>}
            {availability.reason && availability.canTest && <p className="text-xs text-[var(--accent)]">{availability.reason}</p>}
            {availability.canTest ? (
              <label className="flex items-start gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={confirmedTarget === target} onChange={e => setConfirmedTarget(e.target.checked ? target : null)} className="mt-0.5 accent-[var(--accent)]" />
                <span>{isDemo ? 'I want to run this test in demo mode.' : 'I understand this will execute real actions on the active device target.'}</span>
              </label>
            ) : <p className="text-xs text-[var(--text-muted)]">{availability.reason || 'Connect USB or start demo mode to execute a test.'} You can still dry run above.</p>}
          </section>
        </div>
        <footer className="p-4 border-t border-[var(--border-subtle)] flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg text-xs font-medium bg-[var(--bg-input)] cursor-pointer">Close</button>
          <button type="button" disabled={!availability.canTest || confirmedTarget !== target || Boolean(activeJob) || !preview.timeline.length} onClick={handleRun} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"><Play className="w-3.5 h-3.5" />{isDemo ? 'Run in demo' : 'Run on device'}</button>
        </footer>
      </div>
    </div>
  );
}
