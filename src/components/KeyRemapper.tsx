import React, { useState, useEffect, useRef } from 'react';
import { FirmwareStatus, ProfileMode, SlotId } from '../types/macropod';
import { FIRMWARE_ACTIONS, getActionDetails } from '../data/actionLibrary';
import { Check, Play, Search, Keyboard, Type, Tv, Volume2, Laptop, Film, Sliders, Disc, Plus, Trash2, ArrowUp, ArrowDown, Undo2 } from 'lucide-react';
import { soundEngine } from '../services/soundEffects';

interface KeyRemapperProps {
  status: FirmwareStatus;
  selectedSlot: SlotId;
  onSelectSlot: (slot: SlotId) => void;
  onSaveAction: (profile: ProfileMode, slot: SlotId, actionId: string) => Promise<void>;
  onTestAction: (actionId: string) => Promise<void>;
  onSelectProfile: (profile: ProfileMode) => void;
}

type PcMacCategory = 'mac' | 'win' | 'media' | 'shortcut' | 'text';
type TvCategory = 'tv_remote' | 'tv_apps' | 'tv_custom';

interface MacroSequenceStep {
  id: string;
  type: 'chord' | 'delay' | 'hold';
  label: string;
}

export const KeyRemapper: React.FC<KeyRemapperProps> = ({
  status,
  selectedSlot,
  onSelectSlot,
  onSaveAction,
  onTestAction,
  onSelectProfile
}) => {
  const activeProfileMode: ProfileMode = status.profiles.active;
  const [editingProfile, setEditingProfile] = useState<ProfileMode>(activeProfileMode);

  useEffect(() => {
    setEditingProfile(status.profiles.active);
  }, [status.profiles.active]);

  const [pcCategory, setPcCategory] = useState<PcMacCategory>('shortcut');
  const [tvCategory, setTvCategory] = useState<TvCategory>('tv_remote');
  const [searchQuery, setSearchQuery] = useState('');

  // Undo History Stack
  const [undoStack, setUndoStack] = useState<Array<{ profile: ProfileMode; slot: SlotId; actionId: string }>>([]);

  const recordMappingChange = (profile: ProfileMode, slot: SlotId, prevActionId: string) => {
    setUndoStack(prev => [...prev.slice(-15), { profile, slot, actionId: prevActionId }]);
  };

  const handleUndo = async () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    soundEngine.playKeyClick();
    setEditingProfile(last.profile);
    onSelectProfile(last.profile);
    onSelectSlot(last.slot);
    await onSaveAction(last.profile, last.slot, last.actionId);
  };

  // Macro Sequence Builder
  const [customMods, setCustomMods] = useState<Set<'ctrl' | 'shift' | 'alt' | 'gui'>>(new Set(['gui', 'shift']));
  const [customKey, setCustomKey] = useState<string>('4');
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef<HTMLDivElement>(null);

  const [sequenceSteps, setSequenceSteps] = useState<MacroSequenceStep[]>([]);
  const [delayInput, setDelayInput] = useState<number>(250);
  const [holdInput, setHoldInput] = useState<number>(500);

  const [textInput, setTextInput] = useState('');
  const [customCodeset, setCustomCodeset] = useState<number>(11);
  const [customCode, setCustomCode] = useState<number>(2);

  const currentProfile = status.profiles.items.find(p => p.id === editingProfile) || status.profiles.items[0];
  const currentActionId = (currentProfile.controls as any)[selectedSlot] || '';
  const currentDetails = getActionDetails(currentActionId);

  const slotLabels: Record<SlotId, string> = {
    b1: 'Key 1 (B1)',
    b2: 'Key 2 (B2)',
    b3: 'Key 3 (B3)',
    b4: 'Key 4 (B4)',
    dial: 'Dial Push'
  };

  useEffect(() => {
    if (!isRecording) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const newMods = new Set<'ctrl' | 'shift' | 'alt' | 'gui'>();
      if (e.metaKey) newMods.add('gui');
      if (e.ctrlKey) newMods.add('ctrl');
      if (e.altKey) newMods.add('alt');
      if (e.shiftKey) newMods.add('shift');

      let key = e.key.toLowerCase();
      if (['meta', 'control', 'alt', 'shift'].includes(key)) {
        setCustomMods(newMods);
        return;
      }

      if (key === 'escape') key = 'esc';
      if (key === 'enter') key = 'enter';
      if (key === ' ') key = 'space';
      if (key === 'arrowup') key = 'up';
      if (key === 'arrowdown') key = 'down';
      if (key === 'arrowleft') key = 'left';
      if (key === 'arrowright') key = 'right';

      soundEngine.playKeyClick();
      setCustomMods(newMods);
      setCustomKey(key);
      setIsRecording(false);
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isRecording]);

  const toggleMod = (m: 'ctrl' | 'shift' | 'alt' | 'gui') => {
    const next = new Set(customMods);
    if (next.has(m)) next.delete(m);
    else next.add(m);
    setCustomMods(next);
  };

  const buildCustomShortcutId = (modsSet = customMods, key = customKey) => {
    const mods = Array.from(modsSet).sort().join(',');
    return `SHORTCUT:${mods}:${key.toLowerCase()}`;
  };

  const saveActionWithUndo = async (profile: ProfileMode, slot: SlotId, actionId: string) => {
    const prevAction = (status.profiles.items.find(p => p.id === profile)?.controls as any)[slot] || '';
    recordMappingChange(profile, slot, prevAction);
    await onSaveAction(profile, slot, actionId);
  };

  const handleApplyCustomShortcut = async () => {
    const id = buildCustomShortcutId();
    await saveActionWithUndo(editingProfile, selectedSlot, id);
  };

  const handleAddChordStep = () => {
    const chordId = buildCustomShortcutId();
    const details = getActionDetails(chordId);
    setSequenceSteps(prev => [...prev, { id: chordId, type: 'chord', label: details.name }]);
    soundEngine.playKeyClick();
  };

  const handleAddDelayStep = () => {
    const stepId = `DELAY:${delayInput}`;
    setSequenceSteps(prev => [...prev, { id: stepId, type: 'delay', label: `Delay ${delayInput}ms` }]);
    soundEngine.playKeyClick();
  };

  const handleAddHoldStep = () => {
    const stepId = `HOLD:${holdInput}`;
    setSequenceSteps(prev => [...prev, { id: stepId, type: 'hold', label: `Hold ${holdInput}ms` }]);
    soundEngine.playKeyClick();
  };

  const handleRemoveSequenceStep = (index: number) => {
    setSequenceSteps(prev => prev.filter((_, i) => i !== index));
    soundEngine.playKeyClick();
  };

  const handleMoveSequenceStep = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= sequenceSteps.length) return;
    const next = [...sequenceSteps];
    const temp = next[index];
    next[index] = next[targetIdx];
    next[targetIdx] = temp;
    setSequenceSteps(next);
    soundEngine.playKeyClick();
  };

  const handleSaveMacroSequence = async () => {
    if (sequenceSteps.length === 0) return;
    const compiled = `SEQUENCE:${sequenceSteps.map(s => s.id).join('|')}`;
    await saveActionWithUndo(editingProfile, selectedSlot, compiled);
  };

  const handleTestSequence = async () => {
    if (sequenceSteps.length === 0) {
      await onTestAction(buildCustomShortcutId());
      return;
    }
    for (const step of sequenceSteps) {
      if (step.type === 'delay') {
        const ms = Number(step.id.slice(6)) || 250;
        await new Promise(r => setTimeout(r, ms));
      } else {
        await onTestAction(step.id);
        await new Promise(r => setTimeout(r, 120));
      }
    }
  };

  const handleApplyText = async () => {
    if (!textInput.trim()) return;
    const id = `TEXT:${textInput.trim()}`;
    await saveActionWithUndo(editingProfile, selectedSlot, id);
    setTextInput('');
  };

  const handleApplyCustomTvKey = async () => {
    const id = `TVKEY:${customCodeset}:${customCode}`;
    await saveActionWithUndo(editingProfile, selectedSlot, id);
  };

  const isTvMode = editingProfile === 'TV';

  const filteredPcPresets = FIRMWARE_ACTIONS.filter(a => {
    if (isTvMode) return false;
    if (pcCategory === 'mac' && a.category !== 'mac') return false;
    if (pcCategory === 'win' && a.category !== 'win') return false;
    if (pcCategory === 'media' && a.category !== 'media') return false;
    if (a.category === 'tv' || a.category === 'app') return false;

    if (!searchQuery) return true;
    return `${a.name} ${a.description} ${a.id}`.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const filteredTvPresets = FIRMWARE_ACTIONS.filter(a => {
    if (!isTvMode) return false;
    if (tvCategory === 'tv_remote' && a.category !== 'tv') return false;
    if (tvCategory === 'tv_apps' && a.category !== 'app') return false;

    if (!searchQuery) return true;
    return `${a.name} ${a.description} ${a.id}`.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="p-4 sm:p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4 sm:space-y-5 shadow-xl">
      
      {/* Target Slot Selector & Profile Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        
        {/* Physical Button Target */}
        <div className="flex items-center justify-between sm:justify-start gap-2">
          <span className="text-xs font-semibold text-slate-400">Target:</span>
          <div className="flex items-center p-0.5 rounded-lg bg-slate-950 border border-slate-800 overflow-x-auto">
            {(['b1', 'b2', 'b3', 'b4', 'dial'] as SlotId[]).map(s => (
              <button
                key={s}
                onClick={() => onSelectSlot(s)}
                className={`px-2.5 sm:px-3 py-1 text-xs font-mono font-bold rounded-md transition-all cursor-pointer ${
                  selectedSlot === s
                    ? 'bg-sky-400 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {s.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Profile Switcher & Undo Button */}
        <div className="flex items-center justify-between sm:justify-end gap-2.5">
          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              undoStack.length > 0
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer shadow-sm'
                : 'bg-slate-950/40 text-slate-600 border border-slate-800 cursor-not-allowed'
            }`}
            title="Revert last button mapping change"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Undo ({undoStack.length})</span>
          </button>

          <div className="flex items-center p-0.5 rounded-lg bg-slate-950 border border-slate-800">
            <button
              onClick={() => {
                setEditingProfile('MAC');
                onSelectProfile('MAC');
              }}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                editingProfile === 'MAC'
                  ? 'bg-sky-400 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              PC / Mac
            </button>
            <button
              onClick={() => {
                setEditingProfile('TV');
                onSelectProfile('TV');
              }}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                editingProfile === 'TV'
                  ? 'bg-sky-400 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Smart TV
            </button>
          </div>
        </div>

      </div>

      {/* Currently Assigned Display Card */}
      <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-bold text-sky-400 uppercase">
              {slotLabels[selectedSlot]}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 font-mono">
              {editingProfile === 'TV' ? 'TV Mode' : 'PC/Mac Mode'}
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-sm font-bold text-slate-100 truncate">{currentDetails.name}</span>
            <span className="text-xs text-slate-400 font-mono hidden sm:inline">({currentDetails.description})</span>
          </div>
        </div>

        <button
          onClick={() => onTestAction(currentActionId)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors cursor-pointer shrink-0"
        >
          <Play className="w-3.5 h-3.5" />
          <span>Test Key</span>
        </button>
      </div>

      {/* TV MODE */}
      {isTvMode ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setTvCategory('tv_remote')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  tvCategory === 'tv_remote'
                    ? 'bg-sky-400 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Tv className="w-3.5 h-3.5" />
                <span>Remote Keys</span>
              </button>

              <button
                onClick={() => setTvCategory('tv_apps')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  tvCategory === 'tv_apps'
                    ? 'bg-sky-400 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Film className="w-3.5 h-3.5" />
                <span>Streaming Apps</span>
              </button>

              <button
                onClick={() => setTvCategory('tv_custom')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  tvCategory === 'tv_custom'
                    ? 'bg-sky-400 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Custom Keycode</span>
              </button>
            </div>
          </div>

          {(tvCategory === 'tv_remote' || tvCategory === 'tv_apps') && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Filter TV commands..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-400"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-56 sm:max-h-64 overflow-y-auto pr-1">
                {filteredTvPresets.map(preset => {
                  const isAssigned = currentActionId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      onClick={() => saveActionWithUndo(editingProfile, selectedSlot, preset.id)}
                      className={`flex flex-col text-left p-2.5 rounded-lg border transition-all cursor-pointer ${
                        isAssigned
                          ? 'bg-sky-500/10 border-sky-400 text-sky-300 font-semibold shadow-sm'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <span className="text-xs font-bold leading-tight truncate">{preset.name}</span>
                      <span className="text-[11px] font-mono text-slate-500 mt-0.5 truncate">{preset.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {tvCategory === 'tv_custom' && (
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="text-xs text-slate-300">
                Send direct Vizio / Smart TV key codes over Wi-Fi.
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-mono text-slate-400 block mb-1">Codeset</label>
                  <input
                    type="number"
                    value={customCodeset}
                    onChange={e => setCustomCodeset(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-sky-400"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-mono text-slate-400 block mb-1">Keycode</label>
                  <input
                    type="number"
                    value={customCode}
                    onChange={e => setCustomCode(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-sky-400"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <button
                  onClick={handleApplyCustomTvKey}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 font-bold text-xs cursor-pointer shadow-sm"
                >
                  <Check className="w-3.5 h-3.5" />
                  Save TV Keycode
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* PC / MAC MODE */
        <div className="space-y-4">
          <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-slate-800/80">
            {[
              { id: 'shortcut', label: 'Macro Sequence Studio', icon: Keyboard },
              { id: 'mac', label: 'macOS Presets', icon: Laptop },
              { id: 'win', label: 'Windows Presets', icon: Laptop },
              { id: 'media', label: 'Media & Audio', icon: Volume2 },
              { id: 'text', label: 'Text Macro', icon: Type }
            ].map(cat => {
              const Icon = cat.icon;
              const active = pcCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setPcCategory(cat.id as PcMacCategory)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-sky-400 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* MACRO SEQUENCE STUDIO & VISUAL BUILDER */}
          {pcCategory === 'shortcut' && (
            <div className="space-y-4 p-4 rounded-xl bg-slate-950 border border-slate-800">
              
              {/* Recorder Banner */}
              <div ref={recorderRef} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-lg bg-[#0b0e14] border border-slate-800">
                <div className="flex items-center gap-2.5">
                  <span className={`w-3 h-3 rounded-full ${isRecording ? 'bg-rose-500 animate-ping' : 'bg-slate-600'}`} />
                  <div>
                    <span className="text-xs font-bold text-slate-200">
                      {isRecording ? 'Listening for keystroke chord...' : 'Interactive Keystroke Capture'}
                    </span>
                    <p className="text-[11px] text-slate-400">
                      {isRecording ? 'Press any keyboard combo (e.g. Cmd+Shift+4)' : 'Click record and press any multi-key shortcut'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsRecording(!isRecording)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-sm shrink-0 ${
                    isRecording
                      ? 'bg-rose-500 text-white animate-pulse'
                      : 'bg-slate-800 hover:bg-slate-700 text-sky-400 border border-sky-500/30'
                  }`}
                >
                  <Disc className="w-3.5 h-3.5" />
                  <span>{isRecording ? 'Cancel Capture' : 'Record Keystroke'}</span>
                </button>
              </div>

              {/* Active Chord Visualizer */}
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                    Current Step Generator
                  </span>
                  <span className="text-[10px] font-mono text-sky-400">
                    {buildCustomShortcutId()}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {customMods.has('gui') && <span className="px-3 py-1.5 rounded-lg bg-sky-400 text-slate-950 font-mono font-bold text-xs shadow-md">⌘ CMD</span>}
                  {customMods.has('shift') && <span className="px-3 py-1.5 rounded-lg bg-sky-400 text-slate-950 font-mono font-bold text-xs shadow-md">⇧ SHIFT</span>}
                  {customMods.has('alt') && <span className="px-3 py-1.5 rounded-lg bg-sky-400 text-slate-950 font-mono font-bold text-xs shadow-md">⌥ ALT</span>}
                  {customMods.has('ctrl') && <span className="px-3 py-1.5 rounded-lg bg-sky-400 text-slate-950 font-mono font-bold text-xs shadow-md">⌃ CTRL</span>}
                  <span className="text-slate-500 font-bold">+</span>
                  <span className="px-3.5 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-white font-mono font-bold text-xs shadow-md">
                    {customKey.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Modifiers & Key Pickers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono text-slate-400">Modifiers:</label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { id: 'gui', label: 'Cmd ⌘' },
                      { id: 'shift', label: 'Shift ⇧' },
                      { id: 'alt', label: 'Opt ⌥' },
                      { id: 'ctrl', label: 'Ctrl ⌃' }
                    ].map(mod => {
                      const active = customMods.has(mod.id as any);
                      return (
                        <button
                          key={mod.id}
                          type="button"
                          onClick={() => toggleMod(mod.id as any)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all border cursor-pointer ${
                            active
                              ? 'bg-sky-400 text-slate-950 border-sky-400 shadow-sm'
                              : 'bg-slate-900 text-slate-400 border-slate-700 hover:border-slate-500'
                          }`}
                        >
                          {mod.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono text-slate-400">Trigger Key:</label>
                  <select
                    value={customKey}
                    onChange={e => setCustomKey(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-400"
                  >
                    <option value="4">4 (Number)</option>
                    <option value="3">3 (Number)</option>
                    <option value="5">5 (Number)</option>
                    <option value="s">S (Letter)</option>
                    <option value="t">T (Letter)</option>
                    <option value="z">Z (Letter)</option>
                    <option value="c">C (Letter)</option>
                    <option value="v">V (Letter)</option>
                    <option value="escape">Escape</option>
                    <option value="enter">Enter</option>
                    <option value="space">Spacebar</option>
                  </select>
                </div>
              </div>

              {/* VISUAL MACRO SEQUENCE BUILDER & PIPELINE */}
              <div className="pt-3 border-t border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-bold text-sky-400 uppercase tracking-wider">
                    Visual Macro Sequence Pipeline
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {sequenceSteps.length} step(s) chained
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={handleAddChordStep}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 cursor-pointer transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 text-sky-400" />
                    <span>Add Key Chord</span>
                  </button>

                  <div className="flex items-center gap-1 bg-slate-900 rounded-lg border border-slate-700 px-2 py-1">
                    <select
                      value={delayInput}
                      onChange={e => setDelayInput(Number(e.target.value))}
                      className="bg-transparent text-xs font-mono text-slate-300 focus:outline-none cursor-pointer"
                    >
                      <option value={100}>100ms</option>
                      <option value={250}>250ms</option>
                      <option value={500}>500ms</option>
                      <option value={1000}>1000ms</option>
                    </select>
                    <button
                      type="button"
                      onClick={handleAddDelayStep}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs font-bold text-sky-400 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Delay</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1 bg-slate-900 rounded-lg border border-slate-700 px-2 py-1">
                    <select
                      value={holdInput}
                      onChange={e => setHoldInput(Number(e.target.value))}
                      className="bg-transparent text-xs font-mono text-slate-300 focus:outline-none cursor-pointer"
                    >
                      <option value={200}>200ms</option>
                      <option value={500}>500ms</option>
                      <option value={1000}>1000ms</option>
                    </select>
                    <button
                      type="button"
                      onClick={handleAddHoldStep}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs font-bold text-emerald-400 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Hold</span>
                    </button>
                  </div>
                </div>

                {sequenceSteps.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {sequenceSteps.map((step, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-[#0b0e14] border border-slate-800"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center text-[10px] font-mono font-bold text-sky-400">
                            {idx + 1}
                          </span>
                          <span className="text-xs font-bold text-slate-200">{step.label}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                            {step.type.toUpperCase()}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleMoveSequenceStep(idx, 'up')}
                            disabled={idx === 0}
                            className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                            title="Move Up"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveSequenceStep(idx, 'down')}
                            disabled={idx === sequenceSteps.length - 1}
                            className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                            title="Move Down"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveSequenceStep(idx)}
                            className="p-1 rounded bg-slate-900 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 cursor-pointer ml-1"
                            title="Remove Step"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-900 text-center text-xs text-slate-500">
                    No steps in sequence. Add key chords, delays, or hold actions above to build a custom multi-step macro.
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={handleTestSequence}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-200 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Test Sequence</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveMacroSequence}
                    disabled={sequenceSteps.length === 0}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold cursor-pointer transition-all shadow-sm ${
                      sequenceSteps.length > 0
                        ? 'bg-sky-400 hover:bg-sky-300 text-slate-950'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Sequence to Key</span>
                  </button>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <span className="text-[11px] font-mono text-slate-400 block">Quick Macro Presets:</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: '⌘⇧4 (Area Snip)', mods: ['gui', 'shift'], key: '4' },
                    { label: '⌘⇧3 (Full Screen)', mods: ['gui', 'shift'], key: '3' },
                    { label: 'Win+Shift+S (Snip)', mods: ['gui', 'shift'], key: 's' },
                    { label: 'Ctrl+Shift+Esc (Task Mgr)', mods: ['ctrl', 'shift'], key: 'escape' }
                  ].map(preset => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setCustomMods(new Set(preset.mods as any));
                        setCustomKey(preset.key);
                        soundEngine.playKeyClick();
                      }}
                      className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-mono text-slate-300 hover:text-white transition-colors cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* Preset Grids */}
          {['mac', 'win', 'media'].includes(pcCategory) && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search actions..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-400"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-56 sm:max-h-64 overflow-y-auto pr-1">
                {filteredPcPresets.map(preset => {
                  const isAssigned = currentActionId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      onClick={() => saveActionWithUndo(editingProfile, selectedSlot, preset.id)}
                      className={`flex flex-col text-left p-2.5 rounded-lg border transition-all cursor-pointer ${
                        isAssigned
                          ? 'bg-sky-500/10 border-sky-400 text-sky-300 font-semibold shadow-sm'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <span className="text-xs font-bold leading-tight">{preset.name}</span>
                      <span className="text-[11px] font-mono text-slate-500 mt-0.5 truncate">{preset.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Text Macro */}
          {pcCategory === 'text' && (
            <div className="space-y-3 p-4 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-xs text-slate-300">
                Automatically types out a string of characters instantly upon keypress:
              </div>
              <input
                type="text"
                placeholder="e.g. git status, email address, snippet"
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-400"
              />
              <div className="flex justify-end">
                <button
                  onClick={handleApplyText}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 font-bold text-xs cursor-pointer shadow-sm"
                >
                  <Check className="w-3.5 h-3.5" />
                  Save Text Macro
                </button>
              </div>
            </div>
          )}

        </div>
      )}

    </div>
  );
};
