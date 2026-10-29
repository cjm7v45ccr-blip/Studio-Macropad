import React, { useState, useRef, useEffect } from 'react';
import {
  BleHostSlot,
  DeviceConnectionInfo,
  HardwareProfileId,
  StudioProfile,
  SyncStatusPill,
  defaultProfileAlias,
  isBleHostProfile,
  profileIdToBleSlot,
  profileShortTag
} from '../types/studio';
import { validateFirmwareAlias } from '../data/firmwareCatalog';
import { PROFILE_ACCENT_COLORS } from '../data/presetTemplates';
import { PWAInstallButton } from './PWAInstallButton';
import {
  Undo2,
  Redo2,
  Copy,
  Pencil,
  Check,
  X,
  Cpu,
  Usb,
  Laptop,
  Tv,
  SlidersHorizontal,
  Bluetooth
} from 'lucide-react';

interface TopBarProps {
  connection: DeviceConnectionInfo;
  syncStatus: SyncStatusPill;
  currentRev: number;
  dirty: boolean;
  isSyncingUsb: boolean;
  onConnectUsbPad: () => void;
  onStartDemoMode: () => void;
  onOpenConnectModal: () => void;
  onPullFromUsb: () => void;
  profiles: StudioProfile[];
  activeProfile: StudioProfile;
  onSelectProfile: (id: HardwareProfileId) => void;
  onRenameProfile: (id: HardwareProfileId, name: string) => Promise<boolean> | boolean;
  onRequestCopyProfile: (source: HardwareProfileId, target: HardwareProfileId) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSaveToDevice: () => void;
  onSwitchBleHost: (slot: BleHostSlot) => Promise<void> | void;
  onOpenSetupWizard?: () => void;
  searchSlot?: React.ReactNode;
}

export const TopBar: React.FC<TopBarProps> = ({
  connection,
  syncStatus,
  currentRev,
  dirty,
  isSyncingUsb,
  onConnectUsbPad,
  onStartDemoMode,
  onOpenConnectModal,
  onPullFromUsb,
  profiles,
  activeProfile,
  onSelectProfile,
  onRenameProfile,
  onRequestCopyProfile,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSaveToDevice,
  onSwitchBleHost,
  onOpenSetupWizard,
  searchSlot
}) => {
  const [renamingId, setRenamingId] = useState<HardwareProfileId | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const copyMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!copyMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (copyMenuRef.current && !copyMenuRef.current.contains(e.target as Node)) {
        setCopyMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [copyMenuOpen]);

  const startRename = (prof: StudioProfile) => {
    setCopyMenuOpen(false);
    setRenamingId(prof.id);
    setRenameDraft(prof.name);
    setRenameError(null);
  };

  const handleRenameInputChange = (val: string) => {
    setRenameDraft(val);
    const check = validateFirmwareAlias(val);
    setRenameError(check.valid ? null : check.error);
  };

  const commitRename = async () => {
    if (!renamingId) return;
    const check = validateFirmwareAlias(renameDraft);
    if (!check.valid) {
      setRenameError(check.error);
      onRenameProfile(renamingId, renameDraft);
      return;
    }
    const ok = await onRenameProfile(renamingId, renameDraft);
    if (ok !== false) {
      setRenamingId(null);
      setRenameError(null);
    }
  };

  const hwActiveProfile = connection.telemetry?.activeProfile;
  const liveBleHost = connection.telemetry?.bleActiveHost ?? 1;
  const selectedBleSlot = profileIdToBleSlot(activeProfile.id);

  return (
    <header className="shrink-0 bg-[var(--bg-panel)] border-b border-[var(--border-subtle)] px-3 py-2 flex items-center justify-between gap-3 select-none z-40">
      {/* Left: Logo + Host/Profile Switcher */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white shadow-sm shrink-0"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <Cpu className="w-4 h-4" />
          </div>
          <span className="text-sm font-bold tracking-tight text-[var(--text-primary)] hidden xl:inline whitespace-nowrap">
            Studio MacroPad
          </span>
        </div>

        {/* Profile / Host Switcher */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] overflow-x-auto min-w-0">
          {profiles.map(prof => {
            const selected = prof.id === activeProfile.id;
            const isLiveOnPad = connection.connected && hwActiveProfile === prof.id;
            const accent = PROFILE_ACCENT_COLORS[prof.id];
            const Icon = isBleHostProfile(prof.id) ? Laptop : Tv;
            const shortTag = profileShortTag(prof.id);
            const hasCustomAlias = prof.name !== defaultProfileAlias(prof.id);

            return (
              <button
                key={prof.id}
                type="button"
                onClick={() => onSelectProfile(prof.id)}
                title={`${prof.name} (${shortTag})${isLiveOnPad ? ' — Live on pad' : ''}`}
                style={
                  selected
                    ? {
                        backgroundColor: 'var(--bg-elevated)',
                        borderColor: accent
                      }
                    : undefined
                }
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border cursor-pointer whitespace-nowrap shrink-0 min-w-0 ${
                  selected
                    ? 'text-[var(--text-primary)] shadow-sm font-semibold'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: selected ? accent : undefined }}
                />
                <span className="truncate max-w-[90px] sm:max-w-[120px] tabular-nums">
                  {prof.name}
                </span>
                {isLiveOnPad && (
                  <span className="font-mono text-[9px] text-emerald-400 shrink-0">· Live</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Rename & Copy menu for active profile */}
        {renamingId ? (
          <div className="relative flex items-center gap-1 shrink-0">
            <input
              type="text"
              value={renameDraft}
              onChange={e => handleRenameInputChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') {
                  setRenamingId(null);
                  setRenameError(null);
                }
              }}
              autoFocus
              aria-label="Rename profile"
              placeholder="1–20 chars"
              className={`w-28 sm:w-32 px-2 py-1 rounded-lg bg-[var(--bg-input)] border text-xs text-[var(--text-primary)] focus:outline-none ${
                renameError ? 'border-rose-500' : 'border-[var(--accent)]'
              }`}
            />
            <button
              type="button"
              onClick={commitRename}
              className="p-1 rounded-md text-emerald-400 hover:bg-[var(--bg-input)] cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setRenamingId(null);
                setRenameError(null);
              }}
              className="p-1 rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-input)] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="relative flex items-center gap-0.5 shrink-0" ref={copyMenuRef}>
            <button
              type="button"
              onClick={() => startRename(activeProfile)}
              title={`Rename ${activeProfile.name}`}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setCopyMenuOpen(prev => !prev)}
              title={`Copy ${activeProfile.name} bindings`}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>

            {copyMenuOpen && (
              <div className="absolute top-full left-0 mt-1.5 w-52 p-1.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] shadow-2xl z-50">
                <div className="px-2 py-1 text-[11px] font-medium text-[var(--text-muted)]">
                  Copy {activeProfile.name} to…
                </div>
                {profiles
                  .filter(p => p.id !== activeProfile.id)
                  .map(target => {
                    const TargetIcon = isBleHostProfile(target.id) ? Laptop : Tv;
                    return (
                      <button
                        key={target.id}
                        type="button"
                        onClick={() => {
                          setCopyMenuOpen(false);
                          onRequestCopyProfile(activeProfile.id, target.id);
                        }}
                        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <TargetIcon
                            className="w-3.5 h-3.5 shrink-0"
                            style={{ color: PROFILE_ACCENT_COLORS[target.id] }}
                          />
                          <span className="truncate font-medium">{target.name}</span>
                        </span>
                        <span className="font-mono text-[10px] text-[var(--text-muted)] tabular-nums shrink-0">
                          {profileShortTag(target.id)}
                        </span>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Center: Global Macro Search Bar */}
      {searchSlot && (
        <div className="hidden md:flex items-center min-w-0 flex-1 max-w-md mx-2">
          {searchSlot}
        </div>
      )}

      {/* Right: Single Connection Chip + Undo/Redo */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="hidden lg:flex items-center rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] p-0.5">
          <button
            type="button"
            disabled={!canUndo}
            onClick={onUndo}
            title="Undo (Ctrl+Z)"
            className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 cursor-pointer"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={onRedo}
            title="Redo (Ctrl+Shift+Z)"
            className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 cursor-pointer"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Single Connection Chip */}
        <button
          type="button"
          onClick={connection.connected ? onSaveToDevice : onConnectUsbPad}
          style={{
            backgroundColor: !connection.connected || dirty ? 'var(--accent)' : undefined,
            color: !connection.connected || dirty ? '#FFFFFF' : undefined
          }}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shadow-sm ${
            connection.connected
              ? 'bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-strong)] hover:border-[var(--accent)]'
              : 'hover:opacity-95'
          }`}
          title={
            connection.connected
              ? `Synced · USB (${connection.deviceName || 'ESP32 Pad'})`
              : 'Connect MacroPad via USB'
          }
        >
          {connection.connected ? (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)] shrink-0" />
              <span>Synced · USB</span>
              {dirty && <span className="text-[10px] opacity-75">· Unsaved</span>}
            </>
          ) : (
            <>
              <Usb className="w-3.5 h-3.5 shrink-0" />
              <span>Connect</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
