import React, { useEffect, useState } from 'react';
import {
  HardwareProfileId,
  HardwareSlotId,
  StudioProfile,
  isBleHostProfile,
  profileShortTag
} from '../types/studio';
import { HARDWARE_SLOTS, SLOT_LABELS } from '../data/firmwareCatalog';
import {
  extractProfileSlots,
  getBindingForProfileSlot
} from '../hooks/useStudioState';
import { ParsedActionBadge } from './ActionTagBadge';
import {
  Bluetooth,
  BookOpen,
  Disc,
  Printer,
  RotateCcw,
  RotateCw,
  Tv,
  X
} from 'lucide-react';

interface CheatSheetModalProps {
  isOpen: boolean;
  profiles: StudioProfile[];
  activeProfileId: HardwareProfileId;
  tvEnabled?: boolean;
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

const KNOB_1_SLOTS: {
  slot: HardwareSlotId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { slot: 'dial', label: 'K1 Press', icon: Disc },
  { slot: 'enc_ccw', label: 'K1 Left', icon: RotateCcw },
  { slot: 'enc_cw', label: 'K1 Right', icon: RotateCw }
];

const KNOB_2_SLOTS: {
  slot: HardwareSlotId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { slot: 'dial2', label: 'K2 Press', icon: Disc },
  { slot: 'enc2_ccw', label: 'K2 Left', icon: RotateCcw },
  { slot: 'enc2_cw', label: 'K2 Right', icon: RotateCw }
];

export const CheatSheetModal: React.FC<CheatSheetModalProps> = ({
  isOpen,
  profiles,
  activeProfileId,
  tvEnabled = true,
  onClose,
  onJumpToControl
}) => {
  const [labelMode, setLabelMode] = useState<'friendly' | 'value'>('friendly');

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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cheat-sheet-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-sm print:static print:inset-auto print:bg-white print:p-0"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-strong)] shadow-2xl overflow-hidden print:max-h-none print:border-0 print:shadow-none"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0 print:hidden">
              <BookOpen className="w-4 h-4 text-[var(--accent)]" />
            </div>
            <div className="min-w-0">
              <h2
                id="cheat-sheet-title"
                className="text-sm sm:text-base font-bold text-[var(--text-primary)] truncate"
              >
                All-Host Desk Reference
              </h2>
              <p className="text-xs text-[var(--text-muted)] truncate tabular-nums">
                4 profiles · 56 programmable controls · Click any slot to configure on canvas
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 print:hidden">
            <div
              role="group"
              aria-label="Action label display mode"
              className="flex items-center p-0.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)]"
            >
              <button
                type="button"
                onClick={() => setLabelMode('friendly')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  labelMode === 'friendly'
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                Readable
              </button>
              <button
                type="button"
                onClick={() => setLabelMode('value')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  labelMode === 'value'
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                Tokens
              </button>
            </div>

            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Printer className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Print Reference</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close desk reference"
              className="p-1.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 4-Profile Reference Grid */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-4 print:overflow-visible print:p-2">
          {profiles.map(prof => {
            const slots = extractProfileSlots(prof);
            const isBle = isBleHostProfile(prof.id);
            const ProfileIcon = isBle ? Bluetooth : Tv;
            const isActive = prof.id === activeProfileId;
            const assignedCount = HARDWARE_SLOTS.filter(s =>
              Boolean(slots[s])
            ).length;

            return (
              <section
                key={prof.id}
                className={`rounded-2xl bg-[var(--bg-input)]/55 border p-4 space-y-3 transition-colors ${
                  isActive
                    ? 'border-[var(--accent)]/65'
                    : 'border-[var(--border-subtle)]'
                }`}
              >
                {/* Profile Header */}
                <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-strong)] font-mono text-[11px] font-bold text-sky-600 dark:text-sky-400 tabular-nums shrink-0">
                      [{profileShortTag(prof.id)}]
                    </span>
                    <ProfileIcon className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
                    <h3 className="text-xs sm:text-sm font-bold text-[var(--text-primary)] truncate">
                      {prof.name}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 font-mono text-[10px] tabular-nums">
                    {prof.id === 'TV' && !tvEnabled && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/12 border border-amber-500/35 text-amber-700 dark:text-amber-300 font-semibold print:hidden">
                        TV off
                      </span>
                    )}
                    {isActive && (
                      <span className="px-1.5 py-0.5 rounded bg-[var(--accent)]/15 border border-[var(--accent)]/40 text-[var(--text-primary)] font-semibold print:hidden">
                        Active
                      </span>
                    )}
                    <span className="text-[var(--text-muted)]">
                      {assignedCount}/14 mapped
                    </span>
                  </div>
                </div>

                {/* 8 Mechanical Keys (2x4 Grid) */}
                <div className="grid grid-cols-2 gap-1.5">
                  {KEY_SLOTS.map((slot, idx) => {
                    const act = slots[slot];
                    const bind = getBindingForProfileSlot(profiles, prof.id, slot);
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => {
                          onJumpToControl(prof.id, slot);
                          onClose();
                        }}
                        title={`Configure ${prof.name} · ${SLOT_LABELS[slot].short}`}
                        className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-panel)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--accent)] flex items-center justify-between gap-2 text-left transition-colors cursor-pointer min-w-0"
                      >
                        <span className="font-mono text-[10px] font-semibold text-[var(--text-muted)] tabular-nums shrink-0">
                          K{idx + 1}
                        </span>
                        <div className="min-w-0 flex-1 flex justify-end overflow-hidden">
                          <ParsedActionBadge
                            action={act}
                            repeatConfig={bind?.repeatConfig}
                            labelMode={labelMode}
                            maxSteps={1}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Dual Rotary Dial Controls (Knob 1 & Knob 2) */}
                <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1.5">
                  {[KNOB_1_SLOTS, KNOB_2_SLOTS].map((knobGroup, groupIdx) => (
                    <div
                      key={groupIdx}
                      className="grid grid-cols-1 sm:grid-cols-3 gap-1.5"
                    >
                      {knobGroup.map(({ slot, label, icon: KnobIcon }) => {
                        const act = slots[slot];
                        const bind = getBindingForProfileSlot(profiles, prof.id, slot);
                        return (
                          <button
                            key={slot}
                            type="button"
                            onClick={() => {
                              onJumpToControl(prof.id, slot);
                              onClose();
                            }}
                            title={`Configure ${prof.name} · ${SLOT_LABELS[slot].full}`}
                            className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-panel)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--accent)] flex flex-col gap-1 text-left transition-colors cursor-pointer min-w-0"
                          >
                            <div className="flex items-center gap-1 text-[10px] font-mono text-[var(--text-muted)]">
                              <KnobIcon className="w-3 h-3 shrink-0" />
                              <span className="truncate">{label}</span>
                            </div>
                            <div className="min-w-0 overflow-hidden">
                              <ParsedActionBadge
                                action={act}
                                repeatConfig={bind?.repeatConfig}
                                labelMode={labelMode}
                                maxSteps={1}
                              />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {/* Footer Hardware Gesture Legend */}
        <div className="px-4 sm:px-6 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-input)]/40 flex items-center justify-between gap-3 flex-wrap text-[11px] text-[var(--text-secondary)]">
          <div className="flex items-center gap-3 flex-wrap">
            <span>
              <strong className="font-mono text-[var(--text-primary)]">Key 9 (Mode):</strong>{' '}
              {tvEnabled ? 'Tap to toggle BLE Host ↔ TV' : 'Tap to flash active Host (TV off)'}
            </span>
            <span aria-hidden="true" className="text-[var(--text-muted)]">
              ·
            </span>
            <span>
              <strong className="font-mono text-[var(--text-primary)]">Hold Mode + Dial:</strong>{' '}
              Cycle Host 1–3
            </span>
            <span aria-hidden="true" className="text-[var(--text-muted)]">
              ·
            </span>
            <span>
              <strong className="font-mono text-[var(--text-primary)]">Hold Mode 3s:</strong>{' '}
              Setup Mode
            </span>
          </div>
          <span className="font-mono text-[10px] text-[var(--text-muted)] tabular-nums">
            Studio MacroPad Pro
          </span>
        </div>
      </div>
    </div>
  );
};
