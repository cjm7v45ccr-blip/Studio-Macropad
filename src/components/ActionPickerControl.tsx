import React, { useState, useEffect } from 'react';
import {
  ActionBinding,
  ActiveRepeatJob,
  CustomMacroItem,
  DeviceConnectionInfo,
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
  getActionTestAvailability,
  isSupportedFirmwareKey,
  isValidFirmwareAction,
  normalizeBrowserKeyToFirmware,
  parseFirmwareShortcut,
  parseTextConfigFromFirmwareAction,
  requiresUsbSequenceExecution,
  sanitizeSerialString,
  validateTextMacroInput
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
  Repeat,
  Search,
  X,
  AlertCircle
} from 'lucide-react';

interface ActionPickerControlProps {
  binding: ActionBinding;
  onChange: (next: ActionBinding) => void;
  customMacros: CustomMacroItem[];
  keyboardLayout: KeyboardLayoutId;
  connection: DeviceConnectionInfo;
  activeRepeatJob?: ActiveRepeatJob | null;
  onTestBinding?: (binding: ActionBinding) => void;
  onStopRepeat?: () => void;
  onOpenMacroBuilder?: () => void;
}

type PickerCategoryTab =
  | 'os_shortcuts'
  | 'media'
  | 'shortcut'
  | 'text'
  | 'tv'
  | 'tv_app';

const ACTION_TABS: {
  id: PickerCategoryTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'os_shortcuts', label: 'Shortcuts', icon: Laptop },
  { id: 'media', label: 'Media / F13', icon: Volume2 },
  { id: 'shortcut', label: 'Custom Key', icon: Command },
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
  connection,
  activeRepeatJob,
  onTestBinding,
  onStopRepeat,
  onOpenMacroBuilder
}) => {
  const [osMode, setOsMode] = useState<'mac' | 'win'>(() =>
    binding.type === 'win_macro' ? 'win' : 'mac'
  );
  const [activeTab, setActiveTab] = useState<PickerCategoryTab>(() => {
    if (binding.type === 'mac_macro' || binding.type === 'win_macro' || binding.type === 'none') {
      return 'os_shortcuts';
    }
    return binding.type;
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [shortcutError, setShortcutError] = useState<string | null>(null);

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
    setShortcutError(null);
    if (binding.type === 'mac_macro') {
      setOsMode('mac');
      setActiveTab('os_shortcuts');
    } else if (binding.type === 'win_macro') {
      setOsMode('win');
      setActiveTab('os_shortcuts');
    } else if (binding.type !== 'none') {
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
      if (!isSupportedFirmwareKey(fwKey)) {
        setShortcutError(
          `Unsupported key "${e.key || e.code}" — choose A–Z, 0–9, F1–F24, arrows, or standard punctuation.`
        );
        setIsRecording(false);
        return;
      }

      setShortcutError(null);
      const actionStr = buildFirmwareShortcut(mods, fwKey);
      onChange(firmwareActionToBinding(actionStr));
      setIsRecording(false);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isRecording, keyboardLayout, onChange]);

  const currentInfo = describeFirmwareAction(binding.value, binding.repeatConfig);
  const parsedShortcut = parseFirmwareShortcut(binding.value);
  const mainTestAvail = getActionTestAvailability(binding.value, connection);

  const parsedKeyDelay = Math.max(0, Math.min(60000, parseInt(keyDelayInput, 10) || 0));
  const hasNativeEnter =
    textDraft.length > 0 && followUpKey === 'enter' && parsedKeyDelay <= 0;
  const maxTextChars = hasNativeEnter ? 122 : 123;
  const textValidation = validateTextMacroInput(textDraft, maxTextChars);

  const buildDraftTextConfig = (): TextMacroRepeatConfig => {
    const parsedRepeatCount = Math.max(
      1,
      Math.min(999, parseInt(repeatCountInput, 10) || 1)
    );
    const parsedRepeatDelay = Math.max(
      10,
      Math.min(300000, parseInt(repeatDelayInput, 10) || 500)
    );

    return {
      text: textDraft,
      followUpKey,
      keyDelayMs: textDraft.length > 0 && followUpKey ? parsedKeyDelay : 0,
      repeatCount: parsedRepeatCount,
      loopUntilStopped,
      repeatDelayMs: parsedRepeatDelay
    };
  };

  const draftTextConfig = buildDraftTextConfig();
  const draftTextFirmwareAction = textValidation.valid
    ? buildFirmwareActionFromTextConfig(draftTextConfig)
    : '';
  const canApplyTextMacro =
    textValidation.valid && isValidFirmwareAction(draftTextFirmwareAction);
  const needsUsbForDraftRepeat = requiresUsbSequenceExecution(draftTextConfig);
  const draftTextTestAvail = getActionTestAvailability(
    draftTextFirmwareAction,
    connection
  );

  // Draft custom TVKEY / TVAPP actions & test availability
  const csNum = parseInt(tvCodeset, 10);
  const cdNum = parseInt(tvCode, 10);
  const draftTvKeyAction =
    !Number.isNaN(csNum) && csNum >= 0 && !Number.isNaN(cdNum) && cdNum >= 0
      ? `TVKEY:${csNum}:${cdNum}`
      : '';
  const tvKeyTestAvail = getActionTestAvailability(draftTvKeyAction, connection);

  const cleanTvAppId = sanitizeSerialString(tvAppId.trim(), 32);
  const nsNum = parseInt(tvAppNs, 10);
  const cleanTvAppUrl = sanitizeSerialString(tvAppUrl.trim(), 80);
  const draftTvAppAction =
    cleanTvAppId && !Number.isNaN(nsNum)
      ? cleanTvAppUrl
        ? `TVAPP:${cleanTvAppId}:${nsNum}:${cleanTvAppUrl}`
        : `TVAPP:${cleanTvAppId}:${nsNum}`
      : '';
  const tvAppTestAvail = getActionTestAvailability(draftTvAppAction, connection);

  const handleToggleModifier = (modId: string) => {
    setShortcutError(null);
    const exists = parsedShortcut.mods.includes(modId);
    const nextMods = exists
      ? parsedShortcut.mods.filter(m => m !== modId)
      : [...parsedShortcut.mods, modId];
    const nextAction = buildFirmwareShortcut(nextMods, parsedShortcut.key || 'c');
    onChange(firmwareActionToBinding(nextAction));
  };

  const handleSelectShortcutKey = (nextKey: string) => {
    setShortcutError(null);
    const nextAction = buildFirmwareShortcut(parsedShortcut.mods, nextKey);
    onChange(firmwareActionToBinding(nextAction));
  };

  const handleApplyTextMacro = () => {
    if (!textValidation.valid) return;
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
    if (!onTestBinding || !textValidation.valid) return;
    const cfg = buildDraftTextConfig();
    const actionStr = buildFirmwareActionFromTextConfig(cfg);
    if (!isValidFirmwareAction(actionStr)) return;
    onTestBinding(firmwareActionToBinding(actionStr, cfg));
  };

  const handleApplyCustomTvKey = () => {
    if (!draftTvKeyAction || !isValidFirmwareAction(draftTvKeyAction)) return;
    onChange({ type: 'tv', value: draftTvKeyAction });
  };

  const handleApplyCustomTvApp = () => {
    if (!draftTvAppAction || !isValidFirmwareAction(draftTvAppAction)) return;
    onChange({ type: 'tv_app', value: draftTvAppAction });
  };

  const trimmedQuery = searchQuery.trim().toLowerCase();

  // Filter static items:
  // - If searchQuery is typed, search across all categories (respecting Mac MACRO: vs Windows WIN: toggle)
  // - Otherwise show items for the active category tab
  const staticItemsToDisplay = FIRMWARE_STATIC_CATALOG.filter(spec => {
    // Enforce Mac vs Windows toggle: show ONLY MACRO: or WIN: shortcuts
    if (spec.category === 'mac_macro' && osMode !== 'mac') return false;
    if (spec.category === 'win_macro' && osMode !== 'win') return false;

    if (trimmedQuery) {
      return (
        spec.label.toLowerCase().includes(trimmedQuery) ||
        spec.shortLabel.toLowerCase().includes(trimmedQuery) ||
        spec.description.toLowerCase().includes(trimmedQuery) ||
        spec.action.toLowerCase().includes(trimmedQuery)
      );
    }

    if (activeTab === 'os_shortcuts') {
      return osMode === 'mac'
        ? spec.category === 'mac_macro'
        : spec.category === 'win_macro';
    }

    return spec.category === activeTab;
  });

  return (
    <div className="space-y-3.5">
      {/* Live Synced Firmware Action Bar + Test with Link-Down Reason */}
      <div className="p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
              Assigned Action
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
                disabled={!mainTestAvail.canTest}
                onClick={() => onTestBinding(binding)}
                title={mainTestAvail.reason || 'Fire this action live on the MacroPad'}
                className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] hover:border-[var(--accent)] border border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-primary)] disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer whitespace-nowrap"
              >
                <Play className="w-3 h-3 text-emerald-400" />
                <span>Test</span>
              </button>
            )
          )}
        </div>

        {binding.value && !mainTestAvail.canTest && mainTestAvail.reason && (
          <div className="flex items-start gap-1.5 text-[11px] text-amber-300 pt-1.5 border-t border-[var(--border-subtle)]">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <span>{mainTestAvail.reason}</span>
          </div>
        )}
      </div>

      {/* Search Bar + Mac/Windows Shortcut Toggle */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search actions (e.g. mute)…"
            aria-label="Search actions"
            className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Mac / Windows Toggle: shows ONLY MACRO: or WIN: shortcuts */}
        <div
          role="group"
          aria-label="Operating system shortcut toggle"
          className="flex items-center p-0.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] shrink-0"
        >
          <button
            type="button"
            onClick={() => setOsMode('mac')}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              osMode === 'mac'
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
            title="Show MACRO: macOS shortcuts"
          >
            <Laptop className="w-3 h-3" />
            <span>Mac</span>
          </button>
          <button
            type="button"
            onClick={() => setOsMode('win')}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              osMode === 'win'
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
            title="Show WIN: Windows shortcuts"
          >
            <Monitor className="w-3 h-3" />
            <span>Windows</span>
          </button>
        </div>
      </div>

      {/* Saved / Device-Synced Custom Macros Quick Strip */}
      {!trimmedQuery && customMacros.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Saved Custom Macros ({customMacros.length})
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

      {/* Firmware Action Category Tabs */}
      {!trimmedQuery && (
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
          {ACTION_TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-[11px] font-medium transition-all cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm border border-[var(--border-strong)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] border border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {tab.id === 'os_shortcuts'
                    ? osMode === 'mac'
                      ? 'Mac Shortcuts'
                      : 'Win Shortcuts'
                    : tab.label}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Static Catalog Grid (Search results or Active Category) */}
      {(trimmedQuery || staticItemsToDisplay.length > 0) && (
        <div className="space-y-1.5">
          {trimmedQuery && (
            <div className="text-[10px] font-mono text-[var(--text-muted)]">
              {staticItemsToDisplay.length}{' '}
              {staticItemsToDisplay.length === 1 ? 'match' : 'matches'} for "{searchQuery}"
            </div>
          )}

          {staticItemsToDisplay.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] py-3 text-center">
              No built-in actions match "{searchQuery}".
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 max-h-60 overflow-y-auto pr-0.5">
              {staticItemsToDisplay.map(spec => {
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
        </div>
      )}

      {/* Custom BLE Shortcut Builder (SHORTCUT:<mods>:<key>) */}
      {!trimmedQuery && activeTab === 'shortcut' && (
        <div className="space-y-3 p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
                BLE Shortcut Preview
              </div>
              <div className="font-mono text-sm font-semibold text-[var(--text-primary)] mt-0.5 truncate">
                {binding.value.startsWith('SHORTCUT:') || binding.value.startsWith('KEY:F')
                  ? `${formatShortcutPretty(binding.value)} (${binding.value})`
                  : 'Press Record or pick keys'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setShortcutError(null);
                setIsRecording(r => !r);
              }}
              style={
                isRecording
                  ? undefined
                  : {
                      backgroundColor: 'var(--accent)',
                      color: '#FFFFFF'
                    }
              }
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                isRecording
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse'
                  : 'hover:opacity-90'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>{isRecording ? 'Press keys…' : 'Record Shortcut'}</span>
            </button>
          </div>

          {shortcutError && (
            <div className="p-2.5 rounded-lg bg-rose-500/12 border border-rose-500/35 flex items-start gap-2 text-[11px] text-rose-300">
              <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
              <span>{shortcutError}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Modifiers (optional — leave empty for single key like SHORTCUT::right)
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
      {!trimmedQuery && activeTab === 'text' && (
        <div className="space-y-3 p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
          {/* Text Snippet */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-[var(--text-secondary)]">
                Text Snippet (`TEXT:`)
              </label>
              <span
                className={`font-mono text-[10px] tabular-nums ${
                  !textValidation.valid ? 'text-rose-400 font-semibold' : 'text-[var(--text-muted)]'
                }`}
              >
                {textDraft.length}/{maxTextChars}
              </span>
            </div>
            <textarea
              rows={2}
              maxLength={maxTextChars}
              value={textDraft}
              onChange={e => setTextDraft(e.target.value.slice(0, maxTextChars))}
              onKeyDown={e => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  handleApplyTextMacro();
                }
              }}
              placeholder="Enter ASCII text snippet (max 123 chars)…"
              className={`w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border text-xs font-mono text-[var(--text-primary)] focus:outline-none resize-none ${
                !textValidation.valid
                  ? 'border-rose-500'
                  : 'border-[var(--border-subtle)] focus:border-[var(--accent)]'
              }`}
            />
            {!textValidation.valid && textValidation.error && (
              <div className="flex items-start gap-1.5 text-[11px] text-rose-300">
                <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                <span>{textValidation.error}</span>
              </div>
            )}
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
                className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] disabled:opacity-40 focus:outline-none focus:border-[var(--accent)] tabular-nums"
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
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] tabular-nums"
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
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] disabled:opacity-40 focus:outline-none focus:border-[var(--accent)] tabular-nums"
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
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold disabled:opacity-40 cursor-pointer transition-opacity hover:opacity-90 whitespace-nowrap"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save Snippet</span>
            </button>

            {onTestBinding && (
              <button
                type="button"
                disabled={!canApplyTextMacro || !draftTextTestAvail.canTest}
                onClick={handleTestDraftTextMacro}
                title={draftTextTestAvail.reason || 'Test this text/repeat action now'}
                className="px-3 py-2 rounded-lg bg-[var(--bg-elevated)] hover:border-[var(--accent)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-40 disabled:pointer-events-none cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
              >
                <Play className="w-3 h-3 text-emerald-400" />
                <span>Test</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Custom SmartCast TVKEY:<codeset>:<code> */}
      {!trimmedQuery && activeTab === 'tv' && (
        <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Custom TV Key (`TVKEY:codeset:code`)
            </span>
            {draftTvKeyAction && (
              <span className="font-mono text-[10px] text-[var(--text-secondary)]">
                {draftTvKeyAction}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min={0}
              value={tvCodeset}
              onChange={e => setTvCodeset(e.target.value)}
              placeholder="Codeset (e.g. 5)"
              aria-label="SmartCast Codeset"
              className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] tabular-nums"
            />
            <input
              type="number"
              min={0}
              value={tvCode}
              onChange={e => setTvCode(e.target.value)}
              placeholder="Code (e.g. 1)"
              aria-label="SmartCast Key Code"
              className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] tabular-nums"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!draftTvKeyAction}
              onClick={handleApplyCustomTvKey}
              style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
              className="flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold disabled:opacity-40 hover:opacity-90 cursor-pointer whitespace-nowrap"
            >
              Save TVKEY
            </button>
            {onTestBinding && (
              <button
                type="button"
                disabled={!draftTvKeyAction || !tvKeyTestAvail.canTest}
                onClick={() =>
                  onTestBinding({ type: 'tv', value: draftTvKeyAction })
                }
                title={tvKeyTestAvail.reason || 'Test custom TVKEY on SmartCast TV'}
                className="px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] hover:border-[var(--accent)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-40 disabled:pointer-events-none cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
              >
                <Play className="w-3 h-3 text-emerald-400" />
                <span>Test</span>
              </button>
            )}
          </div>
          {draftTvKeyAction && !tvKeyTestAvail.canTest && tvKeyTestAvail.reason && (
            <div className="text-[11px] text-amber-300 flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span>{tvKeyTestAvail.reason}</span>
            </div>
          )}
        </div>
      )}

      {/* Custom SmartCast TVAPP:<id>:<ns>:<url> */}
      {!trimmedQuery && activeTab === 'tv_app' && (
        <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Custom TV App (`TVAPP:id:namespace:url`)
            </span>
            {draftTvAppAction && (
              <span className="font-mono text-[10px] text-[var(--text-secondary)] truncate max-w-[140px]">
                {draftTvAppAction}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={tvAppId}
              onChange={e => setTvAppId(e.target.value)}
              placeholder="App ID (e.g. 1)"
              aria-label="SmartCast App ID"
              className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            />
            <input
              type="number"
              min={0}
              value={tvAppNs}
              onChange={e => setTvAppNs(e.target.value)}
              placeholder="Namespace (e.g. 4)"
              aria-label="SmartCast App Namespace"
              className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] tabular-nums"
            />
          </div>
          <input
            type="text"
            value={tvAppUrl}
            onChange={e => setTvAppUrl(e.target.value)}
            placeholder="Optional launch URL / message"
            aria-label="Optional launch URL"
            className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!draftTvAppAction}
              onClick={handleApplyCustomTvApp}
              style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
              className="flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold disabled:opacity-40 hover:opacity-90 cursor-pointer whitespace-nowrap"
            >
              Save TVAPP
            </button>
            {onTestBinding && (
              <button
                type="button"
                disabled={!draftTvAppAction || !tvAppTestAvail.canTest}
                onClick={() =>
                  onTestBinding({ type: 'tv_app', value: draftTvAppAction })
                }
                title={tvAppTestAvail.reason || 'Test custom TVAPP launch on SmartCast TV'}
                className="px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] hover:border-[var(--accent)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-40 disabled:pointer-events-none cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
              >
                <Play className="w-3 h-3 text-emerald-400" />
                <span>Test</span>
              </button>
            )}
          </div>
          {draftTvAppAction && !tvAppTestAvail.canTest && tvAppTestAvail.reason && (
            <div className="text-[11px] text-amber-300 flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span>{tvAppTestAvail.reason}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
