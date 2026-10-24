import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  MacroFolder,
  MacroItem,
  MacroRepeatMode,
  MacroStep,
  MacroStepType
} from '../types/studio';
import { soundEngine } from '../services/soundEffects';
import {
  Plus,
  Search,
  Folder,
  FolderPlus,
  Circle,
  Square,
  Play,
  GripVertical,
  Trash2,
  Clock,
  ArrowDownToLine,
  ArrowUpFromLine,
  FileText,
  MousePointerClick,
  Copy
} from 'lucide-react';

interface MacroEditorViewProps {
  macros: MacroItem[];
  folders: MacroFolder[];
  onUpdateMacros: (next: MacroItem[]) => void;
  onUpdateFolders: (next: MacroFolder[]) => void;
  onToast: (msg: string) => void;
}

export const MacroEditorView: React.FC<MacroEditorViewProps> = ({
  macros,
  folders,
  onUpdateMacros,
  onUpdateFolders,
  onToast
}) => {
  const [selectedFolderId, setSelectedFolderId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMacroId, setSelectedMacroId] = useState<string>(macros[0]?.id || '');
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [isRecording, setIsRecording] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [activeTestStepIdx, setActiveTestStepIdx] = useState<number | null>(null);
  const [editingDelayStepId, setEditingDelayStepId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const lastEventTimeRef = useRef<number | null>(null);
  const testAbortRef = useRef<boolean>(false);

  const filteredMacros = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return macros.filter(m => {
      const folderMatch = selectedFolderId === 'all' || m.folderId === selectedFolderId;
      if (!folderMatch) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.steps.some(s => s.value.toLowerCase().includes(q))
      );
    });
  }, [macros, selectedFolderId, searchQuery]);

  const activeMacro = macros.find(m => m.id === selectedMacroId) || filteredMacros[0] || null;

  useEffect(() => {
    if (!isRecording || !activeMacro) return;

    lastEventTimeRef.current = performance.now();

    const pushRecordedSteps = (newSteps: MacroStep[]) => {
      onUpdateMacros(
        macros.map(m =>
          m.id === activeMacro.id ? { ...m, steps: [...m.steps, ...newSteps] } : m
        )
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      e.preventDefault();
      e.stopPropagation();

      const now = performance.now();
      const delta = lastEventTimeRef.current ? Math.round(now - lastEventTimeRef.current) : 0;
      lastEventTimeRef.current = now;

      const keyLabel = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
      const batch: MacroStep[] = [];
      if (delta >= 15 && activeMacro.steps.length > 0) {
        batch.push({
          id: `st-${Date.now()}-d`,
          type: 'delay',
          value: String(Math.min(delta, 2500)),
          delayMs: Math.min(delta, 2500)
        });
      }
      batch.push({
        id: `st-${Date.now()}-kd-${Math.random().toString(36).slice(2, 5)}`,
        type: 'key_down',
        value: keyLabel
      });
      pushRecordedSteps(batch);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const now = performance.now();
      const delta = lastEventTimeRef.current ? Math.round(now - lastEventTimeRef.current) : 25;
      lastEventTimeRef.current = now;

      const keyLabel = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
      const batch: MacroStep[] = [
        {
          id: `st-${Date.now()}-du`,
          type: 'delay',
          value: String(Math.max(15, Math.min(delta, 2000))),
          delayMs: Math.max(15, Math.min(delta, 2000))
        },
        {
          id: `st-${Date.now()}-ku-${Math.random().toString(36).slice(2, 5)}`,
          type: 'key_up',
          value: keyLabel
        }
      ];
      pushRecordedSteps(batch);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
    };
  }, [isRecording, activeMacro, macros, onUpdateMacros]);

  const updateActiveMacro = (patch: Partial<MacroItem>) => {
    if (!activeMacro) return;
    onUpdateMacros(macros.map(m => (m.id === activeMacro.id ? { ...m, ...patch } : m)));
  };

  const handleCreateMacro = () => {
    const targetFolder =
      selectedFolderId === 'all' ? folders[0]?.id || 'folder-prod' : selectedFolderId;
    const created: MacroItem = {
      id: `macro-${Date.now()}`,
      name: `New Macro ${macros.length + 1}`,
      folderId: targetFolder,
      repeatMode: 'once',
      repeatCount: 1,
      steps: [
        { id: `s-${Date.now()}-1`, type: 'key_down', value: 'Cmd' },
        { id: `s-${Date.now()}-2`, type: 'key_down', value: 'S' },
        { id: `s-${Date.now()}-3`, type: 'delay', value: '35', delayMs: 35 },
        { id: `s-${Date.now()}-4`, type: 'key_up', value: 'S' },
        { id: `s-${Date.now()}-5`, type: 'key_up', value: 'Cmd' }
      ]
    };
    onUpdateMacros([created, ...macros]);
    setSelectedMacroId(created.id);
    onToast(`Created "${created.name}"`);
  };

  const handleDuplicateMacro = () => {
    if (!activeMacro) return;
    const copy: MacroItem = {
      ...JSON.parse(JSON.stringify(activeMacro)),
      id: `macro-${Date.now()}`,
      name: `${activeMacro.name} Copy`
    };
    onUpdateMacros([copy, ...macros]);
    setSelectedMacroId(copy.id);
    onToast(`Duplicated "${activeMacro.name}"`);
  };

  const handleDeleteMacro = (id: string) => {
    const remaining = macros.filter(m => m.id !== id);
    onUpdateMacros(remaining);
    if (selectedMacroId === id) {
      setSelectedMacroId(remaining[0]?.id || '');
    }
  };

  const handleAddStep = (type: MacroStepType) => {
    if (!activeMacro) return;
    const step: MacroStep =
      type === 'delay'
        ? { id: `st-${Date.now()}`, type: 'delay', value: '50', delayMs: 50 }
        : type === 'text'
        ? { id: `st-${Date.now()}`, type: 'text', value: 'Snippet text' }
        : type === 'mouse'
        ? { id: `st-${Date.now()}`, type: 'mouse', value: 'left_click' }
        : { id: `st-${Date.now()}`, type, value: 'Space' };

    updateActiveMacro({ steps: [...activeMacro.steps, step] });
  };

  const handleUpdateStep = (stepId: string, patch: Partial<MacroStep>) => {
    if (!activeMacro) return;
    updateActiveMacro({
      steps: activeMacro.steps.map(s => (s.id === stepId ? { ...s, ...patch } : s))
    });
  };

  const handleDeleteStep = (stepId: string) => {
    if (!activeMacro) return;
    updateActiveMacro({
      steps: activeMacro.steps.filter(s => s.id !== stepId)
    });
  };

  const handleDropStep = (targetIdx: number) => {
    if (dragIndex === null || !activeMacro || dragIndex === targetIdx) return;
    const list = [...activeMacro.steps];
    const [moved] = list.splice(dragIndex, 1);
    list.splice(targetIdx, 0, moved);
    updateActiveMacro({ steps: list });
    setDragIndex(null);
  };

  const handleTestRun = async () => {
    if (!activeMacro || activeMacro.steps.length === 0) return;
    if (isTesting) {
      testAbortRef.current = true;
      setIsTesting(false);
      setActiveTestStepIdx(null);
      return;
    }

    setIsRecording(false);
    setIsTesting(true);
    testAbortRef.current = false;

    const loops = activeMacro.repeatMode === 'count' ? Math.max(1, Math.min(5, activeMacro.repeatCount)) : 1;

    for (let r = 0; r < loops; r++) {
      for (let i = 0; i < activeMacro.steps.length; i++) {
        if (testAbortRef.current) break;
        setActiveTestStepIdx(i);
        const step = activeMacro.steps[i];
        if (step.type === 'key_down' || step.type === 'mouse' || step.type === 'text') {
          soundEngine.playKeyClick();
        }
        const waitMs = step.type === 'delay' ? Math.min(1200, Math.max(40, step.delayMs || 50)) : 110;
        await new Promise(res => setTimeout(res, waitMs));
      }
    }

    setIsTesting(false);
    setActiveTestStepIdx(null);
    if (!testAbortRef.current) {
      onToast(`Completed test run of "${activeMacro.name}"`);
    }
  };

  const totalDelayMs = activeMacro
    ? activeMacro.steps.reduce((acc, s) => acc + (s.type === 'delay' ? s.delayMs || Number(s.value) || 0 : 0), 0)
    : 0;

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
      {/* Left Column: Folders & Macro List */}
      <div className="w-full lg:w-72 shrink-0 bg-[var(--bg-panel)] border-b lg:border-b-0 lg:border-r border-[var(--border-subtle)] flex flex-col p-4 gap-4 overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--text-primary)]">Macro Library</h2>
          <button
            type="button"
            onClick={handleCreateMacro}
            style={{ backgroundColor: 'var(--accent)' }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Macro</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search macros…"
            className="w-full rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] pl-8 pr-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>

        {/* Folders */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] font-medium text-[var(--text-muted)] px-1">
            <span>Folders</span>
            <button
              type="button"
              onClick={() => setAddingFolder(v => !v)}
              className="hover:text-[var(--text-primary)] cursor-pointer"
              title="Create folder"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
          </div>

          {addingFolder && (
            <form
              onSubmit={e => {
                e.preventDefault();
                if (!newFolderName.trim()) return;
                const nf: MacroFolder = { id: `folder-${Date.now()}`, name: newFolderName.trim() };
                onUpdateFolders([...folders, nf]);
                setSelectedFolderId(nf.id);
                setNewFolderName('');
                setAddingFolder(false);
              }}
              className="flex gap-1 py-1"
            >
              <input
                type="text"
                autoFocus
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                placeholder="Folder name…"
                className="flex-1 min-w-0 rounded-lg bg-[var(--bg-input)] border border-[var(--border-strong)] px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none"
              />
              <button
                type="submit"
                style={{ backgroundColor: 'var(--accent)' }}
                className="px-2 py-1 rounded-lg text-xs font-semibold text-white cursor-pointer"
              >
                Add
              </button>
            </form>
          )}

          <div className="flex flex-wrap lg:flex-col gap-1">
            <button
              type="button"
              onClick={() => setSelectedFolderId('all')}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer whitespace-nowrap ${
                selectedFolderId === 'all'
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span className="flex items-center gap-2">
                <Folder className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <span>All Macros</span>
              </span>
              <span className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums ml-2">
                {macros.length}
              </span>
            </button>

            {folders.map(f => {
              const count = macros.filter(m => m.folderId === f.id).length;
              const active = selectedFolderId === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSelectedFolderId(f.id)}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-semibold'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <Folder className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                    <span className="truncate">{f.name}</span>
                  </span>
                  <span className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums ml-2">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Macro Items List */}
        <div className="space-y-1 pt-2 border-t border-[var(--border-subtle)] flex-1">
          {filteredMacros.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] py-4 text-center">
              No macros match this filter.
            </p>
          ) : (
            filteredMacros.map(m => {
              const isSelected = activeMacro?.id === m.id;
              return (
                <div
                  key={m.id}
                  onClick={() => setSelectedMacroId(m.id)}
                  style={
                    isSelected
                      ? { borderColor: 'var(--accent)', backgroundColor: 'rgba(var(--accent-rgb), 0.12)' }
                      : undefined
                  }
                  className="group p-2.5 rounded-xl border border-transparent hover:bg-[var(--bg-input)] flex items-center justify-between gap-2 cursor-pointer transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                      {m.name}
                    </div>
                    <div className="text-[11px] font-mono text-[var(--text-muted)] tabular-nums">
                      {m.steps.length} steps
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      handleDeleteMacro(m.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-rose-400 hover:text-rose-300 cursor-pointer"
                    title="Delete macro"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Timeline Editor */}
      <div className="flex-1 flex flex-col p-4 sm:p-6 overflow-y-auto space-y-5">
        {!activeMacro ? (
          <div className="m-auto text-center space-y-3 max-w-sm">
            <h3 className="text-base font-bold text-[var(--text-primary)]">No Macro Selected</h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Create a macro sequence to automate multi-key shortcuts, timed delays, text snippets, and mouse clicks.
            </p>
            <button
              type="button"
              onClick={handleCreateMacro}
              style={{ backgroundColor: 'var(--accent)' }}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white cursor-pointer"
            >
              Create First Macro
            </button>
          </div>
        ) : (
          <>
            {/* Top Macro Metadata & Live Record / Test Run Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-3 flex-1 min-w-[220px]">
                <input
                  type="text"
                  value={activeMacro.name}
                  onChange={e => updateActiveMacro({ name: e.target.value })}
                  className="rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] focus:border-[var(--accent)] px-3 py-2 text-sm font-bold text-[var(--text-primary)] focus:outline-none w-full max-w-xs"
                />
                <select
                  value={activeMacro.folderId}
                  onChange={e => updateActiveMacro({ folderId: e.target.value })}
                  className="rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-secondary)]"
                >
                  {folders.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleDuplicateMacro}
                  className="p-2 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                  title="Duplicate macro"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsRecording(r => !r)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border cursor-pointer transition-all whitespace-nowrap ${
                    isRecording
                      ? 'bg-rose-500 text-white border-rose-400 shadow-lg shadow-rose-500/25'
                      : 'bg-[var(--bg-panel)] border-[var(--border-strong)] text-[var(--text-primary)] hover:border-rose-400'
                  }`}
                >
                  {isRecording ? (
                    <>
                      <Square className="w-3.5 h-3.5 fill-current" />
                      <span>Stop Recording</span>
                    </>
                  ) : (
                    <>
                      <Circle className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
                      <span>Record Live</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleTestRun}
                  style={!isTesting ? { backgroundColor: 'var(--accent)' } : undefined}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all whitespace-nowrap ${
                    isTesting
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-white hover:opacity-95'
                  }`}
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>{isTesting ? 'Stop Test' : 'Test Run'}</span>
                </button>
              </div>
            </div>

            {/* Repeat Options & Step Insertion Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Repeat Behavior */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[var(--text-secondary)]">Repeat:</span>
                <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
                  {(
                    [
                      { id: 'once', label: 'Once' },
                      { id: 'count', label: 'N times' },
                      { id: 'while_held', label: 'While held' }
                    ] as { id: MacroRepeatMode; label: string }[]
                  ).map(rm => {
                    const active = activeMacro.repeatMode === rm.id;
                    return (
                      <button
                        key={rm.id}
                        type="button"
                        onClick={() => updateActiveMacro({ repeatMode: rm.id })}
                        style={
                          active
                            ? { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }
                            : undefined
                        }
                        className={`px-2.5 py-1 rounded-lg text-xs cursor-pointer whitespace-nowrap ${
                          active ? 'font-semibold' : 'text-[var(--text-secondary)]'
                        }`}
                      >
                        {rm.label}
                      </button>
                    );
                  })}
                </div>

                {activeMacro.repeatMode === 'count' && (
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={activeMacro.repeatCount}
                    onChange={e => updateActiveMacro({ repeatCount: Number(e.target.value) })}
                    className="w-16 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-mono tabular-nums text-[var(--text-primary)]"
                  />
                )}
              </div>

              {/* Manual Add Step Buttons */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleAddStep('key_down')}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                >
                  <ArrowDownToLine className="w-3.5 h-3.5 text-sky-400" />
                  <span>+ Key Down</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddStep('key_up')}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                >
                  <ArrowUpFromLine className="w-3.5 h-3.5 text-violet-400" />
                  <span>+ Key Up</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddStep('delay')}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                >
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>+ Delay</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddStep('text')}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                >
                  <FileText className="w-3.5 h-3.5 text-emerald-400" />
                  <span>+ Text</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddStep('mouse')}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                >
                  <MousePointerClick className="w-3.5 h-3.5 text-pink-400" />
                  <span>+ Mouse</span>
                </button>
              </div>
            </div>

            {isRecording && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200 flex items-center justify-between">
                <span>Recording keyboard input live — press keys to append Key Down, timed Delay, and Key Up steps.</span>
                <button
                  type="button"
                  onClick={() => updateActiveMacro({ steps: [] })}
                  className="text-rose-300 underline font-semibold cursor-pointer whitespace-nowrap ml-3"
                >
                  Clear Steps
                </button>
              </div>
            )}

            {/* Vertical Timeline Steps */}
            <div className="space-y-2 max-w-3xl">
              <div className="flex items-center justify-between text-xs text-[var(--text-muted)] px-1">
                <span>Drag steps to reorder · Click any delay to edit milliseconds</span>
                <span className="font-mono tabular-nums">
                  Total Delay: {totalDelayMs} ms
                </span>
              </div>

              {activeMacro.steps.length === 0 ? (
                <div className="p-8 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-center text-xs text-[var(--text-muted)]">
                  Timeline is empty. Click "Record Live" and type on your keyboard, or add steps manually above.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {activeMacro.steps.map((step, idx) => {
                    const isPlayingStep = activeTestStepIdx === idx;
                    return (
                      <div
                        key={step.id}
                        draggable
                        onDragStart={() => setDragIndex(idx)}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => handleDropStep(idx)}
                        style={
                          isPlayingStep
                            ? {
                                borderColor: 'var(--accent)',
                                backgroundColor: 'rgba(var(--accent-rgb), 0.16)'
                              }
                            : undefined
                        }
                        className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] transition-colors"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <GripVertical className="w-4 h-4 text-[var(--text-muted)] cursor-grab shrink-0" />
                          <span className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums w-6">
                            {String(idx + 1).padStart(2, '0')}
                          </span>

                          {/* Step Type Label */}
                          {step.type === 'key_down' && (
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-sky-400 w-28 shrink-0">
                              <ArrowDownToLine className="w-3.5 h-3.5" />
                              <span>Key Down</span>
                            </span>
                          )}
                          {step.type === 'key_up' && (
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-violet-400 w-28 shrink-0">
                              <ArrowUpFromLine className="w-3.5 h-3.5" />
                              <span>Key Up</span>
                            </span>
                          )}
                          {step.type === 'delay' && (
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 w-28 shrink-0">
                              <Clock className="w-3.5 h-3.5" />
                              <span>Delay</span>
                            </span>
                          )}
                          {step.type === 'text' && (
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 w-28 shrink-0">
                              <FileText className="w-3.5 h-3.5" />
                              <span>Type Text</span>
                            </span>
                          )}
                          {step.type === 'mouse' && (
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-pink-400 w-28 shrink-0">
                              <MousePointerClick className="w-3.5 h-3.5" />
                              <span>Mouse</span>
                            </span>
                          )}

                          {/* Step Value Editor */}
                          {step.type === 'delay' ? (
                            editingDelayStepId === step.id ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  autoFocus
                                  min={1}
                                  max={30000}
                                  value={step.delayMs ?? Number(step.value)}
                                  onChange={e => {
                                    const ms = Math.max(1, Number(e.target.value));
                                    handleUpdateStep(step.id, { value: String(ms), delayMs: ms });
                                  }}
                                  onBlur={() => setEditingDelayStepId(null)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') setEditingDelayStepId(null);
                                  }}
                                  className="w-24 rounded-lg bg-[var(--bg-input)] border border-[var(--accent)] px-2.5 py-1 text-xs font-mono tabular-nums text-[var(--text-primary)] focus:outline-none"
                                />
                                <span className="font-mono text-xs text-[var(--text-muted)]">ms</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditingDelayStepId(step.id)}
                                className="px-2.5 py-1 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] font-mono text-xs tabular-nums text-amber-300 cursor-pointer"
                                title="Click to edit delay in milliseconds"
                              >
                                {step.delayMs ?? step.value} ms
                              </button>
                            )
                          ) : step.type === 'mouse' ? (
                            <select
                              value={step.value}
                              onChange={e => handleUpdateStep(step.id, { value: e.target.value })}
                              className="rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-mono text-[var(--text-primary)]"
                            >
                              <option value="left_click">left_click</option>
                              <option value="right_click">right_click</option>
                              <option value="middle_click">middle_click</option>
                              <option value="scroll_up">scroll_up</option>
                              <option value="scroll_down">scroll_down</option>
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={step.value}
                              onChange={e => handleUpdateStep(step.id, { value: e.target.value })}
                              className="flex-1 max-w-xs rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-[var(--accent)] px-2.5 py-1 text-xs font-mono text-[var(--text-primary)] focus:outline-none"
                            />
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteStep(step.id)}
                          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-rose-400 cursor-pointer"
                          title="Delete step"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
