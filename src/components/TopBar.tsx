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
  ChevronDown,
  Save,
  LoaderCircle
} from 'lucide-react';

interface TopBarProps {
  connection: DeviceConnectionInfo;
  resolvedTheme?: 'light' | 'dark';
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
  resolvedTheme = 'dark',
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
    <header className="shrink-0 bg-[var(--bg-panel)] border-b border-[var(--border-subtle)] px-3.5 py-2 flex flex-wrap items-center justify-between gap-2.5 select-none z-40">
      {/* Left: Brand + Profile Tabs + Grouped Profile Actions */}
      <div className="flex items-center gap-3 min-w-0 w-full xl:w-auto xl:flex-1">
        <div className="flex items-center gap-2 shrink-0">
          <img
            src={resolvedTheme === 'light' ? '/logo-mark-light.svg' : '/logo-mark-dark.svg'}
            alt="BertoPad"
            referrerPolicy="no-referrer"
            className={`w-7 h-7 rounded-lg object-contain shrink-0 ${
              connection.connecting || isSyncingUsb || syncStatus === 'Saving'
                ? 'animate-[spin_3s_linear_infinite]'
                : ''
            }`}
          />
          <span className="text-sm font-bold tracking-tight hidden xl:inline whitespace-nowrap">
            <span className="text-[var(--text-primary)]">Berto</span>
            <span className="text-[var(--accent)]">Pad</span>
          </span>
        </div>

        {/* Profile / Host Switcher (Single-Accent Filled Segmented Control) */}
        <div className="flex items-center gap-0.5 p-1 rounded-xl bg-[var(--bg-input)] overflow-x-auto min-w-0">
          {profiles.map(prof => {
            const isTvDisabledTab = prof.id === 'TV' && !isTvEnabled;
            const selected = !isTvDisabledTab && prof.id === activeProfile.id;
            const isLiveOnPad =
              !isTvDisabledTab && connection.connected && hwActiveProfile === prof.id;
            const Icon = isBleHostProfile(prof.id) ? Laptop : Tv;
            const shortTag = profileShortTag(prof.id);
            const profOsLabel = isBleHostProfile(prof.id)
              ? ` · ${hostOsShortLabel(hostOsMap[prof.id])}`
              : '';
            const tabLabel = isTvDisabledTab
              ? prof.name.trim().toUpperCase() === 'TV'
                ? 'TV (off)'
                : `${prof.name} (off)`
              : prof.name;

            return (
              <button
                key={prof.id}
                type="button"
                aria-disabled={isTvDisabledTab || undefined}
                onClick={() => onSelectProfile(prof.id)}
                title={
                  isTvDisabledTab
                    ? `${tabLabel} — TV mode is off in Settings`
                    : `${prof.name} (${shortTag}${profOsLabel})${
                        isLiveOnPad ? ' — Active on hardware' : ''
                      }`
                }
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all whitespace-nowrap shrink-0 min-w-0 ${
                  isTvDisabledTab
                    ? 'text-[var(--text-muted)] opacity-60 hover:opacity-80 font-medium cursor-not-allowed'
                    : selected
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-2xs font-semibold cursor-pointer'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium cursor-pointer'
                }`}
              >
                <Icon
                  className={`w-3.5 h-3.5 shrink-0 ${
                    selected ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                  }`}
                />
                <span className="truncate max-w-[96px] sm:max-w-[128px] tabular-nums">
                  {tabLabel}
                </span>
                {isLiveOnPad && (
                  <span className="text-[10px] text-[var(--accent)] font-medium shrink-0">
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
                renameError ? 'border-[var(--border-strong)]' : 'border-[var(--accent)]'
              }`}
            />
            <button
              type="button"
              onClick={commitRename}
              title="Save name"
              className="p-1.5 rounded-md text-[var(--accent)] hover:bg-[var(--bg-input)] cursor-pointer"
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
                    const targetLabel =
                      target.id === 'TV' && !isTvEnabled
                        ? target.name.trim().toUpperCase() === 'TV'
                          ? 'TV (off)'
                          : `${target.name} (off)`
                        : target.name;
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
                          <span className="truncate font-medium">{targetLabel}</span>
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
        <div className="hidden md:flex items-center min-w-[160px] flex-1 max-w-xl">
          {searchSlot}
        </div>
      )}

      {/* Right: Undo/Redo + Connection Action */}
      <div className="flex items-center justify-between sm:justify-end flex-wrap sm:flex-nowrap gap-2 shrink-0 w-full md:w-auto">
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
          const saveLabel = isDemo ? 'Save to demo' : 'Save to device';
          const status = isSaving
            ? (isSyncingUsb ? 'Syncing…' : 'Saving…')
            : needsSave
            ? 'Unsaved changes'
            : connection.connected
            ? (isDemo ? 'Saved to demo' : 'Saved to device')
            : 'Offline workspace';

          return (
            <>
              <button
                type="button"
                onClick={connection.connected || connection.connecting ? onOpenConnectModal : onConnectUsbPad}
                aria-label={connection.connected ? `${isDemo ? 'Demo mode' : 'USB connected'} — connection details` : 'Connect BertoPad via USB'}
                title={connection.connected
                  ? `${connection.deviceName} · ${connection.firmwareVersion} · rev ${connection.rev ?? currentRev}. Open connection details.`
                  : 'Connect BertoPad via USB'}
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-xs font-medium text-[var(--text-primary)] whitespace-nowrap cursor-pointer"
              >
                {connection.connecting ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Usb className="w-3.5 h-3.5" />}
                {connection.connecting ? 'Connecting…' : connection.connected ? (isDemo ? 'Demo mode' : 'USB connected') : 'Connect USB'}
              </button>
              <div role="status" aria-live="polite" className="order-last sm:order-none w-full sm:w-auto sm:flex-1 xl:flex-none min-w-0 flex sm:block items-center justify-between gap-2 text-left sm:text-right text-[10px] sm:text-[11px] leading-tight">
                <p className={needsSave ? 'text-[var(--accent)] font-semibold' : 'text-[var(--text-primary)]'}>{status}</p>
                <p className="text-[var(--text-muted)] sm:mt-1">
                  {connection.connected ? (isDemo ? 'No physical device' : 'Edits auto-save') : 'Not saved to a device'}
                </p>
              </div>
              <button
                type="button"
                onClick={onSaveToDevice}
                disabled={!connection.connected || connection.connecting || isSaving || !needsSave}
                title={!connection.connected
                  ? 'Connect USB first to save your draft to a device'
                  : isSaving ? 'Wait for the current sync to finish'
                  : !needsSave ? 'All profile changes are already saved; connected edits auto-save'
                  : `Save all draft profiles to ${isDemo ? 'the demo device' : connection.deviceName}`}
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shadow-xs hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSaving ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {saveLabel}
              </button>
            </>
          );
        })()}
      </div>
    </header>
  );
};
