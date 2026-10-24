import React, { useState, useEffect } from 'react';
import {
  ActionBinding,
  CustomMacroItem,
  HardwareProfileId,
  HardwareSlotId,
  KeyboardLayoutId,
  StudioProfile
} from '../types/studio';
import {
  FIRMWARE_SUPPORTED_KEYS,
  HARDWARE_SLOTS,
  SLOT_LABELS,
  buildFirmwareShortcut,
  describeFirmwareAction,
  firmwareActionToBinding,
  formatShortcutPretty,
  isValidFirmwareAction,
  normalizeBrowserKeyToFirmware,
  parseFirmwareShortcut,
  sanitizeSerialString
} from '../data/firmwareCatalog';
import { extractProfileSlots } from '../hooks/useStudioState';
import {
  Plus,
  Trash2,
  Play,
  Radio,
  Send,
  Command,
  FileText,
  Tv,
  Clapperboard,
  Laptop,
  Save,
  RefreshCw
} from 'lucide-react';

interface MacroEditorViewProps {
  profiles: [StudioProfile, StudioProfile];
  activeProfileId: HardwareProfileId;
  customMacros: CustomMacroItem[];
  keyboardLayout: KeyboardLayoutId;
  isConnected: boolean;
  onSaveMacro: (macro: CustomMacroItem) => void;
  onDeleteMacro: (id: string) => void;
  onAssignSlot: (
    profileId: HardwareProfileId,
    slot: HardwareSlotId,
    binding: ActionBinding
  ) => void;
  onTestAction: (actionStr: string) => void;
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
  isConnected,
  onSaveMacro,
  onDeleteMacro,
  onAssignSlot,
  onTestAction,
  onPullFromUsb
}) => {
  const [selectedMacroId, setSelectedMacroId] = useState<string | null>(null);
  const [macroName, setMacroName] = useState('Custom Hardware Macro');
  const [builderKind, setBuilderKind] = useState<BuilderKind>('shortcut');
  const [isRecording, setIsRecording] = useState(false);

  // Builder fields
  const [mods, setMods] = useState<string[]>(['cmd', 'shift']);
  const [shortcutKey, setShortcutKey] = useState<string>('4');
  const [textSnippet, setTextSnippet] = useState<string>('');
  const [tvCodeset, setTvCodeset] = useState<string>('5');
  const [tvCode, setTvCode] = useState<string>('1');
  const [tvAppId, setTvAppId] = useState<string>('1');
  const [tvAppNs, setTvAppNs] = useState<string>('4');
  const [tvAppUrl, setTvAppUrl] = useState<string>('');

  // Target slot assignment
  const [targetProfile, setTargetProfile] = useState<HardwareProfileId>(activeProfileId);
  const [targetSlot, setTargetSlot] = useState<HardwareSlotId>('b1');

  useEffect(() => {
    setTargetProfile(activeProfileId);
  }, [activeProfileId]);

  const loadActionIntoBuilder = (action: string, label?: string) => {
    if (!action) return;
    if (label) setMacroName(label);

    if (action.startsWith('SHORTCUT:') || action.startsWith('KEY:F')) {
      const parsed = parseFirmwareShortcut(action);
      setBuilderKind('shortcut');
      setMods(parsed.mods);
      setShortcutKey(parsed.key);
    } else if (action.startsWith('TEXT:')) {
      setBuilderKind('text');
      setTextSnippet(action.slice(5));
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

  // Live Keyboard Recorder
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
      setMods(capturedMods);
      setShortcutKey(fwKey);
      setIsRecording(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isRecording, keyboardLayout]);

  // Compute live firmware action string
  const builtAction = (() => {
    if (builderKind === 'shortcut') {
      return buildFirmwareShortcut(mods, shortcutKey);
    }
    if (builderKind === 'text') {
      const clean = sanitizeSerialString(textSnippet, 123);
      return clean ? `TEXT:${clean}` : '';
    }
    if (builderKind === 'tvkey') {
      const cs = parseInt(tvCodeset, 10);
      const cd = parseInt(tvCode, 10);
      if (Number.isNaN(cs) || Number.isNaN(cd)) return '';
      return `TVKEY:${cs}:${cd}`;
    }
    const cleanId = sanitizeSerialString(tvAppId.trim(), 32);
    const ns = parseInt(tvAppNs, 10);
    const cleanUrl = sanitizeSerialString(tvAppUrl.trim(), 80);
    if (!cleanId || Number.isNaN(ns)) return '';
    return cleanUrl ? `TVAPP:${cleanId}:${ns}:${cleanUrl}` : `TVAPP:${cleanId}:${ns}`;
  })();

  const isActionValid = isValidFirmwareAction(builtAction);

  const handleSaveToMacroList = () => {
    if (!isActionValid) return;
    const info = describeFirmwareAction(builtAction);
    const item: CustomMacroItem = {
      id: selectedMacroId || `macro-${Date.now()}`,
      name: macroName.trim() || info.fullLabel,
      action: builtAction,
      createdAt: new Date().toLocaleTimeString(),
      source: 'user'
    };
    onSaveMacro(item);
    setSelectedMacroId(item.id);
  };

  const handleAssignToHardware = () => {
    if (!isActionValid) return;
    handleSaveToMacroList();
    onAssignSlot(targetProfile, targetSlot, firmwareActionToBinding(builtAction));
  };

  const toggleMod = (id: string) => {
    setMods(prev => (prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]));
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
      {/* Left Sidebar: Live Synced Hardware Matrix + Saved Custom Macros */}
      <div className="w-full lg:w-96 shrink-0 bg-[var(--bg-panel)] border-r border-[var(--border-subtle)] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Hardware Macro Slots
            </h2>
            <p className="text-[11px] text-[var(--text-muted)]">
              Live bindings on MAC & TV profiles
            </p>
          </div>
          {isConnected && (
            <button
              type="button"
              onClick={onPullFromUsb}
              title="Refresh all 14 slots from MacroPad over USB"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Pull USB</span>
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3.5 space-y-5">
          {/* All 14 Real Hardware Slots across MAC & TV */}
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
                    7 slots
                  </span>
                </div>

                <div className="space-y-1">
                  {HARDWARE_SLOTS.map(slot => {
                    const act = slots[slot];
                    const desc = describeFirmwareAction(act);
                    const isTarget =
                      targetProfile === prof.id && targetSlot === slot;
                    return (
                      <div
                        key={`${prof.id}-${slot}`}
                        onClick={() => {
                          setTargetProfile(prof.id);
                          setTargetSlot(slot);
                          if (act) {
                            loadActionIntoBuilder(
                              act,
                              `${prof.id} ${SLOT_LABELS[slot].short}`
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
                        className="px-2.5 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] flex items-center justify-between gap-2 cursor-pointer transition-colors"
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
                        <span className="font-mono text-[10px] text-[var(--text-muted)] truncate max-w-[125px]">
                          {act || '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Saved Custom Macros List (Zero fake presets) */}
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
                }}
                className="flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)] hover:underline cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>New</span>
              </button>
            </div>

            {customMacros.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] px-1 py-2">
                No preset macros — custom shortcuts or text snippets synced from your MacroPad or created on the right appear here.
              </p>
            ) : (
              <div className="space-y-1.5">
                {customMacros.map(m => (
                  <div
                    key={m.id}
                    onClick={() => {
                      setSelectedMacroId(m.id);
                      loadActionIntoBuilder(m.action, m.name);
                    }}
                    className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                      selectedMacroId === m.id
                        ? 'bg-[var(--bg-elevated)] border-[var(--accent)]'
                        : 'bg-[var(--bg-input)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                        {m.name}
                      </div>
                      <div className="font-mono text-[10px] text-[var(--text-muted)] truncate">
                        {m.action}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
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
      <div className="flex-1 overflow-y-auto p-6 lg:p-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold text-[var(--text-primary)]">
                Firmware Macro Builder
              </h1>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Build native ESP32 `SHORTCUT:`, `TEXT:`, `TVKEY:`, or `TVAPP:` macros and sync directly over USB.
              </p>
            </div>
          </div>

          {/* Macro Label */}
          <div className="p-4 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Macro Display Name
              </label>
              <input
                type="text"
                maxLength={36}
                value={macroName}
                onChange={e => setMacroName(e.target.value)}
                placeholder="e.g. Screenshot Selection"
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-sm font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            {/* Firmware Macro Type Selector */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              {(
                [
                  { id: 'shortcut', label: 'BLE Shortcut', icon: Command },
                  { id: 'text', label: 'BLE Type Text', icon: FileText },
                  { id: 'tvkey', label: 'SmartCast Key', icon: Tv },
                  { id: 'tvapp', label: 'SmartCast App', icon: Clapperboard }
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
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                      active
                        ? 'text-[var(--text-primary)]'
                        : 'bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dynamic Builder Body */}
          <div className="p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-4">
            {builderKind === 'shortcut' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-[var(--text-primary)]">
                      Keystroke Combination
                    </div>
                    <div className="font-mono text-base font-bold text-[var(--accent)] mt-0.5">
                      {formatShortcutPretty(builtAction)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsRecording(r => !r)}
                    style={
                      isRecording
                        ? undefined
                        : { backgroundColor: 'var(--accent)', color: '#FFFFFF' }
                    }
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer ${
                      isRecording
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse'
                        : 'hover:opacity-90'
                    }`}
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>{isRecording ? 'Listening for keys…' : 'Record from Keyboard'}</span>
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-[var(--text-secondary)]">
                    Modifier Keys
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
                    Trigger Key (`pressKey`)
                  </label>
                  <select
                    value={shortcutKey}
                    onChange={e => setShortcutKey(e.target.value)}
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
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[var(--text-primary)]">
                    Typed Text String (`TEXT:`)
                  </label>
                  <span className="font-mono text-xs text-[var(--text-muted)]">
                    {textSnippet.length}/123 chars
                  </span>
                </div>
                <textarea
                  rows={4}
                  maxLength={123}
                  value={textSnippet}
                  onChange={e => setTextSnippet(e.target.value)}
                  placeholder="Enter text to type over Bluetooth HID…"
                  className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] resize-none"
                />
              </div>
            )}

            {builderKind === 'tvkey' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">
                    SmartCast Codeset
                  </label>
                  <input
                    type="number"
                    value={tvCodeset}
                    onChange={e => setTvCodeset(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">
                    SmartCast Key Code
                  </label>
                  <input
                    type="number"
                    value={tvCode}
                    onChange={e => setTvCode(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)]"
                  />
                </div>
              </div>
            )}

            {builderKind === 'tvapp' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
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
                      value={tvAppNs}
                      onChange={e => setTvAppNs(e.target.value)}
                      placeholder="e.g. 4"
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)]"
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
            <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  ESP32 Serial Payload Action
                </div>
                <div className="font-mono text-xs text-[var(--text-primary)] truncate mt-0.5">
                  {builtAction || '— Incomplete —'}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={!isActionValid}
                  onClick={handleSaveToMacroList}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-40 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Macro</span>
                </button>

                <button
                  type="button"
                  disabled={!isActionValid || !isConnected}
                  onClick={() => onTestAction(builtAction)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-40 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Test on Pad</span>
                </button>
              </div>
            </div>
          </div>

          {/* Direct Hardware Slot Assignment Card */}
          <div className="p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-3">
            <div className="text-xs font-semibold text-[var(--text-primary)]">
              Assign & Sync Directly to MacroPad Slot
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
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {isConnected
                    ? `Sync to ${targetProfile} ${SLOT_LABELS[targetSlot].short}`
                    : `Assign to ${targetProfile} ${SLOT_LABELS[targetSlot].short}`}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
