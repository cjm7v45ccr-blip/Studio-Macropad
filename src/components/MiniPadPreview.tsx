import React from 'react';
import {
  CustomMacroItem,
  HardwareSlotId,
  TextMacroRepeatConfig
} from '../types/studio';
import {
  SLOT_LABELS,
  deriveAppearanceForAction,
  describeFirmwareAction
} from '../data/firmwareCatalog';
import { KeycapIcon } from '../data/iconRegistry';

interface MiniPadPreviewProps {
  title?: string;
  active?: boolean;
  resolveAction: (slot: HardwareSlotId) => string;
  resolveRepeat?: (slot: HardwareSlotId) => TextMacroRepeatConfig | undefined;
  customMacros?: CustomMacroItem[];
  compact?: boolean;
}

const MINI_KEY_SLOTS: readonly (HardwareSlotId | 'mode')[] = [
  'b1',
  'b2',
  'b3',
  'b4',
  'b5',
  'b6',
  'b7',
  'b8',
  'mode'
] as const;

export const MiniPadPreview: React.FC<MiniPadPreviewProps> = ({
  title,
  active = false,
  resolveAction,
  resolveRepeat,
  customMacros,
  compact = false
}) => {
  const k1Dial = resolveAction('dial');
  const k1Cw = resolveAction('enc_cw');
  const k1Ccw = resolveAction('enc_ccw');
  const k2Dial = resolveAction('dial2');
  const k2Cw = resolveAction('e2_cw');
  const k2Ccw = resolveAction('e2_ccw');

  const k1Tooltip = [
    k1Ccw ? `Left: ${describeFirmwareAction(k1Ccw, resolveRepeat?.('enc_ccw'), customMacros).shortLabel}` : null,
    k1Dial ? `Press: ${describeFirmwareAction(k1Dial, resolveRepeat?.('dial'), customMacros).shortLabel}` : null,
    k1Cw ? `Right: ${describeFirmwareAction(k1Cw, resolveRepeat?.('enc_cw'), customMacros).shortLabel}` : null
  ]
    .filter(Boolean)
    .join(' · ');

  const k2Tooltip = [
    k2Ccw ? `Left: ${describeFirmwareAction(k2Ccw, resolveRepeat?.('e2_ccw'), customMacros).shortLabel}` : null,
    k2Dial ? `Press: ${describeFirmwareAction(k2Dial, resolveRepeat?.('dial2'), customMacros).shortLabel}` : null,
    k2Cw ? `Right: ${describeFirmwareAction(k2Cw, resolveRepeat?.('e2_cw'), customMacros).shortLabel}` : null
  ]
    .filter(Boolean)
    .join(' · ');

  const k1Mapped = Boolean(k1Dial || k1Cw || k1Ccw);
  const k2Mapped = Boolean(k2Dial || k2Cw || k2Ccw);

  return (
    <div
      className={`rounded-xl bg-[#14161B] border ${
        active
          ? 'border-[var(--accent)] ring-1 ring-[rgba(var(--accent-rgb),0.35)]'
          : 'border-[#ECEAE4]/12'
      } ${compact ? 'p-2' : 'p-2.5'} select-none shadow-inner`}
    >
      {/* Mini OLED Strip */}
      <div className="mb-2 px-2 py-1 rounded-md bg-[#050608] border border-[#ECEAE4]/12 flex items-center justify-between gap-2">
        <span className="font-mono text-[9px] font-semibold tracking-wider uppercase text-[#ECEAE4] truncate">
          {title || 'BERTOPAD'}
        </span>
        <span className="w-4 h-1 rounded-full bg-[#ECEAE4]/25 shrink-0" aria-hidden="true" />
      </div>

      {/* 3x3 Key Matrix + Dual Encoders */}
      <div className="flex items-center justify-between gap-2">
        <div className="grid grid-cols-3 gap-1 flex-1">
          {MINI_KEY_SLOTS.map((slot, idx) => {
            if (slot === 'mode') {
              return (
                <div
                  key="mode"
                  title="Mode Key: Switch Host / TV"
                  className={`${
                    compact ? 'h-6' : 'h-7'
                  } rounded-[6px] bg-[#1E2128] border border-[#F2A33A]/35 flex items-center justify-center`}
                >
                  <span className="font-mono text-[7px] font-bold tracking-wider text-[#F2A33A]">
                    MODE
                  </span>
                </div>
              );
            }

            const raw = resolveAction(slot);
            const repeat = resolveRepeat?.(slot);
            const desc = describeFirmwareAction(raw, repeat, customMacros);
            const app = deriveAppearanceForAction(raw, undefined, repeat, customMacros);
            const isMapped = Boolean(raw);

            return (
              <div
                key={slot}
                title={`${SLOT_LABELS[slot].short}: ${isMapped ? desc.fullLabel : 'Unassigned'}`}
                className={`${
                  compact ? 'h-6' : 'h-7'
                } rounded-[6px] bg-[#1E2128] border flex items-center justify-center transition-colors ${
                  isMapped
                    ? 'border-[#ECEAE4]/14 text-[#ECEAE4]'
                    : 'border-[#ECEAE4]/5 text-[#A3A6AD]/35 opacity-45'
                }`}
              >
                {isMapped ? (
                  <KeycapIcon
                    icon={app.icon}
                    className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'}
                    style={{ color: app.labelColor || '#ECEAE4' }}
                  />
                ) : (
                  <span className="font-mono text-[8px] tabular-nums">{idx + 1}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Dual Mini Rotary Encoders */}
        <div className="flex flex-col items-center justify-center gap-1.5 pl-2 border-l border-[#ECEAE4]/10 shrink-0">
          {[
            { num: 1, mapped: k1Mapped, tip: k1Tooltip },
            { num: 2, mapped: k2Mapped, tip: k2Tooltip }
          ].map(knob => (
            <div
              key={knob.num}
              title={`Knob ${knob.num}: ${knob.tip || 'Unassigned'}`}
              className={`${
                compact ? 'w-6 h-6' : 'w-7 h-7'
              } rounded-full bg-[#1E2128] border flex items-center justify-center relative ${
                knob.mapped
                  ? 'border-[#F2A33A]/60 text-[#ECEAE4]'
                  : 'border-[#ECEAE4]/10 text-[#A3A6AD]/40 opacity-50'
              }`}
            >
              <span
                aria-hidden="true"
                className={`w-0.5 h-1.5 rounded-full absolute top-0.5 ${
                  knob.mapped ? 'bg-[#F2A33A]' : 'bg-[#A3A6AD]/40'
                }`}
              />
              <span className="font-mono text-[7px] font-semibold tabular-nums mt-1">
                K{knob.num}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
