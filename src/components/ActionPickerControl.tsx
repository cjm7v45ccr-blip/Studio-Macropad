import React, { useState, useEffect, useMemo } from 'react';
import {
  ActionBinding,
  ActiveRepeatJob,
  CustomMacroItem,
  DeviceConnectionInfo,
  HardwareProfileId,
  HostOsType,
  KeyboardLayoutId,
  TextMacroRepeatConfig,
  hostOsFullLabel,
  isBleHostProfile
} from '../types/studio';
import {
  DEFAULT_TEXT_REPEAT_CONFIG,
  FIRMWARE_STATIC_CATALOG,
  FIRMWARE_SUPPORTED_KEYS,
  MAX_FIRMWARE_DELAY_STEP_MS,
  buildFirmwareActionFromTextConfig,
  buildFirmwareShortcut,
  calculateStepsTiming,
  canonicalizeFirmwareAction,
  describeFirmwareAction,
  findEquivalentBuiltInSpec,
  firmwareActionToBinding,
  formatDurationCompact,
  getActionTestAvailability,
  getMacroCanonicalSignature,
  getShortcutsForHostOs,
  isSupportedFirmwareKey,
  isValidFirmwareAction,
  normalizeBrowserKeyToFirmware,
  parseFirmwareShortcut,
  parseSingleActionKeyValue,
  parseTextConfigFromFirmwareAction,
  requiresUsbSequenceExecution,
  sanitizeSerialString,
  validateTextMacroInput
} from '../data/firmwareCatalog';
import { KeycapIcon } from '../data/iconRegistry';
import { ParsedActionBadge } from './ActionTagBadge';
import {
  Command,
  Volume2,
  Tv,
  Clapperboard,
  FileText,
  Laptop,
  Play,
  Square,
  Radio,
  Check,
  Repeat,
  Search,
  X,
  AlertCircle,
  Bluetooth,
  Sliders,
  Wand2,
  Zap,
  Code2,
  Plus
} from 'lucide-react';

interface ActionPickerControlProps {
  binding: ActionBinding;
  onChange: (next: ActionBinding) => void;
  customMacros: CustomMacroItem[];
  keyboardLayout: KeyboardLayoutId;
  connection: DeviceConnectionInfo;
  activeProfileId?: HardwareProfileId;
  activeHostOs?: HostOsType;
  onChangeHostOs?: (os: HostOsType) => void;
  showAdvancedIds?: boolean;
  onToggleAdvancedIds?: () => void;
  activeRepeatJob?: ActiveRepeatJob | null;
  onTestBinding?: (binding: ActionBinding) => void;
  onStopRepeat?: () => void;
  onOpenMacroBuilder?: () => void;
}

type PickerCategoryTab =
  | 'my_macros'
  | 'os_shortcuts'
  | 'media'
  | 'ble'
  | 'shortcut'
  | 'text'
  | 'tv'
  | 'tv_app';

const ACTION_TABS: {
  id: PickerCategoryTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'my_macros', label: 'My Macros', icon: Zap },
  { id: 'os_shortcuts', label: 'Shortcuts', icon: Laptop },
  { id: 'media', label: 'Media & Keys', icon: Volume2 },
  { id: 'ble', label: 'BLE Hosts', icon: Bluetooth },
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
  activeProfileId = 'HOST1',
  activeHostOs = 'mac',
  onChangeHostOs,
  showAdvancedIds = false,
  onToggleAdvancedIds,
  activeRepeatJob,
  onTestBinding,
  onStopRepeat,
  onOpenMacroBuilder
}) => {
  const currentSignature = useMemo(
    () => getMacroCanonicalSignature(binding.value, binding.repeatConfig),
    [binding.value, binding.repeatConfig]
  );

  const matchedSavedMacro = useMemo(() => {
    if (!currentSignature) return undefined;
    return customMacros.find(
      m => getMacroCanonicalSignature(m.action, m.repeatConfig) === currentSignature
    );
  }, [customMacros, currentSignature]);

  const deriveTabForBinding = (): PickerCategoryTab => {
    if (matchedSavedMacro) return 'my_macros';
    if (binding.type === 'mac_macro' || binding.type === 'win_macro') {
      return 'os_shortcuts';
    }
    if (binding.type === 'none') {
      return activeProfileId === 'TV' ? 'tv' : 'os_shortcuts';
    }
    return binding.type;
  };

  const [activeTab, setActiveTab] = useState<PickerCategoryTab>(deriveTabForBinding);
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
    if (matchedSavedMacro) {
      setActiveTab('my_macros');
    } else if (binding.type === 'mac_macro' || binding.type === 'win_macro') {
      setActiveTab('os_shortcuts');
    } else if (binding.type !== 'none') {
      setActiveTab(binding.type);
    }

    if (binding.repeatConfig || binding.value.startsWith('TEXT:')) {
      const cfg = parseTextConfigFromFirmwareAction(binding.value, binding.repeatConfig);
      setTextDraft(cfg.text);
      setFollowUpKey(cfg.followUpKey);
      setKeyDelayInput(String(Math.min(MAX_FIRMWARE_DELAY_STEP_MS, cfg.keyDelayMs)));
      setRepeatCountInput(String(cfg.repeatCount));
      setLoopUntilStopped(cfg.loopUntilStopped);
      setRepeatDelayInput(String(Math.min(MAX_FIRMWARE_DELAY_STEP_MS, cfg.repeatDelayMs)));
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
  }, [binding.type, binding.value, binding.repeatConfig, matchedSavedMacro]);

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

  const currentInfo = describeFirmwareAction(
    binding.value,
    binding.repeatConfig,
    customMacros
  );

  const isShortcutBinding =
    binding.value.startsWith('SHORTCUT:') || binding.value.startsWith('KEY:F');
  const parsedShortcut = isShortcutBinding
    ? parseFirmwareShortcut(binding.value)
    : { mods: [] as string[], key: 'f13' };

  const equivalentBuiltIn = useMemo(() => {
    if (!binding.value.startsWith('SHORTCUT:')) return null;
    const spec = findEquivalentBuiltInSpec(binding.value);
    if (spec && spec.action !== canonicalizeFirmwareAction(binding.value)) {
      return spec;
    }
    return null;
  }, [binding.value]);

  const mainTestAvail = getActionTestAvailability(binding.value, connection);

  const parsedKeyDelay = Math.max(
    0,
    Math.min(MAX_FIRMWARE_DELAY_STEP_MS, parseInt(keyDelayInput, 10) || 0)
  );
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
      Math.min(MAX_FIRMWARE_DELAY_STEP_MS, parseInt(repeatDelayInput, 10) || 500)
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

  const shouldStoreDraftRepeatMeta =
    Boolean(draftTextConfig.followUpKey) ||
    draftTextConfig.repeatCount > 1 ||
    draftTextConfig.loopUntilStopped ||
    draftTextConfig.keyDelayMs > 0;
  const draftTextSignature = canApplyTextMacro
    ? getMacroCanonicalSignature(
        draftTextFirmwareAction,
        shouldStoreDraftRepeatMeta ? draftTextConfig : undefined
      )
    : '';
  const isTextDraftUnsaved =
    activeTab === 'text' &&
    canApplyTextMacro &&
    draftTextSignature !== currentSignature;

  // Draft custom TVKEY / TVAPP actions & test availability
  const csNum = parseInt(tvCodeset, 10);
  const cdNum = parseInt(tvCode, 10);
  const draftTvKeyAction =
    !Number.isNaN(csNum) && csNum >= 0 && !Number.isNaN(cdNum) && cdNum >= 0
      ? `TVKEY:${csNum}:${cdNum}`
      : '';
  const tvKeyTestAvail = getActionTestAvailability(draftTvKeyAction, connection);
  const isTvKeyDraftUnsaved =
    activeTab === 'tv' &&
    Boolean(draftTvKeyAction) &&
    binding.value.startsWith('TVKEY:') &&
    draftTvKeyAction !== binding.value;

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
  const isTvAppDraftUnsaved =
    activeTab === 'tv_app' &&
    Boolean(draftTvAppAction) &&
    binding.value.startsWith('TVAPP:') &&
    draftTvAppAction !== binding.value;

  const handleToggleModifier = (modId: string) => {
    setShortcutError(null);
    const exists = parsedShortcut.mods.includes(modId);
    const nextMods = exists
      ? parsedShortcut.mods.filter(m => m !== modId)
      : [...parsedShortcut.mods, modId];
    const nextAction = buildFirmwareShortcut(nextMods, parsedShortcut.key || 'f13');
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

  // Per-device OS mapped shortcuts (no duplicate Mac + PC lists!)
  const osMappedShortcuts = useMemo(
    () => getShortcutsForHostOs(activeHostOs),
    [activeHostOs]
  );

  const matchingCustomMacros = useMemo(() => {
    if (!trimmedQuery) return customMacros;
    return customMacros.filter(m => {
      const desc = describeFirmwareAction(m.action, m.repeatConfig, customMacros);
      return (
        m.name.toLowerCase().includes(trimmedQuery) ||
        m.action.toLowerCase().includes(trimmedQuery) ||
        desc.fullLabel.toLowerCase().includes(trimmedQuery)
      );
    });
  }, [customMacros, trimmedQuery]);

  const nonOsStaticCatalog = useMemo(
    () =>
      FIRMWARE_STATIC_CATALOG.filter(
        s => s.category !== 'mac_macro' && s.category !== 'win_macro'
      ),
    []
  );

  const searchShortcutMatches = useMemo(() => {
    if (!trimmedQuery) return [];
    return osMappedShortcuts.filter(
      s =>
        s.label.toLowerCase().includes(trimmedQuery) ||
        s.shortcutHint.toLowerCase().includes(trimmedQuery) ||
        s.description.toLowerCase().includes(trimmedQuery) ||
        s.action.toLowerCase().includes(trimmedQuery)
    );
  }, [osMappedShortcuts, trimmedQuery]);

  const searchOtherStaticMatches = useMemo(() => {
    if (!trimmedQuery) return [];
    return nonOsStaticCatalog.filter(
      s =>
        s.label.toLowerCase().includes(trimmedQuery) ||
        s.shortLabel.toLowerCase().includes(trimmedQuery) ||
        s.description.toLowerCase().includes(trimmedQuery) ||
        s.action.toLowerCase().includes(trimmedQuery)
    );
  }, [nonOsStaticCatalog, trimmedQuery]);

  const activeCategoryItems = useMemo(() => {
    if (
      activeTab === 'my_macros' ||
      activeTab === 'os_shortcuts' ||
      activeTab === 'shortcut' ||
      activeTab === 'text'
    ) {
      return [];
    }
    return nonOsStaticCatalog.filter(s => s.category === activeTab);
  }, [activeTab, nonOsStaticCatalog]);

  const renderMacroSummaryMeta = (macro: CustomMacroItem) => {
    const parsedCfg = parseTextConfigFromFirmwareAction(macro.action, macro.repeatConfig);
    const steps = parsedCfg.steps || [];
    const timing = calculateStepsTiming(steps);
    const stepCount = Math.max(1, steps.length);
    if (showAdvancedIds) {
      return macro.action;
    }
    if (stepCount > 1 || timing.totalDelayMs > 0) {
      return `${stepCount} ${stepCount === 1 ? 'step' : 'steps'} · ~${formatDurationCompact(
        timing.estimatedRunMs
      )}`;
    }
    return describeFirmwareAction(macro.action, macro.repeatConfig).fullLabel;
  };

  return (
    <div className="space-y-3">
      {/* Compact Assigned Action Bar */}
      <div
        title={binding.value ? `Raw action: ${binding.value}` : 'Unassigned'}
        className="px-3 py-2.5 rounded-xl bg-[var(--bg-input)] flex items-center justify-between gap-2.5"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {binding.value ? (
              <ParsedActionBadge
                action={binding.value}
                repeatConfig={binding.repeatConfig}
                customMacros={customMacros}
                showRawId={showAdvancedIds}
                size="sm"
                maxSteps={2}
              />
            ) : (
              <span className="text-xs text-[var(--text-muted)]">Unassigned</span>
            )}
          </div>
          {binding.value && (
            <div className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
              {showAdvancedIds ? binding.value : currentInfo.fullLabel}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onOpenMacroBuilder && (
            <button
              type="button"
              onClick={onOpenMacroBuilder}
              title="Open multi-step sequence builder for this control"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-panel)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] shadow-2xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Sliders className="w-3 h-3 text-[var(--accent)]" />
              <span>Sequence</span>
            </button>
          )}

          {activeRepeatJob && onStopRepeat ? (
            <button
              type="button"
              onClick={onStopRepeat}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-[11px] font-semibold text-rose-600 dark:text-rose-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
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
                title={
                  mainTestAvail.reason ||
                  'Connect MacroPad via USB to test actions on hardware'
                }
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-panel)] text-[11px] font-semibold text-[var(--text-primary)] disabled:opacity-40 shadow-2xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Play className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <span>Test</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Top Search Box */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search shortcuts, macros, media, or TV actions…"
          aria-label="Search actions"
          className="w-full pl-8 pr-8 py-2 rounded-xl bg-[var(--bg-input)] border border-transparent focus:border-[var(--accent)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none transition-colors"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Two-Pane Picker: Narrow Category List on Left, Actions on Right */}
      <div className="flex items-start gap-2.5">
        {/* Left Category Rail */}
        <nav
          aria-label="Action categories"
          className="w-[116px] sm:w-[124px] shrink-0 flex flex-col gap-0.5 p-1 rounded-xl bg-[var(--bg-input)]"
        >
          {ACTION_TABS.map(tab => {
            const Icon = tab.icon;
            const active = !trimmedQuery && activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setActiveTab(tab.id);
                }}
                className={`w-full flex items-center justify-between gap-1.5 px-2.5 py-2 rounded-lg text-[11px] transition-colors cursor-pointer text-left whitespace-nowrap ${
                  active
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-semibold shadow-2xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]/60 font-medium'
                }`}
              >
                <span className="flex items-center gap-1.5 min-w-0 truncate">
                  <Icon
                    className={`w-3.5 h-3.5 shrink-0 ${
                      active ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                    }`}
                  />
                  <span className="truncate">{tab.label}</span>
                </span>
                {tab.id === 'my_macros' && customMacros.length > 0 && (
                  <span className="text-[10px] text-[var(--text-muted)] tabular-nums shrink-0">
                    {customMacros.length}
                  </span>
                )}
              </button>
            );
          })}

          {onToggleAdvancedIds && (
            <div className="pt-1.5 mt-1 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={onToggleAdvancedIds}
                title="Show or hide raw firmware command IDs (e.g. PLAY_PAUSE, VOL_DOWN)"
                className={`w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  showAdvancedIds
                    ? 'bg-[rgba(var(--accent-rgb),0.14)] text-[var(--accent)] font-semibold'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                <Code2 className="w-3 h-3 shrink-0" />
                <span>{showAdvancedIds ? 'IDs Shown' : 'Advanced'}</span>
              </button>
            </div>
          )}
        </nav>

        {/* Right Actions / Builder Pane */}
        <div className="flex-1 min-w-0 space-y-2.5">
          {trimmedQuery ? (
            /* Unified Search Results */
            <div className="space-y-3">
              {matchingCustomMacros.length === 0 &&
              searchShortcutMatches.length === 0 &&
              searchOtherStaticMatches.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] py-6 text-center">
                  No actions or macros match "{searchQuery}".
                </p>
              ) : (
                <>
                  {matchingCustomMacros.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-medium text-[var(--text-muted)] px-0.5">
                        My Macros · {matchingCustomMacros.length}
                      </div>
                      <div className="space-y-1">
                        {matchingCustomMacros.map(m => {
                          const macroSig = getMacroCanonicalSignature(
                            m.action,
                            m.repeatConfig
                          );
                          const selected =
                            Boolean(currentSignature) && macroSig === currentSignature;
                          const desc = describeFirmwareAction(
                            m.action,
                            m.repeatConfig,
                            customMacros
                          );
                          return (
                            <button
                              key={m.id}
                              type="button"
                              title={`${m.name} — ${m.action}`}
                              onClick={() =>
                                onChange(firmwareActionToBinding(m.action, m.repeatConfig))
                              }
                              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all cursor-pointer ${
                                selected
                                  ? 'bg-[rgba(var(--accent-rgb),0.14)] ring-1 ring-[var(--accent)] text-[var(--text-primary)]'
                                  : 'bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                              }`}
                            >
                              <KeycapIcon
                                icon={desc.icon}
                                className={`w-4 h-4 shrink-0 ${
                                  selected
                                    ? 'text-[var(--accent)]'
                                    : 'text-[var(--text-secondary)]'
                                }`}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                                  {m.name}
                                </div>
                                <div
                                  className={`text-[11px] text-[var(--text-muted)] truncate ${
                                    showAdvancedIds ? 'font-mono text-[10px]' : ''
                                  }`}
                                >
                                  {renderMacroSummaryMeta(m)}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {searchShortcutMatches.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-medium text-[var(--text-muted)] px-0.5">
                        Shortcuts ({hostOsFullLabel(activeHostOs)}) ·{' '}
                        {searchShortcutMatches.length}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {searchShortcutMatches.map(spec => {
                          const selected =
                            binding.value === spec.action && !binding.repeatConfig;
                          return (
                            <button
                              key={spec.id}
                              type="button"
                              title={`${spec.label} (${spec.shortcutHint}) — ${spec.action}`}
                              onClick={() =>
                                onChange(firmwareActionToBinding(spec.action))
                              }
                              className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-left transition-all cursor-pointer ${
                                selected
                                  ? 'bg-[rgba(var(--accent-rgb),0.14)] ring-1 ring-[var(--accent)] text-[var(--text-primary)]'
                                  : 'bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                              }`}
                            >
                              <KeycapIcon
                                icon={spec.icon}
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  selected
                                    ? 'text-[var(--accent)]'
                                    : 'text-[var(--text-secondary)]'
                                }`}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                                  {spec.label}
                                </div>
                                <div className="text-[10px] font-mono text-[var(--text-muted)] truncate">
                                  {showAdvancedIds ? spec.action : spec.shortcutHint}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {searchOtherStaticMatches.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-medium text-[var(--text-muted)] px-0.5">
                        System, Media & TV · {searchOtherStaticMatches.length}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {searchOtherStaticMatches.map(spec => {
                          const selected =
                            binding.value === spec.action && !binding.repeatConfig;
                          const parsedSpec = parseSingleActionKeyValue(spec.action);
                          return (
                            <button
                              key={spec.action}
                              type="button"
                              title={`${spec.label} — ${spec.action}`}
                              onClick={() =>
                                onChange({
                                  type: spec.category,
                                  value: spec.action
                                })
                              }
                              className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-left transition-all cursor-pointer ${
                                selected
                                  ? 'bg-[rgba(var(--accent-rgb),0.14)] ring-1 ring-[var(--accent)] text-[var(--text-primary)]'
                                  : 'bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                              }`}
                            >
                              <KeycapIcon
                                icon={spec.icon}
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  selected
                                    ? 'text-[var(--accent)]'
                                    : 'text-[var(--text-secondary)]'
                                }`}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                                  {spec.label}
                                </div>
                                {showAdvancedIds && (
                                  <div className="text-[10px] font-mono text-[var(--text-muted)] truncate">
                                    {parsedSpec.value}
                                  </div>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : activeTab === 'my_macros' ? (
            /* Single Macro Library Category */
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 px-0.5">
                <span className="text-[11px] font-medium text-[var(--text-muted)]">
                  Saved in Macro Library
                </span>
                {onOpenMacroBuilder && (
                  <button
                    type="button"
                    onClick={onOpenMacroBuilder}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)] hover:underline cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Open Builder</span>
                  </button>
                )}
              </div>

              {customMacros.length === 0 ? (
                <div className="p-5 rounded-xl bg-[var(--bg-input)] text-center space-y-2.5">
                  <p className="text-xs text-[var(--text-secondary)]">
                    No saved macros yet. Build multi-step sequences with waits, shortcuts, and typed text in the Macro Builder.
                  </p>
                  {onOpenMacroBuilder && (
                    <button
                      type="button"
                      onClick={onOpenMacroBuilder}
                      style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Create Macro</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {customMacros.map(m => {
                    const macroSig = getMacroCanonicalSignature(m.action, m.repeatConfig);
                    const selected =
                      Boolean(currentSignature) && macroSig === currentSignature;
                    const desc = describeFirmwareAction(
                      m.action,
                      m.repeatConfig,
                      customMacros
                    );
                    return (
                      <button
                        key={m.id}
                        type="button"
                        title={`${m.name} — ${m.action}`}
                        onClick={() =>
                          onChange(firmwareActionToBinding(m.action, m.repeatConfig))
                        }
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all cursor-pointer ${
                          selected
                            ? 'bg-[rgba(var(--accent-rgb),0.14)] ring-1 ring-[var(--accent)] text-[var(--text-primary)]'
                            : 'bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        <KeycapIcon
                          icon={desc.icon}
                          className={`w-4 h-4 shrink-0 ${
                            selected
                              ? 'text-[var(--accent)]'
                              : 'text-[var(--text-secondary)]'
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                            {m.name}
                          </div>
                          <div
                            className={`text-[11px] text-[var(--text-muted)] truncate ${
                              showAdvancedIds ? 'font-mono text-[10px]' : ''
                            }`}
                          >
                            {renderMacroSummaryMeta(m)}
                          </div>
                        </div>
                        {selected && (
                          <Check className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : activeTab === 'os_shortcuts' ? (
            /* Per-Device OS Mapped Shortcuts */
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 px-0.5">
                <span className="text-[11px] text-[var(--text-muted)] truncate">
                  {isBleHostProfile(activeProfileId)
                    ? `Mapped for ${hostOsFullLabel(activeHostOs)}`
                    : `Shortcuts (${hostOsFullLabel(activeHostOs)})`}
                </span>
                {isBleHostProfile(activeProfileId) && onChangeHostOs && (
                  <div
                    role="group"
                    aria-label="Device operating system"
                    className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[var(--bg-input)] shrink-0"
                  >
                    {(
                      [
                        { id: 'mac', label: 'Mac' },
                        { id: 'windows', label: 'Win' },
                        { id: 'linux', label: 'Linux' }
                      ] as const
                    ).map(opt => {
                      const isActiveOs = activeHostOs === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => onChangeHostOs(opt.id)}
                          title={`Set this device to ${hostOsFullLabel(opt.id)}`}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                            isActiveOs
                              ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-semibold shadow-2xs'
                              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {osMappedShortcuts.map(spec => {
                  const selected =
                    binding.value === spec.action && !binding.repeatConfig;
                  return (
                    <button
                      key={spec.id}
                      type="button"
                      title={`${spec.label} (${spec.shortcutHint}) — ${spec.action}`}
                      onClick={() =>
                        onChange(firmwareActionToBinding(spec.action))
                      }
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-left transition-all cursor-pointer ${
                        selected
                          ? 'bg-[rgba(var(--accent-rgb),0.14)] ring-1 ring-[var(--accent)] text-[var(--text-primary)]'
                          : 'bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <KeycapIcon
                        icon={spec.icon}
                        className={`w-3.5 h-3.5 shrink-0 ${
                          selected
                            ? 'text-[var(--accent)]'
                            : 'text-[var(--text-secondary)]'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                          {spec.label}
                        </div>
                        <div className="text-[10px] font-mono text-[var(--text-muted)] truncate">
                          {showAdvancedIds ? spec.action : spec.shortcutHint}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Static Categories + Custom Inline Builders */
            <div className="space-y-2.5">
              {activeCategoryItems.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {activeCategoryItems.map(spec => {
                    const selected =
                      binding.value === spec.action && !binding.repeatConfig;
                    const parsedSpec = parseSingleActionKeyValue(spec.action);
                    return (
                      <button
                        key={spec.action}
                        type="button"
                        title={`${spec.label} — ${spec.action}`}
                        onClick={() =>
                          onChange({
                            type: spec.category,
                            value: spec.action
                          })
                        }
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-left transition-all cursor-pointer ${
                          selected
                            ? 'bg-[rgba(var(--accent-rgb),0.14)] ring-1 ring-[var(--accent)] text-[var(--text-primary)]'
                            : 'bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        <KeycapIcon
                          icon={spec.icon}
                          className={`w-3.5 h-3.5 shrink-0 ${
                            selected
                              ? 'text-[var(--accent)]'
                              : 'text-[var(--text-secondary)]'
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                            {spec.label}
                          </div>
                          {showAdvancedIds && (
                            <div className="text-[10px] font-mono text-[var(--text-muted)] truncate">
                              {parsedSpec.value}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Multi-Host BLE Context Note */}
              {activeTab === 'ble' && (
                <div className="p-2.5 rounded-xl bg-[var(--bg-input)] flex items-center justify-between gap-2 text-[11px] text-[var(--text-secondary)]">
                  <div className="min-w-0">
                    Hold <span className="font-semibold text-[var(--text-primary)]">Mode</span> + turn the dial on hardware to switch Bluetooth hosts anytime.
                  </div>
                  {connection.connected && connection.telemetry && (
                    <span className="font-mono text-[10px] text-[var(--accent)] shrink-0 tabular-nums">
                      H{connection.telemetry.bleActiveHost} Active
                    </span>
                  )}
                </div>
              )}

              {/* Custom BLE Shortcut Builder */}
              {activeTab === 'shortcut' && (
                <div className="space-y-3 p-3 rounded-xl bg-[var(--bg-input)]">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-[var(--text-muted)]">
                        Shortcut Key
                      </div>
                      <div className="mt-0.5 truncate">
                        {isShortcutBinding ? (
                          <ParsedActionBadge
                            action={binding.value}
                            showRawId={showAdvancedIds}
                            size="sm"
                          />
                        ) : (
                          <span className="text-xs text-[var(--text-secondary)]">
                            Record or choose keys below
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShortcutError(null);
                        setIsRecording(r => !r);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                        isRecording
                          ? 'bg-rose-500/20 text-rose-600 dark:text-rose-300'
                          : 'bg-[var(--accent)] text-white hover:opacity-90'
                      }`}
                    >
                      <Radio className="w-3.5 h-3.5" />
                      <span>{isRecording ? 'Press keys…' : 'Record'}</span>
                    </button>
                  </div>

                  {equivalentBuiltIn && (
                    <div className="p-2 rounded-lg bg-[var(--bg-elevated)] flex items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center gap-1.5 min-w-0 truncate text-[var(--text-secondary)]">
                        <span>Matches</span>
                        <strong className="text-[var(--text-primary)] truncate">
                          {equivalentBuiltIn.label}
                        </strong>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onChange({
                            type: equivalentBuiltIn.category,
                            value: equivalentBuiltIn.action
                          })
                        }
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--bg-panel)] text-[11px] font-semibold text-[var(--accent)] cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Wand2 className="w-3 h-3" />
                        <span>Use built-in</span>
                      </button>
                    </div>
                  )}

                  {shortcutError && (
                    <div className="p-2.5 rounded-lg bg-rose-500/12 flex items-start gap-2 text-[11px] text-rose-600 dark:text-rose-300">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                      <span>{shortcutError}</span>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-[var(--text-muted)]">
                      Modifiers
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {MODIFIER_OPTIONS.map(mod => {
                        const active = parsedShortcut.mods.includes(mod.id);
                        return (
                          <button
                            key={mod.id}
                            type="button"
                            onClick={() => handleToggleModifier(mod.id)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition-colors cursor-pointer whitespace-nowrap ${
                              active
                                ? 'bg-[rgba(var(--accent-rgb),0.16)] ring-1 ring-[var(--accent)] text-[var(--text-primary)] font-semibold'
                                : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            {mod.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-[var(--text-muted)]">
                      Key
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

              {/* Type Text + Follow-up Key + Clamped Delay Builder */}
              {activeTab === 'text' && (
                <div className="space-y-3 p-3 rounded-xl bg-[var(--bg-input)]">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-medium text-[var(--text-secondary)]">
                        Typed Text
                      </label>
                      <span
                        className={`font-mono text-[10px] tabular-nums ${
                          !textValidation.valid
                            ? 'text-rose-500 font-semibold'
                            : 'text-[var(--text-muted)]'
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
                      placeholder="Enter ASCII text snippet…"
                      className={`w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border text-xs font-mono text-[var(--text-primary)] focus:outline-none resize-none ${
                        !textValidation.valid
                          ? 'border-rose-500'
                          : 'border-[var(--border-subtle)] focus:border-[var(--accent)]'
                      }`}
                    />
                    {!textValidation.valid && textValidation.error && (
                      <div className="flex items-start gap-1.5 text-[11px] text-rose-600 dark:text-rose-300">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                        <span>{textValidation.error}</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--border-subtle)]">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-[var(--text-muted)]">
                        Follow-up Key
                      </label>
                      <select
                        value={followUpKey}
                        onChange={e => setFollowUpKey(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                      >
                        <option value="">None</option>
                        {FIRMWARE_SUPPORTED_KEYS.map(k => (
                          <option key={k} value={k}>
                            {k.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-[var(--text-muted)]">
                        Wait (max 10s)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={MAX_FIRMWARE_DELAY_STEP_MS}
                        step={50}
                        disabled={!followUpKey || textDraft.length === 0}
                        value={keyDelayInput}
                        onChange={e => setKeyDelayInput(e.target.value)}
                        onBlur={() =>
                          setKeyDelayInput(
                            String(
                              Math.max(
                                0,
                                Math.min(
                                  MAX_FIRMWARE_DELAY_STEP_MS,
                                  parseInt(keyDelayInput, 10) || 0
                                )
                              )
                            )
                          )
                        }
                        placeholder="0"
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] disabled:opacity-40 focus:outline-none focus:border-[var(--accent)] tabular-nums"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)]">
                        <Repeat className="w-3 h-3 text-[var(--accent)]" />
                        <span>Repeat</span>
                      </span>

                      <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[var(--bg-elevated)]">
                        <button
                          type="button"
                          onClick={() => setLoopUntilStopped(false)}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors cursor-pointer ${
                            !loopUntilStopped
                              ? 'bg-[var(--bg-panel)] text-[var(--text-primary)] shadow-2xs'
                              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                          }`}
                        >
                          Count
                        </button>
                        <button
                          type="button"
                          onClick={() => setLoopUntilStopped(true)}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors cursor-pointer ${
                            loopUntilStopped
                              ? 'bg-[var(--bg-panel)] text-[var(--text-primary)] shadow-2xs'
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
                          {loopUntilStopped ? 'Mode' : 'Count'}
                        </label>
                        {loopUntilStopped ? (
                          <div className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] text-xs font-mono text-[var(--accent)]">
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
                                String(
                                  Math.max(
                                    1,
                                    Math.min(999, parseInt(repeatCountInput, 10) || 1)
                                  )
                                )
                              )
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] tabular-nums"
                          />
                        )}
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-[var(--text-muted)]">
                          Cycle Delay (ms)
                        </label>
                        <input
                          type="number"
                          min={10}
                          max={MAX_FIRMWARE_DELAY_STEP_MS}
                          step={50}
                          disabled={
                            !loopUntilStopped && (parseInt(repeatCountInput, 10) || 1) <= 1
                          }
                          value={repeatDelayInput}
                          onChange={e => setRepeatDelayInput(e.target.value)}
                          onBlur={() =>
                            setRepeatDelayInput(
                              String(
                                Math.max(
                                  10,
                                  Math.min(
                                    MAX_FIRMWARE_DELAY_STEP_MS,
                                    parseInt(repeatDelayInput, 10) || 500
                                  )
                                )
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
                        Loops stream over USB when pressed. Press the key again or click Stop to halt.
                      </p>
                    )}
                  </div>

                  {isTextDraftUnsaved && (
                    <div className="text-[11px] text-amber-600 dark:text-amber-300">
                      Unapplied changes — click Apply Snippet to assign.
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={!canApplyTextMacro}
                      onClick={handleApplyTextMacro}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold disabled:opacity-40 cursor-pointer transition-opacity hover:opacity-90 whitespace-nowrap"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Apply Snippet</span>
                    </button>

                    {onTestBinding && (
                      <button
                        type="button"
                        disabled={!canApplyTextMacro || !draftTextTestAvail.canTest}
                        onClick={handleTestDraftTextMacro}
                        title={draftTextTestAvail.reason || 'Test this text action now'}
                        className="px-3 py-2 rounded-lg bg-[var(--bg-elevated)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-40 disabled:pointer-events-none cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Play className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                        <span>Test</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Custom SmartCast TVKEY:<codeset>:<code> */}
              {activeTab === 'tv' && (
                <div className="p-3 rounded-xl bg-[var(--bg-input)] space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-[var(--text-muted)]">
                      Custom Remote Code
                    </span>
                    {draftTvKeyAction && showAdvancedIds && (
                      <span className="font-mono text-[10px] text-[var(--text-muted)]">
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
                  {isTvKeyDraftUnsaved && (
                    <div className="text-[11px] text-amber-600 dark:text-amber-300">
                      Click Apply Code to update this key.
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!draftTvKeyAction}
                      onClick={handleApplyCustomTvKey}
                      className="flex-1 py-1.5 px-3 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold disabled:opacity-40 hover:opacity-90 cursor-pointer whitespace-nowrap"
                    >
                      Apply Code
                    </button>
                    {onTestBinding && (
                      <button
                        type="button"
                        disabled={!draftTvKeyAction || !tvKeyTestAvail.canTest}
                        onClick={() =>
                          onTestBinding({ type: 'tv', value: draftTvKeyAction })
                        }
                        title={tvKeyTestAvail.reason || 'Test custom remote code'}
                        className="px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-40 disabled:pointer-events-none cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Play className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                        <span>Test</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Custom SmartCast TVAPP:<id>:<ns>:<url> */}
              {activeTab === 'tv_app' && (
                <div className="p-3 rounded-xl bg-[var(--bg-input)] space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-[var(--text-muted)]">
                      Custom SmartCast App
                    </span>
                    {draftTvAppAction && showAdvancedIds && (
                      <span className="font-mono text-[10px] text-[var(--text-muted)] truncate max-w-[140px]">
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
                  {isTvAppDraftUnsaved && (
                    <div className="text-[11px] text-amber-600 dark:text-amber-300">
                      Click Apply App to update this key.
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!draftTvAppAction}
                      onClick={handleApplyCustomTvApp}
                      className="flex-1 py-1.5 px-3 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold disabled:opacity-40 hover:opacity-90 cursor-pointer whitespace-nowrap"
                    >
                      Apply App
                    </button>
                    {onTestBinding && (
                      <button
                        type="button"
                        disabled={!draftTvAppAction || !tvAppTestAvail.canTest}
                        onClick={() =>
                          onTestBinding({ type: 'tv_app', value: draftTvAppAction })
                        }
                        title={tvAppTestAvail.reason || 'Test custom SmartCast app'}
                        className="px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-40 disabled:pointer-events-none cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Play className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                        <span>Test</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
