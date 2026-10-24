import React, { useState, useRef, useEffect } from 'react';
import {
  DeviceConnectionInfo,
  LayerConfig,
  StudioProfile
} from '../types/studio';
import {
  ChevronDown,
  Plus,
  Undo2,
  Redo2,
  Save,
  Usb,
  Pencil,
  Copy,
  Trash2,
  Check
} from 'lucide-react';

interface TopBarProps {
  connection: DeviceConnectionInfo;
  onOpenConnectModal: () => void;
  profiles: StudioProfile[];
  activeProfile: StudioProfile;
  onSelectProfile: (profileId: string) => void;
  onCreateProfile: (name: string) => void;
  onRenameProfile: (profileId: string, name: string) => void;
  onDuplicateProfile: (profileId: string) => void;
  onDeleteProfile: (profileId: string) => void;
  onSelectLayer: (layerIndex: number) => void;
  onUpdateLayerMeta: (layerIndex: number, patch: Partial<Pick<LayerConfig, 'name' | 'color'>>) => void;
  hasUnsavedChanges: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSaveToDevice: () => void;
}

const LAYER_SWATCHES = [
  '#3B82F6',
  '#8B5CF6',
  '#06B6D4',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#EC4899',
  '#F3F4F6'
];

export const TopBar: React.FC<TopBarProps> = ({
  connection,
  onOpenConnectModal,
  profiles,
  activeProfile,
  onSelectProfile,
  onCreateProfile,
  onRenameProfile,
  onDuplicateProfile,
  onDeleteProfile,
  onSelectLayer,
  onUpdateLayerMeta,
  hasUnsavedChanges,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSaveToDevice
}) => {
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [renamingProfileId, setRenamingProfileId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  const [editingLayerIdx, setEditingLayerIdx] = useState<number | null>(null);
  const [layerDraftName, setLayerDraftName] = useState('');

  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const layerPopoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
        setCreatingProfile(false);
        setRenamingProfileId(null);
      }
      if (layerPopoverRef.current && !layerPopoverRef.current.contains(e.target as Node)) {
        setEditingLayerIdx(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const submitNewProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newProfileName.trim();
    if (!trimmed) return;
    onCreateProfile(trimmed);
    setNewProfileName('');
    setCreatingProfile(false);
    setProfileMenuOpen(false);
  };

  const openLayerEditor = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingLayerIdx(idx);
    setLayerDraftName(activeProfile.layers[idx].name);
  };

  return (
    <header className="h-14 shrink-0 bg-[var(--bg-panel)] border-b border-[var(--border-subtle)] px-4 flex items-center justify-between gap-4 z-30">
      {/* Left: Brand & Device Status Pill */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center font-extrabold text-xs text-white shadow-sm"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            S
          </div>
          <span className="font-bold text-sm tracking-tight text-[var(--text-primary)] whitespace-nowrap hidden sm:inline">
            Studio Pad
          </span>
        </div>

        <button
          type="button"
          onClick={onOpenConnectModal}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            connection.connected
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:border-emerald-400'
              : 'bg-[var(--bg-input)] border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
          title="Manage USB cable hardware connection"
        >
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              connection.connected ? 'bg-emerald-400' : 'bg-zinc-500'
            }`}
          />
          <Usb className="w-3.5 h-3.5 shrink-0" />
          <span className="font-semibold text-[var(--text-primary)]">
            {connection.connected ? 'Connected' : 'Disconnected'}
          </span>
          <span className="text-[var(--text-muted)] hidden md:inline">·</span>
          <span className="text-[var(--text-secondary)] hidden md:inline">
            {connection.deviceName}
          </span>
          <span className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums hidden lg:inline">
            {connection.firmwareVersion}
          </span>
        </button>

        {/* Profile Dropdown + Quick Create */}
        <div className="relative flex items-center gap-1" ref={profileMenuRef}>
          <button
            type="button"
            onClick={() => setProfileMenuOpen(o => !o)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap"
          >
            <span className="truncate max-w-[130px]">{activeProfile.name}</span>
            <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => {
              setProfileMenuOpen(true);
              setCreatingProfile(true);
            }}
            className="w-8 h-8 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--accent)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shrink-0"
            title="Create new profile"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          {profileMenuOpen && (
            <div className="absolute left-0 top-full mt-1.5 w-72 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-strong)] shadow-2xl p-2 z-50 space-y-1.5">
              <div className="px-2 py-1 flex items-center justify-between text-[11px] font-medium text-[var(--text-muted)]">
                <span>Profiles ({profiles.length})</span>
                <button
                  type="button"
                  onClick={() => setCreatingProfile(true)}
                  style={{ color: 'var(--accent)' }}
                  className="font-semibold hover:underline cursor-pointer"
                >
                  + New
                </button>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-1">
                {profiles.map(prof => {
                  const isCurrent = prof.id === activeProfile.id;
                  const isRenaming = renamingProfileId === prof.id;

                  if (isRenaming) {
                    return (
                      <form
                        key={prof.id}
                        onSubmit={e => {
                          e.preventDefault();
                          if (renameText.trim()) {
                            onRenameProfile(prof.id, renameText.trim());
                          }
                          setRenamingProfileId(null);
                        }}
                        className="flex items-center gap-1 p-1"
                      >
                        <input
                          type="text"
                          autoFocus
                          value={renameText}
                          onChange={e => setRenameText(e.target.value)}
                          className="flex-1 rounded-lg bg-[var(--bg-input)] border border-[var(--accent)] px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none"
                        />
                        <button
                          type="submit"
                          className="p-1.5 rounded-lg bg-[var(--bg-elevated)] text-emerald-400 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </form>
                    );
                  }

                  return (
                    <div
                      key={prof.id}
                      className={`group flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs transition-colors ${
                        isCurrent
                          ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-semibold'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSelectProfile(prof.id);
                          setProfileMenuOpen(false);
                        }}
                        className="flex-1 text-left truncate cursor-pointer"
                      >
                        {prof.name}
                      </button>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingProfileId(prof.id);
                            setRenameText(prof.name);
                          }}
                          className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                          title="Rename profile"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDuplicateProfile(prof.id)}
                          className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                          title="Duplicate profile"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        {profiles.length > 1 && (
                          <button
                            type="button"
                            onClick={() => onDeleteProfile(prof.id)}
                            className="p-1 text-rose-400 hover:text-rose-300 cursor-pointer"
                            title="Delete profile"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {creatingProfile && (
                <form onSubmit={submitNewProfile} className="pt-2 border-t border-[var(--border-subtle)] flex gap-1.5">
                  <input
                    type="text"
                    autoFocus
                    value={newProfileName}
                    onChange={e => setNewProfileName(e.target.value)}
                    placeholder="Profile name…"
                    className="flex-1 min-w-0 rounded-lg bg-[var(--bg-input)] border border-[var(--border-strong)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                  />
                  <button
                    type="submit"
                    style={{ backgroundColor: 'var(--accent)' }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
                  >
                    Create
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Center: Layer Tabs (Layer 1, 2, 3, 4 with Rename & Color-Code) */}
      <div className="hidden xl:flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] relative" ref={layerPopoverRef}>
        {activeProfile.layers.map((layer, idx) => {
          const isActive = activeProfile.activeLayerIndex === idx;
          return (
            <div key={layer.id} className="relative flex items-center">
              <button
                type="button"
                onClick={() => onSelectLayer(idx)}
                onDoubleClick={e => openLayerEditor(idx, e)}
                style={
                  isActive
                    ? {
                        backgroundColor: 'var(--bg-elevated)',
                        borderColor: layer.color
                      }
                    : undefined
                }
                className={`group flex items-center gap-2 px-3 py-1 rounded-lg text-xs border transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'text-[var(--text-primary)] font-semibold shadow-sm'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="Click to select layer · Click edit icon or double-click to rename & color-code"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: layer.color }}
                />
                <span className="max-w-[96px] truncate">{layer.name || `Layer ${idx + 1}`}</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={e => openLayerEditor(idx, e)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') openLayerEditor(idx, e as any);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-opacity ml-0.5"
                >
                  <Pencil className="w-2.5 h-2.5" />
                </span>
              </button>

              {editingLayerIdx === idx && (
                <div className="absolute left-0 top-full mt-2 w-56 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-strong)] shadow-2xl p-3 z-50 space-y-2.5">
                  <div className="text-[11px] font-semibold text-[var(--text-secondary)]">
                    Customize Layer {idx + 1}
                  </div>
                  <input
                    type="text"
                    autoFocus
                    value={layerDraftName}
                    onChange={e => {
                      setLayerDraftName(e.target.value);
                      onUpdateLayerMeta(idx, { name: e.target.value });
                    }}
                    placeholder={`Layer ${idx + 1}`}
                    className="w-full rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                  />
                  <div>
                    <span className="block text-[10px] text-[var(--text-muted)] mb-1.5">
                      Layer Color Code
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {LAYER_SWATCHES.map(swatch => (
                        <button
                          key={swatch}
                          type="button"
                          onClick={() => onUpdateLayerMeta(idx, { color: swatch })}
                          className={`w-5 h-5 rounded-md cursor-pointer transition-transform ${
                            layer.color.toUpperCase() === swatch.toUpperCase()
                              ? 'scale-110 ring-2 ring-white'
                              : 'opacity-80 hover:opacity-100'
                          }`}
                          style={{ backgroundColor: swatch }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Right: Undo / Redo + Save to Device */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] p-0.5">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
            title="Undo (Cmd/Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
            title="Redo (Cmd/Ctrl+Shift+Z)"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={onSaveToDevice}
          style={{ backgroundColor: 'var(--accent)' }}
          className="relative flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer shadow-sm whitespace-nowrap"
        >
          <Save className="w-3.5 h-3.5 shrink-0" />
          <span>Save to device</span>
          {hasUnsavedChanges && (
            <span
              className="w-2 h-2 rounded-full bg-amber-300 ring-2 ring-black/30 shrink-0"
              title="Unsaved changes"
            />
          )}
        </button>
      </div>
    </header>
  );
};
