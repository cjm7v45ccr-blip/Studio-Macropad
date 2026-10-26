import React, { useState, useRef, useEffect } from 'react';
import {
  ActionBinding,
  ActiveRepeatJob,
  BleHostSlot,
  CustomMacroItem,
  DeviceConnectionInfo,
  HardwareProfileId,
  HardwareSlotId,
  KeyAppearance,
  KeyControlConfig,
  KeyboardLayoutId
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
  Bluetooth
} from 'lucide-react';

interface ButtonInspectorProps {
  keyConfig: KeyControlConfig;
  activeProfileId: HardwareProfileId;
  activeProfileName: string;
  customMacros: CustomMacroItem[];
  keyboardLayout: KeyboardLayoutId;
  connection: DeviceConnectionInfo;
  activeRepeatJob?: ActiveRepeatJob | null;
  onUpdateBinding: (binding: ActionBinding) => void;
  onResetSlotToDefault: (slot: HardwareSlotId) => void;
  onUpdateAppearance: (patch: Partial<KeyAppearance>) => void;
  onResetAppearance: () => void;
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
  activeProfileId,
  activeProfileName,
  customMacros,
  keyboardLayout,
  connection,
  activeRepeatJob,
  onUpdateBinding,
  onResetSlotToDefault,
  onUpdateAppearance,
  onResetAppearance,
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

  // Track the exact binding this control had when selected so Undo restores it cleanly
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

  const activeBleHost: BleHostSlot = connection.telemetry?.bleActiveHost ?? 1;

  // Dedicated Mode Switch Inspector (9th physical button)
  if (keyConfig.isModeSwitch || keyConfig.id === 'k9') {
    return (
      <aside className="w-full lg:w-[400px] shrink-0 bg-[var(--bg-panel)] border-t lg:border-t-0 lg:border-l border-[var(--border-subtle)] flex flex-col lg:h-full overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--bg-input)] border border-[var(--border-strong)] flex items-center justify-center shadow-inner">
              <Layers className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Mode Switch
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Profile, Multi-Host BLE & Setup Button
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
              <Layers className="w-4 h-4 text-[var(--accent)]" />
              <span>Hardware Gestures</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              This physical key controls profiles, instant Bluetooth host switching, and USB setup:
            </p>
            <ul className="space-y-2 text-xs text-[var(--text-secondary)] pt-1">
              <li className="flex items-start gap-2">
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] shrink-0 whitespace-nowrap">
                  Short Press
                </span>
                <span>
                  Switches active profile between <strong>MAC</strong> and <strong>TV</strong>.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-sky-300 shrink-0 whitespace-nowrap">
                  Hold + Dial
                </span>
                <span>
                  Instantly cycles between <strong>Host 1</strong>, <strong>Host 2</strong>, and{' '}
                  <strong>Host 3</strong> (<span className="font-mono">Studio Pad 1–3</span>).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] shrink-0 whitespace-nowrap">
                  Hold 3 Sec
                </span>
                <span>Enters or exits Setup Mode on the 128×64 OLED display.</span>
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
              Switch to {activeProfileId === 'MAC' ? 'TV' : 'MAC'} Profile
            </span>
          </button>

          {/* Direct Web & Serial Multi-Host BLE Switcher (/api/ble/switch) */}
          <div className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                <Bluetooth className="w-4 h-4 text-sky-400 shrink-0" />
                <span>Multi-Host BLE Engine</span>
              </div>
              <span className="font-mono text-[10px] text-[var(--text-muted)] tabular-nums">
                {connection.connected
                  ? connection.telemetry?.bleDeviceName || `Studio Pad ${activeBleHost}`
                  : 'Connect USB to switch'}
              </span>
            </div>

            <div
              role="group"
              aria-label="Select active Bluetooth host"
              className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)]"
            >
              {([1, 2, 3] as const).map(slot => {
                const isCurrent = connection.connected && activeBleHost === slot;
                return (
                  <button
                    key={slot}
                    type="button"
                    disabled={!connection.connected}
                    onClick={() => onSwitchBleHost(slot)}
                    style={
                      isCurrent
                        ? {
                            borderColor: 'var(--accent)',
                            backgroundColor: 'rgba(var(--accent-rgb), 0.16)'
                          }
                        : undefined
                    }
                    className={`py-2 px-2 rounded-lg border text-center transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap ${
                      isCurrent
                        ? 'text-[var(--text-primary)] font-semibold'
                        : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    <div className="font-mono text-[10px] text-sky-400 tabular-nums">
                      [H{slot}]
                    </div>
                    <div className="text-[11px] mt-0.5">Host {slot}</div>
                  </button>
                );
              })}
            </div>

            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              Each slot uses its own virtual hardware MAC address and Bluetooth name (<span className="font-mono">Studio Pad 1–3</span>).
            </p>
          </div>
        </div>
      </aside>
    );
  }

  const slotId = keyConfig.slot || 'b1';
  const slotMeta = SLOT_LABELS[slotId];
  const currentTap = keyConfig.triggers.tap;
  const factoryDefaultAction = FACTORY_DEFAULT_SLOTS[activeProfileId][slotId];
  const factoryDesc = describeFirmwareAction(factoryDefaultAction);

  const canUndoSelection =
    currentTap.value !== initialBindingOnSelect.value ||
    JSON.stringify(currentTap.repeatConfig || null) !==
      JSON.stringify(initialBindingOnSelect.repeatConfig || null);

  const isAlreadyFactoryDefault =
    currentTap.value === factoryDefaultAction && !currentTap.repeatConfig;

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
    <aside className="w-full lg:w-[400px] shrink-0 bg-[var(--bg-panel)] border-t lg:border-t-0 lg:border-l border-[var(--border-subtle)] flex flex-col lg:h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-5 py-3.5 border-b border-[var(--border-subtle)] space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--bg-input)] border border-[var(--border-strong)] flex items-center justify-center shadow-inner shrink-0">
              <KeycapIcon
                icon={keyConfig.appearance.icon}
                className="w-4 h-4"
                style={{ color: keyConfig.appearance.labelColor }}
              />
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
        </div>

        {/* Control-Scoped Undo & Reset to Default Bar */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!canUndoSelection}
            onClick={() => onUpdateBinding(initialBindingOnSelect)}
            title="Restore the value this control had when you selected it"
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer whitespace-nowrap"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Undo</span>
          </button>

          <button
            type="button"
            disabled={isAlreadyFactoryDefault}
            onClick={() => onResetSlotToDefault(slotId)}
            title={`Reset to factory default: ${factoryDesc.fullLabel} (${factoryDefaultAction})`}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to default</span>
          </button>
        </div>
      </div>

      {/* Section Switcher: Hardware Action vs Keycap Legend */}
      <div className="px-4 sm:px-5 pt-3">
        <div className="grid grid-cols-2 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => setInspectorSection('action')}
            className={`py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              inspectorSection === 'action'
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            Hardware Action
          </button>
          <button
            type="button"
            onClick={() => setInspectorSection('appearance')}
            className={`py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              inspectorSection === 'appearance'
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            Keycap Legend
          </button>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
        {inspectorSection === 'action' ? (
          <ActionPickerControl
            binding={keyConfig.triggers.tap}
            onChange={onUpdateBinding}
            customMacros={customMacros}
            keyboardLayout={keyboardLayout}
            connection={connection}
            activeRepeatJob={activeRepeatJob}
            onTestBinding={onTestBinding}
            onStopRepeat={onStopRepeat}
            onOpenMacroBuilder={onOpenMacroBuilder}
          />
        ) : (
          <div className="space-y-5">
            {/* Virtual OLED Preview Box */}
            <div className="p-3.5 rounded-2xl bg-[#02060a] border border-cyan-500/40 shadow-[0_0_16px_rgba(6,182,212,0.2)] flex flex-col items-center justify-center space-y-2 font-mono text-cyan-300">
              <div className="w-full flex items-center justify-between text-[10px] border-b border-cyan-500/20 pb-1.5 text-cyan-400">
                <span className="font-bold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  OLED LIVE PREVIEW
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-cyan-400/80">128×64 · {slotMeta.short}</span>
                  {activeProfileId === 'MAC' && (
                    <span
                      title={`Active BLE Host Badge ([H${activeBleHost}])`}
                      className="px-1.5 py-0.5 rounded bg-black border border-white/80 text-white font-mono text-[9px] font-bold leading-none tabular-nums"
                    >
                      [H{activeBleHost}]
                    </span>
                  )}
                </div>
              </div>
              <div className="py-2.5 flex flex-col items-center justify-center space-y-1.5">
                <div className="w-12 h-12 rounded-xl bg-cyan-950/70 border border-cyan-500/45 flex items-center justify-center shadow-inner">
                  <KeycapIcon
                    icon={keyConfig.appearance.icon}
                    className="w-6 h-6"
                    style={{ color: keyConfig.appearance.labelColor || '#38BDF8' }}
                  />
                </div>
                <span className="text-xs font-extrabold tracking-widest text-cyan-100 uppercase truncate max-w-[200px]">
                  {keyConfig.appearance.label || slotMeta.short}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                Custom Keycap Appearance
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
                  UI Keycap Label
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
                          : 'border-white/20 hover:scale-105'
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

            {/* Icon Library + Custom Upload */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[var(--text-secondary)]">
                  Keycap Icon
                </label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
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
                    style={
                      iconCategory === cat
                        ? {
                            backgroundColor: 'rgba(var(--accent-rgb), 0.16)',
                            borderColor: 'var(--accent)',
                            color: 'var(--text-primary)'
                          }
                        : undefined
                    }
                    className={`px-2 py-1 rounded-md text-[10px] font-medium whitespace-nowrap border transition-colors cursor-pointer ${
                      iconCategory === cat
                        ? ''
                        : 'bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-6 gap-1.5 max-h-56 overflow-y-auto p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
                {filteredIcons.map(entry => {
                  const IconComp = entry.component;
                  const active = keyConfig.appearance.icon === entry.id;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      title={entry.label}
                      onClick={() => onUpdateAppearance({ icon: entry.id })}
                      style={
                        active
                          ? {
                              borderColor: 'var(--accent)',
                              backgroundColor: 'rgba(var(--accent-rgb), 0.18)',
                              color: 'var(--text-primary)'
                            }
                          : undefined
                      }
                      className={`aspect-square rounded-lg flex items-center justify-center border transition-all cursor-pointer ${
                        active
                          ? ''
                          : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
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
