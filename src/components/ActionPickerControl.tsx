import React, { useState, useEffect } from 'react';
import {
  ActionBinding,
  ActionType,
  ActiveRepeatJob,
  CustomMacroItem,
  KeyboardLayoutId,
  TextMacroRepeatConfig
} from '../types/studio';
import {
  DEFAULT_TEXT_REPEAT_CONFIG,
  FIRMWARE_STATIC_CATALOG,
  FIRMWARE_SUPPORTED_KEYS,
  buildFirmwareActionFromTextConfig,
  buildFirmwareShortcut,
  describeFirmwareAction,
  firmwareActionToBinding,
  formatShortcutPretty,
  isValidFirmwareAction,
  normalizeBrowserKeyToFirmware,
  parseFirmwareShortcut,
  parseTextConfigFromFirmwareAction,
  requiresUsbSequenceExecution,
  sanitizeSerialString
} from '../data/firmwareCatalog';
import { KeycapIcon } from '../data/iconRegistry';
import {
  Command,
  Volume2,
  Tv,
  Clapperboard,
  FileText,
  Laptop,
  Monitor,
  Play,
  Square,
  Radio,
  Sparkles,
  Check,
  Repeat
} from 'lucide-react';

interface ActionPickerControlProps {
  binding: ActionBinding;
  onChange: (next: ActionBinding) => void;
  customMacros: CustomMacroItem[];
  keyboardLayout: KeyboardLayoutId;
  isConnected: boolean;
  activeRepeatJob?: ActiveRepeatJob | null;
  onTestBinding?: (binding: ActionBinding) => void;
  onStopRepeat?: () => void;
  onOpenMacroBuilder?: () => void;
}

const ACTION_TABS: {
  id: Exclude<ActionType, 'none'>;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'mac_macro', label: 'macOS', icon: Laptop },
  { id: 'win_macro', label: 'Windows', icon: Monitor },
  { id: 'media', label: 'Media / F13', icon: Volume2 },
  { id: 'shortcut', label: 'Shortcut', icon: Command },
  { id: 'text', label: 'Type Text', icon: FileText },
  { id: 'tv', label: 'TV Remote', icon: Tv },
  { id: 'tv_app', label: 'TV Apps', icon: Clapperboard }
];

const MODIFIER_OPTIONS: { id: string; label: string }[] = [
  { id: 'cmd', label: '⌘ Cmd' },
  { id: 'ctrl', label: '⌃ Ctrl' },
  { id: 'alt', label: '⌥ Opt/Alt' },
  { id: 'shift', label: '⇧ Shift' },
  { id: 'win', label: '⊞ Win' }
];

export const ActionPickerControl: React.FC<ActionPickerControlProps> = ({
  binding,
  onChange,
  customMacros,
  keyboardLayout,
  isConnected,
  activeRepeatJob,
  onTestBinding,
  onStopRepeat,
  onOpenMacroBuilder
}) => {
  const [activeTab, setActiveTab] = useState<Exclude<ActionType, 'none'>>(() =>
    binding.type === 'none' ? 'mac_macro' : binding.type
  );
  const [isRecording, setIsRecording] = useState(false);

  // Draft state for Type Text + Follow-up Button + Custom Repeat Delay
  const [textDraft, setTextDraft] = useState('');
  const [followUpKey, setFollowUpKey] = useState('');
  const [keyDelayInput, setKeyDelayInput] = useState('0');
  const [repeatCountInput, setRepeatCountInput] = useState('1');
  const [loopUntilStopped, setLoopUntilStopped] = useState(false);
  const [repeatDelayInput, setRepeatDelayInput] = useState('500');

  // Draft state for SmartCast builders
  const [tvCodeset, setTvCodeset] = useState('5');
  const [tvCode, setTvCode] = useState('1');
  const [tvAppId, setTvAppId] = useState('1');
  const [tvAppNs, setTvAppNs] = useState('4');
  const [tvAppUrl, setTvAppUrl] = useState('');

  useEffect(() => {
    if (binding.type !== 'none') {
      setActiveTab(binding.type);
    }

    if (binding.repeatConfig || binding.value.startsWith('TEXT:')) {
      const cfg = parseTextConfigFromFirmwareAction(binding.value, binding.repeatConfig);
      setTextDraft(cfg.text);
      setFollowUpKey(cfg.followUpKey);
      setKeyDelayInput(String(cfg.keyDelayMs));
      setRepeatCountInput(String(cfg.repeatCount));
      setLoopUntilStopped(cfg.loopUntilStopped);
      setRepeatDelayInput(String(cfg.repeatDelayMs));
    } else if (binding.type !== 'text') {
      setTextDraft(DEFAULT_TEXT_REPEAT_CONFIG.text);
      setFollowUpKey(DEFAULT_TEXT_REPEAT_CONFIG.followUpKey);
      setKeyDelayInput(String(DEFAULT_TEXT_REPEAT_CONFIG.keyDelayMs));
      setRepeatCountInput(String(DEFAULT_TEXT_REPEAT_CONFIG.repeatCount));
      setLoopUntilStopped(DEFAULT_TEXT_REPEAT_CONFIG.loopUntilStopped);
      setRepeatDelayInput(String(DEFAULT_TEXT_REPEAT_CONFIG.repeatDelayMs));
    }

    if (binding.value.startsWith('TVKEY:')) {
      const parts = binding.value.split(':');
      if (parts.length >= 3) {
        setTvCodeset(parts[1] || '5');
        setTvCode(parts[2] || '1');
      }
    }
    if (binding.value.startsWith('TVAPP:')) {
      const first = binding.value.indexOf(':');
      const second = binding.value.indexOf(':', first + 1);
      const third = binding.value.indexOf(':', second + 1);
      if (first > 0 && second > first) {
        setTvAppId(binding.value.slice(first + 1, second));
        if (third > second) {
          setTvAppNs(binding.value.slice(second + 1, third));
          setTvAppUrl(binding.value.slice(third + 1));
        } else {
          setTvAppNs(binding.value.slice(second + 1));
          setTvAppUrl('');
        }
      }
    }
  }, [binding.type, binding.value, binding.repeatConfig]);

  // Live Keyboard Shortcut Recorder normalized to ESP32 pressKey() tokens
  useEffect(() => {
    if (!isRecording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (['Meta', 'Control', 'Shift', 'Alt'].includes(e.key)) {
        return;
      }

      const mods: string[] = [];
      if (e.metaKey) mods.push('cmd');
      if (e.ctrlKey) mods.push('ctrl');
      if (e.altKey) mods.push('alt');
      if (e.shiftKey) mods.push('shift');

      const fwKey = normalizeBrowserKeyToFirmware(e.code, e.key, keyboardLayout);
      const actionStr = buildFirmwareShortcut(mods, fwKey);
      onChange(firmwareActionToBinding(actionStr));
      setIsRecording(false);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isRecording, keyboardLayout, onChange]);

  const currentInfo = describeFirmwareAction(binding.value, binding.repeatConfig);
  const parsedShortcut = parseFirmwareShortcut(binding.value);

  const buildDraftTextConfig = (): TextMacroRepeatConfig => {
    const parsedKeyDelay = Math.max(0, Math.min(60000, parseInt(keyDelayInput, 10) || 0));
    const parsedRepeatCount = Math.max(
      1,
      Math.min(999, parseInt(repeatCountInput, 10) || 1)
    );
    const parsedRepeatDelay = Math.max(
      10,
      Math.min(300000, parseInt(repeatDelayInput, 10) || 500)
    );
    const hasNativeEnter =
      textDraft.length > 0 && followUpKey === 'enter' && parsedKeyDelay <= 0;
    const cleanText = sanitizeSerialString(textDraft, hasNativeEnter ? 122 : 123);

    return {
      text: cleanText,
      followUpKey,
      keyDelayMs: cleanText.length > 0 && followUpKey ? parsedKeyDelay : 0,
      repeatCount: parsedRepeatCount,
      loopUntilStopped,
      repeatDelayMs: parsedRepeatDelay
    };
  };

  const draftTextConfig = buildDraftTextConfig();
  const draftTextFirmwareAction = buildFirmwareActionFromTextConfig(draftTextConfig);
  const canApplyTextMacro = isValidFirmwareAction(draftTextFirmwareAction);
  const needsUsbForDraftRepeat = requiresUsbSequenceExecution(draftTextConfig);

  const handleToggleModifier = (modId: string) => {
    const exists = parsedShortcut.mods.includes(modId);
    const nextMods = exists
      ? parsedShortcut.mods.filter(m => m !== modId)
      : [...parsedShortcut.mods, modId];
    const nextAction = buildFirmwareShortcut(nextMods, parsedShortcut.key || 'c');
    onChange(firmwareActionToBinding(nextAction));
  };

  const handleSelectShortcutKey = (nextKey: string) => {
    const nextAction = buildFirmwareShortcut(parsedShortcut.mods, nextKey);
    onChange(firmwareActionToBinding(nextAction));
  };

  const handleApplyTextMacro = () => {
    const cfg = buildDraftTextConfig();
    const actionStr = buildFirmwareActionFromTextConfig(cfg);
    if (!isValidFirmwareAction(actionStr)) return;

    const shouldStoreRepeatMeta =
      Boolean(cfg.followUpKey) ||
      cfg.repeatCount > 1 ||
      cfg.loopUntilStopped ||
      cfg.keyDelayMs > 0;

    onChange(
      firmwareActionToBinding(actionStr, shouldStoreRepeatMeta ? cfg : undefined)
    );
  };

  const handleTestDraftTextMacro = () => {
    if (!onTestBinding) return;
    const cfg = buildDraftTextConfig();
    const actionStr = buildFirmwareActionFromTextConfig(cfg);
    if (!isValidFirmwareAction(actionStr)) return;
    onTestBinding(firmwareActionToBinding(actionStr, cfg));
  };

  const handleApplyCustomTvKey = () => {
    const cs = parseInt(tvCodeset, 10);
    const cd = parseInt(tvCode, 10);
    if (Number.isNaN(cs) || Number.isNaN(cd)) return;
    onChange({ type: 'tv', value: `TVKEY:${cs}:${cd}` });
  };

  const handleApplyCustomTvApp = () => {
    const cleanId = sanitizeSerialString(tvAppId.trim(), 32);
    const ns = parseInt(tvAppNs, 10);
    const cleanUrl = sanitizeSerialString(tvAppUrl.trim(), 80);
    if (!cleanId || Number.isNaN(ns)) return;
    const actionStr = cleanUrl
      ? `TVAPP:${cleanId}:${ns}:${cleanUrl}`
      : `TVAPP:${cleanId}:${ns}`;
    if (isValidFirmwareAction(actionStr)) {
      onChange({ type: 'tv_app', value: actionStr });
    }
  };

  const staticItemsForTab = FIRMWARE_STATIC_CATALOG.filter(
    spec => spec.category === activeTab
  );

  return (
    <div className="space-y-3.5">
      {/* Live Synced Firmware Action Bar */}
      <div className="p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
            Hardware Action Token
          </div>
          <div className="font-mono text-xs text-[var(--text-primary)] truncate mt-0.5">
            {binding.value ? binding.value.replace(/\n/g, '\\n') : '— UNASSIGNED —'}
          </div>
          {binding.value && (
            <div className="text-[11px] text-[var(--text-secondary)] truncate">
              {currentInfo.fullLabel}
            </div>
          )}
        </div>

        {activeRepeatJob && onStopRepeat ? (
          <button
            type="button"
            onClick={onStopRepeat}
            className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-[11px] font-semibold text-rose-300 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Square className="w-3 h-3 fill-current" />
            <span>Stop</span>
          </button>
        ) : (
          onTestBinding &&
          binding.value &&
          isValidFirmwareAction(binding.value) && (
            <button
              type="button"
              disabled={!isConnected}
              onClick={() => onTestBinding(binding)}
              title={
                isConnected
                  ? 'Execute this action or repeat sequence on the connected MacroPad'
                  : 'Connect MacroPad via USB to test live on hardware'
              }
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] hover:border-[var(--accent)] border border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-primary)] disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Play className="w-3 h-3 text-emerald-400" />
              <span>Test on Pad</span>
            </button>
          )
        )}
      </div>

      {/* Saved / Device-Synced Custom Macros Quick Strip */}
      {customMacros.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Synced & Saved Custom Macros ({customMacros.length})
            </span>
            {onOpenMacroBuilder && (
              <button
                type="button"
                onClick={onOpenMacroBuilder}
                className="text-[10px] font-semibold text-[var(--accent)] hover:underline cursor-pointer"
              >
                Open Macro Builder
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-0.5">
            {customMacros.map(m => {
              const selected =
                binding.value === m.action &&
                JSON.stringify(binding.repeatConfig || null) ===
                  JSON.stringify(m.repeatConfig || null);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onChange(firmwareActionToBinding(m.action, m.repeatConfig))}
                  style={
                    selected
                      ? {
                          borderColor: 'var(--accent)',
                          backgroundColor: 'rgba(var(--accent-rgb), 0.14)'
                        }
                      : undefined
                  }
                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1.5 max-w-full ${
                    selected
                      ? 'text-[var(--text-primary)]'
                      : 'bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Sparkles className="w-3 h-3 text-[var(--accent)] shrink-0" />
                  <span className="truncate max-w-[150px]">{m.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Firmware Action Category Selector */}
      <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
        {ACTION_TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center justify-center gap-1 py-1.5 px-1 rounded-lg text-[10px] font-medium transition-all cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm border border-[var(--border-strong)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] border border-transparent'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Static Catalog Grid for macOS / Windows / Media / TV / TV Apps */}
      {staticItemsForTab.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5 max-h-60 overflow-y-auto pr-0.5">
          {staticItemsForTab.map(spec => {
            const selected = binding.value === spec.action && !binding.repeatConfig;
            return (
              <button
                key={spec.action}
                type="button"
                onClick={() =>
                  onChange({
                    type: spec.category,
                    value: spec.action
                  })
                }
                style={
                  selected
                    ? {
                        borderColor: 'var(--accent)',
                        backgroundColor: 'rgba(var(--accent-rgb), 0.14)'
                      }
                    : undefined
                }
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-left border transition-all cursor-pointer ${
                  selected
                    ? 'text-[var(--text-primary)] font-medium'
                    : 'bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]'
                }`}
              >
                <KeycapIcon
                  icon={spec.icon}
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: spec.color }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs truncate">{spec.label}</div>
                  <div className="font-mono text-[9px] text-[var(--text-muted)] truncate">
                    {spec.action}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Custom BLE Shortcut Builder (SHORTCUT:<mods>:<key>) */}
      {activeTab === 'shortcut' && (
        <div className="space-y-3 p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
                BLE Combo Preview
              </div>
              <div className="font-mono text-sm font-semibold text-[var(--text-primary)] mt-0.5">
                {binding.value.startsWith('SHORTCUT:') || binding.value.startsWith('KEY:F')
                  ? formatShortcutPretty(binding.value)
                  : 'Press Record or pick keys'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsRecording(r => !r)}
              style={
                isRecording
                  ? undefined
                  : {
                      backgroundColor: 'var(--accent)',
                      color: '#FFFFFF'
                    }
              }
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                isRecording
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse'
                  : 'hover:opacity-90'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>{isRecording ? 'Press keys…' : 'Record Shortcut'}</span>
            </button>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Modifiers (BLE HID)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {MODIFIER_OPTIONS.map(mod => {
                const active = parsedShortcut.mods.includes(mod.id);
                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => handleToggleModifier(mod.id)}
                    style={
                      active
                        ? {
                            borderColor: 'var(--accent)',
                            backgroundColor: 'rgba(var(--accent-rgb), 0.16)',
                            color: 'var(--text-primary)'
                          }
                        : undefined
                    }
                    className={`px-2 py-1 rounded-md text-[11px] font-mono border transition-colors cursor-pointer ${
                      active
                        ? 'font-semibold'
                        : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    {mod.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Primary Key
            </label>
            <select
              value={parsedShortcut.key}
              onChange={e => handleSelectShortcutKey(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            >
              {FIRMWARE_SUPPORTED_KEYS.map(k => (
                <option key={k} value={k}>
                  {k.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Custom BLE Typed Text + Follow-up Button + Custom Repeat Delay Builder */}
      {activeTab === 'text' && (
        <div className="space-y-3 p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
          {/* Text Snippet */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-[var(--text-secondary)]">
                Text to Type (`TEXT:`)
              </label>
              <span className="font-mono text-[10px] text-[var(--text-muted)]">
                {textDraft.length}/122
              </span>
            </div>
            <textarea
              rows={2}
              maxLength={123}
              value={textDraft}
              onChange={e => setTextDraft(e.target.value)}
              onKeyDown={e => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  handleApplyTextMacro();
                }
              }}
              placeholder="Enter text snippet (optional if repeating a key)…"
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] resize-none"
            />
          </div>

          {/* Follow-up Button / Key + Custom Key Delay */}
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[var(--border-subtle)]">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Button / Key
              </label>
              <select
                value={followUpKey}
                onChange={e => setFollowUpKey(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="">None (Text only)</option>
                {FIRMWARE_SUPPORTED_KEYS.map(k => (
                  <option key={k} value={k}>
                    {k.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Key Delay (ms)
              </label>
              <input
                type="number"
                min={0}
                max={60000}
                step={50}
                disabled={!followUpKey || textDraft.length === 0}
                value={keyDelayInput}
                onChange={e => setKeyDelayInput(e.target.value)}
                onBlur={() =>
                  setKeyDelayInput(
                    String(Math.max(0, Math.min(60000, parseInt(keyDelayInput, 10) || 0)))
                  )
                }
                placeholder="0"
                className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] disabled:opacity-40 focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>

          {/* Repeat Count / Loop + Custom Repeat Delay */}
          <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                <Repeat className="w-3 h-3 text-[var(--accent)]" />
                <span>Repeat & Custom Delay</span>
              </span>

              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setLoopUntilStopped(false)}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                    !loopUntilStopped
                      ? 'bg-[var(--bg-panel)] text-[var(--text-primary)] shadow-sm'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  Count
                </button>
                <button
                  type="button"
                  onClick={() => setLoopUntilStopped(true)}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                    loopUntilStopped
                      ? 'bg-[var(--bg-panel)] text-[var(--text-primary)] shadow-sm'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  Loop
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] text-[var(--text-muted)]">
                  {loopUntilStopped ? 'Repeat Mode' : 'Repeat Count'}
                </label>
                {loopUntilStopped ? (
                  <div className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--accent)]">
                    Until Stopped
                  </div>
                ) : (
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={repeatCountInput}
                    onChange={e => setRepeatCountInput(e.target.value)}
                    onBlur={() =>
                      setRepeatCountInput(
                        String(Math.max(1, Math.min(999, parseInt(repeatCountInput, 10) || 1)))
                      )
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                  />
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-[var(--text-muted)]">
                  Repeat Delay (ms)
                </label>
                <input
                  type="number"
                  min={10}
                  max={300000}
                  step={50}
                  disabled={!loopUntilStopped && (parseInt(repeatCountInput, 10) || 1) <= 1}
                  value={repeatDelayInput}
                  onChange={e => setRepeatDelayInput(e.target.value)}
                  onBlur={() =>
                    setRepeatDelayInput(
                      String(
                        Math.max(10, Math.min(300000, parseInt(repeatDelayInput, 10) || 500))
                      )
                    )
                  }
                  placeholder="500"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] disabled:opacity-40 focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>

            {needsUsbForDraftRepeat && (
              <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                Timed delays and multi-repeats stream over USB when pressed. Press the key again or click Stop to halt.
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              disabled={!canApplyTextMacro}
              onClick={handleApplyTextMacro}
              style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold disabled:opacity-40 cursor-pointer transition-opacity hover:opacity-90"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply & Sync</span>
            </button>

            {onTestBinding && (
              <button
                type="button"
                disabled={!canApplyTextMacro || !isConnected}
                onClick={handleTestDraftTextMacro}
                title={
                  isConnected
                    ? 'Test this text/key repeat sequence now'
                    : 'Connect USB to test sequence'
                }
                className="px-3 py-2 rounded-lg bg-[var(--bg-elevated)] hover:border-[var(--accent)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-40 cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
              >
                <Play className="w-3 h-3 text-emerald-400" />
                <span>Run</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Advanced Custom SmartCast TVKEY:<codeset>:<code> */}
      {activeTab === 'tv' && (
        <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Custom SmartCast Key (`TVKEY:codeset:code`)
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input
              type="number"
              value={tvCodeset}
              onChange={e => setTvCodeset(e.target.value)}
              placeholder="Codeset"
              className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            />
            <input
              type="number"
              value={tvCode}
              onChange={e => setTvCode(e.target.value)}
              placeholder="Code"
              className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            />
            <button
              type="button"
              onClick={handleApplyCustomTvKey}
              className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] hover:border-[var(--accent)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer"
            >
              Set TVKEY
            </button>
          </div>
        </div>
      )}

      {/* Advanced Custom SmartCast TVAPP:<id>:<ns>:<url> */}
      {activeTab === 'tv_app' && (
        <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Custom SmartCast App (`TVAPP:id:namespace:url`)
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={tvAppId}
              onChange={e => setTvAppId(e.target.value)}
              placeholder="App ID (e.g. 1)"
              className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            />
            <input
              type="number"
              value={tvAppNs}
              onChange={e => setTvAppNs(e.target.value)}
              placeholder="Namespace (e.g. 4)"
              className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={tvAppUrl}
              onChange={e => setTvAppUrl(e.target.value)}
              placeholder="Optional launch URL / message"
              className="flex-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            />
            <button
              type="button"
              onClick={handleApplyCustomTvApp}
              className="px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] hover:border-[var(--accent)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
            >
              Set TVAPP
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
