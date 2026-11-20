import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  HardwareProfileId,
  HardwareSlotId,
  StudioProfile,
  isBleHostProfile
} from '../types/studio';
import {
  HOLD_SLOTS,
  MOTION_SLOTS,
  SLOT_LABELS,
  describeFirmwareAction,
  getVisibleHardwareSlots,
  hasKeyHoldCapability,
  hasMotionCapability
} from '../data/firmwareCatalog';
import {
  extractProfileSlots,
  getBindingForProfileSlot
} from '../hooks/useStudioState';
import {
  Bluetooth,
  BookOpen,
  Printer,
  Tv,
  X
} from 'lucide-react';

interface CheatSheetModalProps {
  isOpen: boolean;
  profiles: StudioProfile[];
  activeProfileId: HardwareProfileId;
  tvEnabled?: boolean;
  capabilities?: string[];
  onClose: () => void;
  onJumpToControl: (profileId: HardwareProfileId, slot: HardwareSlotId) => void;
}

const KEY_SLOTS: readonly HardwareSlotId[] = [
  'b1',
  'b2',
  'b3',
  'b4',
  'b5',
  'b6',
  'b7',
  'b8'
] as const;

const KNOB_1_BASE_SLOTS: { slot: HardwareSlotId; label: string }[] = [
  { slot: 'dial', label: 'Press' },
  { slot: 'enc_ccw', label: 'Left' },
  { slot: 'enc_cw', label: 'Right' }
];

const KNOB_1_HOLD_SLOTS: { slot: HardwareSlotId; label: string }[] = [
  { slot: 'push_ccw', label: 'Push+Left' },
  { slot: 'push_cw', label: 'Push+Right' }
];

const KNOB_2_BASE_SLOTS: { slot: HardwareSlotId; label: string }[] = [
  { slot: 'dial2', label: 'Press' },
  { slot: 'e2_ccw', label: 'Left' },
  { slot: 'e2_cw', label: 'Right' }
];

const KNOB_2_HOLD_SLOTS: { slot: HardwareSlotId; label: string }[] = [
  { slot: 'push_ccw2', label: 'Push+Left' },
  { slot: 'push_cw2', label: 'Push+Right' }
];

function formatSlotValue(
  action: string,
  repeatConfig: ReturnType<typeof getBindingForProfileSlot> extends infer B
    ? B extends { repeatConfig?: infer R }
      ? R
      : undefined
    : undefined,
  labelMode: 'friendly' | 'value'
): string | null {
  if (!action || !action.trim()) return null;
  if (labelMode === 'value') {
    return action.replace(/\n/g, '\\n');
  }
  return describeFirmwareAction(action, repeatConfig).shortLabel;
}

export const CheatSheetModal: React.FC<CheatSheetModalProps> = ({
  isOpen,
  profiles,
  activeProfileId,
  tvEnabled = true,
  capabilities,
  onClose,
  onJumpToControl
}) => {
  const [labelMode, setLabelMode] = useState<'friendly' | 'value'>('friendly');
  const hasKeyHold = hasKeyHoldCapability(capabilities);
  const hasMotion = hasMotionCapability(capabilities);
  const visibleSlots = getVisibleHardwareSlots(capabilities);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const assignedTotal = profiles.reduce((acc, prof) => {
    const slots = extractProfileSlots(prof);
    return acc + visibleSlots.filter(s => Boolean(slots[s]?.trim())).length;
  }, 0);

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cheat-sheet-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[#080A0D]/80 backdrop-blur-md print:static print:inset-auto print:bg-white print:p-0"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl max-h-[90dvh] flex flex-col rounded-2xl studio-popover overflow-hidden animate-popover-in print:max-h-none print:border-0 print:shadow-none"
        onClick={e => e.stopPropagation()}
      >
        {/* Minimal Hairline Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3 flex-wrap shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <BookOpen className="w-4 h-4 text-[var(--text-secondary)] shrink-0 print:hidden" />
            <div className="min-w-0 flex items-baseline gap-2.5 flex-wrap">
              <h2
                id="cheat-sheet-title"
                className="text-sm font-semibold text-[var(--text-primary)] tracking-tight"
              >
                All-Host Desk Reference
              </h2>
              <span className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums">
                {profiles.length} profiles · {assignedTotal} mapped
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 print:hidden">
            <div
              role="group"
              aria-label="Action label display mode"
              className="flex items-center p-0.5 rounded-lg bg-[var(--bg-input)]"
            >
              <button
                type="button"
                onClick={() => setLabelMode('friendly')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  labelMode === 'friendly'
                    ? 'bg-[var(--bg-selected)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                Readable
              </button>
              <button
                type="button"
                onClick={() => setLabelMode('value')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  labelMode === 'value'
                    ? 'bg-[var(--bg-selected)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                Tokens
              </button>
            </div>

            <button
              type="button"
              onClick={() => window.print()}
              className="studio-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
              <span>Print</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close desk reference"
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Flat 2x2 Hairline Reference Grid */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-7 print:overflow-visible print:p-2">
          {profiles.map(prof => {
            const slots = extractProfileSlots(prof);
            const isBle = isBleHostProfile(prof.id);
            const ProfileIcon = isBle ? Bluetooth : Tv;
            const isActive = prof.id === activeProfileId;

            const assignedKnob1Hold = KNOB_1_HOLD_SLOTS.filter(({ slot }) =>
              Boolean(slots[slot]?.trim())
            );
            const assignedKnob2Hold = KNOB_2_HOLD_SLOTS.filter(({ slot }) =>
              Boolean(slots[slot]?.trim())
            );
            const assignedMotion = hasMotion
              ? MOTION_SLOTS.filter(slot => Boolean(slots[slot]?.trim()))
              : [];

            return (
              <section key={prof.id} className="space-y-3 min-w-0">
                {/* Flat Profile Header */}
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2 min-w-0">
                    <ProfileIcon
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                      }`}
                    />
                    <h3 className="text-xs font-semibold text-[var(--text-primary)] truncate">
                      {prof.name}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 font-mono text-[10px]">
                    {prof.id === 'TV' && !tvEnabled && (
                      <span className="text-[var(--text-muted)] print:hidden">Off</span>
                    )}
                    {isActive && (
                      <span className="inline-flex items-center gap-1.5 text-[var(--accent)] font-medium print:hidden">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
                        Active
                      </span>
                    )}
                  </div>
                </div>

                {/* K1–K8 Clean Hairline 2-Column Table */}
                <div className="grid grid-cols-2 gap-x-5">
                  {KEY_SLOTS.map((slot, idx) => {
                    const act = slots[slot];
                    const bind = getBindingForProfileSlot(profiles, prof.id, slot);
                    const formatted = formatSlotValue(act, bind?.repeatConfig, labelMode);
                    const holdSlot = HOLD_SLOTS[idx];
                    const holdAct = slots[holdSlot];
                    const holdBind = getBindingForProfileSlot(profiles, prof.id, holdSlot);
                    const formattedHold =
                      hasKeyHold && holdAct?.trim()
                        ? formatSlotValue(holdAct, holdBind?.repeatConfig, labelMode)
                        : null;

                    return (
                      <div
                        key={slot}
                        className="border-b border-[var(--border-subtle)]/50 min-w-0"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onJumpToControl(prof.id, slot);
                            onClose();
                          }}
                          title={`${prof.name} · ${SLOT_LABELS[slot].full}: ${
                            act ? describeFirmwareAction(act, bind?.repeatConfig).fullLabel : 'Unassigned'
                          }`}
                          className="w-full py-1.5 px-1.5 -mx-1.5 rounded-md hover:bg-[var(--bg-hover)] flex items-center justify-between gap-2 text-left transition-colors cursor-pointer group"
                        >
                          <span className="font-mono text-[10px] font-medium text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] tabular-nums shrink-0">
                            K{idx + 1}
                          </span>
                          {formatted ? (
                            <span
                              className={`truncate text-right ${
                                labelMode === 'value'
                                  ? 'font-mono text-[10px] text-[var(--text-secondary)]'
                                  : 'text-xs text-[var(--text-primary)]'
                              }`}
                            >
                              {formatted}
                            </span>
                          ) : (
                            <span className="font-mono text-xs text-[var(--text-muted)]/40">
                              —
                            </span>
                          )}
                        </button>

                        {formattedHold && (
                          <button
                            type="button"
                            onClick={() => {
                              onJumpToControl(prof.id, holdSlot);
                              onClose();
                            }}
                            title={`${prof.name} · ${SLOT_LABELS[holdSlot].full}: ${describeFirmwareAction(holdAct, holdBind?.repeatConfig).fullLabel}`}
                            className="w-full pb-1.5 pt-0.5 px-1.5 -mx-1.5 rounded-md hover:bg-[var(--bg-hover)] flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
                          >
                            <span className="font-mono text-[9px] text-[var(--text-muted)]/80 pl-2 shrink-0">
                              ↳ Hold
                            </span>
                            <span
                              className={`truncate text-right ${
                                labelMode === 'value'
                                  ? 'font-mono text-[10px] text-[var(--text-muted)]'
                                  : 'text-[11px] text-[var(--text-secondary)]'
                              }`}
                            >
                              {formattedHold}
                            </span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Rotary Knobs (Flat Hairline Rows) */}
                <div className="pt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2.5">
                  {/* Knob 1 */}
                  <div className="min-w-0">
                    <div className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-muted)] pb-1">
                      Knob 1
                    </div>
                    <div className="divide-y divide-[var(--border-subtle)]/40">
                      {[...KNOB_1_BASE_SLOTS, ...assignedKnob1Hold].map(({ slot, label }) => {
                        const act = slots[slot];
                        const bind = getBindingForProfileSlot(profiles, prof.id, slot);
                        const formatted = formatSlotValue(act, bind?.repeatConfig, labelMode);
                        return (
                          <button
                            key={slot}
                            type="button"
                            onClick={() => {
                              onJumpToControl(prof.id, slot);
                              onClose();
                            }}
                            title={`${prof.name} · ${SLOT_LABELS[slot].full}: ${
                              act ? describeFirmwareAction(act, bind?.repeatConfig).fullLabel : 'Unassigned'
                            }`}
                            className="w-full py-1 px-1.5 -mx-1.5 rounded-md hover:bg-[var(--bg-hover)] flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
                          >
                            <span className="font-mono text-[10px] text-[var(--text-muted)] shrink-0">
                              {label}
                            </span>
                            {formatted ? (
                              <span
                                className={`truncate text-right ${
                                  labelMode === 'value'
                                    ? 'font-mono text-[10px] text-[var(--text-secondary)]'
                                    : 'text-[11px] text-[var(--text-primary)]'
                                }`}
                              >
                                {formatted}
                              </span>
                            ) : (
                              <span className="font-mono text-[11px] text-[var(--text-muted)]/40">
                                —
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Knob 2 */}
                  <div className="min-w-0">
                    <div className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-muted)] pb-1">
                      Knob 2
                    </div>
                    <div className="divide-y divide-[var(--border-subtle)]/40">
                      {[...KNOB_2_BASE_SLOTS, ...assignedKnob2Hold].map(({ slot, label }) => {
                        const act = slots[slot];
                        const bind = getBindingForProfileSlot(profiles, prof.id, slot);
                        const formatted = formatSlotValue(act, bind?.repeatConfig, labelMode);
                        return (
                          <button
                            key={slot}
                            type="button"
                            onClick={() => {
                              onJumpToControl(prof.id, slot);
                              onClose();
                            }}
                            title={`${prof.name} · ${SLOT_LABELS[slot].full}: ${
                              act ? describeFirmwareAction(act, bind?.repeatConfig).fullLabel : 'Unassigned'
                            }`}
                            className="w-full py-1 px-1.5 -mx-1.5 rounded-md hover:bg-[var(--bg-hover)] flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
                          >
                            <span className="font-mono text-[10px] text-[var(--text-muted)] shrink-0">
                              {label}
                            </span>
                            {formatted ? (
                              <span
                                className={`truncate text-right ${
                                  labelMode === 'value'
                                    ? 'font-mono text-[10px] text-[var(--text-secondary)]'
                                    : 'text-[11px] text-[var(--text-primary)]'
                                }`}
                              >
                                {formatted}
                              </span>
                            ) : (
                              <span className="font-mono text-[11px] text-[var(--text-muted)]/40">
                                —
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Motion Gestures (Only rendered when at least one gesture is mapped) */}
                {assignedMotion.length > 0 && (
                  <div className="pt-1 border-t border-[var(--border-subtle)]/50">
                    <div className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-muted)] pb-1">
                      Motion
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {assignedMotion.map(slot => {
                        const act = slots[slot];
                        const bind = getBindingForProfileSlot(profiles, prof.id, slot);
                        const formatted = formatSlotValue(act, bind?.repeatConfig, labelMode);
                        return (
                          <button
                            key={slot}
                            type="button"
                            onClick={() => {
                              onJumpToControl(prof.id, slot);
                              onClose();
                            }}
                            className="py-0.5 px-1.5 -mx-1.5 rounded-md hover:bg-[var(--bg-hover)] inline-flex items-center gap-1.5 text-left transition-colors cursor-pointer"
                          >
                            <span className="font-mono text-[10px] text-[var(--text-muted)]">
                              {SLOT_LABELS[slot].short}:
                            </span>
                            <span className="text-[11px] text-[var(--text-primary)]">
                              {formatted}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {/* Minimal Hardware Legend Footer */}
        <div className="px-5 sm:px-6 py-3 border-t border-[var(--border-subtle)] flex items-center justify-between gap-3 flex-wrap text-[11px] text-[var(--text-muted)] shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span>
              <strong className="font-mono text-[var(--text-secondary)]">K9 Mode</strong>{' '}
              {tvEnabled ? 'Host ↔ TV' : 'Flash active host'}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="font-mono text-[var(--text-secondary)]">Hold Mode + Dial</strong>{' '}
              Host 1–3
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="font-mono text-[var(--text-secondary)]">Hold Mode 3s</strong>{' '}
              Setup
            </span>
          </div>
          <span className="font-mono text-[10px] text-[var(--text-muted)]">
            Click any control to edit
          </span>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
};
