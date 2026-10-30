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
  isBleHostProfile,
  profileIdToBleSlot,
  profileShortTag
} from '../types/studio';
import { ICON_LIBRARY, KeycapIcon } from '../data/iconRegistry';
import {
  FACTORY_DEFAULT_SLOTS,
  SLOT_LABELS,
  describeFirmwareAction
} from '../data/firmwareCatalog';
import { ActionPickerControl } from './ActionPickerControl';
import {
  RotateCcw,
  Undo2,
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
  onChangeHostOs?: (os: HostOsType) => void;
  showAdvancedIds?: boolean;
  onToggleAdvancedIds?: () => void;
  customMacros: CustomMacroItem[];
  keyboardLayout: KeyboardLayoutId;
  connection: DeviceConnectionInfo;
  activeRepeatJob?: ActiveRepeatJob | null;
  onUpdateBinding: (binding: ActionBinding) => void;
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
  '#F3F4F6',
  '#38BDF8',
  '#60A5FA',
  '#818CF8',
  '#A78BFA',
  '#F472B6',
  '#F87171',
  '#FBBF24',
  '#34D399'
];

export const ButtonInspector: React.FC<ButtonInspectorProps> = ({
  keyConfig,
  profiles,
  activeProfileId,
  activeProfileName,
  activeHostOs,
  onChangeHostOs,
  showAdvancedIds = false,
  onToggleAdvancedIds,
  customMacros,
  keyboardLayout,
  connection,
  activeRepeatJob,
  onUpdateBinding,
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

  const selectionKey = `${activeProfileId}:${keyConfig.id}`;
  const [trackedSelectionKey, setTrackedSelectionKey] = useState(selectionKey);
  const [initialBindingOnSelect, setInitialBindingOnSelect] = useState<ActionBinding>(
    keyConfig.triggers.tap
  );

  useEffect(() => {
    if (trackedSelectionKey !== selectionKey) {
      setTrackedSelectionKey(selectionKey);
      setInitialBindingOnSelect(keyConfig.triggers.tap);
    }
  }, [selectionKey, trackedSelectionKey, keyConfig.triggers.tap]);

  const activeBleHost: BleHostSlot =
    connection.telemetry?.bleActiveHost ?? profileIdToBleSlot(activeProfileId) ?? 1;

  // Dedicated Mode Switch Inspector (9th physical button)
  if (keyConfig.isModeSwitch || keyConfig.id === 'k9') {
    const activeHostProf = profiles.find(
      p => p.id === bleSlotToProfileId(activeBleHost)
    );
    const activeHostDisplay = activeHostProf?.name || `Device ${activeBleHost}`;

    return (
      <aside className="w-full lg:w-[440px] xl:w-[460px] shrink-0 bg-[var(--bg-panel)] border-t lg:border-t-0 lg:border-l border-[var(--border-subtle)] lg:h-full lg:overflow-y-auto">
        <div className="sticky top-0 z-20 bg-[var(--bg-panel)]/95 backdrop-blur-md px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--bg-input)] flex items-center justify-center">
              <Layers className="w-4 h-4 text-[var(--accent)]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Mode Key
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Mode Toggle · Multi-Host BLE · Setup
              </p>
            </div>
          </div>
        </div>

        <div key={selectionKey} className="p-5 space-y-4 animate-panel-in">
          <div className="p-4 rounded-xl bg-[var(--bg-input)] space-y-2.5">
            <div className="text-xs font-semibold text-[var(--text-primary)]">
              Hardware Gestures
            </div>
            <ul className="space-y-2 text-xs text-[var(--text-secondary)] pt-0.5">
              <li className="flex items-start gap-2.5">
                <span className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-[var(--bg-elevated)] text-[var(--text-primary)] shrink-0 whitespace-nowrap">
                  Short Press
                </span>
                <span>
                  Switches between <strong>{activeHostDisplay}</strong> and <strong>TV</strong>.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-[var(--bg-elevated)] text-[var(--accent)] shrink-0 whitespace-nowrap">
                  Hold + Dial
                </span>
                <span>
                  Cycles between <strong>Device 1–3</strong>, each with its own layout and Bluetooth MAC.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-[var(--bg-elevated)] text-[var(--text-primary)] shrink-0 whitespace-nowrap">
                  Hold 3 Sec
                </span>
                <span>Opens or exits Setup Mode on the OLED screen.</span>
              </li>
            </ul>
          </div>

          <button
            type="button"
            onClick={onToggleProfileMode}
            style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap"
          >
            <ArrowLeftRight className="w-4 h-4 shrink-0" />
            <span>
              Switch to {activeProfileId === 'TV' ? activeHostDisplay : 'TV'} Profile
            </span>
          </button>

          <div className="p-4 rounded-xl bg-[var(--bg-input)] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                <Bluetooth className="w-4 h-4 text-[var(--accent)] shrink-0" />
                <span>Bluetooth Host</span>
              </div>
              <span className="font-mono text-[10px] text-[var(--text-muted)] tabular-nums">
                {connection.connected
                  ? connection.telemetry?.bleDeviceName || `Studio Pad ${activeBleHost}`
                  : 'Select host'}
              </span>
            </div>

            <div
              role="group"
              aria-label="Select Bluetooth host"
              className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[var(--bg-panel)]"
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
                    className={`py-2 px-2 rounded-lg text-center transition-colors cursor-pointer whitespace-nowrap min-w-0 ${
                      isCurrent
                        ? 'bg-[rgba(var(--accent-rgb),0.16)] ring-1 ring-[var(--accent)] text-[var(--text-primary)] font-semibold'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    <div className="font-mono text-[10px] text-[var(--accent)] tabular-nums">
                      H{slot}
                    </div>
                    <div className="text-[11px] mt-0.5 truncate">
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

  const slotId = keyConfig.slot || 'b1';
  const slotMeta = SLOT_LABELS[slotId];
  const currentTap = keyConfig.triggers.tap;
  const factoryDefaultAction = FACTORY_DEFAULT_SLOTS[activeProfileId][slotId];
  const factoryDesc = describeFirmwareAction(
    factoryDefaultAction,
    undefined,
    customMacros
  );

  const canUndoSelection =
    currentTap.value !== initialBindingOnSelect.value ||
    JSON.stringify(currentTap.repeatConfig || null) !==
      JSON.stringify(initialBindingOnSelect.repeatConfig || null);

  const isAlreadyFactoryDefault =
    currentTap.value === factoryDefaultAction && !currentTap.repeatConfig;

  const isAlreadyUnassigned = !currentTap.value && !currentTap.repeatConfig;

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
    <aside className="w-full lg:w-[440px] xl:w-[460px] shrink-0 bg-[var(--bg-panel)] border-t lg:border-t-0 lg:border-l border-[var(--border-subtle)] lg:h-full lg:overflow-y-auto">
      {/* Sticky Single-Scroll Header */}
      <div className="sticky top-0 z-20 bg-[var(--bg-panel)]/95 backdrop-blur-md px-4 sm:px-5 py-3.5 border-b border-[var(--border-subtle)] space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--bg-input)] flex items-center justify-center shrink-0">
              <KeycapIcon
                icon={keyConfig.appearance.icon}
                className="w-4 h-4"
                style={{ color: keyConfig.appearance.labelColor }}
              />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-[var(--text-primary)] truncate">
                {slotMeta.full}
              </h2>
              <p className="text-xs text-[var(--text-muted)] truncate tabular-nums">
                {activeProfileName} · {profileShortTag(activeProfileId)} · {slotMeta.short}
              </p>
            </div>
          </div>

          {/* Compact Subtle Control Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              disabled={!canUndoSelection}
              onClick={() => onUpdateBinding(initialBindingOnSelect)}
              title="Undo changes to this key"
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
                  ? onClearSlot(slotId)
                  : onUpdateBinding({ type: 'none', value: '' })
              }
              title="Clear this key so pressing it sends nothing"
              className="flex items-center gap-1 py-1.5 px-2 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer whitespace-nowrap"
            >
              <XCircle className="w-3 h-3 shrink-0" />
              <span>Clear</span>
            </button>

            <button
              type="button"
              disabled={isAlreadyFactoryDefault}
              onClick={() => onResetSlotToDefault(slotId)}
              title={`Reset to default: ${factoryDesc.fullLabel}`}
              className="flex items-center gap-1 py-1.5 px-2 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3 h-3 shrink-0" />
              <span>Default</span>
            </button>
          </div>
        </div>

        {/* Section Switcher: Action vs Keycap Legend */}
        <div className="grid grid-cols-2 p-1 rounded-xl bg-[var(--bg-input)]">
          <button
            type="button"
            onClick={() => setInspectorSection('action')}
            className={`py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
              inspectorSection === 'action'
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-semibold shadow-2xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            Action
          </button>
          <button
            type="button"
            onClick={() => setInspectorSection('appearance')}
            className={`py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
              inspectorSection === 'appearance'
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-semibold shadow-2xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
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
            binding={keyConfig.triggers.tap}
            onChange={onUpdateBinding}
            customMacros={customMacros}
            keyboardLayout={keyboardLayout}
            connection={connection}
            activeProfileId={activeProfileId}
            activeHostOs={activeHostOs}
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
            {/* Virtual OLED Preview Box */}
            <div className="p-3.5 rounded-2xl bg-[#02060a] border border-cyan-500/35 flex flex-col items-center justify-center space-y-2 font-mono text-cyan-300">
              <div className="w-full flex items-center justify-between text-[10px] border-b border-cyan-500/20 pb-1.5 text-cyan-400">
                <span className="font-semibold">OLED Preview</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-cyan-400/80">128×64 · {slotMeta.short}</span>
                  {isBleHostProfile(activeProfileId) && (
                    <span className="px-1.5 py-0.5 rounded bg-black border border-white/70 text-white font-mono text-[9px] font-bold leading-none tabular-nums">
                      [{profileShortTag(activeProfileId)}]
                    </span>
                  )}
                </div>
              </div>
              <div className="py-2.5 flex flex-col items-center justify-center space-y-1.5">
                <div className="w-12 h-12 rounded-xl bg-cyan-950/70 border border-cyan-500/45 flex items-center justify-center">
                  <KeycapIcon
                    icon={keyConfig.appearance.icon}
                    className="w-6 h-6"
                    style={{ color: keyConfig.appearance.labelColor || '#38BDF8' }}
                  />
                </div>
                <span className="text-xs font-bold tracking-wider text-cyan-100 truncate max-w-[200px]">
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
                          ? 'scale-110 ring-2 ring-[var(--accent)] border-white'
                          : 'border-black/15 dark:border-white/20 hover:scale-105'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  );
                })}
                <input
                  type="color"
                  value={keyConfig.appearance.labelColor}
                  onChange={e => onUpdateAppearance({ labelColor: e.target.value })}
                  className="w-7 h-7 rounded cursor-pointer bg-transparent border-0"
                  title="Custom color"
                />
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

              <div className="flex items-center gap-1 overflow-x-auto pb-1">
                {categories.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setIconCategory(cat)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      iconCategory === cat
                        ? 'bg-[rgba(var(--accent-rgb),0.16)] text-[var(--accent)] font-semibold'
                        : 'bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-6 gap-1.5 p-1.5 rounded-xl bg-[var(--bg-input)]">
                {filteredIcons.map(entry => {
                  const IconComp = entry.component;
                  const active = keyConfig.appearance.icon === entry.id;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      title={entry.label}
                      onClick={() => onUpdateAppearance({ icon: entry.id })}
                      className={`aspect-square rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                        active
                          ? 'bg-[rgba(var(--accent-rgb),0.18)] ring-1 ring-[var(--accent)] text-[var(--accent)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
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
