import React, { useState } from 'react';
import {
  ActionBinding,
  ActiveRepeatJob,
  CustomMacroItem,
  EncoderControlConfig,
  HardwareProfileId,
  KeyboardLayoutId
} from '../types/studio';
import { describeFirmwareAction } from '../data/firmwareCatalog';
import { ActionPickerControl } from './ActionPickerControl';
import { RotateCw, RotateCcw, Disc } from 'lucide-react';

interface EncoderInspectorProps {
  encoder: EncoderControlConfig;
  activeProfileId: HardwareProfileId;
  activeProfileName: string;
  customMacros: CustomMacroItem[];
  keyboardLayout: KeyboardLayoutId;
  isConnected: boolean;
  activeRepeatJob?: ActiveRepeatJob | null;
  onUpdateSlot: (slot: 'dial' | 'enc_cw' | 'enc_ccw', binding: ActionBinding) => void;
  onUpdateColor: (color: string) => void;
  onTestBinding: (binding: ActionBinding) => void;
  onStopRepeat: () => void;
  onOpenMacroBuilder: () => void;
}

type EncoderTabId = 'enc_cw' | 'enc_ccw' | 'dial';

const RING_COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4'];

export const EncoderInspector: React.FC<EncoderInspectorProps> = ({
  encoder,
  activeProfileId,
  activeProfileName,
  customMacros,
  keyboardLayout,
  isConnected,
  activeRepeatJob,
  onUpdateSlot,
  onUpdateColor,
  onTestBinding,
  onStopRepeat,
  onOpenMacroBuilder
}) => {
  const [selectedSlot, setSelectedSlot] = useState<EncoderTabId>('enc_cw');

  const activeBinding =
    selectedSlot === 'dial'
      ? encoder.dial
      : selectedSlot === 'enc_cw'
      ? encoder.cw
      : encoder.ccw;

  const slotCards: {
    id: EncoderTabId;
    title: string;
    pin: string;
    icon: React.ComponentType<{ className?: string }>;
    binding: ActionBinding;
  }[] = [
    {
      id: 'enc_cw',
      title: 'Turn CW',
      pin: 'enc_cw',
      icon: RotateCw,
      binding: encoder.cw
    },
    {
      id: 'enc_ccw',
      title: 'Turn CCW',
      pin: 'enc_ccw',
      icon: RotateCcw,
      binding: encoder.ccw
    },
    {
      id: 'dial',
      title: 'Dial Push',
      pin: 'dial',
      icon: Disc,
      binding: encoder.dial
    }
  ];

  return (
    <aside className="w-full lg:w-[390px] shrink-0 bg-[var(--bg-panel)] border-l border-[var(--border-subtle)] flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-full bg-[var(--bg-input)] border-2 flex items-center justify-center shrink-0"
            style={{ borderColor: encoder.color }}
          >
            <RotateCw className="w-4 h-4 text-[var(--text-primary)]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Rotary Encoder
              </h2>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-input)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                GPIO 33/32/25
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] truncate">
              {activeProfileName} ({activeProfileId}) · 3 Hardware Slots
            </p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* 3 Real Hardware Encoder Slots Summary & Selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--text-secondary)]">
            Hardware Encoder Slot
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {slotCards.map(card => {
              const Icon = card.icon;
              const active = selectedSlot === card.id;
              const summary = describeFirmwareAction(
                card.binding.value,
                card.binding.repeatConfig
              );
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => setSelectedSlot(card.id)}
                  style={
                    active
                      ? {
                          borderColor: 'var(--accent)',
                          backgroundColor: 'rgba(var(--accent-rgb), 0.14)'
                        }
                      : undefined
                  }
                  className={`flex flex-col items-start gap-1 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    active
                      ? 'text-[var(--text-primary)] shadow-sm'
                      : 'bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <Icon className="w-3.5 h-3.5 text-[var(--accent)]" />
                    <span className="font-mono text-[9px] opacity-75">{card.pin}</span>
                  </div>
                  <span className="text-[11px] font-semibold text-[var(--text-primary)]">
                    {card.title}
                  </span>
                  <span className="text-[10px] truncate w-full text-[var(--text-secondary)]">
                    {summary.shortLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Action Picker for selected encoder slot */}
        <ActionPickerControl
          binding={activeBinding}
          onChange={next => onUpdateSlot(selectedSlot, next)}
          customMacros={customMacros}
          keyboardLayout={keyboardLayout}
          isConnected={isConnected}
          activeRepeatJob={activeRepeatJob}
          onTestBinding={onTestBinding}
          onStopRepeat={onStopRepeat}
          onOpenMacroBuilder={onOpenMacroBuilder}
        />

        {/* UI Ring Accent */}
        <div className="space-y-2 pt-3 border-t border-[var(--border-subtle)]">
          <label className="text-xs font-medium text-[var(--text-secondary)]">
            Dial Ring Accent
          </label>
          <div className="flex items-center gap-2">
            {RING_COLORS.map(hex => {
              const active = encoder.color.toLowerCase() === hex.toLowerCase();
              return (
                <button
                  key={hex}
                  type="button"
                  onClick={() => onUpdateColor(hex)}
                  className={`w-6 h-6 rounded-full border transition-transform cursor-pointer ${
                    active
                      ? 'scale-110 ring-2 ring-[var(--accent)] border-white'
                      : 'border-white/20 hover:scale-105'
                  }`}
                  style={{ backgroundColor: hex }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
};
