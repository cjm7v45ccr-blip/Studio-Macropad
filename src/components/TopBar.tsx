import React, { useState } from 'react';
import {
  DeviceConnectionInfo,
  HardwareProfileId,
  StudioProfile,
  SyncStatusPill
} from '../types/studio';
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
  Wifi
} from 'lucide-react';

interface TopBarProps {
  connection: DeviceConnectionInfo;
  syncStatus: SyncStatusPill;
  currentRev: number;
  dirty: boolean;
  isSyncingUsb: boolean;
  onOpenConnectModal: () => void;
  onPullFromUsb: () => void;
  profiles: [StudioProfile, StudioProfile];
  activeProfile: StudioProfile;
  onSelectProfile: (id: HardwareProfileId) => void;
  onRenameProfile: (id: HardwareProfileId, name: string) => void;
  onCopyProfile: (source: HardwareProfileId, target: HardwareProfileId) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSaveToDevice: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  connection,
  syncStatus,
  currentRev,
  dirty,
  isSyncingUsb,
  onOpenConnectModal,
  onPullFromUsb,
  profiles,
  activeProfile,
  onSelectProfile,
  onRenameProfile,
  onCopyProfile,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSaveToDevice
}) => {
  const [renamingId, setRenamingId] = useState<HardwareProfileId | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const startRename = (prof: StudioProfile) => {
    setRenamingId(prof.id);
    setRenameDraft(prof.name);
  };

  const commitRename = () => {
    if (renamingId && renameDraft.trim()) {
      onRenameProfile(renamingId, renameDraft.trim());
    }
    setRenamingId(null);
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
      text: 'Saving'
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
    <header className="h-14 shrink-0 bg-[var(--bg-panel)] border-b border-[var(--border-subtle)] px-4 flex items-center justify-between gap-3 select-none z-30">
      {/* Left: Brand + 4-State Sync Status Pill + Live Badges */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-sm shrink-0"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <Cpu className="w-4 h-4" />
          </div>
          <div className="leading-tight hidden sm:block">
            <div className="text-sm font-bold tracking-tight text-[var(--text-primary)]">
              Studio MacroPad
            </div>
            <div className="text-[10px] font-mono text-[var(--text-muted)]">
              ESP32 USB Link
            </div>
          </div>
        </div>

        <div className="h-5 w-px bg-[var(--border-subtle)] hidden md:block" />

        {/* 4-State Sync Status Pill: Synced | Saving | Out of sync | Disconnected */}
        <button
          type="button"
          onClick={onOpenConnectModal}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all cursor-pointer whitespace-nowrap hover:brightness-110 ${currentPill.badge}`}
          title={
            connection.connected
              ? `${connection.deviceName} (${connection.firmwareVersion}) · rev ${currentRev}`
              : 'Click to connect MacroPad over USB Serial'
          }
        >
          {syncStatus === 'Saving' || connection.connecting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          ) : (
            <span className={`w-2 h-2 rounded-full shrink-0 ${currentPill.dot}`} />
          )}
          <span>{currentPill.text}</span>
          {connection.connected && (
            <span className="font-mono text-[10px] opacity-75 hidden xl:inline">
              rev {currentRev}
            </span>
          )}
          {!connection.connected && !connection.connecting && (
            <Usb className="w-3 h-3 opacity-70 shrink-0" />
          )}
        </button>

        {/* Live BLE / Wi-Fi Event Badges when connected */}
        {connection.connected && connection.telemetry && (
          <div className="hidden lg:flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] font-mono text-[10px]">
            <span
              className={`flex items-center gap-1 ${
                connection.telemetry.bleConnected ? 'text-sky-400' : 'text-zinc-500'
              }`}
              title={
                connection.telemetry.bleConnected
                  ? 'Bluetooth Keyboard Connected'
                  : 'Bluetooth Disconnected'
              }
            >
              <Bluetooth className="w-3 h-3" />
              <span>BLE</span>
            </span>
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
            className="p-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingUsb ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {/* Center: Hardware MAC / TV Profile Selector (calls /api/profile/activate when connected) */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
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
                className={`flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-medium transition-all border cursor-pointer whitespace-nowrap ${
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
                <span>{prof.name}</span>
                <span className="font-mono text-[10px] opacity-65">({prof.id})</span>
                {isLiveOnPad && (
                  <span
                    className="px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono text-[9px] font-bold"
                    title="Active profile on physical MacroPad"
                  >
                    ACTIVE
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Inline Hardware Alias Rename (`mac_name` / `tv_name`) */}
        {renamingId ? (
          <div className="hidden md:flex items-center gap-1">
            <input
              type="text"
              value={renameDraft}
              maxLength={20}
              onChange={e => setRenameDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setRenamingId(null);
              }}
              autoFocus
              placeholder="1-20 chars"
              className="w-28 px-2 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--accent)] text-xs text-[var(--text-primary)] focus:outline-none"
            />
            <button
              type="button"
              onClick={commitRename}
              className="p-1 rounded-md text-emerald-400 hover:bg-[var(--bg-input)] cursor-pointer"
              title="Save name"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setRenamingId(null)}
              className="p-1 rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-input)] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="hidden lg:flex items-center gap-1">
            <button
              type="button"
              onClick={() => startRename(activeProfile)}
              title={`Rename ${activeProfile.id} profile alias`}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onCopyProfile(activeProfile.id, otherProfileId)}
              title={`Copy all 7 bindings from ${activeProfile.id} → ${otherProfileId}`}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Right: PWA + Undo/Redo + Connect / Push Action */}
      <div className="flex items-center gap-2 shrink-0">
        <PWAInstallButton />

        <div className="hidden sm:flex items-center rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] p-0.5">
          <button
            type="button"
            disabled={!canUndo}
            onClick={onUndo}
            title="Undo (Ctrl/Cmd + Z)"
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

        <button
          type="button"
          onClick={connection.connected ? onSaveToDevice : onOpenConnectModal}
          style={{
            backgroundColor: !connection.connected || dirty ? 'var(--accent)' : undefined,
            color: !connection.connected || dirty ? '#FFFFFF' : undefined
          }}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
            !connection.connected || dirty
              ? 'shadow-sm hover:opacity-90'
              : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
          }`}
          title={
            connection.connected
              ? 'Write all 7 slots per profile to MacroPad via /api/profile/save'
              : 'Connect MacroPad over USB Serial'
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
              <span>Connect Pad</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
