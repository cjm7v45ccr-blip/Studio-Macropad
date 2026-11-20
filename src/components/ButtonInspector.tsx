import React, { useState, useRef, useEffect } from 'react';
import {
  ActionBinding,
  ActiveRepeatJob,
  BleHostSlot,
  CustomMacroItem,
  DeviceConnectionInfo,
  HardwareProfileId,
  HardwareSlotId,
  HostOsType,
  KeyAppearance,
  KeyControlConfig,
  KeyboardLayoutId,
  StudioProfile,
  bleSlotToProfileId,
  profileIdToBleSlot
} from '../types/studio';
import { ICON_LIBRARY, KeycapIcon } from '../data/iconRegistry';
import {
  FACTORY_DEFAULT_SLOTS,
  SLOT_LABELS,
  describeFirmwareAction,
  hasKeyHoldCapability
} from '../data/firmwareCatalog';
import { ActionKeyId, KEY_TO_HOLD_SLOT } from '../data/presetTemplates';
import { ActionPickerControl } from './ActionPickerControl';
import {
  RotateCcw,
  Upload,
  Search,
  Layers,
  ArrowLeftRight,
  Bluetooth,
  XCircle
} from 'lucide-react';

interface ButtonInspectorProps {
  keyConfig: KeyControlConfig;
  profiles: StudioProfile[];
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
  activeTrigger?: 'tap' | 'hold';
  onSelectTrigger?: (trigger: 'tap' | 'hold') => void;
  onUpdateBinding: (binding: ActionBinding) => void;
  onUpdateHoldBinding?: (binding: ActionBinding) => void;
  onResetSlotToDefault: (slot: HardwareSlotId) => void;
  onClearSlot?: (slot: HardwareSlotId) => void;
  onUpdateAppearance: (patch: Partial<KeyAppearance>) => void;
  onResetAppearance: () => void;
  onSelectProfile: (id: HardwareProfileId) => void;
  onToggleProfileMode: () => void;
  onSwitchBleHost: (slot: BleHostSlot) => Promise<void> | void;
  onTestBinding: (binding: ActionBinding) => void;
  onStopRepeat: () => void;
  onOpenMacroBuilder: () => void;
}

const COLOR_SWATCHES = [
  '#ECEAE4',
  '#F2A33A',
  '#D97706',
  '#10B981',
  '#38BDF8',
  '#F43F5E',
  '#A3A6AD'
];

export const ButtonInspector: React.FC<ButtonInspectorProps> = ({
  keyConfig,
  profiles,
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
  activeTrigger = 'tap',
  onSelectTrigger,
  onUpdateBinding,
  onUpdateHoldBinding,
  onResetSlotToDefault,
  onClearSlot,
  onUpdateAppearance,
  onResetAppearance,
  onSelectProfile,
  onToggleProfileMode,
  onSwitchBleHost,
  onTestBinding,
  onStopRepeat,
  onOpenMacroBuilder
}) => {
  const [inspectorSection, setInspectorSection] = useState<'action' | 'appearance'>('action');
  const [iconQuery, setIconQuery] = useState('');
  const [iconCategory, setIconCategory] = useState<string>('All');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasKeyHold = hasKeyHoldCapability(connection.telemetry?.capabilities);
  const effectiveTrigger: 'tap' | 'hold' =
    hasKeyHold && activeTrigger === 'hold' ? 'hold' : 'tap';
  const currentTap = keyConfig.triggers.tap;
  const currentHold: ActionBinding = keyConfig.triggers.hold || {
    type: 'none',
    value: ''
  };
  const activeBinding = effectiveTrigger === 'hold' ? currentHold : currentTap;

  const selectionKey = `${activeProfileId}:${keyConfig.id}:${effectiveTrigger}`;
  const [trackedSelectionKey, setTrackedSelectionKey] = useState(selectionKey);

  useEffect(() => {
    if (trackedSelectionKey !== selectionKey) {
      setTrackedSelectionKey(selectionKey);
      if (effectiveTrigger === 'hold') {
        setInspectorSection('action');
      }
    }
  }, [selectionKey, trackedSelectionKey, effectiveTrigger]);

  const isTvEnabled = tvEnabled ?? (connection.telemetry?.tvEnabled !== false);
  const activeBleHost: BleHostSlot =
    connection.telemetry?.bleActiveHost ?? profileIdToBleSlot(activeProfileId) ?? 1;

  // Dedicated Mode Switch Inspector (9th physical button)
  if (keyConfig.isModeSwitch || keyConfig.id === 'k9') {
    const activeHostProf = profiles.find(
      p => p.id === bleSlotToProfileId(activeBleHost)
    );
    const activeHostDisplay = activeHostProf?.name || `Device ${activeBleHost}`;

    return (
      <aside className="w-full lg:w-[430px] xl:w-[450px] shrink-0 bg-[var(--bg-panel)] border-t lg:border-t-0 lg:border-l border-[var(--border-subtle)] lg:h-full lg:overflow-y-auto">
        <div className="sticky top-0 z-20 bg-[var(--bg-panel)] px-5 py-4 border-b border-[var(--border-subtle)] flex items-center gap-2.5">
          <Layers className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] tracking-tight">
              Mode Key
            </h2>
            <p className="font-mono text-[11px] text-[var(--text-muted)]">
              {isTvEnabled ? 'Multi-host BLE · TV · Setup' : 'Multi-host BLE · Setup'}
            </p>
          </div>
        </div>

        <div key={selectionKey} className="px-5 py-4 divide-y divide-[var(--border-subtle)] animate-panel-in">
          <div className="pb-5 space-y-2.5">
            <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              Hardware Gestures
            </div>
            <div className="divide-y divide-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
              <div className="py-2 flex items-baseline justify-between gap-3">
                <span className="font-mono text-[11px] text-[var(--text-primary)] shrink-0">
                  Short Press
                </span>
                <span className="text-right text-[var(--text-secondary)]">
                  {isTvEnabled ? `Toggle ${activeHostDisplay} / TV` : `Show ${activeHostDisplay} on OLED`}
                </span>
              </div>
              <div className="py-2 flex items-baseline justify-between gap-3">
                <span className="font-mono text-[11px] text-[var(--text-primary)] shrink-0">
                  Hold + Dial
                </span>
                <span className="text-right text-[var(--text-secondary)]">
                  Cycle BLE hosts 1–3
                </span>
              </div>
              <div className="py-2 flex items-baseline justify-between gap-3">
                <span className="font-mono text-[11px] text-[var(--text-primary)] shrink-0">
                  Hold 3s
                </span>
                <span className="text-right text-[var(--text-secondary)]">
                  Toggle OLED Setup Mode
                </span>
              </div>
            </div>
          </div>

          {isTvEnabled && (
            <div className="py-4">
              <button
                type="button"
                onClick={onToggleProfileMode}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg studio-cta text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Switch to {activeProfileId === 'TV' ? activeHostDisplay : 'TV'} Profile
                </span>
              </button>
            </div>
          )}

          <div className="pt-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                <Bluetooth className="w-3.5 h-3.5 shrink-0" />
                <span>Bluetooth Host</span>
              </div>
              <span className="font-mono text-[10px] text-[var(--text-muted)] tabular-nums">
                {connection.connected
                  ? connection.telemetry?.bleDeviceName || `BertoPad ${activeBleHost}`
                  : '3 hosts'}
              </span>
            </div>

            <div
              role="group"
              aria-label="Select Bluetooth host"
              className="grid grid-cols-3 gap-1"
            >
              {([1, 2, 3] as const).map(slot => {
                const hostProfId = bleSlotToProfileId(slot);
                const hostProf = profiles.find(p => p.id === hostProfId);
                const isCurrent = connection.connected
                  ? activeBleHost === slot
                  : activeProfileId === hostProfId;
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => {
                      if (connection.connected) {
                        onSwitchBleHost(slot);
                      } else {
                        onSelectProfile(hostProfId);
                      }
                    }}
                    className={`py-2 px-2 rounded-lg text-left transition-colors cursor-pointer whitespace-nowrap min-w-0 ${
                      isCurrent
                        ? 'bg-[var(--bg-selected)] text-[var(--text-primary)] font-medium'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--text-muted)] tabular-nums">
                      <span>H{slot}</span>
                      {isCurrent && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" aria-hidden="true" />
                      )}
                    </div>
                    <div className="text-xs mt-0.5 truncate">
                      {hostProf?.name || `Device ${slot}`}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </aside>
    );
  }

  const tapSlotId: HardwareSlotId = keyConfig.slot || 'b1';
  const holdSlotId: HardwareSlotId =
    keyConfig.holdSlot || KEY_TO_HOLD_SLOT[keyConfig.id];
  const slotId: HardwareSlotId =
    effectiveTrigger === 'hold' ? holdSlotId : tapSlotId;
  const slotMeta = SLOT_LABELS[slotId];
  const factoryDefaultAction = FACTORY_DEFAULT_SLOTS[activeProfileId][slotId];
  const factoryDesc = describeFirmwareAction(
    factoryDefaultAction,
    undefined,
    customMacros
  );

  const tapDesc = currentTap.value
    ? describeFirmwareAction(currentTap.value, currentTap.repeatConfig, customMacros)
        .shortLabel
    : 'Unassigned';
  const holdDesc = currentHold.value
    ? describeFirmwareAction(currentHold.value, currentHold.repeatConfig, customMacros)
        .shortLabel
    : 'Unassigned';

  const handleActiveBindingChange = (next: ActionBinding) => {
    if (effectiveTrigger === 'hold' && onUpdateHoldBinding) {
      onUpdateHoldBinding(next);
    } else {
      onUpdateBinding(next);
    }
  };

  const isAlreadyFactoryDefault =
    activeBinding.value === factoryDefaultAction && !activeBinding.repeatConfig;

  const isAlreadyUnassigned = !activeBinding.value && !activeBinding.repeatConfig;

  const categories = [
    'All',
    'Media',
    'Stream & Calls',
    'Creative',
    'Code',
    'System',
    'Navigation'
  ];

  const filteredIcons = ICON_LIBRARY.filter(entry => {
    const matchesCat = iconCategory === 'All' || entry.category === iconCategory;
    if (!matchesCat) return false;
    if (!iconQuery.trim()) return true;
    const q = iconQuery.toLowerCase();
    return (
      entry.label.toLowerCase().includes(q) ||
      entry.keywords.some(k => k.includes(q))
    );
  });

  const handleCustomIconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onUpdateAppearance({ icon: reader.result });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <aside className="w-full lg:w-[430px] xl:w-[450px] shrink-0 bg-[var(--bg-panel)] border-t lg:border-t-0 lg:border-l border-[var(--border-subtle)] lg:h-full lg:overflow-y-auto">
      {/* Sticky Minimal Header */}
      <div className="sticky top-0 z-20 bg-[var(--bg-panel)] px-5 pt-4 border-b border-[var(--border-subtle)] space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <KeycapIcon
              icon={keyConfig.appearance.icon}
              className="w-4 h-4 shrink-0"
              style={{ color: keyConfig.appearance.labelColor }}
            />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-[var(--text-primary)] tracking-tight truncate">
                {keyConfig.appearance.label || slotMeta.full}
              </h2>
              <p className="font-mono text-[11px] text-[var(--text-muted)] truncate tabular-nums">
                {slotMeta.short} · {activeProfileName} · {effectiveTrigger === 'hold' ? 'Hold' : 'Tap'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              disabled={isAlreadyUnassigned}
              onClick={() =>
                onClearSlot
                  ? onClearSlot(slotId)
                  : handleActiveBindingChange({ type: 'none', value: '' })
              }
              title="Clear this control"
              className="flex items-center gap-1 py-1 px-2 rounded-md text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer whitespace-nowrap"
            >
              <XCircle className="w-3 h-3 shrink-0" />
              <span>Clear</span>
            </button>

            <button
              type="button"
              disabled={isAlreadyFactoryDefault}
              onClick={() => onResetSlotToDefault(slotId)}
              title={`Reset to default: ${factoryDesc.fullLabel || 'Unassigned'}`}
              className="flex items-center gap-1 py-1 px-2 rounded-md text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3 h-3 shrink-0" />
              <span>Default</span>
            </button>
          </div>
        </div>

        {/* Flat Press vs Hold Trigger Rows */}
        {hasKeyHold && (
          <div
            role="group"
            aria-label="Key trigger type"
            className="divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)] -mx-5 px-5"
          >
            <button
              type="button"
              onClick={() => {
                onSelectTrigger?.('tap');
                setInspectorSection('action');
              }}
              className={`w-full -mx-2 px-2 py-2 flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer ${
                effectiveTrigger === 'tap'
                  ? 'bg-[var(--bg-selected)] text-[var(--text-primary)] font-medium rounded-md'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span className="font-mono text-[11px] whitespace-nowrap shrink-0">
                Press · {SLOT_LABELS[tapSlotId].short}
              </span>
              <span className="truncate text-[11px] text-[var(--text-muted)]">
                {tapDesc}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectTrigger?.('hold');
                setInspectorSection('action');
              }}
              className={`w-full -mx-2 px-2 py-2 flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer ${
                effectiveTrigger === 'hold'
                  ? 'bg-[var(--bg-selected)] text-[var(--text-primary)] font-medium rounded-md'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span className="font-mono text-[11px] whitespace-nowrap shrink-0">
                Hold (500ms)
              </span>
              <span className="truncate text-[11px] text-[var(--text-muted)]">
                {holdDesc}
              </span>
            </button>
          </div>
        )}

        {/* Underline Section Tabs: Action vs Keycap Legend */}
        <div className="flex items-center gap-5 border-t border-[var(--border-subtle)] -mx-5 px-5 pt-1">
          <button
            type="button"
            onClick={() => setInspectorSection('action')}
            className={`py-2 text-xs transition-colors cursor-pointer whitespace-nowrap border-b-2 -mb-px ${
              inspectorSection === 'action'
                ? 'border-[var(--text-primary)] text-[var(--text-primary)] font-semibold'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {hasKeyHold && effectiveTrigger === 'hold' ? 'Hold Action' : 'Action'}
          </button>
          <button
            type="button"
            onClick={() => setInspectorSection('appearance')}
            className={`py-2 text-xs transition-colors cursor-pointer whitespace-nowrap border-b-2 -mb-px ${
              inspectorSection === 'appearance'
                ? 'border-[var(--text-primary)] text-[var(--text-primary)] font-semibold'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            Keycap Legend
          </button>
        </div>
      </div>

      {/* Single-Scroll Body */}
      <div key={selectionKey} className="p-4 sm:p-5 space-y-5 animate-panel-in">
        {inspectorSection === 'action' ? (
          <ActionPickerControl
            binding={activeBinding}
            onChange={handleActiveBindingChange}
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
        ) : (
          <div className="space-y-5">
            {/* Virtual 1-Bit OLED Preview Box */}
            <div className="p-3.5 rounded-2xl bg-black border border-[#ECEAE4]/20 flex flex-col items-center justify-center space-y-2 font-mono text-[#ECEAE4]">
              <div className="w-full flex items-center justify-between text-[10px] border-b border-[#ECEAE4]/15 pb-1.5 text-[#A3A6AD]">
                <span className="font-semibold text-[#ECEAE4] flex items-center gap-1.5">
                  <img
                    src="/logo-mark-mono.svg"
                    alt="OLED"
                    referrerPolicy="no-referrer"
                    className="w-3.5 h-3.5 object-contain"
                  />
                  <span>OLED Preview</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-[#A3A6AD]">
                    {activeProfileName} · {slotMeta.short}
                  </span>
                </div>
              </div>
              <div className="py-2.5 flex flex-col items-center justify-center space-y-1.5">
                <div className="w-12 h-12 rounded-xl bg-[#14161B] border border-[#ECEAE4]/30 flex items-center justify-center">
                  <KeycapIcon
                    icon={keyConfig.appearance.icon}
                    className="w-6 h-6"
                    style={{ color: '#ECEAE4' }}
                  />
                </div>
                <span className="text-xs font-bold tracking-wider text-[#ECEAE4] truncate max-w-[200px]">
                  {keyConfig.appearance.label || slotMeta.short}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                Keycap Appearance
              </span>
              <button
                type="button"
                onClick={onResetAppearance}
                className="text-[11px] font-semibold text-[var(--accent)] hover:underline cursor-pointer"
              >
                Auto-match action
              </button>
            </div>

            {/* Keycap Label */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[var(--text-secondary)]">
                  Keycap Label
                </label>
                <span className="font-mono text-[10px] text-[var(--text-muted)] tabular-nums">
                  {keyConfig.appearance.label.length}/12
                </span>
              </div>
              <input
                type="text"
                maxLength={12}
                value={keyConfig.appearance.label}
                onChange={e => onUpdateAppearance({ label: e.target.value })}
                placeholder="e.g. Copy"
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            {/* Keycap Tint */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                Legend Color
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                {COLOR_SWATCHES.map(hex => {
                  const active =
                    keyConfig.appearance.labelColor.toLowerCase() === hex.toLowerCase();
                  return (
                    <button
                      key={hex}
                      type="button"
                      aria-label={`Select color ${hex}`}
                      onClick={() => onUpdateAppearance({ labelColor: hex })}
                      className={`w-6 h-6 rounded-full border transition-transform cursor-pointer ${
                        active
                          ? 'scale-110 ring-2 ring-[var(--accent)] border-[var(--text-primary)]'
                          : 'border-[var(--border-strong)] hover:scale-105'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Icon Library + Custom Upload (no nested scroll container) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[var(--text-secondary)]">
                  Keycap Icon
                </label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  <Upload className="w-3 h-3" />
                  <span>Upload SVG/PNG</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/svg+xml,image/jpeg,image/webp"
                  onChange={handleCustomIconUpload}
                  className="hidden"
                />
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={iconQuery}
                  onChange={e => setIconQuery(e.target.value)}
                  placeholder="Search icons…"
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="flex items-center flex-wrap gap-1 border-b border-[var(--border-subtle)] pb-2">
                {categories.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setIconCategory(cat)}
                    className={`px-2 py-1 rounded-md text-[11px] whitespace-nowrap transition-colors cursor-pointer ${
                      iconCategory === cat
                        ? 'bg-[var(--bg-selected)] text-[var(--text-primary)] font-medium'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-6 gap-1">
                {filteredIcons.map(entry => {
                  const IconComp = entry.component;
                  const active = keyConfig.appearance.icon === entry.id;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      title={entry.label}
                      onClick={() => onUpdateAppearance({ icon: entry.id })}
                      className={`aspect-square rounded-md flex items-center justify-center transition-colors cursor-pointer ${
                        active
                          ? 'bg-[var(--bg-selected)] text-[var(--text-primary)] ring-1 ring-[var(--border-strong)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <IconComp className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
