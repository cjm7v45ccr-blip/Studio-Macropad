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
    saved: { icon: <Check size={14} className="shrink-0" />, text: 'Saved', cls: 'text-emerald-400' },
    saving: { icon: <Loader2 size={14} className="shrink-0 animate-spin" />, text: 'Saving…', cls: 'text-zinc-400' },
    unsaved: { icon: <Circle size={10} fill="currentColor" className="shrink-0" />, text: 'Unsaved', cls: 'text-amber-400' },
    offline: { icon: <Circle size={10} className="shrink-0" />, text: 'Offline', cls: 'text-zinc-500' }
  };
  const sInfo = SYNC_CONFIG[syncState];

  // Connection State
  const connState: 'offline' | 'connecting' | 'connected' = connection.connecting
    ? 'connecting'
    : connection.connected
    ? 'connected'
    : 'offline';
  
  const DOT_COLOR = {
    offline: 'bg-zinc-500',
    connecting: 'bg-amber-400 animate-pulse',
    connected: 'bg-emerald-400'
  };

  const connLabel = connection.connected
    ? connection.transport === 'demo'
      ? 'Demo mode'
      : connection.deviceName || 'USB connected'
    : 'Connect pad';

  const iconBtnStyle = "flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-30 transition cursor-pointer";

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
          <span className="hidden text-[15px] font-bold tracking-tight lg:inline">
            <span className="text-[var(--text-primary)]">Berto</span>
            <span className="text-amber-400">Pad</span>
          </span>
        </div>

        {/* Device Tabs */}
        <div role="tablist" aria-label="Devices" className="flex items-center gap-0.5 rounded-xl bg-white/5 p-1 overflow-x-auto min-w-0">
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
                    ? 'bg-white/10 text-white font-semibold shadow-2xs'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon size={15} className={`shrink-0 ${selected ? 'text-amber-400' : 'text-zinc-500'}`} />
                <span className="max-w-[7rem] sm:max-w-[9rem] truncate">{prof.name}</span>
                {isLive && (
                  <span aria-label="Live on hardware" className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
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
            <div className="absolute top-full left-0 mt-1.5 w-56 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-1.5 shadow-2xl z-50 animate-popover-in text-xs">
              <div className="px-2.5 py-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider border-b border-white/5 mb-1">
                {activeProfile.name}
              </div>

              <button
                type="button"
                onClick={startRename}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-zinc-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <span className="flex items-center gap-2"><Pencil size={14} className="text-zinc-400" /> Rename profile</span>
                <span className="font-mono text-[10px] text-zinc-500">{profileShortTag(activeProfile.id)}</span>
              </button>

              <div className="my-1 border-t border-white/5" />

              <div className="px-2.5 py-1 text-[11px] font-medium text-zinc-400">Copy bindings to…</div>
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
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
                  >
                    <span className="truncate">{target.name}</span>
                    <span className="font-mono text-[10px] text-zinc-500">{profileShortTag(target.id)}</span>
                  </button>
                ))}

              {activeIsHost && (
                <>
                  <div className="my-1 border-t border-white/5" />
                  <div className="px-2.5 py-1 text-[11px] font-medium text-zinc-400">Host OS</div>
                  {(['mac', 'windows', 'linux'] as const).map(osOpt => (
                    <button
                      key={osOpt}
                      type="button"
                      onClick={() => {
                        onSetHostOs(activeProfile.id as BleHostProfileId, osOpt);
                        setMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition cursor-pointer ${
                        activeHostOs === osOpt ? 'bg-amber-400/15 text-amber-300 font-semibold' : 'text-zinc-300 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <span>{hostOsFullLabel(osOpt)}</span>
                      {activeHostOs === osOpt && <Check size={14} className="text-amber-400" />}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Inline Rename Input Modal / Popover if active */}
        {renaming && (
          <div className="absolute left-4 top-16 z-50 flex items-center gap-1.5 rounded-xl bg-[var(--bg-elevated)] border border-amber-400/50 p-2 shadow-xl">
            <input
              type="text"
              value={renameDraft}
              onChange={e => {
                setRenameDraft(e.target.value);
                setRenameError(validateFirmwareAlias(e.target.value).error);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setRenaming(false);
              }}
              autoFocus
              placeholder="Profile name (1-20 chars)"
              className="w-40 px-2 py-1 rounded-lg bg-black/40 border border-white/10 text-xs text-white focus:outline-none"
            />
            <button
              type="button"
              onClick={commitRename}
              className="p-1.5 rounded-lg bg-amber-400 text-black hover:bg-amber-300 cursor-pointer"
            >
              <Check size={14} />
            </button>
            <button
              type="button"
              onClick={() => setRenaming(false)}
              className="p-1.5 rounded-lg bg-white/10 text-zinc-300 hover:text-white cursor-pointer"
            >
              <X size={14} />
            </button>
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
          <div className="flex h-9 w-full items-center gap-2 rounded-xl bg-white/5 px-3 text-sm text-zinc-400 hover:bg-white/10 transition cursor-pointer">
            <Search size={16} className="text-zinc-500" />
            <span>Search actions & macros</span>
            <kbd className="ml-auto rounded bg-white/10 px-1.5 py-0.5 text-xs font-mono text-zinc-400">
              {isMac ? '⌘K' : 'Ctrl K'}
            </kbd>
          </div>
        </div>
      )}

      {/* Right: Save Status Chip + Undo/Redo + Connection Pill / Popover */}
      <div className="flex items-center gap-1.5 shrink-0 ml-auto md:ml-0 relative" ref={connPopoverRef}>
        <span className={`mr-1 hidden items-center gap-1.5 text-xs font-medium sm:flex ${sInfo.cls}`}>
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
            className="ml-2 flex h-9 items-center rounded-xl bg-amber-400 px-4 text-xs sm:text-sm font-semibold text-black hover:bg-amber-300 transition cursor-pointer whitespace-nowrap shadow-xs"
          >
            Connect pad
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConnPopoverOpen(prev => !prev)}
            title="Open connection details"
            aria-label="Connection details"
            className="ml-2 flex h-9 items-center gap-2 rounded-xl bg-white/5 px-3 text-xs sm:text-sm text-zinc-200 hover:bg-white/10 transition cursor-pointer whitespace-nowrap border border-white/5"
          >
            <span className={`h-2 w-2 rounded-full ${DOT_COLOR[connState]}`} />
            <span className="font-medium truncate max-w-[120px]">{connLabel}</span>
          </button>
        )}

        {/* Connection Details Popover */}
        {connPopoverOpen && (
          <div className="absolute top-full right-0 mt-2 w-72 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-strong)] p-4 shadow-2xl z-50 animate-popover-in text-xs">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${DOT_COLOR[connState]}`} />
                <span className="font-semibold text-sm text-white">Connection Details</span>
              </div>
              <button
                type="button"
                onClick={() => setConnPopoverOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-2.5 text-zinc-300">
              <div className="flex items-center justify-between py-1 border-b border-white/5">
                <span className="flex items-center gap-1.5 text-zinc-400"><Usb size={14} /> USB / Transport</span>
                <span className="font-mono text-white font-medium">{connection.transport === 'demo' ? 'Demo Mode' : (connection.deviceName || 'WebSerial Connected')}</span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-white/5">
                <span className="flex items-center gap-1.5 text-zinc-400"><Bluetooth size={14} /> Bluetooth (BLE)</span>
                <span className="font-mono text-white font-medium">{connection.telemetry?.bleActiveHost ? `Host ${connection.telemetry.bleActiveHost} Active` : 'Ready (3 Hosts)'}</span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-white/5">
                <span className="flex items-center gap-1.5 text-zinc-400"><Wifi size={14} /> Wi-Fi Status</span>
                <span className="font-mono text-white font-medium">{connection.telemetry?.wifiConnected ? 'Connected' : 'Disconnected'}</span>
              </div>

              <div className="flex items-center justify-between py-1">
                <span className="flex items-center gap-1.5 text-zinc-400"><Cpu size={14} /> Firmware Rev</span>
                <span className="font-mono text-white font-medium">v{connection.firmwareVersion || '4.7.1'} (Rev {connection.rev ?? currentRev})</span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setConnPopoverOpen(false);
                  onOpenConnectModal();
                }}
                className="flex-1 py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-200 font-medium transition cursor-pointer text-center"
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
                  className="flex items-center gap-1.5 py-2 px-3 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 font-medium transition cursor-pointer"
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
