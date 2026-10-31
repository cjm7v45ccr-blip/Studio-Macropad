import React, { useState, useEffect } from 'react';
import {
  ActionBinding,
  ActiveRepeatJob,
  CustomMacroItem,
  DeviceConnectionInfo,
  EncoderControlConfig,
  EncoderIndex,
  EncoderSubControlId,
  HardwareProfileId,
  HardwareSlotId,
  HostOsType,
  KeyboardLayoutId,
  SlotRepeatMap,
  profileShortTag
} from '../types/studio';
import {
  FACTORY_DEFAULT_SLOTS,
  SLOT_LABELS,
  bindingToFirmwareAction,
  describeFirmwareAction
} from '../data/firmwareCatalog';
import { ActionPickerControl } from './ActionPickerControl';
import { ParsedActionBadge } from './ActionTagBadge';
import {
  RotateCw,
  RotateCcw,
  Disc,
  Undo2,
  ArrowLeftRight,
  XCircle
} from 'lucide-react';

interface EncoderInspectorProps {
  encoder: EncoderControlConfig;
  encoderIndex: EncoderIndex;
  encoder1Color: string;
  encoder2Color: string;
  onSelectEncoder: (index: EncoderIndex) => void;
  selectedSubControl: EncoderSubControlId;
  onSelectSubControl: (sub: EncoderSubControlId) => void;
  activeProfileId: HardwareProfileId;
  activeProfileName: string;
  activeHostOs: HostOsType;
  tvEnabled?: boolean;
  onChangeHostOs?: (os: HostOsType) => void;
  showAdvancedIds?: boolean;
  onToggleAdvancedIds?: () => void;
  customMacros: CustomMacroItem[];
  keyboardLayout: KeyboardLayoutId;
  connection: DeviceConnectionInfo;
  activeRepeatJob?: ActiveRepeatJob | null;
  onUpdateSlot: (slot: EncoderSubControlId, binding: ActionBinding) => void;
  onResetSlotToDefault: (slot: HardwareSlotId) => void;
  onClearSlot?: (slot: HardwareSlotId) => void;
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
  encoderIndex,
  encoder1Color,
  encoder2Color,
  onSelectEncoder,
  selectedSubControl,
  onSelectSubControl,
  activeProfileId,
  activeProfileName,
  activeHostOs,
  tvEnabled,
  onChangeHostOs,
  showAdvancedIds = false,
  onToggleAdvancedIds,
  customMacros,
  keyboardLayout,
  connection,
  activeRepeatJob,
  onUpdateSlot,
  onResetSlotToDefault,
  onClearSlot,
  onApplyKnobSlots,
  onUpdateColor,
  onTestBinding,
  onStopRepeat,
  onOpenMacroBuilder
}) => {
  const isTvEnabled = tvEnabled ?? (connection.telemetry?.tvEnabled !== false);
  const dialSlot: EncoderSubControlId = encoderIndex === 2 ? 'dial2' : 'dial';
  const cwSlot: EncoderSubControlId = encoderIndex === 2 ? 'enc2_cw' : 'enc_cw';
  const ccwSlot: EncoderSubControlId = encoderIndex === 2 ? 'enc2_ccw' : 'enc_ccw';

  const activeBinding =
    selectedSubControl === 'dial' || selectedSubControl === 'dial2'
      ? encoder.dial
      : selectedSubControl === 'enc_cw' || selectedSubControl === 'enc2_cw'
      ? encoder.cw
      : encoder.ccw;

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
  const factoryDesc = describeFirmwareAction(
    factoryDefaultAction,
    undefined,
    customMacros
  );

  const canUndoSelection =
    activeBinding.value !== initialBindingOnSelect.value ||
    JSON.stringify(activeBinding.repeatConfig || null) !==
      JSON.stringify(initialBindingOnSelect.repeatConfig || null);

  const isAlreadyFactoryDefault =
    activeBinding.value === factoryDefaultAction && !activeBinding.repeatConfig;

  const isAlreadyUnassigned = !activeBinding.value && !activeBinding.repeatConfig;

  const handleApplyKnobPreset = (
    presetId: 'volume' | 'track' | 'channel' | 'arrows'
  ) => {
    if (presetId === 'volume') {
      if (activeProfileId === 'TV') {
        onApplyKnobSlots(
          {
            [dialSlot]: 'TV:MUTE',
            [cwSlot]: 'TV:VOL_UP',
            [ccwSlot]: 'TV:VOL_DOWN'
          },
          `Applied TV Volume preset to Knob ${encoderIndex}`
        );
      } else {
        onApplyKnobSlots(
          {
            [dialSlot]: 'MEDIA:MUTE',
            [cwSlot]: 'MEDIA:VOL_UP',
            [ccwSlot]: 'MEDIA:VOL_DOWN'
          },
          `Applied Volume preset to Knob ${encoderIndex}`
        );
      }
      return;
    }

    if (presetId === 'track') {
      onApplyKnobSlots(
        {
          [dialSlot]: 'MEDIA:PLAY_PAUSE',
          [cwSlot]: 'MEDIA:NEXT',
          [ccwSlot]: 'MEDIA:PREV'
        },
        `Applied Track skip preset to Knob ${encoderIndex}`
      );
      return;
    }

    if (presetId === 'channel') {
      onApplyKnobSlots(
        {
          [cwSlot]: 'TV:CH_UP',
          [ccwSlot]: 'TV:CH_DOWN'
        },
        `Applied Channel preset to Knob ${encoderIndex}`
      );
      return;
    }

    onApplyKnobSlots(
      {
        [cwSlot]: 'SHORTCUT::right',
        [ccwSlot]: 'SHORTCUT::left'
      },
      `Applied Arrow keys preset to Knob ${encoderIndex}`
    );
  };

  const handleSwapDirections = () => {
    const cwAct =
      bindingToFirmwareAction(encoder.cw) ||
      FACTORY_DEFAULT_SLOTS[activeProfileId][cwSlot];
    const ccwAct =
      bindingToFirmwareAction(encoder.ccw) ||
      FACTORY_DEFAULT_SLOTS[activeProfileId][ccwSlot];

    const repeatOverrides: SlotRepeatMap = {};
    if (encoder.ccw.repeatConfig) {
      repeatOverrides[`${activeProfileId}:${cwSlot}`] = encoder.ccw.repeatConfig;
    }
    if (encoder.cw.repeatConfig) {
      repeatOverrides[`${activeProfileId}:${ccwSlot}`] = encoder.cw.repeatConfig;
    }

    onApplyKnobSlots(
      {
        [cwSlot]: ccwAct,
        [ccwSlot]: cwAct
      },
      `Swapped Knob ${encoderIndex} Turn Left & Turn Right directions`,
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
      id: dialSlot,
      title: 'Press',
      icon: Disc,
      binding: encoder.dial
    },
    {
      id: cwSlot,
      title: 'Turn Right',
      icon: RotateCw,
      binding: encoder.cw
    },
    {
      id: ccwSlot,
      title: 'Turn Left',
      icon: RotateCcw,
      binding: encoder.ccw
    }
  ];

  return (
    <aside className="w-full lg:w-[440px] xl:w-[460px] shrink-0 bg-[var(--bg-panel)] border-t lg:border-t-0 lg:border-l border-[var(--border-subtle)] lg:h-full lg:overflow-y-auto">
      {/* Sticky Single-Scroll Header */}
      <div className="sticky top-0 z-20 bg-[var(--bg-panel)]/95 backdrop-blur-md px-4 sm:px-5 py-3.5 border-b border-[var(--border-subtle)] space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-full bg-[var(--bg-input)] border-2 flex items-center justify-center shrink-0"
              style={{ borderColor: encoder.color }}
            >
              <RotateCw className="w-4 h-4 text-[var(--text-primary)]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-[var(--text-primary)] truncate">
                {slotMeta.full}
              </h2>
              <p className="text-xs text-[var(--text-muted)] truncate">
                {activeProfileName} · {profileShortTag(activeProfileId)} · {slotMeta.short}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              disabled={!canUndoSelection}
              onClick={() => onUpdateSlot(selectedSubControl, initialBindingOnSelect)}
              title="Undo changes to this knob control"
              className="flex items-center gap-1 py-1.5 px-2 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer whitespace-nowrap"
            >
              <Undo2 className="w-3 h-3 shrink-0" />
              <span>Undo</span>
            </button>

            <button
              type="button"
              disabled={isAlreadyUnassigned}
              onClick={() =>
                onClearSlot
                  ? onClearSlot(selectedSubControl)
                  : onUpdateSlot(selectedSubControl, { type: 'none', value: '' })
              }
              title="Clear this knob control"
              className="flex items-center gap-1 py-1.5 px-2 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer whitespace-nowrap"
            >
              <XCircle className="w-3 h-3 shrink-0" />
              <span>Clear</span>
            </button>

            <button
              type="button"
              disabled={isAlreadyFactoryDefault}
              onClick={() => onResetSlotToDefault(selectedSubControl)}
              title={`Reset to default: ${factoryDesc.fullLabel}`}
              className="flex items-center gap-1 py-1.5 px-2 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3 h-3 shrink-0" />
              <span>Default</span>
            </button>
          </div>
        </div>

        {/* Knob 1 / Knob 2 Selector */}
        <div
          role="group"
          aria-label="Select rotary encoder"
          className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--bg-input)]"
        >
          {([1, 2] as const).map(idx => {
            const active = encoderIndex === idx;
            const ringColor = idx === 2 ? encoder2Color : encoder1Color;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onSelectEncoder(idx)}
                className={`flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-semibold shadow-2xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="w-2.5 h-2.5 rounded-full border-2 shrink-0"
                  style={{ borderColor: ringColor }}
                />
                <span>Knob {idx}</span>
              </button>
            );
          })}
        </div>

        {/* 3 Real Hardware Encoder Controls Selector */}
        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[var(--bg-input)]">
          {slotCards.map(card => {
            const Icon = card.icon;
            const active = selectedSubControl === card.id;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => onSelectSubControl(card.id)}
                className={`flex flex-col items-start gap-1 px-2.5 py-2 rounded-lg text-left transition-all cursor-pointer min-w-0 ${
                  active
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-2xs ring-1 ring-[var(--accent)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                <div className="flex items-center gap-1.5 w-full min-w-0">
                  <Icon
                    className={`w-3.5 h-3.5 shrink-0 ${
                      active ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                    }`}
                  />
                  <span className="text-[11px] font-semibold text-[var(--text-primary)] truncate">
                    {card.title}
                  </span>
                </div>
                <div className="w-full min-w-0 truncate">
                  <ParsedActionBadge
                    action={card.binding.value}
                    repeatConfig={card.binding.repeatConfig}
                    customMacros={customMacros}
                    showRawId={showAdvancedIds}
                    maxSteps={1}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Single-Scroll Body */}
      <div key={selectionKey} className="p-4 sm:p-5 space-y-4 animate-panel-in">
        {/* Quick Knob Presets & Swap Directions */}
        <div className="p-3 rounded-xl bg-[var(--bg-input)] space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-[var(--text-muted)]">
              Knob {encoderIndex} Presets
            </span>
            <button
              type="button"
              onClick={handleSwapDirections}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--bg-elevated)] text-[10px] font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors cursor-pointer whitespace-nowrap"
              title={`Swap Knob ${encoderIndex} Turn Left and Turn Right actions`}
            >
              <ArrowLeftRight className="w-3 h-3 text-[var(--accent)]" />
              <span>Swap directions</span>
            </button>
          </div>

          <div
            className={`grid gap-1.5 ${
              isTvEnabled ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'
            }`}
          >
            {(
              [
                { id: 'volume', label: 'Volume' },
                { id: 'track', label: 'Track skip' },
                ...(isTvEnabled ? ([{ id: 'channel', label: 'Channel' }] as const) : []),
                { id: 'arrows', label: 'Arrow keys' }
              ] as const
            ).map(preset => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApplyKnobPreset(preset.id)}
                className="py-1.5 px-2 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-panel)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Two-Pane Action Picker for selected encoder slot */}
        <ActionPickerControl
          binding={activeBinding}
          onChange={next => onUpdateSlot(selectedSubControl, next)}
          customMacros={customMacros}
          keyboardLayout={keyboardLayout}
          connection={connection}
          activeProfileId={activeProfileId}
          activeHostOs={activeHostOs}
          tvEnabled={isTvEnabled}
          onChangeHostOs={onChangeHostOs}
          showAdvancedIds={showAdvancedIds}
          onToggleAdvancedIds={onToggleAdvancedIds}
          activeRepeatJob={activeRepeatJob}
          onTestBinding={onTestBinding}
          onStopRepeat={onStopRepeat}
          onOpenMacroBuilder={onOpenMacroBuilder}
        />

        {/* Dial Ring Accent */}
        <div className="space-y-2 pt-3 border-t border-[var(--border-subtle)]">
          <label className="text-xs font-medium text-[var(--text-secondary)]">
            Knob {encoderIndex} Ring Accent
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            {RING_COLORS.map(hex => {
              const active = encoder.color.toLowerCase() === hex.toLowerCase();
              return (
                <button
                  key={hex}
                  type="button"
                  aria-label={`Select Knob ${encoderIndex} ring accent ${hex}`}
                  onClick={() => onUpdateColor(hex)}
                  className={`w-6 h-6 rounded-full border transition-transform cursor-pointer ${
                    active
                      ? 'scale-110 ring-2 ring-[var(--accent)] border-white'
                      : 'border-black/15 dark:border-white/20 hover:scale-105'
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
