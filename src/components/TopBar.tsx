import React, { useState } from 'react';
import {
  DeviceConnectionInfo,
  HardwareProfileId,
  StudioProfile
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
  Zap
} from 'lucide-react';

interface TopBarProps {
  connection: DeviceConnectionInfo;
  isSyncedWithHardware: boolean;
  isSyncingUsb: boolean;
  autoSyncOnEdit: boolean;
  onToggleAutoSync: () => void;
  onOpenConnectModal: () => void;
  onPullFromUsb: () => void;
  profiles: [StudioProfile, StudioProfile];
  activeProfile: StudioProfile;
  onSelectProfile: (id: HardwareProfileId) => void;
  onRenameProfile: (id: HardwareProfileId, name: string) => void;
  onCopyProfile: (source: HardwareProfileId, target: HardwareProfileId) => void;
  hasUnsavedChanges: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSaveToDevice: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  connection,
  isSyncedWithHardware,
  isSyncingUsb,
  autoSyncOnEdit,
  onToggleAutoSync,
  onOpenConnectModal,
  onPullFromUsb,
  profiles,
  activeProfile,
  onSelectProfile,
  onRenameProfile,
  onCopyProfile,
  hasUnsavedChanges,
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

  return (
    <header className="h-14 shrink-0 bg-[var(--bg-panel)] border-b border-[var(--border-subtle)] px-4 flex items-center justify-between gap-3 select-none z-30">
      {/* Left: Brand + USB Serial Status + Pull Sync */}
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
              ESP32 USB Sync Studio
            </div>
          </div>
        </div>

        <div className="h-5 w-px bg-[var(--border-subtle)] hidden md:block" />

        {/* Live USB Connection Button */}
        <button
          type="button"
          onClick={onOpenConnectModal}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] transition-colors cursor-pointer whitespace-nowrap"
          title="Connect or inspect MacroPad USB Serial link"
        >
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              connection.connected
                ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.75)]'
                : 'bg-amber-500'
            }`}
          />
          <Usb className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
          <span className="text-xs font-medium text-[var(--text-primary)]">
            {connection.connected ? 'USB Synced' : 'Connect USB'}
          </span>
          {connection.connected && (
            <span className="text-[11px] font-mono text-[var(--text-muted)] hidden xl:inline">
              {connection.firmwareVersion}
            </span>
          )}
        </button>

        {connection.connected && (
          <button
            type="button"
            onClick={onPullFromUsb}
            disabled={isSyncingUsb}
            title="Pull latest macros & active profile from MacroPad over USB"
            className="p-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingUsb ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {/* Center: Hardware MAC / TV Profile Selector + Rename + Copy */}
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
                    title="Currently active profile on physical MacroPad"
                  >
                    ON PAD
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
              title="Save name to MacroPad"
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
              title={`Rename ${activeProfile.id} profile alias (max 20 chars)`}
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

      {/* Right: Auto-Sync + Undo/Redo + Sync to Device */}
      <div className="flex items-center gap-2 shrink-0">
        <PWAInstallButton />

        <button
          type="button"
          onClick={onToggleAutoSync}
          title="When enabled, every key or dial edit immediately writes over USB Serial to your MacroPad"
          className={`hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
            autoSyncOnEdit
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--text-muted)]'
          }`}
        >
          <Zap className="w-3 h-3" />
          <span>Instant Sync: {autoSyncOnEdit ? 'ON' : 'OFF'}</span>
        </button>

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
          onClick={onSaveToDevice}
          style={{
            backgroundColor: hasUnsavedChanges ? 'var(--accent)' : undefined,
            color: hasUnsavedChanges ? '#FFFFFF' : undefined
          }}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
            hasUnsavedChanges
              ? 'shadow-sm hover:opacity-90'
              : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
          }`}
          title={
            connection.connected
              ? 'Push all MAC & TV slots and names to ESP32 NVS storage over USB'
              : 'Connect MacroPad over USB to sync'
          }
        >
          <Save className="w-3.5 h-3.5 shrink-0" />
          <span>
            {connection.connected
              ? hasUnsavedChanges
                ? 'Sync to Pad'
                : isSyncedWithHardware
                ? 'All Synced'
                : 'Sync Pad'
              : 'Sync USB'}
          </span>
          {hasUnsavedChanges && (
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          )}
        </button>
      </div>
    </header>
  );
};
