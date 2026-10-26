import React, { useState, useEffect } from 'react';
import {
  ActionBinding,
  ActiveRepeatJob,
  CustomMacroItem,
  DeviceConnectionInfo,
  EncoderControlConfig,
  EncoderSubControlId,
  HardwareProfileId,
  HardwareSlotId,
  KeyboardLayoutId,
  SlotRepeatMap
} from '../types/studio';
import {
  FACTORY_DEFAULT_SLOTS,
  SLOT_LABELS,
  bindingToFirmwareAction,
  describeFirmwareAction
} from '../data/firmwareCatalog';
import { ActionPickerControl } from './ActionPickerControl';
import {
  RotateCw,
  RotateCcw,
  Disc,
  Undo2,
  ArrowLeftRight
} from 'lucide-react';

interface EncoderInspectorProps {
  encoder: EncoderControlConfig;
  selectedSubControl: EncoderSubControlId;
  onSelectSubControl: (sub: EncoderSubControlId) => void;
  activeProfileId: HardwareProfileId;
  activeProfileName: string;
  customMacros: CustomMacroItem[];
  keyboardLayout: KeyboardLayoutId;
  connection: DeviceConnectionInfo;
  activeRepeatJob?: ActiveRepeatJob | null;
  onUpdateSlot: (slot: EncoderSubControlId, binding: ActionBinding) => void;
  onResetSlotToDefault: (slot: HardwareSlotId) => void;
  onApplyKnobSlots: (
    partialSlots: Partial<Record<HardwareSlotId, string>>,
    successMsg: string,
    repeatOverrides?: SlotRepeatMap
  ) => void;
  onUpdateColor: (color: string) => void;
  onTestBinding: (binding: ActionBinding) => void;
  onStopRepeat: () => void;
  onOpenMacroBuilder: () => void;
}

const RING_COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4'];

export const EncoderInspector: React.FC<EncoderInspectorProps> = ({
  encoder,
  selectedSubControl,
  onSelectSubControl,
  activeProfileId,
  activeProfileName,
  customMacros,
  keyboardLayout,
  connection,
  activeRepeatJob,
  onUpdateSlot,
  onResetSlotToDefault,
  onApplyKnobSlots,
  onUpdateColor,
  onTestBinding,
  onStopRepeat,
  onOpenMacroBuilder
}) => {
  const activeBinding =
    selectedSubControl === 'dial'
      ? encoder.dial
      : selectedSubControl === 'enc_cw'
      ? encoder.cw
      : encoder.ccw;

  // Track the exact binding this encoder sub-control had when selected
  const selectionKey = `${activeProfileId}:${selectedSubControl}`;
  const [trackedKey, setTrackedKey] = useState(selectionKey);
  const [initialBindingOnSelect, setInitialBindingOnSelect] = useState<ActionBinding>(
    activeBinding
  );

  useEffect(() => {
    if (trackedKey !== selectionKey) {
      setTrackedKey(selectionKey);
      setInitialBindingOnSelect(activeBinding);
    }
  }, [selectionKey, trackedKey, activeBinding]);

  const slotMeta = SLOT_LABELS[selectedSubControl];
  const factoryDefaultAction = FACTORY_DEFAULT_SLOTS[activeProfileId][selectedSubControl];
  const factoryDesc = describeFirmwareAction(factoryDefaultAction);

  const canUndoSelection =
    activeBinding.value !== initialBindingOnSelect.value ||
    JSON.stringify(activeBinding.repeatConfig || null) !==
      JSON.stringify(initialBindingOnSelect.repeatConfig || null);

  const isAlreadyFactoryDefault =
    activeBinding.value === factoryDefaultAction && !activeBinding.repeatConfig;

  const handleApplyKnobPreset = (
    presetId: 'volume' | 'track' | 'channel' | 'arrows'
  ) => {
    if (presetId === 'volume') {
      if (activeProfileId === 'TV') {
        onApplyKnobSlots(
          {
            dial: 'TV:MUTE',
            enc_cw: 'TV:VOL_UP',
            enc_ccw: 'TV:VOL_DOWN'
          },
          'Applied TV Volume knob preset'
        );
      } else {
        onApplyKnobSlots(
          {
            dial: 'MEDIA:MUTE',
            enc_cw: 'MEDIA:VOL_UP',
            enc_ccw: 'MEDIA:VOL_DOWN'
          },
          'Applied Volume knob preset'
        );
      }
      return;
    }

    if (presetId === 'track') {
      onApplyKnobSlots(
        {
          dial: 'MEDIA:PLAY_PAUSE',
          enc_cw: 'MEDIA:NEXT',
          enc_ccw: 'MEDIA:PREV'
        },
        'Applied Track skip knob preset'
      );
      return;
    }

    if (presetId === 'channel') {
      onApplyKnobSlots(
        {
          enc_cw: 'TV:CH_UP',
          enc_ccw: 'TV:CH_DOWN'
        },
        'Applied Channel knob preset'
      );
      return;
    }

    onApplyKnobSlots(
      {
        enc_cw: 'SHORTCUT::right',
        enc_ccw: 'SHORTCUT::left'
      },
      'Applied Arrow keys knob preset'
    );
  };

  const handleSwapDirections = () => {
    const cwAct =
      bindingToFirmwareAction(encoder.cw) ||
      FACTORY_DEFAULT_SLOTS[activeProfileId].enc_cw;
    const ccwAct =
      bindingToFirmwareAction(encoder.ccw) ||
      FACTORY_DEFAULT_SLOTS[activeProfileId].enc_ccw;

    const repeatOverrides: SlotRepeatMap = {};
    if (encoder.ccw.repeatConfig) {
      repeatOverrides[`${activeProfileId}:enc_cw`] = encoder.ccw.repeatConfig;
    }
    if (encoder.cw.repeatConfig) {
      repeatOverrides[`${activeProfileId}:enc_ccw`] = encoder.cw.repeatConfig;
    }

    onApplyKnobSlots(
      {
        enc_cw: ccwAct,
        enc_ccw: cwAct
      },
      'Swapped knob Turn Left & Turn Right directions',
      repeatOverrides
    );
  };

  const slotCards: {
    id: EncoderSubControlId;
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    binding: ActionBinding;
  }[] = [
    {
      id: 'dial',
      title: 'Knob Press',
      icon: Disc,
      binding: encoder.dial
    },
    {
      id: 'enc_cw',
      title: 'Turn Right',
      icon: RotateCw,
      binding: encoder.cw
    },
    {
      id: 'enc_ccw',
      title: 'Turn Left',
      icon: RotateCcw,
      binding: encoder.ccw
    }
  ];

  return (
    <aside className="w-full lg:w-[400px] shrink-0 bg-[var(--bg-panel)] border-t lg:border-t-0 lg:border-l border-[var(--border-subtle)] flex flex-col lg:h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-5 py-3.5 border-b border-[var(--border-subtle)] space-y-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-full bg-[var(--bg-input)] border-2 flex items-center justify-center shrink-0"
            style={{ borderColor: encoder.color }}
          >
            <RotateCw className="w-4 h-4 text-[var(--text-primary)]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-[var(--text-primary)] truncate">
                {slotMeta.full}
              </h2>

            </div>
            <p className="text-xs text-[var(--text-muted)] truncate">
              {activeProfileName} ({activeProfileId}) · {slotMeta.short}
            </p>
          </div>
        </div>

        {/* Control-Scoped Undo & Reset to Default Bar */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!canUndoSelection}
            onClick={() => onUpdateSlot(selectedSubControl, initialBindingOnSelect)}
            title="Restore the value this knob control had when you selected it"
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer whitespace-nowrap"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Undo</span>
          </button>

          <button
            type="button"
            disabled={isAlreadyFactoryDefault}
            onClick={() => onResetSlotToDefault(selectedSubControl)}
            title={`Reset to factory default: ${factoryDesc.fullLabel} (${factoryDefaultAction})`}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to default</span>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
        {/* 3 Real Hardware Encoder Controls Selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--text-secondary)]">
            Rotary Knob Controls (3 Slots)
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {slotCards.map(card => {
              const Icon = card.icon;
              const active = selectedSubControl === card.id;
              const summary = describeFirmwareAction(
                card.binding.value,
                card.binding.repeatConfig
              );
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => onSelectSubControl(card.id)}
                  style={
                    active
                      ? {
                          borderColor: 'var(--accent)',
                          backgroundColor: 'rgba(var(--accent-rgb), 0.14)'
                        }
                      : undefined
                  }
                  className={`flex flex-col items-start gap-1 p-2.5 rounded-xl border text-left transition-all cursor-pointer min-w-0 ${
                    active
                      ? 'text-[var(--text-primary)] shadow-sm'
                      : 'bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  <div className="flex items-center justify-between w-full gap-1">
                    <Icon className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  </div>
                  <span className="text-[11px] font-semibold text-[var(--text-primary)] truncate w-full">
                    {card.title}
                  </span>
                  <span className="text-[10px] truncate w-full text-[var(--text-secondary)]">
                    {summary.shortLabel}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-[var(--text-muted)] leading-relaxed pt-0.5">
            Hardware shortcut: holding <span className="font-semibold text-[var(--text-secondary)]">Mode</span> while rotating the dial cycles BLE Hosts 1–3 without overriding these bindings.
          </p>
        </div>

        {/* Quick Knob Presets & Swap Directions */}
        <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Knob Presets
            </span>
            <button
              type="button"
              onClick={handleSwapDirections}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--bg-elevated)] hover:border-[var(--accent)] border border-[var(--border-subtle)] text-[10px] font-semibold text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap"
              title="Swap Turn Left and Turn Right actions"
            >
              <ArrowLeftRight className="w-3 h-3 text-[var(--accent)]" />
              <span>Swap directions</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {(
              [
                { id: 'volume', label: 'Volume' },
                { id: 'track', label: 'Track skip' },
                { id: 'channel', label: 'Channel' },
                { id: 'arrows', label: 'Arrow keys' }
              ] as const
            ).map(preset => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApplyKnobPreset(preset.id)}
                className="py-1.5 px-2 rounded-lg bg-[var(--bg-elevated)] hover:border-[var(--accent)] border border-[var(--border-subtle)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Action Picker for selected encoder slot */}
        <ActionPickerControl
          binding={activeBinding}
          onChange={next => onUpdateSlot(selectedSubControl, next)}
          customMacros={customMacros}
          keyboardLayout={keyboardLayout}
          connection={connection}
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
          <div className="flex items-center gap-2 flex-wrap">
            {RING_COLORS.map(hex => {
              const active = encoder.color.toLowerCase() === hex.toLowerCase();
              return (
                <button
                  key={hex}
                  type="button"
                  aria-label={`Select ring accent ${hex}`}
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
