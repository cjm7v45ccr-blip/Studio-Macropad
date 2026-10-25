import React, { useState, useRef, useEffect } from 'react';
import {
  ActionBinding,
  ActiveRepeatJob,
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
  Cpu
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
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Mode Switch
                </h2>

              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Profile & Setup Button
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
              <Layers className="w-4 h-4 text-[var(--accent)]" />
              <span>Dedicated Mode Control</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              This physical button switches active profiles and enters setup mode on the display:
            </p>
            <ul className="space-y-2 text-xs text-[var(--text-secondary)] pt-1">
              <li className="flex items-start gap-2">
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] shrink-0">
                  Short Press
                </span>
                <span>
                  Switches active profile between <strong>MAC</strong> and <strong>TV</strong>.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] shrink-0">
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
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span>
              Switch to {activeProfileId === 'MAC' ? 'TV' : 'MAC'} Profile
            </span>
          </button>
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
