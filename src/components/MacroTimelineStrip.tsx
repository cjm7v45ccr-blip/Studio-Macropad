import React, { useMemo, useState } from 'react';
import {
  Bluetooth,
  Clock,
  Command,
  CornerDownLeft,
  FileText,
  Laptop,
  Tv,
  Volume2
} from 'lucide-react';
import { MacroStepActionType, MacroStepConfig } from '../types/studio';
import { parseMacroStepTag } from '../data/firmwareCatalog';

export interface MacroTimelineStripProps {
  steps: MacroStepConfig[];
  estimatedRunMs: number;
  totalDelayMs: number;
  expandedStepId: string | null;
  activeStepIndex?: number;
  activeStepPhase?: 'action' | 'delay';
  isRunning: boolean;
  issueStepIds: Set<string>;
  onSelectStep: (stepId: string) => void;
}

function formatMsCompact(ms: number): string {
  if (ms >= 1000) {
    const secs = ms / 1000;
    return `${secs % 1 === 0 ? secs.toFixed(0) : secs.toFixed(2).replace(/0+$/, '')} s`;
  }
  return `${Math.round(ms)} ms`;
}

const STEP_ICON_MAP: Record<MacroStepActionType, React.ComponentType<{ className?: string }>> = {
  shortcut: Command,
  text: FileText,
  key: CornerDownLeft,
  delay: Clock,
  media: Volume2,
  os_action: Laptop,
  ble: Bluetooth,
  tv: Tv
};

interface TimelineSegment {
  key: string;
  stepId: string;
  stepIndex: number;
  kind: 'action' | 'delay';
  actionType: MacroStepActionType;
  durationMs: number;
  label: string;
  repeatCount: number;
}

export const MacroTimelineStrip: React.FC<MacroTimelineStripProps> = ({
  steps,
  estimatedRunMs,
  totalDelayMs,
  expandedStepId,
  activeStepIndex,
  activeStepPhase,
  isRunning,
  issueStepIds,
  onSelectStep
}) => {
  const [hoveredStepIdx, setHoveredStepIdx] = useState<number | null>(null);

  const parsedSteps = useMemo(
    () =>
      steps.map((step, idx) => {
        const tag = parseMacroStepTag(step);
        return { step, idx, tag };
      }),
    [steps]
  );

  const segments = useMemo<TimelineSegment[]>(() => {
    const out: TimelineSegment[] = [];
    parsedSteps.forEach(({ step, idx, tag }) => {
      const isLast = idx === parsedSteps.length - 1;
      const repeats = Math.max(1, step.repeatCount || 1);
      if (step.actionType === 'delay') {
        const waitMs = Math.max(10, step.delayMs || 0);
        out.push({
          key: `${step.id}-delay`,
          stepId: step.id,
          stepIndex: idx,
          kind: 'delay',
          actionType: 'delay',
          durationMs: waitMs,
          label: tag.prettyValue,
          repeatCount: 1
        });
        return;
      }

      const actionDuration = 50 * repeats;
      out.push({
        key: `${step.id}-action`,
        stepId: step.id,
        stepIndex: idx,
        kind: 'action',
        actionType: step.actionType,
        durationMs: actionDuration,
        label: tag.prettyValue,
        repeatCount: repeats
      });

      const effectivePostDelay =
        (!isLast || repeats > 1) && step.delayMs > 0
          ? step.delayMs * (isLast ? repeats - 1 : repeats)
          : 0;
      if (effectivePostDelay > 0) {
        out.push({
          key: `${step.id}-wait`,
          stepId: step.id,
          stepIndex: idx,
          kind: 'delay',
          actionType: 'delay',
          durationMs: effectivePostDelay,
          label: `Wait ${formatMsCompact(effectivePostDelay)}`,
          repeatCount: 1
        });
      }
    });
    return out;
  }, [parsedSteps]);

  const totalTimelineMs = useMemo(
    () => Math.max(50, segments.reduce((sum, seg) => sum + seg.durationMs, 0)),
    [segments]
  );

  if (steps.length === 0) return null;

  const activeParsed =
    isRunning && typeof activeStepIndex === 'number'
      ? parsedSteps[activeStepIndex]
      : null;

  const hoveredParsed =
    hoveredStepIdx !== null ? parsedSteps[hoveredStepIdx] : null;

  const statusText = activeParsed
    ? activeStepPhase === 'delay'
      ? `Waiting ${formatMsCompact(activeParsed.step.delayMs)} after Step ${String(
          activeParsed.idx + 1
        ).padStart(2, '0')}`
      : `Running Step ${String(activeParsed.idx + 1).padStart(2, '0')} · ${
          activeParsed.tag.prettyValue
        }`
    : hoveredParsed
    ? `Step ${String(hoveredParsed.idx + 1).padStart(2, '0')} · ${
        hoveredParsed.tag.prettyValue
      }${
        hoveredParsed.step.actionType !== 'delay' &&
        hoveredParsed.step.delayMs > 0 &&
        hoveredParsed.idx < steps.length - 1
          ? ` (+${formatMsCompact(hoveredParsed.step.delayMs)} wait)`
          : ''
      }`
    : 'Click any node to jump & edit';

  return (
    <section
      aria-label="Sequence timeline"
      className="rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] overflow-hidden"
    >
      {/* Instrument Header */}
      <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)] shrink-0">
            Sequence Timeline
          </span>
          <span
            className={`text-xs truncate ${
              activeParsed
                ? 'text-[var(--accent)] font-semibold'
                : 'text-[var(--text-muted)]'
            }`}
          >
            {statusText}
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums text-[var(--text-secondary)] shrink-0">
          {totalDelayMs > 0 && (
            <span className="text-[var(--text-muted)]">
              {formatMsCompact(totalDelayMs)} wait
            </span>
          )}
          <span className="font-semibold text-[var(--text-primary)]">
            ~{formatMsCompact(estimatedRunMs)}
          </span>
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Layer 1: Sculpted Horizontal Keycap / Action Flow Ribbon */}
        <div
          className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1"
          role="list"
          aria-label="Visual step flow ribbon"
        >
          {parsedSteps.map(({ step, idx, tag }) => {
            const Icon = STEP_ICON_MAP[step.actionType];
            const isExpanded = expandedStepId === step.id;
            const isExecutingAction =
              isRunning && activeStepIndex === idx && activeStepPhase === 'action';
            const isExecutingDelay =
              isRunning && activeStepIndex === idx && activeStepPhase === 'delay';
            const hasIssue = issueStepIds.has(step.id);
            const isHovered = hoveredStepIdx === idx;
            const isLast = idx === parsedSteps.length - 1;
            const showConnectorDelay =
              !isLast && step.actionType !== 'delay' && step.delayMs > 0;

            return (
              <React.Fragment key={step.id}>
                <button
                  type="button"
                  role="listitem"
                  onClick={() => onSelectStep(step.id)}
                  onMouseEnter={() => setHoveredStepIdx(idx)}
                  onMouseLeave={() => setHoveredStepIdx(null)}
                  title={`Step ${String(idx + 1).padStart(2, '0')}: ${tag.prettyValue}`}
                  className={`group/chip relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all cursor-pointer shrink-0 max-w-[180px] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${
                    isExecutingAction
                      ? 'border-[var(--accent)] bg-[rgba(var(--accent-rgb),0.18)] text-[var(--text-primary)] ring-1 ring-[var(--accent)]/40 -translate-y-px'
                      : hasIssue
                      ? 'border-[#D97706] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                      : isExpanded
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                      : isHovered
                      ? 'border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                      : step.actionType === 'delay'
                      ? 'border-dashed border-[var(--border-strong)] bg-[var(--bg-input)]/70 text-[var(--text-secondary)] hover:border-[var(--accent)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-input)] text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-elevated)]'
                  }`}
                >
                  <span
                    className={`font-mono text-[10px] tabular-nums shrink-0 ${
                      isExecutingAction || isExpanded
                        ? 'text-[var(--accent)] font-bold'
                        : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <Icon
                    className={`w-3 h-3 shrink-0 ${
                      isExecutingAction || isExpanded
                        ? 'text-[var(--accent)]'
                        : 'text-[var(--text-secondary)]'
                    }`}
                  />
                  <span className="font-mono text-[11px] font-medium truncate">
                    {tag.prettyValue}
                  </span>
                  {step.actionType !== 'delay' && step.repeatCount > 1 && (
                    <span className="font-mono text-[10px] text-[var(--accent)] font-semibold tabular-nums shrink-0">
                      ×{step.repeatCount}
                    </span>
                  )}
                </button>

                {!isLast && (
                  <div
                    className="flex items-center gap-1 shrink-0 select-none"
                    aria-hidden="true"
                  >
                    <div
                      className={`h-px transition-colors ${
                        showConnectorDelay ? 'w-2' : 'w-3'
                      } ${
                        isExecutingDelay
                          ? 'bg-[var(--accent)]'
                          : 'bg-[var(--border-strong)]'
                      }`}
                    />
                    {showConnectorDelay && (
                      <>
                        <span
                          className={`font-mono text-[10px] tabular-nums transition-colors ${
                            isExecutingDelay
                              ? 'text-[var(--accent)] font-semibold'
                              : 'text-[var(--text-muted)]'
                          }`}
                        >
                          {formatMsCompact(step.delayMs)}
                        </span>
                        <div
                          className={`w-2 h-px transition-colors ${
                            isExecutingDelay
                              ? 'bg-[var(--accent)]'
                              : 'bg-[var(--border-strong)]'
                          }`}
                        />
                      </>
                    )}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Layer 2: Proportional Hardware Execution Gantt Bar */}
        <div className="space-y-1.5">
          <div
            className="h-3 w-full rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] p-[2px] flex items-stretch gap-[2px] overflow-hidden"
            role="group"
            aria-label="Proportional step duration bar"
          >
            {segments.map(seg => {
              const pct = Math.max(
                seg.kind === 'action' ? 4 : 3,
                (seg.durationMs / totalTimelineMs) * 100
              );
              const isSegRunning =
                isRunning &&
                activeStepIndex === seg.stepIndex &&
                activeStepPhase === seg.kind;
              const isSegSelected = expandedStepId === seg.stepId;
              const isSegHovered = hoveredStepIdx === seg.stepIndex;
              const hasIssue = issueStepIds.has(seg.stepId);

              let barClass = '';
              if (seg.kind === 'delay') {
                barClass = isSegRunning
                  ? 'bg-[var(--accent)]/60'
                  : isSegHovered || isSegSelected
                  ? 'macro-wait-hatch border border-[var(--accent)]/50'
                  : 'macro-wait-hatch';
              } else if (isSegRunning) {
                barClass = 'bg-[var(--accent)]';
              } else if (hasIssue) {
                barClass = 'bg-[#D97706]';
              } else if (isSegSelected || isSegHovered) {
                barClass = 'bg-[var(--accent)]/85';
              } else if (seg.actionType === 'text') {
                barClass = 'bg-[var(--accent)]/50';
              } else if (seg.actionType === 'shortcut' || seg.actionType === 'key') {
                barClass = 'bg-[var(--text-primary)]/70';
              } else {
                barClass = 'bg-[var(--text-secondary)]/65';
              }

              return (
                <button
                  key={seg.key}
                  type="button"
                  onClick={() => onSelectStep(seg.stepId)}
                  onMouseEnter={() => setHoveredStepIdx(seg.stepIndex)}
                  onMouseLeave={() => setHoveredStepIdx(null)}
                  style={{ flexGrow: Math.max(1, Math.round(pct * 10)) }}
                  title={`Step ${String(seg.stepIndex + 1).padStart(2, '0')} · ${
                    seg.label
                  } (${formatMsCompact(seg.durationMs)})`}
                  aria-label={`Step ${seg.stepIndex + 1} ${seg.kind}: ${seg.label}, ${formatMsCompact(
                    seg.durationMs
                  )}`}
                  className={`h-full min-w-[6px] rounded-[4px] transition-opacity cursor-pointer ${barClass}`}
                />
              );
            })}
          </div>

          {/* Precision Millisecond Scale Ruler */}
          <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-[var(--text-muted)] select-none">
            <span>0 ms</span>
            {estimatedRunMs >= 200 && (
              <span>{formatMsCompact(Math.round(estimatedRunMs / 2))}</span>
            )}
            <span>~{formatMsCompact(estimatedRunMs)}</span>
          </div>
        </div>
      </div>
    </section>
  );
};
