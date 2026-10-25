import React, { useState, useEffect } from 'react';
import {
  ActionBinding,
  ActiveRepeatJob,
  CustomMacroItem,
  DeviceConnectionInfo,
  HardwareProfileId,
  HardwareSlotId,
  KeyboardLayoutId,
  MacroStepConfig,
  StudioProfile,
  TextMacroRepeatConfig
} from '../types/studio';
import {
  DEFAULT_TEXT_REPEAT_CONFIG,
  FIRMWARE_SUPPORTED_KEYS,
  HARDWARE_SLOTS,
  SLOT_LABELS,
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
import {
  extractProfileSlots,
  getBindingForProfileSlot
} from '../hooks/useStudioState';
import {
  Plus,
  Trash2,
  Play,
  Square,
  Radio,
  Send,
  Command,
  FileText,
  Tv,
  Clapperboard,
  Laptop,
  Save,
  RefreshCw,
  Repeat,
  AlertCircle,
  Layers,
  ChevronDown,
  ChevronUp,
  Sliders,
  Sparkles,
  Check
} from 'lucide-react';

interface MacroEditorViewProps {
  profiles: [StudioProfile, StudioProfile];
  activeProfileId: HardwareProfileId;
  customMacros: CustomMacroItem[];
  keyboardLayout: KeyboardLayoutId;
  connection: DeviceConnectionInfo;
  activeRepeatJob?: ActiveRepeatJob | null;
  onSaveMacro: (macro: CustomMacroItem) => void;
  onDeleteMacro: (id: string) => void;
  onAssignSlot: (
    profileId: HardwareProfileId,
    slot: HardwareSlotId,
    binding: ActionBinding
  ) => void;
  onTestBinding: (binding: ActionBinding) => void;
  onStopRepeat: () => void;
  onPullFromUsb: () => void;
}

type BuilderKind = 'shortcut' | 'text' | 'tvkey' | 'tvapp';

const MOD_LIST = [
  { id: 'cmd', label: '⌘ Cmd' },
  { id: 'ctrl', label: '⌃ Ctrl' },
  { id: 'alt', label: '⌥ Opt/Alt' },
  { id: 'shift', label: '⇧ Shift' },
  { id: 'win', label: '⊞ Win' }
];

export const MacroEditorView: React.FC<MacroEditorViewProps> = ({
  profiles,
  activeProfileId,
  customMacros,
  keyboardLayout,
  connection,
  activeRepeatJob,
  onSaveMacro,
  onDeleteMacro,
  onAssignSlot,
  onTestBinding,
  onStopRepeat,
  onPullFromUsb
}) => {
  const [selectedMacroId, setSelectedMacroId] = useState<string | null>(null);
  const [macroName, setMacroName] = useState('Custom Hardware Macro');
  const [builderKind, setBuilderKind] = useState<BuilderKind>('shortcut');
  const [isRecording, setIsRecording] = useState(false);
  const [shortcutError, setShortcutError] = useState<string | null>(null);

  // Shortcut fields
  const [mods, setMods] = useState<string[]>(['cmd', 'shift']);
  const [shortcutKey, setShortcutKey] = useState<string>('4');

  // Text / Button + Custom Repeat Delay fields
  const [textSnippet, setTextSnippet] = useState<string>('');
  const [followUpKey, setFollowUpKey] = useState<string>('');
  const [keyDelayInput, setKeyDelayInput] = useState<string>('0');
  const [repeatCountInput, setRepeatCountInput] = useState<string>('1');
  const [loopUntilStopped, setLoopUntilStopped] = useState<boolean>(false);
  const [repeatDelayInput, setRepeatDelayInput] = useState<string>('500');
  const [macroSteps, setMacroSteps] = useState<MacroStepConfig[]>([]);

  // SmartCast fields
  const [tvCodeset, setTvCodeset] = useState<string>('5');
  const [tvCode, setTvCode] = useState<string>('1');
  const [tvAppId, setTvAppId] = useState<string>('1');
  const [tvAppNs, setTvAppNs] = useState<string>('4');
  const [tvAppUrl, setTvAppUrl] = useState<string>('');

  // Target slot assignment
  const [targetProfile, setTargetProfile] = useState<HardwareProfileId>(activeProfileId);
  const [targetSlot, setTargetSlot] = useState<HardwareSlotId>('b1');

  // Collapsible section state for enhanced navigation
  const [isSectionOpen, setIsSectionOpen] = useState<{
    setup: boolean;
    config: boolean;
    multistep: boolean;
    assign: boolean;
  }>({
    setup: true,
    config: true,
    multistep: true,
    assign: true
  });

  const toggleSection = (key: keyof typeof isSectionOpen) => {
    setIsSectionOpen(prev => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    setTargetProfile(activeProfileId);
  }, [activeProfileId]);

  const loadActionIntoBuilder = (
    action: string,
    label?: string,
    repeatConfig?: TextMacroRepeatConfig
  ) => {
    setShortcutError(null);
    if (!action && !repeatConfig) return;
    if (label) setMacroName(label);
    setMacroSteps(repeatConfig?.steps || []);

    if (repeatConfig || action.startsWith('TEXT:')) {
      const cfg = parseTextConfigFromFirmwareAction(action, repeatConfig);
      setBuilderKind('text');
      setTextSnippet(cfg.text);
      setFollowUpKey(cfg.followUpKey);
      setKeyDelayInput(String(cfg.keyDelayMs));
      setRepeatCountInput(String(cfg.repeatCount));
      setLoopUntilStopped(cfg.loopUntilStopped);
      setRepeatDelayInput(String(cfg.repeatDelayMs));
      return;
    }

    if (action.startsWith('SHORTCUT:') || action.startsWith('KEY:F')) {
      const parsed = parseFirmwareShortcut(action);
      setBuilderKind('shortcut');
      setMods(parsed.mods);
      setShortcutKey(parsed.key);
    } else if (action.startsWith('TVKEY:')) {
      const parts = action.split(':');
      setBuilderKind('tvkey');
      setTvCodeset(parts[1] || '5');
      setTvCode(parts[2] || '1');
    } else if (action.startsWith('TVAPP:')) {
      const first = action.indexOf(':');
      const second = action.indexOf(':', first + 1);
      const third = action.indexOf(':', second + 1);
      setBuilderKind('tvapp');
      if (first > 0 && second > first) {
        setTvAppId(action.slice(first + 1, second));
        if (third > second) {
          setTvAppNs(action.slice(second + 1, third));
          setTvAppUrl(action.slice(third + 1));
        } else {
          setTvAppNs(action.slice(second + 1));
          setTvAppUrl('');
        }
      }
    }
  };

  // Live Keyboard Recorder with strict unsupported-key rejection
  useEffect(() => {
    if (!isRecording) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (['Meta', 'Control', 'Shift', 'Alt'].includes(e.key)) return;

      const capturedMods: string[] = [];
      if (e.metaKey) capturedMods.push('cmd');
      if (e.ctrlKey) capturedMods.push('ctrl');
      if (e.altKey) capturedMods.push('alt');
      if (e.shiftKey) capturedMods.push('shift');

      const fwKey = normalizeBrowserKeyToFirmware(e.code, e.key, keyboardLayout);
      if (!isSupportedFirmwareKey(fwKey)) {
        setShortcutError(
          `Unsupported key "${e.key || e.code}" — choose A–Z, 0–9, F1–F24, arrows, or standard punctuation.`
        );
        setIsRecording(false);
        return;
      }

      setShortcutError(null);
      setMods(capturedMods);
      setShortcutKey(fwKey);
      setIsRecording(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isRecording, keyboardLayout]);

  const parsedKeyDelay = Math.max(0, Math.min(60000, parseInt(keyDelayInput, 10) || 0));
  const hasNativeEnter =
    textSnippet.length > 0 && followUpKey === 'enter' && parsedKeyDelay <= 0;
  const maxTextChars = hasNativeEnter ? 122 : 123;
  const textValidation = validateTextMacroInput(textSnippet, maxTextChars);

  const builtTextRepeatConfig: TextMacroRepeatConfig = (() => {
    const parsedRepeatCount = Math.max(
      1,
      Math.min(999, parseInt(repeatCountInput, 10) || 1)
    );
    const parsedRepeatDelay = Math.max(
      10,
      Math.min(300000, parseInt(repeatDelayInput, 10) || 500)
    );

    return {
      text: textSnippet,
      followUpKey,
      keyDelayMs: textSnippet.length > 0 && followUpKey ? parsedKeyDelay : 0,
      repeatCount: parsedRepeatCount,
      loopUntilStopped,
      repeatDelayMs: parsedRepeatDelay,
      steps: macroSteps.length > 0 ? macroSteps : undefined
    };
  })();

  const effectiveRepeatConfig: TextMacroRepeatConfig | undefined =
    builderKind === 'text' &&
    (Boolean(builtTextRepeatConfig.followUpKey) ||
      builtTextRepeatConfig.repeatCount > 1 ||
      builtTextRepeatConfig.loopUntilStopped ||
      builtTextRepeatConfig.keyDelayMs > 0 ||
      (builtTextRepeatConfig.steps && builtTextRepeatConfig.steps.length > 0))
      ? builtTextRepeatConfig
      : undefined;

  // Compute live firmware action string
  const builtAction = (() => {
    if (builderKind === 'shortcut') {
      return buildFirmwareShortcut(mods, shortcutKey);
    }
    if (builderKind === 'text') {
      if (!textValidation.valid) return '';
      return buildFirmwareActionFromTextConfig(builtTextRepeatConfig);
    }
    if (builderKind === 'tvkey') {
      const cs = parseInt(tvCodeset, 10);
      const cd = parseInt(tvCode, 10);
      if (Number.isNaN(cs) || cs < 0 || Number.isNaN(cd) || cd < 0) return '';
      return `TVKEY:${cs}:${cd}`;
    }
    const cleanId = sanitizeSerialString(tvAppId.trim(), 32);
    const ns = parseInt(tvAppNs, 10);
    const cleanUrl = sanitizeSerialString(tvAppUrl.trim(), 80);
    if (!cleanId || Number.isNaN(ns) || ns < 0) return '';
    return cleanUrl ? `TVAPP:${cleanId}:${ns}:${cleanUrl}` : `TVAPP:${cleanId}:${ns}`;
  })();

  const isActionValid = isValidFirmwareAction(builtAction);
  const builtBinding = firmwareActionToBinding(
    builtAction,
    builderKind === 'text' ? effectiveRepeatConfig : undefined
  );
  const needsUsbRepeat =
    builderKind === 'text' && requiresUsbSequenceExecution(builtTextRepeatConfig);
  const testAvail = getActionTestAvailability(builtAction, connection);

  const handleSaveToMacroList = () => {
    if (!isActionValid) return;
    const info = describeFirmwareAction(builtAction, effectiveRepeatConfig);
    const item: CustomMacroItem = {
      id: selectedMacroId || `macro-${Date.now()}`,
      name: macroName.trim() || info.fullLabel,
      action: builtAction,
      repeatConfig: effectiveRepeatConfig,
      createdAt: new Date().toLocaleTimeString(),
      source: 'user'
    };
    onSaveMacro(item);
    setSelectedMacroId(item.id);
  };

  const handleAssignToHardware = () => {
    if (!isActionValid) return;
    handleSaveToMacroList();
    onAssignSlot(targetProfile, targetSlot, builtBinding);
  };

  const toggleMod = (id: string) => {
    setShortcutError(null);
    setMods(prev => (prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]));
  };

  const handleMoveStepUp = (index: number) => {
    if (index <= 0) return;
    setMacroSteps(prev => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[index - 1];
      copy[index - 1] = temp;
      return copy;
    });
  };

  const handleMoveStepDown = (index: number) => {
    if (index >= macroSteps.length - 1) return;
    setMacroSteps(prev => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[index + 1];
      copy[index + 1] = temp;
      return copy;
    });
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
      {/* Left Column: Live Synced Hardware Matrix + Saved Custom Macros */}
      <div className="w-full lg:w-96 shrink-0 bg-[var(--bg-panel)] border-b lg:border-b-0 lg:border-r border-[var(--border-subtle)] flex flex-col lg:overflow-hidden">
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Hardware Macro Slots
            </h2>
            <p className="text-[11px] text-[var(--text-muted)]">
              Live bindings on MAC & TV profiles
            </p>
          </div>
          {connection.connected && (
            <button
              type="button"
              onClick={onPullFromUsb}
              title="Refresh all 14 slots from MacroPad"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Pull Status</span>
            </button>
          )}
        </div>

        <div className="flex-1 lg:overflow-y-auto p-3.5 space-y-5">
          {profiles.map(prof => {
            const slots = extractProfileSlots(prof);
            const ProfIcon = prof.id === 'MAC' ? Laptop : Tv;
            return (
              <div key={prof.id} className="space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-primary)]">
                    <ProfIcon
                      className="w-3.5 h-3.5"
                      style={{ color: prof.id === 'MAC' ? '#3B82F6' : '#10B981' }}
                    />
                    <span>
                      {prof.name} ({prof.id})
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-[var(--text-muted)]">
                    7 controls
                  </span>
                </div>

                <div className="space-y-1">
                  {HARDWARE_SLOTS.map(slot => {
                    const act = slots[slot];
                    const slotBinding = getBindingForProfileSlot(profiles, prof.id, slot);
                    const desc = describeFirmwareAction(act, slotBinding?.repeatConfig);
                    const isTarget =
                      targetProfile === prof.id && targetSlot === slot;
                    return (
                      <button
                        key={`${prof.id}-${slot}`}
                        type="button"
                        onClick={() => {
                          setTargetProfile(prof.id);
                          setTargetSlot(slot);
                          if (act) {
                            loadActionIntoBuilder(
                              act,
                              `${prof.id} ${SLOT_LABELS[slot].short}`,
                              slotBinding?.repeatConfig
                            );
                          }
                        }}
                        style={
                          isTarget
                            ? {
                                borderColor: 'var(--accent)',
                                backgroundColor: 'rgba(var(--accent-rgb), 0.10)'
                              }
                            : undefined
                        }
                        className="w-full text-left px-2.5 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] flex items-center justify-between gap-2 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--text-primary)] shrink-0">
                            {SLOT_LABELS[slot].short}
                          </span>
                          <span
                            className={`text-xs truncate ${
                              act ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] italic'
                            }`}
                          >
                            {act ? desc.shortLabel : 'Unassigned'}
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-[var(--text-muted)] truncate max-w-[115px]">
                          {act ? act.replace(/\n/g, '\\n') : '—'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Saved Custom Macros List */}
          <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-[var(--text-primary)]">
                Custom Macros ({customMacros.length})
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedMacroId(null);
                  setMacroName('New Custom Macro');
                  setTextSnippet(DEFAULT_TEXT_REPEAT_CONFIG.text);
                  setFollowUpKey(DEFAULT_TEXT_REPEAT_CONFIG.followUpKey);
                  setKeyDelayInput(String(DEFAULT_TEXT_REPEAT_CONFIG.keyDelayMs));
                  setRepeatCountInput(String(DEFAULT_TEXT_REPEAT_CONFIG.repeatCount));
                  setLoopUntilStopped(DEFAULT_TEXT_REPEAT_CONFIG.loopUntilStopped);
                  setRepeatDelayInput(String(DEFAULT_TEXT_REPEAT_CONFIG.repeatDelayMs));
                }}
                className="flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)] hover:underline cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>New</span>
              </button>
            </div>

            {customMacros.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] px-1 py-2">
                Custom shortcuts, text/repeat macros, or TV actions synced from your pad or saved on the right appear here.
              </p>
            ) : (
              <div className="space-y-1.5">
                {customMacros.map(m => (
                  <div
                    key={m.id}
                    className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-colors ${
                      selectedMacroId === m.id
                        ? 'bg-[var(--bg-elevated)] border-[var(--accent)]'
                        : 'bg-[var(--bg-input)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMacroId(m.id);
                        loadActionIntoBuilder(m.action, m.name, m.repeatConfig);
                      }}
                      className="min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                        {m.name}
                      </div>
                      <div className="font-mono text-[10px] text-[var(--text-muted)] truncate">
                        {m.action.replace(/\n/g, '\\n')}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteMacro(m.id);
                        if (selectedMacroId === m.id) setSelectedMacroId(null);
                      }}
                      className="p-1 rounded text-[var(--text-muted)] hover:text-rose-400 cursor-pointer shrink-0"
                      title="Remove from saved list"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Workspace: Custom Firmware Macro Builder */}
      <div className="flex-1 lg:overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <div>
            <h1 className="text-lg font-bold text-[var(--text-primary)]">
              Custom Action & Macro Builder
            </h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Build shortcuts, repeatable text/key sequences with custom delays, or custom SmartCast TV actions.
            </p>
          </div>

          {/* Quick Navigation Jump Bar */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] overflow-x-auto">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] px-2">Jump:</span>
            {[
              { id: 'setup', label: '1. Setup' },
              { id: 'config', label: '2. Config' },
              { id: 'multistep', label: '3. Steps' },
              { id: 'assign', label: '4. Assign' }
            ].map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  const el = document.getElementById(`section-${item.id}`);
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    setIsSectionOpen(prev => ({ ...prev, [item.id]: true }));
                  }
                }}
                className="px-2.5 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap transition-colors"
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Macro Label & Type Selector */}
          <div id="section-setup" className="p-4 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Macro Display Name
              </label>
              <input
                type="text"
                maxLength={36}
                value={macroName}
                onChange={e => setMacroName(e.target.value)}
                placeholder="e.g. Custom Action"
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-sm font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              {(
                [
                  { id: 'shortcut', label: 'BLE Shortcut', icon: Command },
                  { id: 'text', label: 'Text / Repeat', icon: FileText },
                  { id: 'tvkey', label: 'TV Key', icon: Tv },
                  { id: 'tvapp', label: 'TV App', icon: Clapperboard }
                ] as const
              ).map(tab => {
                const Icon = tab.icon;
                const active = builderKind === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setBuilderKind(tab.id)}
                    style={
                      active
                        ? {
                            borderColor: 'var(--accent)',
                            backgroundColor: 'rgba(var(--accent-rgb), 0.14)'
                          }
                        : undefined
                    }
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                      active
                        ? 'text-[var(--text-primary)]'
                        : 'bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dynamic Builder Body */}
          <div id="section-config" className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-4">
            {builderKind === 'shortcut' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-xs font-semibold text-[var(--text-primary)]">
                      Keystroke Combination
                    </div>
                    <div className="font-mono text-base font-bold text-[var(--accent)] mt-0.5">
                      {formatShortcutPretty(builtAction)} ({builtAction})
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
                        : { backgroundColor: 'var(--accent)', color: '#FFFFFF' }
                    }
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                      isRecording
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse'
                        : 'hover:opacity-90'
                    }`}
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>{isRecording ? 'Listening for keys…' : 'Record from Keyboard'}</span>
                  </button>
                </div>

                {shortcutError && (
                  <div className="p-2.5 rounded-xl bg-rose-500/12 border border-rose-500/35 flex items-start gap-2 text-xs text-rose-300">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{shortcutError}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-[var(--text-secondary)]">
                    Modifier Keys (leave unchecked for no-modifier key like SHORTCUT::right)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {MOD_LIST.map(m => {
                      const active = mods.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => toggleMod(m.id)}
                          style={
                            active
                              ? {
                                  borderColor: 'var(--accent)',
                                  backgroundColor: 'rgba(var(--accent-rgb), 0.16)'
                                }
                              : undefined
                          }
                          className={`px-3 py-1.5 rounded-lg border text-xs font-mono cursor-pointer ${
                            active
                              ? 'text-[var(--text-primary)] font-semibold'
                              : 'bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                          }`}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-[var(--text-secondary)]">
                    Trigger Key
                  </label>
                  <select
                    value={shortcutKey}
                    onChange={e => {
                      setShortcutError(null);
                      setShortcutKey(e.target.value);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
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

            {builderKind === 'text' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[var(--text-primary)]">
                      Typed Text Snippet (`TEXT:`)
                    </label>
                    <span
                      className={`font-mono text-xs tabular-nums ${
                        !textValidation.valid
                          ? 'text-rose-400 font-semibold'
                          : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {textSnippet.length}/{maxTextChars} chars
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    maxLength={maxTextChars}
                    value={textSnippet}
                    onChange={e => setTextSnippet(e.target.value.slice(0, maxTextChars))}
                    placeholder="Enter ASCII text to type over Bluetooth HID (stops at 123 chars)…"
                    className={`w-full px-3 py-2.5 rounded-xl bg-[var(--bg-input)] border text-xs font-mono text-[var(--text-primary)] focus:outline-none resize-none ${
                      !textValidation.valid
                        ? 'border-rose-500'
                        : 'border-[var(--border-subtle)] focus:border-[var(--accent)]'
                    }`}
                  />
                  {!textValidation.valid && textValidation.error && (
                    <div className="flex items-start gap-2 text-xs text-rose-300">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <span>{textValidation.error}</span>
                    </div>
                  )}
                </div>

                {/* Follow-up Button / Key + Custom Delay */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-[var(--border-subtle)]">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[var(--text-secondary)]">
                      Button / Key Press
                    </label>
                    <select
                      value={followUpKey}
                      onChange={e => setFollowUpKey(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                    >
                      <option value="">None (Text only)</option>
                      {FIRMWARE_SUPPORTED_KEYS.map(k => (
                        <option key={k} value={k}>
                          {k.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[var(--text-secondary)]">
                      Delay Before Key (ms)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={60000}
                      step={50}
                      disabled={!followUpKey || textSnippet.length === 0}
                      value={keyDelayInput}
                      onChange={e => setKeyDelayInput(e.target.value)}
                      onBlur={() =>
                        setKeyDelayInput(
                          String(Math.max(0, Math.min(60000, parseInt(keyDelayInput, 10) || 0)))
                        )
                      }
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] disabled:opacity-40 focus:outline-none focus:border-[var(--accent)] tabular-nums"
                    />
                  </div>
                </div>

                {/* Repeat Count / Loop + Custom Repeat Delay */}
                <div className="space-y-3 pt-3 border-t border-[var(--border-subtle)]">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                      <Repeat className="w-3.5 h-3.5 text-[var(--accent)]" />
                      <span>Repeat & Custom Interval Delay</span>
                    </div>

                    <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
                      <button
                        type="button"
                        onClick={() => setLoopUntilStopped(false)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          !loopUntilStopped
                            ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                        }`}
                      >
                        Fixed Count
                      </button>
                      <button
                        type="button"
                        onClick={() => setLoopUntilStopped(true)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          loopUntilStopped
                            ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                        }`}
                      >
                        Loop Until Stopped
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-[var(--text-secondary)]">
                        {loopUntilStopped ? 'Loop Mode' : 'Repeat Count (1–999)'}
                      </label>
                      {loopUntilStopped ? (
                        <div className="px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--accent)]">
                          Continuous until stopped
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
                                Math.max(1, Math.min(999, parseInt(repeatCountInput, 10) || 1))
                              )
                            )
                          }
                          className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] tabular-nums"
                        />
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-[var(--text-secondary)]">
                        Custom Repeat Delay (ms)
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
                              Math.max(
                                10,
                                Math.min(300000, parseInt(repeatDelayInput, 10) || 500)
                              )
                            )
                          )
                        }
                        placeholder="500"
                        className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] disabled:opacity-40 focus:outline-none focus:border-[var(--accent)] tabular-nums"
                      />
                    </div>
                  </div>

                  {needsUsbRepeat && (
                    <p className="text-xs text-[var(--text-muted)]">
                      Base action saves to ESP32 flash; timed delays and repeats execute live while connected over USB. Press the physical button a second time or click Stop to cancel.
                    </p>
                  )}
                </div>

                {/* Multi-Step Vertical Stepper & Per-Step Repeat Intervals */}
                <div id="section-multistep" className="space-y-4 pt-4 border-t border-[var(--border-subtle)]">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                      <Layers className="w-4 h-4 text-[var(--accent)]" />
                      <span>Vertical Automation Stepper ({macroSteps.length} steps)</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() =>
                          setMacroSteps(prev => [
                            ...prev,
                            {
                              id: `step-${Date.now()}`,
                              label: 'Type Text',
                              actionType: 'text',
                              value: 'Hello',
                              delayMs: 250,
                              repeatCount: 1
                            }
                          ])
                        }
                        className="px-2.5 py-1.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent)] cursor-pointer whitespace-nowrap shadow-sm"
                      >
                        + Add Text Step
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setMacroSteps(prev => [
                            ...prev,
                            {
                              id: `step-${Date.now()}`,
                              label: 'Press Key',
                              actionType: 'key',
                              value: 'enter',
                              delayMs: 150,
                              repeatCount: 1
                            }
                          ])
                        }
                        className="px-2.5 py-1.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent)] cursor-pointer whitespace-nowrap shadow-sm"
                      >
                        + Add Key Step
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setMacroSteps(prev => [
                            ...prev,
                            {
                              id: `step-${Date.now()}`,
                              label: 'Delay Pause',
                              actionType: 'delay',
                              value: '',
                              delayMs: 500,
                              repeatCount: 1
                            }
                          ])
                        }
                        className="px-2.5 py-1.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent)] cursor-pointer whitespace-nowrap shadow-sm"
                      >
                        + Add Pause Step
                      </button>
                    </div>
                  </div>

                  {macroSteps.length === 0 ? (
                    <div className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-center text-xs text-[var(--text-muted)] italic">
                      No multi-step actions configured. Add steps above to build a timed execution sequence.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {macroSteps.map((step, idx) => (
                        <div key={step.id} className="relative">
                          {/* Step Card */}
                          <div className="p-3.5 rounded-2xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] transition-all space-y-3 shadow-sm">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="w-6 h-6 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-center font-mono text-xs font-bold text-[var(--accent)] shadow-inner">
                                  {idx + 1}
                                </span>
                                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)]">
                                  {step.actionType === 'text' ? 'Type Text Action' : step.actionType === 'key' ? 'Key Press Action' : 'Timed Pause Action'}
                                </span>
                              </div>

                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() => handleMoveStepUp(idx)}
                                  className="p-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 cursor-pointer"
                                  title="Move Step Up"
                                >
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === macroSteps.length - 1}
                                  onClick={() => handleMoveStepDown(idx)}
                                  className="p-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 cursor-pointer"
                                  title="Move Step Down"
                                >
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setMacroSteps(prev => prev.filter(s => s.id !== step.id))
                                  }
                                  className="p-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-rose-400 cursor-pointer ml-1"
                                  title="Delete Step"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              {step.actionType !== 'delay' ? (
                                <div className="space-y-1">
                                  <label className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-secondary)]">
                                    {step.actionType === 'text' ? 'Text Value' : 'Key Token'}
                                  </label>
                                  {step.actionType === 'text' ? (
                                    <input
                                      type="text"
                                      value={step.value}
                                      onChange={e => {
                                        const val = e.target.value;
                                        setMacroSteps(prev =>
                                          prev.map(s => (s.id === step.id ? { ...s, value: val } : s))
                                        );
                                      }}
                                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                                    />
                                  ) : (
                                    <select
                                      value={step.value}
                                      onChange={e => {
                                        const val = e.target.value;
                                        setMacroSteps(prev =>
                                          prev.map(s => (s.id === step.id ? { ...s, value: val } : s))
                                        );
                                      }}
                                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                                    >
                                      {FIRMWARE_SUPPORTED_KEYS.map(k => (
                                        <option key={k} value={k}>
                                          {k.toUpperCase()}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <label className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-secondary)]">
                                    Duration Pause
                                  </label>
                                  <div className="px-3 py-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-muted)]">
                                    Delay Wait
                                  </div>
                                </div>
                              )}

                              <div className="space-y-1">
                                <label className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-secondary)]">
                                  Repeat Count
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  max={99}
                                  value={step.repeatCount}
                                  onChange={e => {
                                    const rc = Math.max(1, parseInt(e.target.value, 10) || 1);
                                    setMacroSteps(prev =>
                                      prev.map(s => (s.id === step.id ? { ...s, repeatCount: rc } : s))
                                    );
                                  }}
                                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] tabular-nums"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-secondary)]">
                                  Step Interval (ms)
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  max={60000}
                                  step={50}
                                  value={step.delayMs}
                                  onChange={e => {
                                    const dm = Math.max(0, parseInt(e.target.value, 10) || 0);
                                    setMacroSteps(prev =>
                                      prev.map(s => (s.id === step.id ? { ...s, delayMs: dm } : s))
                                    );
                                  }}
                                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] tabular-nums"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Visual Delay Timing Connector between steps */}
                          {idx < macroSteps.length - 1 && (
                            <div className="flex items-center justify-center my-1.5 relative">
                              <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-dashed border-[var(--border-strong)]"></div>
                              </div>
                              <span className="relative px-2.5 py-0.5 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] font-mono text-[10px] text-[var(--accent)] shadow-sm">
                                ⏱️ {step.delayMs}ms delay to Step {idx + 2}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {builderKind === 'tvkey' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">
                    SmartCast Codeset
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={tvCodeset}
                    onChange={e => setTvCodeset(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">
                    SmartCast Key Code
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={tvCode}
                    onChange={e => setTvCode(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] tabular-nums"
                  />
                </div>
              </div>
            )}

            {builderKind === 'tvapp' && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[var(--text-secondary)]">
                      APP_ID
                    </label>
                    <input
                      type="text"
                      value={tvAppId}
                      onChange={e => setTvAppId(e.target.value)}
                      placeholder="e.g. 1"
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[var(--text-secondary)]">
                      NAME_SPACE
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={tvAppNs}
                      onChange={e => setTvAppNs(e.target.value)}
                      placeholder="e.g. 4"
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] tabular-nums"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">
                    Optional Deep-Link Message / URL
                  </label>
                  <input
                    type="text"
                    value={tvAppUrl}
                    onChange={e => setTvAppUrl(e.target.value)}
                    placeholder="Leave empty for standard launch"
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)]"
                  />
                </div>
              </div>
            )}

            {/* Generated Firmware Action Readout + Test */}
            <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    ESP32 Action Payload
                  </div>
                  <div className="font-mono text-xs text-[var(--text-primary)] truncate mt-0.5">
                    {builtAction ? builtAction.replace(/\n/g, '\\n') : '— Incomplete —'}
                  </div>
                  {isActionValid && effectiveRepeatConfig && (
                    <div className="text-[11px] text-[var(--text-secondary)] truncate">
                      {describeFirmwareAction(builtAction, effectiveRepeatConfig).fullLabel}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={!isActionValid}
                    onClick={handleSaveToMacroList}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-40 cursor-pointer whitespace-nowrap"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Macro</span>
                  </button>

                  {activeRepeatJob ? (
                    <button
                      type="button"
                      onClick={onStopRepeat}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/40 hover:bg-rose-500/25 text-xs font-semibold text-rose-300 cursor-pointer whitespace-nowrap"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                      <span>Stop</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!isActionValid || !testAvail.canTest}
                      onClick={() => onTestBinding(builtBinding)}
                      title={testAvail.reason || 'Test this action live on the pad'}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-40 disabled:pointer-events-none cursor-pointer whitespace-nowrap"
                    >
                      <Play className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Test</span>
                    </button>
                  )}
                </div>
              </div>

              {isActionValid && !testAvail.canTest && testAvail.reason && (
                <div className="flex items-start gap-1.5 text-[11px] text-amber-300 pt-1.5 border-t border-[var(--border-subtle)]">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>{testAvail.reason}</span>
                </div>
              )}
            </div>
          </div>

          {/* Direct Hardware Slot Assignment Card */}
          <div id="section-assign" className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-3">
            <div className="text-xs font-semibold text-[var(--text-primary)]">
              Assign & Sync Directly to Control
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <select
                value={targetProfile}
                onChange={e => setTargetProfile(e.target.value as HardwareProfileId)}
                className="px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)]"
              >
                <option value="MAC">MAC Profile</option>
                <option value="TV">TV Profile</option>
              </select>

              <select
                value={targetSlot}
                onChange={e => setTargetSlot(e.target.value as HardwareSlotId)}
                className="px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)]"
              >
                {HARDWARE_SLOTS.map(s => (
                  <option key={s} value={s}>
                    {SLOT_LABELS[s].full}
                  </option>
                ))}
              </select>

              <button
                type="button"
                disabled={!isActionValid}
                onClick={handleAssignToHardware}
                style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  Save to {targetProfile} {SLOT_LABELS[targetSlot].short}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
