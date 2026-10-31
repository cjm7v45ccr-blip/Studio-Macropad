import React, { useState, useRef, useEffect } from 'react';
import {
  BleHostProfileId,
  BleHostSlot,
  DeviceConnectionInfo,
  HardwareProfileId,
  HostOsMap,
  HostOsType,
  StudioProfile,
  SyncStatusPill,
  hostOsFullLabel,
  hostOsShortLabel,
  isBleHostProfile,
  profileShortTag
} from '../types/studio';
import { validateFirmwareAlias } from '../data/firmwareCatalog';
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
  ChevronDown
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
  hostOsMap: HostOsMap;
  onSetHostOs: (hostId: BleHostProfileId, nextOs: HostOsType) => void;
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
  tvEnabled?: boolean;
  searchSlot?: React.ReactNode;
}

export const TopBar: React.FC<TopBarProps> = ({
  connection,
  syncStatus,
  currentRev,
  dirty,
  isSyncingUsb,
  onConnectUsbPad,
  onOpenConnectModal,
  profiles,
  activeProfile,
  hostOsMap,
  onSetHostOs,
  onSelectProfile,
  onRenameProfile,
  onRequestCopyProfile,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSaveToDevice,
  tvEnabled,
  searchSlot
}) => {
  const [renamingId, setRenamingId] = useState<HardwareProfileId | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const [osMenuOpen, setOsMenuOpen] = useState(false);
  const utilityRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!copyMenuOpen && !osMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (utilityRef.current && !utilityRef.current.contains(e.target as Node)) {
        setCopyMenuOpen(false);
        setOsMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [copyMenuOpen, osMenuOpen]);

  const startRename = (prof: StudioProfile) => {
    setCopyMenuOpen(false);
    setOsMenuOpen(false);
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
  const activeIsHost = isBleHostProfile(activeProfile.id);
  const activeHostOs: HostOsType = isBleHostProfile(activeProfile.id)
    ? hostOsMap[activeProfile.id]
    : 'mac';

  const isTvEnabled = tvEnabled ?? (connection.telemetry?.tvEnabled !== false);

  return (
    <header className="shrink-0 bg-[var(--bg-panel)] border-b border-[var(--border-subtle)] px-3.5 py-2 flex items-center justify-between gap-4 select-none z-40">
      {/* Left: Brand + Profile Tabs + Grouped Profile Actions */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white shadow-xs shrink-0"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <Cpu className="w-4 h-4" />
          </div>
          <span className="text-sm font-bold tracking-tight text-[var(--text-primary)] hidden xl:inline whitespace-nowrap">
            Studio MacroPad
          </span>
        </div>

        {/* Profile / Host Switcher (Single-Accent Filled Segmented Control) */}
        <div className="flex items-center gap-0.5 p-1 rounded-xl bg-[var(--bg-input)] overflow-x-auto min-w-0">
          {profiles.filter(p => p.id !== 'TV' || isTvEnabled).map(prof => {
            const selected = prof.id === activeProfile.id;
            const isLiveOnPad = connection.connected && hwActiveProfile === prof.id;
            const Icon = isBleHostProfile(prof.id) ? Laptop : Tv;
            const shortTag = profileShortTag(prof.id);
            const profOsLabel = isBleHostProfile(prof.id)
              ? ` · ${hostOsShortLabel(hostOsMap[prof.id])}`
              : '';

            return (
              <button
                key={prof.id}
                type="button"
                onClick={() => onSelectProfile(prof.id)}
                title={`${prof.name} (${shortTag}${profOsLabel})${
                  isLiveOnPad ? ' — Active on hardware' : ''
                }`}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer whitespace-nowrap shrink-0 min-w-0 ${
                  selected
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-2xs font-semibold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium'
                }`}
              >
                <Icon
                  className={`w-3.5 h-3.5 shrink-0 ${
                    selected ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                  }`}
                />
                <span className="truncate max-w-[88px] sm:max-w-[116px] tabular-nums">
                  {prof.name}
                </span>
                {isLiveOnPad && (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium shrink-0">
                    · Live
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Grouped & Labeled Rename / Copy / Device OS Cluster */}
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
              className={`w-28 sm:w-32 px-2.5 py-1 rounded-lg bg-[var(--bg-input)] border text-xs text-[var(--text-primary)] focus:outline-none ${
                renameError ? 'border-rose-500' : 'border-[var(--accent)]'
              }`}
            />
            <button
              type="button"
              onClick={commitRename}
              title="Save name"
              className="p-1.5 rounded-md text-emerald-600 dark:text-emerald-400 hover:bg-[var(--bg-input)] cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setRenamingId(null);
                setRenameError(null);
              }}
              title="Cancel rename"
              className="p-1.5 rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-input)] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div
            className="relative hidden sm:flex items-center p-0.5 rounded-xl bg-[var(--bg-input)] shrink-0"
            ref={utilityRef}
          >
            {activeIsHost && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setCopyMenuOpen(false);
                    setOsMenuOpen(prev => !prev);
                  }}
                  title={`Operating system for ${activeProfile.name}: ${hostOsFullLabel(
                    activeHostOs
                  )}`}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer whitespace-nowrap"
                >
                  <span>{hostOsShortLabel(activeHostOs)}</span>
                  <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" />
                </button>
                <span
                  aria-hidden="true"
                  className="w-px h-3.5 bg-[var(--border-subtle)] mx-0.5"
                />
              </>
            )}

            <button
              type="button"
              onClick={() => startRename(activeProfile)}
              title={`Rename ${activeProfile.name}`}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer whitespace-nowrap"
            >
              <Pencil className="w-3 h-3 shrink-0" />
              <span className="hidden 2xl:inline">Rename</span>
            </button>

            <span
              aria-hidden="true"
              className="w-px h-3.5 bg-[var(--border-subtle)] mx-0.5"
            />

            <button
              type="button"
              onClick={() => {
                setOsMenuOpen(false);
                setCopyMenuOpen(prev => !prev);
              }}
              title={`Copy ${activeProfile.name} bindings to another profile`}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer whitespace-nowrap"
            >
              <Copy className="w-3 h-3 shrink-0" />
              <span className="hidden 2xl:inline">Copy</span>
            </button>

            {/* Per-Device OS Popover */}
            {osMenuOpen && activeIsHost && (
              <div className="absolute top-full left-0 mt-1.5 w-48 p-1.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] shadow-xl z-50 animate-popover-in">
                <div className="px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)]">
                  {activeProfile.name} OS
                </div>
                {(['mac', 'windows', 'linux'] as const).map(osOpt => {
                  const isCurrent = activeHostOs === osOpt;
                  return (
                    <button
                      key={osOpt}
                      type="button"
                      onClick={() => {
                        onSetHostOs(activeProfile.id as BleHostProfileId, osOpt);
                        setOsMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer whitespace-nowrap ${
                        isCurrent
                          ? 'bg-[rgba(var(--accent-rgb),0.14)] text-[var(--text-primary)] font-semibold'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]'
                      }`}
                    >
                      <span>{hostOsFullLabel(osOpt)}</span>
                      {isCurrent && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Copy Profile Popover */}
            {copyMenuOpen && (
              <div className="absolute top-full right-0 mt-1.5 w-52 p-1.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] shadow-xl z-50 animate-popover-in">
                <div className="px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)]">
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
                          <TargetIcon className="w-3.5 h-3.5 shrink-0 text-[var(--text-muted)]" />
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

      {/* Center: Widened Global Search Field */}
      {searchSlot && (
        <div className="hidden md:flex items-center min-w-[220px] flex-1 max-w-xl">
          {searchSlot}
        </div>
      )}

      {/* Right: Undo/Redo + Connection Action */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="hidden lg:flex items-center rounded-xl bg-[var(--bg-input)] p-0.5">
          <button
            type="button"
            disabled={!canUndo}
            onClick={onUndo}
            title="Undo (Ctrl+Z)"
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 cursor-pointer"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={onRedo}
            title="Redo (Ctrl+Shift+Z)"
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 cursor-pointer"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {(() => {
          const isDemo = connection.transport === 'demo';
          const isSaving = isSyncingUsb || syncStatus === 'Saving';
          const needsSave = dirty || syncStatus === 'Out of sync';
          const activeRev = connection.rev ?? currentRev;

          if (!connection.connected) {
            return (
              <button
                type="button"
                onClick={connection.connecting ? onOpenConnectModal : onConnectUsbPad}
                style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shadow-xs hover:opacity-95"
                title={
                  connection.connecting
                    ? 'Opening USB port & syncing profiles…'
                    : 'Connect MacroPad via USB'
                }
              >
                <Usb className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {connection.connecting
                    ? 'Connecting…'
                    : needsSave
                    ? 'Connect · Draft'
                    : 'Connect'}
                </span>
              </button>
            );
          }

          return (
            <button
              type="button"
              onClick={needsSave ? onSaveToDevice : onOpenConnectModal}
              style={
                needsSave
                  ? { backgroundColor: 'var(--accent)', color: '#FFFFFF' }
                  : undefined
              }
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                needsSave
                  ? 'shadow-xs hover:opacity-95'
                  : 'bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)]'
              }`}
              title={
                needsSave
                  ? `Push unsaved changes to ${connection.deviceName}`
                  : `${connection.deviceName} · ${connection.firmwareVersion} · rev ${activeRev}`
              }
            >
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  isSaving || needsSave
                    ? 'bg-amber-400'
                    : isDemo
                    ? 'bg-sky-400'
                    : 'bg-emerald-500'
                }`}
              />
              <span className="tabular-nums">
                {isSaving
                  ? `Saving · ${isDemo ? 'Demo' : 'USB'}`
                  : needsSave
                  ? `Save · ${isDemo ? 'Demo' : 'USB'}`
                  : isDemo
                  ? `Demo · ${connection.firmwareVersion}`
                  : 'Synced · USB'}
              </span>
            </button>
          );
        })()}
      </div>
    </header>
  );
};
