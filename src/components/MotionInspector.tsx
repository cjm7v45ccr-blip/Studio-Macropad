import React, { useState, useEffect } from 'react';
import {
  ActionBinding,
  ActiveRepeatJob,
  CustomMacroItem,
  DeviceConnectionInfo,
  HardwareProfileId,
  HardwareSlotId,
  HostOsType,
  KeyboardLayoutId,
  MotionControlConfig,
  MotionSlotId,
  profileShortTag
} from '../types/studio';
import {
  FACTORY_DEFAULT_SLOTS,
  SLOT_LABELS,
  bindingToFirmwareAction
} from '../data/firmwareCatalog';
import { ActionPickerControl } from './ActionPickerControl';
import { ParsedActionBadge } from './ActionTagBadge';
import {
  Compass,
  ArrowDown,
  ArrowUp,
  Undo2,
  XCircle,
  SlidersHorizontal
} from 'lucide-react';

interface MotionInspectorProps {
  motionConfig: MotionControlConfig;
  selectedSlot: MotionSlotId;
  onSelectSlot: (slot: MotionSlotId) => void;
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
  onUpdateSlot: (slot: MotionSlotId, binding: ActionBinding) => void;
  onResetSlotToDefault: (slot: HardwareSlotId) => void;
  onClearSlot?: (slot: HardwareSlotId) => void;
  onTestBinding: (binding: ActionBinding) => void;
  onStopRepeat: () => void;
  onOpenMacroBuilder: () => void;
  onOpenMotionSettings?: () => void;
}

const MOTION_CARDS: {
  slot: MotionSlotId;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    slot: 'g_shake',
    title: 'Shake',
    subtitle: 'Quick double shake',
    icon: Compass
  },
  {
    slot: 'g_down',
    title: 'Face Down',
    subtitle: 'Flip pad face-down',
    icon: ArrowDown
  },
  {
    slot: 'g_up',
    title: 'Face Up',
    subtitle: 'Return pad face-up',
    icon: ArrowUp
  }
];

export const MotionInspector: React.FC<MotionInspectorProps> = ({
  motionConfig,
  selectedSlot,
  onSelectSlot,
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
  onTestBinding,
  onStopRepeat,
  onOpenMacroBuilder,
  onOpenMotionSettings
}) => {
  const isTvEnabled = tvEnabled ?? (connection.telemetry?.tvEnabled !== false);
  const activeBinding: ActionBinding = motionConfig[selectedSlot] || {
    type: 'none',
    value: ''
  };

  const selectionKey = `${activeProfileId}:${selectedSlot}`;
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

  const currentActionStr = bindingToFirmwareAction(activeBinding);
  const defaultActionStr = FACTORY_DEFAULT_SLOTS[activeProfileId][selectedSlot] || '';
  const initialActionStr = bindingToFirmwareAction(initialBindingOnSelect);
  const canRevert = currentActionStr !== initialActionStr;
  const canClear = Boolean(currentActionStr);
  const canResetDefault = currentActionStr !== defaultActionStr;

  return (
    <aside className="w-full lg:w-[400px] xl:w-[430px] shrink-0 lg:h-full overflow-y-auto bg-[var(--bg-panel)] border-t lg:border-t-0 lg:border-l border-[var(--border-subtle)] flex flex-col">
      {/* Header + 3 Motion Gesture Selector Cards */}
      <div className="p-4 sm:p-5 border-b border-[var(--border-subtle)] space-y-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-[var(--text-muted)] tabular-nums">
              <span>{profileShortTag(activeProfileId)}</span>
              <span aria-hidden="true">·</span>
              <span className="truncate">{activeProfileName}</span>
              {showAdvancedIds && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-[var(--accent)]">{selectedSlot}</span>
                </>
              )}
            </div>
            <h2 className="text-sm font-bold text-[var(--text-primary)] mt-0.5">
              {SLOT_LABELS[selectedSlot].short}
            </h2>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {canRevert && (
              <button
                type="button"
                onClick={() => onUpdateSlot(selectedSlot, initialBindingOnSelect)}
                title="Revert unsaved edits on this motion trigger"
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                <Undo2 className="w-3 h-3" />
                <span>Revert</span>
              </button>
            )}
            {canClear && onClearSlot && (
              <button
                type="button"
                onClick={() => onClearSlot(selectedSlot)}
                title="Unassign this motion gesture"
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                <XCircle className="w-3 h-3" />
                <span>Clear</span>
              </button>
            )}
            {canResetDefault && (
              <button
                type="button"
                onClick={() => onResetSlotToDefault(selectedSlot)}
                title="Reset to factory default"
                className="px-2 py-1 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                Default
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {MOTION_CARDS.map(card => {
            const Icon = card.icon;
            const active = selectedSlot === card.slot;
            const bind = motionConfig[card.slot] || { type: 'none', value: '' };
            return (
              <button
                key={card.slot}
                type="button"
                onClick={() => onSelectSlot(card.slot)}
                className={`p-2.5 rounded-xl border text-left flex flex-col justify-between gap-1.5 transition-colors cursor-pointer min-w-0 ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'bg-[var(--bg-input)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
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
                  {bind.value ? (
                    <ParsedActionBadge
                      action={bind.value}
                      repeatConfig={bind.repeatConfig}
                      customMacros={customMacros}
                      showRawId={showAdvancedIds}
                      maxSteps={1}
                    />
                  ) : (
                    <span className="font-mono text-[10px] text-[var(--text-muted)]">
                      Unassigned
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {onOpenMotionSettings && (
          <div className="flex items-center justify-between gap-2 pt-1 text-[11px] text-[var(--text-muted)]">
            <span>
              {connection.telemetry?.motion?.enabled === false
                ? 'Motion gestures are currently turned off in Settings.'
                : `Sensitivity ${connection.telemetry?.motion?.sensitivity ?? 3}/5`}
            </span>
            <button
              type="button"
              onClick={onOpenMotionSettings}
              className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline font-medium cursor-pointer shrink-0"
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>Sensor settings</span>
            </button>
          </div>
        )}
      </div>

      {/* Action Picker Body */}
      <div key={selectionKey} className="p-4 sm:p-5 space-y-4 animate-panel-in">
        <ActionPickerControl
          binding={activeBinding}
          onChange={next => onUpdateSlot(selectedSlot, next)}
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
      </div>
    </aside>
  );
};
