import React, { useState, useEffect, useRef } from 'react';
import { FirmwareStatus, ProfileMode, SlotId } from '../types/macropod';
import { FIRMWARE_ACTIONS, getActionDetails } from '../data/actionLibrary';
import { Check, Play, Search, Keyboard, Type, Tv, Volume2, Laptop, Film, Sliders, Disc, Plus, Trash2, ArrowUp, ArrowDown, Undo2, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react';
import { soundEngine } from '../services/soundEffects';

interface KeyRemapperProps {
  status: FirmwareStatus;
  selectedSlot: SlotId;
  onSelectSlot: (slot: SlotId) => void;
  onSaveAction: (profile: ProfileMode, slot: SlotId, actionId: string) => Promise<void>;
  onTestAction: (actionId: string) => Promise<void>;
  onSelectProfile: (profile: ProfileMode) => void;
}

type WizardTab = 'profile' | 'button' | 'action' | 'test';
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

  // Wizard Navigation Tab
  const [activeTab, setActiveTab] = useState<WizardTab>('profile');

  // Categories
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
    b1: 'Key 1 (GPIO 4)',
    b2: 'Key 2 (GPIO 5)',
    b3: 'Key 3 (GPIO 6)',
    b4: 'Key 4 (GPIO 7)',
    dial: 'Rotary Push Dial'
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
    soundEngine.playKeyClick();
    // Automatically advance to test tab on successful save
    setActiveTab('test');
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
    <div className="p-4 sm:p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-5 shadow-2xl">
      
      {/* Step-by-Step Wizard Navigation Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        
        {/* Wizard Step Tabs */}
        <div className="grid grid-cols-4 gap-1 p-0.5 rounded-xl bg-slate-950 border border-slate-800">
          {[
            { id: 'profile', label: '1. Profile', icon: Laptop },
            { id: 'button', label: '2. Button', icon: Keyboard },
            { id: 'action', label: '3. Action', icon: Sparkles },
            { id: 'test', label: '4. Test', icon: Play }
          ].map((tab, idx) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  soundEngine.playKeyClick();
                  setActiveTab(tab.id as WizardTab);
                }}
                className={`py-2 px-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  isActive
                    ? 'bg-sky-400 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Undo Button */}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              undoStack.length > 0
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer shadow-sm'
                : 'bg-slate-950/40 text-slate-600 border border-slate-800 cursor-not-allowed'
            }`}
            title="Revert last button mapping change"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Undo ({undoStack.length})</span>
          </button>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* STEP 1: CHOOSE PROFILE MODE                                               */}
      {/* ========================================================================= */}
      {activeTab === 'profile' && (
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-slate-100">Step 1: Select Profile Mode</h4>
            <p className="text-xs text-slate-400">Choose whether you are configuring bindings for your computer (PC/Mac) or Smart TV.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => {
                setEditingProfile('MAC');
                onSelectProfile('MAC');
                soundEngine.playKeyClick();
                setActiveTab('button');
              }}
              className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between h-28 ${
                editingProfile === 'MAC'
                  ? 'bg-sky-500/10 border-sky-400 text-white shadow-lg shadow-sky-500/10'
                  : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <Laptop className="w-5 h-5 text-sky-400" />
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-sky-300 font-bold">Active</span>
              </div>
              <div>
                <div className="text-sm font-bold">PC / Mac Productivity</div>
                <div className="text-xs text-slate-400">Shortcuts, media keys, text snippets</div>
              </div>
            </button>

            <button
              onClick={() => {
                setEditingProfile('TV');
                onSelectProfile('TV');
                soundEngine.playKeyClick();
                setActiveTab('button');
              }}
              className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between h-28 ${
                editingProfile === 'TV'
                  ? 'bg-sky-500/10 border-sky-400 text-white shadow-lg shadow-sky-500/10'
                  : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <Tv className="w-5 h-5 text-sky-400" />
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-sky-300 font-bold">SmartCast</span>
              </div>
              <div>
                <div className="text-sm font-bold">Smart TV Remote</div>
                <div className="text-xs text-slate-400">Vizio remote commands & streaming apps</div>
              </div>
            </button>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={() => {
                soundEngine.playKeyClick();
                setActiveTab('button');
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 font-bold text-xs cursor-pointer shadow-sm"
            >
              <span>Next: Select Button</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 2: SELECT BUTTON TARGET                                              */}
      {/* ========================================================================= */}
      {activeTab === 'button' && (
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-slate-100">Step 2: Choose Physical Button</h4>
            <p className="text-xs text-slate-400">Select which mechanical switch or rotary dial push you want to customize.</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {(['b1', 'b2', 'b3', 'b4', 'dial'] as SlotId[]).map(s => {
              const actionId = (currentProfile.controls as any)[s] || '';
              const details = getActionDetails(actionId);
              const isSelected = selectedSlot === s;

              return (
                <button
                  key={s}
                  onClick={() => {
                    onSelectSlot(s);
                    soundEngine.playKeyClick();
                  }}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between h-28 ${
                    isSelected
                      ? 'bg-sky-500/10 border-sky-400 text-white shadow-lg'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-mono font-bold text-sky-400">
                    <span>{s.toUpperCase()}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-sky-400" />}
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-100 truncate">{details.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono truncate">{slotLabels[s]}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setActiveTab('profile')}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            <button
              onClick={() => {
                soundEngine.playKeyClick();
                setActiveTab('action');
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 font-bold text-xs cursor-pointer shadow-sm"
            >
              <span>Next: Assign Action</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 3: ASSIGN ACTION                                                     */}
      {/* ========================================================================= */}
      {activeTab === 'action' && (
        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-100">Step 3: Assign Action to {slotLabels[selectedSlot]}</h4>
              <p className="text-xs text-slate-400">Pick from presets, build multi-key sequences, or enter text.</p>
            </div>
            <button
              onClick={() => setActiveTab('button')}
              className="text-xs text-sky-400 hover:underline font-mono cursor-pointer"
            >
              Change Button
            </button>
          </div>

          {/* TV MODE ACTIONS */}
          {isTvMode ? (
            <div className="space-y-4">
              <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2">
                <button
                  onClick={() => setTvCategory('tv_remote')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    tvCategory === 'tv_remote' ? 'bg-sky-400 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Remote Keys
                </button>
                <button
                  onClick={() => setTvCategory('tv_apps')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    tvCategory === 'tv_apps' ? 'bg-sky-400 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Streaming Apps
                </button>
                <button
                  onClick={() => setTvCategory('tv_custom')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    tvCategory === 'tv_custom' ? 'bg-sky-400 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Custom Keycode
                </button>
              </div>

              {(tvCategory === 'tv_remote' || tvCategory === 'tv_apps') && (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search TV commands..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-400"
                    />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-56 overflow-y-auto pr-1">
                    {filteredTvPresets.map(preset => {
                      const isAssigned = currentActionId === preset.id;
                      return (
                        <button
                          key={preset.id}
                          onClick={() => saveActionWithUndo(editingProfile, selectedSlot, preset.id)}
                          className={`flex flex-col text-left p-2.5 rounded-lg border transition-all cursor-pointer ${
                            isAssigned
                              ? 'bg-sky-500/10 border-sky-400 text-sky-300 font-semibold'
                              : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
                          }`}
                        >
                          <span className="text-xs font-bold leading-tight truncate">{preset.name}</span>
                          <span className="text-[10px] font-mono text-slate-500 mt-0.5 truncate">{preset.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {tvCategory === 'tv_custom' && (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-mono text-slate-400 block mb-1">Codeset</label>
                      <input
                        type="number"
                        value={customCodeset}
                        onChange={e => setCustomCodeset(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-mono text-slate-400 block mb-1">Keycode</label>
                      <input
                        type="number"
                        value={customCode}
                        onChange={e => setCustomCode(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={handleApplyCustomTvKey}
                      className="px-4 py-2 rounded-lg bg-sky-400 text-slate-950 font-bold text-xs cursor-pointer"
                    >
                      Save TV Keycode
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* PC / MAC MODE ACTIONS */
            <div className="space-y-4">
              <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-slate-800">
                {[
                  { id: 'shortcut', label: 'Macro Builder', icon: Keyboard },
                  { id: 'mac', label: 'macOS', icon: Laptop },
                  { id: 'win', label: 'Windows', icon: Laptop },
                  { id: 'media', label: 'Media', icon: Volume2 },
                  { id: 'text', label: 'Text', icon: Type }
                ].map(cat => {
                  const Icon = cat.icon;
                  const active = pcCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setPcCategory(cat.id as PcMacCategory)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                        active ? 'bg-sky-400 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{cat.label}</span>
                    </button>
                  );
                })}
              </div>

              {pcCategory === 'shortcut' && (
                <div className="space-y-4 p-4 rounded-xl bg-slate-950 border border-slate-800">
                  <div ref={recorderRef} className="flex items-center justify-between p-3 rounded-lg bg-[#0b0e14] border border-slate-800">
                    <div className="flex items-center gap-2.5">
                      <span className={`w-3 h-3 rounded-full ${isRecording ? 'bg-rose-500 animate-ping' : 'bg-slate-600'}`} />
                      <div>
                        <span className="text-xs font-bold text-slate-200">
                          {isRecording ? 'Listening for keystroke chord...' : 'Interactive Keystroke Capture'}
                        </span>
                        <p className="text-[11px] text-slate-400">Click record and press any shortcut</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsRecording(!isRecording)}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                        isRecording ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-800 text-sky-400 border border-sky-500/30'
                      }`}
                    >
                      <Disc className="w-3.5 h-3.5" />
                      <span>{isRecording ? 'Stop' : 'Record'}</span>
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono font-bold text-sky-400 uppercase">Sequence Builder</span>
                      <span className="text-[10px] text-slate-400">{sequenceSteps.length} step(s)</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={handleAddChordStep}
                        className="py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 cursor-pointer"
                      >
                        + Add Chord
                      </button>
                      <div className="flex items-center gap-1 bg-slate-900 rounded-lg border border-slate-700 px-2 py-1">
                        <select
                          value={delayInput}
                          onChange={e => setDelayInput(Number(e.target.value))}
                          className="bg-transparent text-xs font-mono text-slate-300 focus:outline-none"
                        >
                          <option value={100}>100ms</option>
                          <option value={250}>250ms</option>
                          <option value={500}>500ms</option>
                        </select>
                        <button type="button" onClick={handleAddDelayStep} className="px-2 py-1 bg-slate-800 text-xs font-bold text-sky-400 rounded">
                          + Delay
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddHoldStep}
                        className="py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-emerald-400 cursor-pointer"
                      >
                        + Hold
                      </button>
                    </div>

                    {sequenceSteps.length > 0 && (
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {sequenceSteps.map((s, i) => (
                          <div key={i} className="flex items-center justify-between p-2 rounded bg-[#0b0e14] border border-slate-800 text-xs">
                            <span className="font-bold text-slate-200">{i + 1}. {s.label}</span>
                            <div className="flex items-center gap-1">
                              <button onClick={() => handleMoveSequenceStep(i, 'up')} disabled={i === 0} className="p-1 text-slate-400 hover:text-white disabled:opacity-30">
                                <ArrowUp className="w-3 h-3" />
                              </button>
                              <button onClick={() => handleMoveSequenceStep(i, 'down')} disabled={i === sequenceSteps.length - 1} className="p-1 text-slate-400 hover:text-white disabled:opacity-30">
                                <ArrowDown className="w-3 h-3" />
                              </button>
                              <button onClick={() => handleRemoveSequenceStep(i)} className="p-1 text-slate-400 hover:text-rose-400">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        onClick={handleSaveMacroSequence}
                        disabled={sequenceSteps.length === 0}
                        className="px-4 py-2 rounded-lg bg-sky-400 text-slate-950 font-bold text-xs cursor-pointer disabled:opacity-40"
                      >
                        Save Sequence
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {['mac', 'win', 'media'].includes(pcCategory) && (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search presets..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-400"
                    />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-56 overflow-y-auto pr-1">
                    {filteredPcPresets.map(preset => {
                      const isAssigned = currentActionId === preset.id;
                      return (
                        <button
                          key={preset.id}
                          onClick={() => saveActionWithUndo(editingProfile, selectedSlot, preset.id)}
                          className={`flex flex-col text-left p-2.5 rounded-lg border transition-all cursor-pointer ${
                            isAssigned ? 'bg-sky-500/10 border-sky-400 text-sky-300 font-semibold' : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
                          }`}
                        >
                          <span className="text-xs font-bold leading-tight truncate">{preset.name}</span>
                          <span className="text-[10px] font-mono text-slate-500 mt-0.5 truncate">{preset.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {pcCategory === 'text' && (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <input
                    type="text"
                    placeholder="Type text string..."
                    value={textInput}
                    onChange={e => setTextInput(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white"
                  />
                  <div className="flex justify-end">
                    <button onClick={handleApplyText} className="px-4 py-2 rounded-lg bg-sky-400 text-slate-950 font-bold text-xs cursor-pointer">
                      Save Text Macro
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setActiveTab('button')}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            <button
              onClick={() => {
                soundEngine.playKeyClick();
                setActiveTab('test');
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs cursor-pointer"
            >
              <span>Next: Test & Flash</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 4: TEST & FLASH                                                      */}
      {/* ========================================================================= */}
      {activeTab === 'test' && (
        <div className="space-y-4 py-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-400">
            <Check className="w-7 h-7" />
          </div>

          <div className="space-y-1 max-w-md mx-auto">
            <h4 className="text-sm font-bold text-slate-100">Ready to Test & Flash</h4>
            <p className="text-xs text-slate-400">
              <strong className="text-slate-200">{slotLabels[selectedSlot]}</strong> is mapped to <strong className="text-sky-400">{currentDetails.name}</strong> ({currentDetails.description}).
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => onTestAction(currentActionId)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs cursor-pointer shadow-sm"
            >
              <Play className="w-4 h-4 text-emerald-400" />
              <span>Dispatch & Test on Device</span>
            </button>
          </div>

          <div className="flex items-center justify-between pt-6 border-t border-slate-800">
            <button
              onClick={() => setActiveTab('action')}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back to Actions</span>
            </button>
            <button
              onClick={() => setActiveTab('profile')}
              className="text-xs font-mono text-sky-400 hover:underline cursor-pointer"
            >
              Configure Another Button →
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
