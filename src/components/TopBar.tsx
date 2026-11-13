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
  Usb,
  Laptop,
  Tv,
  MoreHorizontal,
  Search,
  Loader2,
  Circle,
  Wifi,
  Bluetooth,
  Cpu,
  PowerOff
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
  onSwitchBleHost: (slot: BleHostSlot) => Promise<void> | void;
  onDisconnect?: () => Promise<void> | void;
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
  onDisconnect,
  tvEnabled,
  searchSlot
}) => {
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [connPopoverOpen, setConnPopoverOpen] = useState(false);
  
  const menuRef = useRef<HTMLDivElement | null>(null);
  const connPopoverRef = useRef<HTMLDivElement | null>(null);

  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
  const isTvEnabled = tvEnabled ?? (connection.telemetry?.tvEnabled !== false);
  const hwActiveProfile = connection.telemetry?.activeProfile;
  const activeIsHost = isBleHostProfile(activeProfile.id);
  const activeHostOs: HostOsType = activeIsHost
    ? hostOsMap[activeProfile.id as BleHostProfileId]
    : 'mac';

  // Outside click for menus
  useEffect(() => {
    if (!menuOpen && !connPopoverOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      if (connPopoverRef.current && !connPopoverRef.current.contains(e.target as Node)) {
        setConnPopoverOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [menuOpen, connPopoverOpen]);

  // Alt+1/2/3 shortcuts to switch profiles
  useEffect(() => {
    const handleKeyShortcut = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= profiles.length) {
          const target = profiles[num - 1];
          if (target && !(target.id === 'TV' && !isTvEnabled)) {
            e.preventDefault();
            onSelectProfile(target.id);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyShortcut);
    return () => window.removeEventListener('keydown', handleKeyShortcut);
  }, [profiles, isTvEnabled, onSelectProfile]);

  const startRename = () => {
    setMenuOpen(false);
    setRenaming(true);
    setRenameDraft(activeProfile.name);
    setRenameError(null);
  };

  const commitRename = async () => {
    const check = validateFirmwareAlias(renameDraft);
    if (!check.valid) {
      setRenameError(check.error);
      return;
    }
    const ok = await onRenameProfile(activeProfile.id, renameDraft);
    if (ok !== false) {
      setRenaming(false);
      setRenameError(null);
    }
  };

  // Sync Status computation
  const isSaving = isSyncingUsb || syncStatus === 'Saving';
  const needsSave = dirty || syncStatus === 'Out of sync';
  const syncState: 'saved' | 'saving' | 'unsaved' | 'offline' = isSaving
    ? 'saving'
    : needsSave
    ? 'unsaved'
    : connection.connected
    ? 'saved'
    : 'offline';

  const SYNC_CONFIG = {
    saved: {
      icon: <Check size={14} className="shrink-0" />,
      text: 'Saved',
      cls: 'text-emerald-600 dark:text-emerald-400'
    },
    saving: {
      icon: <Loader2 size={14} className="shrink-0 animate-spin" />,
      text: 'Saving…',
      cls: 'text-[var(--text-muted)]'
    },
    unsaved: {
      icon: <Circle size={10} fill="currentColor" className="shrink-0" />,
      text: 'Unsaved',
      cls: 'text-[var(--accent)]'
    },
    offline: {
      icon: <Circle size={10} className="shrink-0" />,
      text: 'Offline',
      cls: 'text-[var(--text-muted)]'
    }
  };
  const sInfo = SYNC_CONFIG[syncState];

  // Connection State
  const connState: 'offline' | 'connecting' | 'connected' = connection.connecting
    ? 'connecting'
    : connection.connected
    ? 'connected'
    : 'offline';

  const DOT_COLOR = {
    offline: 'bg-zinc-400 dark:bg-zinc-500',
    connecting: 'bg-[var(--accent)] animate-pulse',
    connected: 'bg-emerald-500 dark:bg-emerald-400'
  };

  const connLabel = connection.connected
    ? connection.transport === 'demo'
      ? 'Demo mode'
      : connection.deviceName || 'USB connected'
    : 'Connect pad';

  const iconBtnStyle =
    'flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer';

  return (
    <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)] px-4 select-none shrink-0 shadow-xs">
      {/* Left: Brand + Device Tabs + Options Menu */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="flex items-center gap-2 pr-1 shrink-0">
          <img
            src={resolvedTheme === 'light' ? '/logo-mark-light.svg' : '/logo-mark-dark.svg'}
            alt="BertoPad"
            referrerPolicy="no-referrer"
            className="h-7 w-7 rounded-lg object-contain shrink-0"
          />
          <span className="hidden text-[15px] font-bold tracking-tight lg:inline whitespace-nowrap shrink-0">
            <span className="text-[var(--text-primary)]">Berto</span>
            <span className="text-[var(--accent)]">Pad</span>
          </span>
        </div>

        {/* Device Tabs */}
        <div
          role="tablist"
          aria-label="Devices"
          className="flex items-center gap-0.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] p-1 overflow-x-auto min-w-0"
        >
          {profiles.map(prof => {
            const isTvDisabled = prof.id === 'TV' && !isTvEnabled;
            if (isTvDisabled) return null;

            const selected = prof.id === activeProfile.id;
            const isLive = connection.connected && hwActiveProfile === prof.id;
            const isTv = prof.id === 'TV';
            const Icon = isTv ? Tv : Laptop;

            return (
              <button
                key={prof.id}
                role="tab"
                aria-selected={selected}
                type="button"
                onClick={() => onSelectProfile(prof.id)}
                title={`${prof.name} (${profileShortTag(prof.id)})${isLive ? ' — Active on hardware' : ''}`}
                className={`flex h-8 items-center gap-2 rounded-lg px-2.5 sm:px-3 text-xs sm:text-sm font-medium transition cursor-pointer whitespace-nowrap shrink-0 ${
                  selected
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-semibold shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-panel)]'
                }`}
              >
                <Icon
                  size={15}
                  className={`shrink-0 ${
                    selected ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                  }`}
                />
                <span className="max-w-[7rem] sm:max-w-[9rem] truncate">{prof.name}</span>
                {isLive && (
                  <span
                    aria-label="Live on hardware"
                    className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 shrink-0"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Device Options Menu Button (...) */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen(prev => !prev)}
            title={`Options for ${activeProfile.name}`}
            aria-label="Device options"
            className={iconBtnStyle}
          >
            <MoreHorizontal size={18} />
          </button>

          {menuOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-56 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-strong)] p-1.5 shadow-2xl z-50 animate-popover-in text-xs">
              <div className="px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-muted)] border-b border-[var(--border-subtle)] mb-1 truncate">
                {activeProfile.name}
              </div>

              <button
                type="button"
                onClick={startRename}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Pencil size={14} className="text-[var(--text-muted)]" /> Rename profile
                </span>
                <span className="font-mono text-[10px] text-[var(--text-muted)]">
                  {profileShortTag(activeProfile.id)}
                </span>
              </button>

              <div className="my-1 border-t border-[var(--border-subtle)]" />

              <div className="px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)]">
                Copy bindings to…
              </div>
              {profiles
                .filter(p => p.id !== activeProfile.id && !(p.id === 'TV' && !isTvEnabled))
                .map(target => (
                  <button
                    key={target.id}
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onRequestCopyProfile(activeProfile.id, target.id);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition cursor-pointer"
                  >
                    <span className="truncate">{target.name}</span>
                    <span className="font-mono text-[10px] text-[var(--text-muted)]">
                      {profileShortTag(target.id)}
                    </span>
                  </button>
                ))}

              {activeIsHost && (
                <>
                  <div className="my-1 border-t border-[var(--border-subtle)]" />
                  <div className="px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)]">
                    Host OS ({hostOsShortLabel(activeHostOs)})
                  </div>
                  {(['mac', 'windows', 'linux'] as const).map(osOpt => (
                    <button
                      key={osOpt}
                      type="button"
                      onClick={() => {
                        onSetHostOs(activeProfile.id as BleHostProfileId, osOpt);
                        setMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition cursor-pointer ${
                        activeHostOs === osOpt
                          ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-semibold'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]'
                      }`}
                    >
                      <span>{hostOsFullLabel(osOpt)}</span>
                      {activeHostOs === osOpt && <Check size={14} className="text-[var(--accent)]" />}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Inline Rename Input Popover if active */}
        {renaming && (
          <div className="absolute left-4 top-16 z-50 flex flex-col gap-1.5 rounded-xl bg-[var(--bg-panel)] border border-[var(--accent)] p-2.5 shadow-2xl animate-popover-in">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={renameDraft}
                maxLength={20}
                onChange={e => {
                  setRenameDraft(e.target.value);
                  setRenameError(validateFirmwareAlias(e.target.value).error);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') {
                    setRenaming(false);
                    setRenameError(null);
                  }
                }}
                autoFocus
                placeholder="Profile name (1–20 chars)"
                aria-label="Profile name"
                className="w-44 px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              />
              <button
                type="button"
                onClick={commitRename}
                aria-label="Save profile name"
                className="p-1.5 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] hover:opacity-90 cursor-pointer"
              >
                <Check size={14} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setRenaming(false);
                  setRenameError(null);
                }}
                aria-label="Cancel rename"
                className="p-1.5 rounded-lg bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
            {renameError && (
              <p className="text-[11px] text-[var(--accent)] max-w-[230px] leading-snug">
                {renameError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Center: Search / Global Action Search */}
      {searchSlot ? (
        <div className="mx-auto hidden md:flex items-center min-w-[200px] flex-1 max-w-md px-2">
          {searchSlot}
        </div>
      ) : (
        <div className="mx-auto hidden md:flex items-center flex-1 max-w-md px-2">
          <div className="flex h-9 w-full items-center gap-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm text-[var(--text-muted)] hover:border-[var(--border-strong)] transition cursor-pointer">
            <Search size={16} className="text-[var(--text-muted)]" />
            <span>Search actions &amp; macros</span>
            <kbd className="ml-auto rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-xs font-mono text-[var(--text-muted)]">
              {isMac ? '⌘K' : 'Ctrl K'}
            </kbd>
          </div>
        </div>
      )}

      {/* Right: Save Status Chip + Undo/Redo + Connection Pill / Popover */}
      <div className="flex items-center gap-1.5 shrink-0 ml-auto md:ml-0 relative" ref={connPopoverRef}>
        <span className={`mr-1 hidden items-center gap-1.5 text-xs font-medium sm:flex whitespace-nowrap ${sInfo.cls}`}>
          {sInfo.icon}
          <span>{sInfo.text}</span>
        </span>

        <button
          type="button"
          disabled={!canUndo}
          onClick={onUndo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
          className={iconBtnStyle}
        >
          <Undo2 size={18} />
        </button>

        <button
          type="button"
          disabled={!canRedo}
          onClick={onRedo}
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
          className={iconBtnStyle}
        >
          <Redo2 size={18} />
        </button>

        {connState === 'offline' ? (
          <button
            type="button"
            onClick={onConnectUsbPad}
            className="ml-2 flex h-9 items-center rounded-xl bg-[var(--accent)] px-4 text-xs sm:text-sm font-semibold text-[var(--accent-contrast)] hover:opacity-90 transition cursor-pointer whitespace-nowrap shadow-xs shrink-0"
          >
            Connect pad
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConnPopoverOpen(prev => !prev)}
            title="Open connection details"
            aria-label="Connection details"
            className="ml-2 flex h-9 items-center gap-2 rounded-xl bg-[var(--bg-input)] px-3 text-xs sm:text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition cursor-pointer whitespace-nowrap border border-[var(--border-subtle)] shrink-0"
          >
            <span className={`h-2 w-2 rounded-full ${DOT_COLOR[connState]}`} />
            <span className="font-medium truncate max-w-[120px]">{connLabel}</span>
          </button>
        )}

        {/* Connection Details Popover */}
        {connPopoverOpen && (
          <div className="absolute top-full right-0 mt-2 w-72 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-strong)] p-4 shadow-2xl z-50 animate-popover-in text-xs">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${DOT_COLOR[connState]}`} />
                <span className="font-semibold text-sm text-[var(--text-primary)]">
                  Connection Details
                </span>
              </div>
              <button
                type="button"
                onClick={() => setConnPopoverOpen(false)}
                aria-label="Close connection details"
                className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-2.5 text-[var(--text-secondary)]">
              <div className="flex items-center justify-between py-1 border-b border-[var(--border-subtle)]">
                <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
                  <Usb size={14} /> USB / Transport
                </span>
                <span className="font-mono text-[var(--text-primary)] font-medium">
                  {connection.transport === 'demo'
                    ? 'Demo Mode'
                    : connection.deviceName || 'WebSerial Connected'}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-[var(--border-subtle)]">
                <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
                  <Bluetooth size={14} /> Bluetooth (BLE)
                </span>
                <span className="font-mono text-[var(--text-primary)] font-medium tabular-nums">
                  {connection.telemetry?.bleActiveHost
                    ? `Host ${connection.telemetry.bleActiveHost} Active`
                    : 'Ready (3 Hosts)'}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-[var(--border-subtle)]">
                <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
                  <Wifi size={14} /> Wi-Fi Status
                </span>
                <span className="font-mono text-[var(--text-primary)] font-medium">
                  {connection.telemetry?.wifiConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>

              <div className="flex items-center justify-between py-1">
                <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
                  <Cpu size={14} /> Firmware Rev
                </span>
                <span className="font-mono text-[var(--text-primary)] font-medium tabular-nums">
                  v{connection.firmwareVersion || '4.10.1'} (Rev {connection.rev ?? currentRev})
                </span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setConnPopoverOpen(false);
                  onOpenConnectModal();
                }}
                className="flex-1 py-2 px-3 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-medium transition cursor-pointer text-center whitespace-nowrap"
              >
                Advanced settings
              </button>
              {onDisconnect && (
                <button
                  type="button"
                  onClick={async () => {
                    setConnPopoverOpen(false);
                    await onDisconnect();
                  }}
                  className="flex items-center gap-1.5 py-2 px-3 rounded-xl bg-red-500/12 hover:bg-red-500/20 text-red-600 dark:text-red-400 font-medium transition cursor-pointer whitespace-nowrap"
                >
                  <PowerOff size={14} /> Disconnect
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
