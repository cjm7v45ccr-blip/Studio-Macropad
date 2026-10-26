import React, { useState } from 'react';
import {
  BleHostSlot,
  DeviceConnectionInfo,
  HardwareProfileId,
  StudioProfile,
  SyncStatusPill
} from '../types/studio';
import { validateFirmwareAlias } from '../data/firmwareCatalog';
import { PWAInstallButton } from './PWAInstallButton';
import {
  Undo2,
  Redo2,
  Save,
  Copy,
  Pencil,
  Check,
  X,
  Cpu,
  Usb,
  RefreshCw,
  Laptop,
  Tv,
  Loader2,
  Bluetooth,
  Wifi,
  PlayCircle
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
  profiles: [StudioProfile, StudioProfile];
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
  searchSlot
}) => {
  const [renamingId, setRenamingId] = useState<HardwareProfileId | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);

  const startRename = (prof: StudioProfile) => {
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
  const otherProfileId: HardwareProfileId = activeProfile.id === 'MAC' ? 'TV' : 'MAC';

  const pillStyles: Record<
    SyncStatusPill,
    { dot: string; badge: string; text: string }
  > = {
    Synced: {
      dot: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.75)]',
      badge: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
      text: 'Synced'
    },
    Saving: {
      dot: 'bg-sky-400',
      badge: 'bg-sky-500/10 border-sky-500/30 text-sky-300',
      text: 'Saving…'
    },
    'Out of sync': {
      dot: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]',
      badge: 'bg-amber-500/12 border-amber-500/35 text-amber-300',
      text: 'Out of sync'
    },
    Disconnected: {
      dot: 'bg-zinc-500',
      badge: 'bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--text-secondary)]',
      text: connection.connecting ? 'Connecting…' : 'Disconnected'
    }
  };

  const currentPill = pillStyles[syncStatus];

  return (
    <header className="shrink-0 bg-[var(--bg-panel)] border-b border-[var(--border-subtle)] px-2.5 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2 select-none z-40">
      {/* Left: Brand + 4-State Sync Status Pill + Live Badges */}
      <div className="flex items-center gap-2 min-w-0 order-1">
        <div className="flex items-center gap-2 shrink-0">
          <div
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-white shadow-sm shrink-0"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <Cpu className="w-4 h-4" />
          </div>
          <div className="leading-tight hidden md:block">
            <div className="text-sm font-bold tracking-tight text-[var(--text-primary)] whitespace-nowrap">
              Studio MacroPad
            </div>
            <div className="text-[10px] font-mono text-[var(--text-muted)] whitespace-nowrap">
              {connection.transport === 'demo' ? 'Demo Mode · v3.2-PRO' : 'ESP32 USB Link'}
            </div>
          </div>
        </div>

        {/* 4-State Sync Status Pill: Synced | Saving… | Out of sync | Disconnected */}
        <button
          type="button"
          onClick={onOpenConnectModal}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] sm:text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 hover:brightness-110 ${currentPill.badge}`}
          title={
            connection.connected
              ? `${connection.deviceName} (${connection.firmwareVersion}) · rev ${currentRev}`
              : 'Open USB connection status & options'
          }
        >
          {syncStatus === 'Saving' || connection.connecting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          ) : (
            <span className={`w-2 h-2 rounded-full shrink-0 ${currentPill.dot}`} />
          )}
          <span>{currentPill.text}</span>
          {connection.transport === 'demo' && connection.connected && (
            <span className="font-mono text-[9px] uppercase px-1 rounded bg-sky-500/20 text-sky-300">
              Demo
            </span>
          )}
          {connection.connected && (
            <span className="font-mono text-[10px] opacity-75 tabular-nums hidden xl:inline">
              rev {currentRev}
            </span>
          )}
        </button>

        {/* Live Multi-Host BLE & Wi-Fi Badges when connected */}
        {connection.connected && connection.telemetry && (
          <div className="hidden xl:flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] font-mono text-[10px] shrink-0">
            <span
              className={`flex items-center gap-1 ${
                connection.telemetry.bleConnected ? 'text-sky-400' : 'text-zinc-500'
              }`}
              title={
                connection.telemetry.bleConnected
                  ? `Bluetooth Connected · ${connection.telemetry.bleDeviceName}`
                  : `Bluetooth Disconnected · ${connection.telemetry.bleDeviceName}`
              }
            >
              <Bluetooth className="w-3 h-3" />
              <span>BLE</span>
            </span>
            <div
              role="group"
              aria-label="Switch Bluetooth host"
              className="flex items-center gap-0.5 pl-0.5"
            >
              {([1, 2, 3] as const).map(slot => {
                const isActiveHost = connection.telemetry?.bleActiveHost === slot;
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => onSwitchBleHost(slot)}
                    title={`Switch to Host ${slot} (Studio Pad ${slot})`}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-colors cursor-pointer tabular-nums whitespace-nowrap ${
                      isActiveHost
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent'
                    }`}
                  >
                    H{slot}
                  </button>
                );
              })}
            </div>
            <span className="text-zinc-700">·</span>
            <span
              className={`flex items-center gap-1 ${
                connection.telemetry.wifiConnected ? 'text-emerald-400' : 'text-zinc-500'
              }`}
              title={
                connection.telemetry.wifiConnected
                  ? `Wi-Fi Connected (${connection.telemetry.ip || connection.telemetry.ssid})`
                  : 'Wi-Fi Disconnected'
              }
            >
              <Wifi className="w-3 h-3" />
              <span>WIFI</span>
            </span>
          </div>
        )}

        {connection.connected && (
          <button
            type="button"
            onClick={onPullFromUsb}
            disabled={isSyncingUsb}
            title="Read latest /api/status from MacroPad"
            className="hidden sm:inline-flex p-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 transition-colors cursor-pointer shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingUsb ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {/* Center: Hardware MAC / TV Profile Selector + "Active on pad" badge */}
      <div className="flex items-center gap-1.5 min-w-0 order-3 lg:order-2 w-full sm:w-auto justify-between sm:justify-center">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] min-w-0 flex-1 sm:flex-initial">
          {profiles.map(prof => {
            const selected = prof.id === activeProfile.id;
            const isLiveOnPad = connection.connected && hwActiveProfile === prof.id;
            const Icon = prof.id === 'MAC' ? Laptop : Tv;

            return (
              <button
                key={prof.id}
                type="button"
                onClick={() => onSelectProfile(prof.id)}
                style={
                  selected
                    ? {
                        backgroundColor: 'var(--bg-elevated)',
                        borderColor: prof.id === 'MAC' ? '#3B82F6' : '#10B981'
                      }
                    : undefined
                }
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border cursor-pointer whitespace-nowrap min-w-0 ${
                  selected
                    ? 'text-[var(--text-primary)] shadow-sm'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                <Icon
                  className="w-3.5 h-3.5 shrink-0"
                  style={{
                    color: selected
                      ? prof.id === 'MAC'
                        ? '#3B82F6'
                        : '#10B981'
                      : undefined
                  }}
                />
                <span className="truncate max-w-[84px] sm:max-w-[110px]">{prof.name}</span>
                <span className="font-mono text-[10px] opacity-65 hidden md:inline">
                  ({prof.id})
                </span>
                {isLiveOnPad && (
                  <span
                    className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono text-[9px] font-bold shrink-0"
                    title="Real active profile on the physical pad"
                  >
                    Active on pad
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Inline Hardware Alias Rename (`mac_name` / `tv_name`) with live >20 / symbol validation */}
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
              aria-label={`Rename ${renamingId} profile`}
              placeholder="1–20 chars"
              className={`w-28 sm:w-36 px-2 py-1 rounded-lg bg-[var(--bg-input)] border text-xs text-[var(--text-primary)] focus:outline-none ${
                renameError ? 'border-rose-500' : 'border-[var(--accent)]'
              }`}
            />
            <button
              type="button"
              onClick={commitRename}
              className="p-1 rounded-md text-emerald-400 hover:bg-[var(--bg-input)] cursor-pointer shrink-0"
              title="Save profile name"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setRenamingId(null);
                setRenameError(null);
              }}
              className="p-1 rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-input)] cursor-pointer shrink-0"
              title="Cancel rename"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            {renameError && (
              <div className="absolute top-full right-0 mt-1.5 w-60 p-2 rounded-lg bg-[var(--bg-elevated)] border border-rose-500/40 text-[11px] text-rose-300 shadow-xl z-50">
                {renameError}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => startRename(activeProfile)}
              title={`Rename ${activeProfile.id} profile (1–20 letters, numbers, spaces, - or _)`}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onRequestCopyProfile(activeProfile.id, otherProfileId)}
              title={`Copy ${activeProfile.id} → ${otherProfileId} (preview diff)`}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Site-Wide Macro Search Bar */}
      {searchSlot && (
        <div className="flex items-center min-w-0 order-4 lg:order-3 w-full sm:flex-1 lg:flex-initial lg:w-auto">
          {searchSlot}
        </div>
      )}

      {/* Right: PWA + Undo/Redo + Connect USB pad / Try demo / Push Action */}
      <div className="flex items-center gap-1.5 shrink-0 order-2 lg:order-4">
        <div className="hidden xl:block">
          <PWAInstallButton />
        </div>

        <div className="hidden md:flex items-center rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] p-0.5">
          <button
            type="button"
            disabled={!canUndo}
            onClick={onUndo}
            title="Undo last workspace change (Ctrl/Cmd + Z)"
            className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={onRedo}
            title="Redo (Ctrl/Cmd + Shift + Z)"
            className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {!connection.connected && (
          <button
            type="button"
            onClick={onStartDemoMode}
            className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <PlayCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Try demo mode</span>
          </button>
        )}

        <button
          type="button"
          onClick={connection.connected ? onSaveToDevice : onConnectUsbPad}
          style={{
            backgroundColor: !connection.connected || dirty ? 'var(--accent)' : undefined,
            color: !connection.connected || dirty ? '#FFFFFF' : undefined
          }}
          className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
            !connection.connected || dirty
              ? 'shadow-sm hover:opacity-90'
              : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
          }`}
          title={
            connection.connected
              ? 'Write all 11 slots per profile to MacroPad via /api/profile/save'
              : 'Open browser port picker and connect USB pad'
          }
        >
          {connection.connected ? (
            <>
              <Save className="w-3.5 h-3.5 shrink-0" />
              <span>{dirty ? 'Push Drafts' : 'Push All'}</span>
            </>
          ) : (
            <>
              <Usb className="w-3.5 h-3.5 shrink-0" />
              <span>Connect USB pad</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
