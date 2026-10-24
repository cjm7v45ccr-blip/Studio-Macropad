import React, { useState, useMemo } from 'react';
import {
  ActionBinding,
  ConflictWarning,
  KeyboardLayoutId,
  KeyControlConfig,
  MacroItem,
  StudioProfile,
  TriggerType
} from '../types/studio';
import { ActionPickerControl } from './ActionPickerControl';
import { ICON_LIBRARY, KeycapIcon, summarizeAction } from '../data/iconRegistry';
import {
  AlertTriangle,
  Search,
  Upload,
  RotateCcw
} from 'lucide-react';

interface ButtonInspectorProps {
  keyConfig: KeyControlConfig;
  keyNumber: number;
  onUpdateTrigger: (trigger: TriggerType, binding: ActionBinding) => void;
  onUpdateAppearance: (patch: Partial<KeyControlConfig['appearance']>) => void;
  onUpdateAdvanced: (patch: Partial<KeyControlConfig['advanced']>) => void;
  onResetKey: () => void;
  macros: MacroItem[];
  profiles: StudioProfile[];
  keyboardLayout: KeyboardLayoutId;
  conflicts: ConflictWarning[];
  globalDebounceMs: number;
  onNavigateToMacros: () => void;
  onToast: (msg: string) => void;
}

const TRIGGERS: { id: TriggerType; label: string }[] = [
  { id: 'tap', label: 'Tap' },
  { id: 'hold', label: 'Hold' },
  { id: 'double_tap', label: 'Double-tap' },
  { id: 'tap_hold', label: 'Tap+Hold' }
];

const LABEL_COLOR_SWATCHES = [
  '#F3F4F6',
  '#60A5FA',
  '#A78BFA',
  '#34D399',
  '#FBBF24',
  '#F87171',
  '#F472B6',
  '#38BDF8'
];

export const ButtonInspector: React.FC<ButtonInspectorProps> = ({
  keyConfig,
  keyNumber,
  onUpdateTrigger,
  onUpdateAppearance,
  onUpdateAdvanced,
  onResetKey,
  macros,
  profiles,
  keyboardLayout,
  conflicts,
  globalDebounceMs,
  onNavigateToMacros,
  onToast
}) => {
  const [tab, setTab] = useState<'action' | 'appearance' | 'advanced'>('action');
  const [activeTrigger, setActiveTrigger] = useState<TriggerType>('tap');
  const [iconQuery, setIconQuery] = useState('');

  const keyConflicts = conflicts.filter(
    c => c.controlA === keyConfig.id || c.controlB === keyConfig.id
  );

  const filteredIcons = useMemo(() => {
    const q = iconQuery.trim().toLowerCase();
    if (!q) return ICON_LIBRARY;
    return ICON_LIBRARY.filter(
      item =>
        item.label.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.keywords.some(k => k.includes(q))
    );
  }, [iconQuery]);

  const handleCustomIconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 512 * 1024) {
      onToast('Icon image must be under 512 KB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onUpdateAppearance({ icon: reader.result });
        onToast('Custom keycap icon uploaded');
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <aside className="w-full lg:w-[390px] xl:w-[420px] shrink-0 bg-[var(--bg-panel)] border-l border-[var(--border-subtle)] flex flex-col h-full overflow-hidden">
      {/* Inspector Header */}
      <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[var(--bg-input)] border border-[var(--border-strong)] flex items-center justify-center shrink-0">
            <KeycapIcon
              icon={keyConfig.appearance.icon}
              className="w-5 h-5"
              style={{ color: keyConfig.appearance.labelColor }}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              <span>Key {keyNumber}</span>
              <span className="text-[var(--text-muted)]">·</span>
              <span className="truncate font-medium text-[var(--text-secondary)]">
                {keyConfig.appearance.label || 'Unlabeled'}
              </span>
            </div>
            <div className="text-[11px] font-mono text-[var(--text-muted)] truncate">
              {summarizeAction(keyConfig.triggers.tap, macros)}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onResetKey}
          className="p-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shrink-0"
          title="Reset key to blank default"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Inline Conflict Warning */}
      {keyConflicts.length > 0 && (
        <div className="mx-4 mt-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            {keyConflicts.map((c, idx) => (
              <p key={idx} className="leading-snug">
                {c.summary}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Primary Inspector Tabs: Action | Appearance | Advanced */}
      <div className="px-4 pt-3">
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
          {(
            [
              { id: 'action', label: 'Action' },
              { id: 'appearance', label: 'Appearance' },
              { id: 'advanced', label: 'Advanced' }
            ] as const
          ).map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                style={
                  active
                    ? { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }
                    : undefined
                }
                className={`py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  active ? 'font-semibold shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable Inspector Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {tab === 'action' && (
          <>
            {/* Trigger Type Selector */}
            <div>
              <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1.5">
                Trigger Behavior
              </label>
              <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
                {TRIGGERS.map(trig => {
                  const isSelected = activeTrigger === trig.id;
                  const isAssigned = keyConfig.triggers[trig.id].type !== 'none';
                  return (
                    <button
                      key={trig.id}
                      type="button"
                      onClick={() => setActiveTrigger(trig.id)}
                      style={
                        isSelected
                          ? { backgroundColor: 'var(--accent)', color: '#FFFFFF' }
                          : undefined
                      }
                      className={`relative py-1.5 px-2 rounded-lg text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center justify-center gap-1 ${
                        isSelected
                          ? 'font-semibold'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <span>{trig.label}</span>
                      {isAssigned && !isSelected && (
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: 'var(--accent)' }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <ActionPickerControl
              binding={keyConfig.triggers[activeTrigger]}
              onChange={next => onUpdateTrigger(activeTrigger, next)}
              macros={macros}
              profiles={profiles}
              keyboardLayout={keyboardLayout}
              onNavigateToMacros={onNavigateToMacros}
              onToast={onToast}
            />
          </>
        )}

        {tab === 'appearance' && (
          <div className="space-y-4">
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Customize how this keycap appears on the on-screen Studio Pad replica.
            </p>

            {/* Keycap Label */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-medium text-[var(--text-secondary)]">
                Keycap Legend Text
              </label>
              <input
                type="text"
                maxLength={18}
                value={keyConfig.appearance.label}
                onChange={e => onUpdateAppearance({ label: e.target.value })}
                placeholder={`Key ${keyNumber}`}
                className="w-full rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-[var(--accent)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none"
              />
            </div>

            {/* Label Color */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-[var(--text-secondary)]">
                  Legend & Icon Tint
                </label>
                <span className="font-mono text-[11px] text-[var(--text-muted)] uppercase">
                  {keyConfig.appearance.labelColor}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {LABEL_COLOR_SWATCHES.map(hex => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => onUpdateAppearance({ labelColor: hex })}
                    className={`w-6 h-6 rounded-lg border border-white/15 cursor-pointer transition-transform ${
                      keyConfig.appearance.labelColor.toUpperCase() === hex
                        ? 'scale-110 ring-2 ring-[var(--accent)]'
                        : 'opacity-85 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                ))}
                <input
                  type="color"
                  value={keyConfig.appearance.labelColor}
                  onChange={e => onUpdateAppearance({ labelColor: e.target.value })}
                  className="w-7 h-7 rounded-lg bg-transparent border-0 cursor-pointer"
                  title="Custom color picker"
                />
              </div>
            </div>

            {/* Icon Picker + Custom Upload */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-[var(--text-secondary)]">
                  Keycap Icon
                </label>
                <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[11px] font-medium text-[var(--text-primary)] cursor-pointer transition-colors">
                  <Upload className="w-3 h-3" />
                  <span>Upload SVG/PNG</span>
                  <input
                    type="file"
                    accept="image/*,.svg"
                    onChange={handleCustomIconUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={iconQuery}
                  onChange={e => setIconQuery(e.target.value)}
                  placeholder="Search icons (play, cut, mic, git, zoom…)"
                  className="w-full rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] pl-8 pr-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="grid grid-cols-6 gap-1.5 max-h-60 overflow-y-auto p-1">
                {filteredIcons.map(entry => {
                  const IconComp = entry.component;
                  const active = keyConfig.appearance.icon === entry.id;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => onUpdateAppearance({ icon: entry.id })}
                      style={
                        active
                          ? {
                              borderColor: 'var(--accent)',
                              backgroundColor: 'rgba(var(--accent-rgb), 0.16)'
                            }
                          : undefined
                      }
                      className="h-10 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer transition-colors"
                      title={entry.label}
                    >
                      <IconComp className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {tab === 'advanced' && (
          <div className="space-y-5">
            {/* Debounce Override */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-[var(--text-secondary)]">Switch Debounce Override</span>
                <span className="font-mono text-[var(--text-primary)] tabular-nums">
                  {keyConfig.advanced.debounceOverrideMs === 0
                    ? `Global (${globalDebounceMs} ms)`
                    : `${keyConfig.advanced.debounceOverrideMs} ms`}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={60}
                step={5}
                value={keyConfig.advanced.debounceOverrideMs}
                onChange={e => onUpdateAdvanced({ debounceOverrideMs: Number(e.target.value) })}
                className="w-full accent-[var(--accent)] cursor-pointer"
              />
              <p className="text-[11px] text-[var(--text-muted)]">
                Set to 0 ms to inherit global switch debounce, or raise to filter mechanical chatter.
              </p>
            </div>

            {/* Repeat While Held */}
            <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="text-xs font-semibold text-[var(--text-primary)] block">
                    Repeat While Held
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    Continuously re-fires Tap action while switch stays depressed
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={keyConfig.advanced.repeatWhileHeld}
                  onChange={e => onUpdateAdvanced({ repeatWhileHeld: e.target.checked })}
                  className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
                />
              </label>

              {keyConfig.advanced.repeatWhileHeld && (
                <div className="space-y-1.5 pt-2 border-t border-[var(--border-subtle)]">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text-secondary)]">Repeat Interval</span>
                    <span className="font-mono tabular-nums text-[var(--text-primary)]">
                      {keyConfig.advanced.repeatRateMs} ms
                    </span>
                  </div>
                  <input
                    type="range"
                    min={25}
                    max={500}
                    step={15}
                    value={keyConfig.advanced.repeatRateMs}
                    onChange={e => onUpdateAdvanced({ repeatRateMs: Number(e.target.value) })}
                    className="w-full accent-[var(--accent)] cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* Delay Before Firing */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-[var(--text-secondary)]">Delay Before Firing</span>
                <span className="font-mono tabular-nums text-[var(--text-primary)]">
                  {keyConfig.advanced.delayBeforeFiringMs} ms
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1500}
                step={25}
                value={keyConfig.advanced.delayBeforeFiringMs}
                onChange={e => onUpdateAdvanced({ delayBeforeFiringMs: Number(e.target.value) })}
                className="w-full accent-[var(--accent)] cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
