import React, { useRef, useState } from 'react';
import {
  HardwareBackupPayload,
  HardwareProfileId,
  StudioProfile,
  UserPreset
} from '../types/studio';
import { describeFirmwareAction } from '../data/firmwareCatalog';
import {
  Download,
  Upload,
  BookmarkPlus,
  Trash2,
  Copy,
  RefreshCw,
  HardDrive,
  ArrowRight
} from 'lucide-react';

interface LibraryViewProps {
  profiles: [StudioProfile, StudioProfile];
  userPresets: UserPreset[];
  isConnected: boolean;
  isSyncedWithHardware: boolean;
  onPullFromUsb: () => void;
  onPushAllToUsb: () => void;
  onCopyHardwareProfile: (source: HardwareProfileId, target: HardwareProfileId) => void;
  onSaveUserSnapshot: (name: string) => void;
  onDeleteUserSnapshot: (id: string) => void;
  onApplyHardwareBackup: (backup: HardwareBackupPayload) => void;
  onExportBackupFile: () => void;
  onImportBackupFile: (file: File) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  userPresets,
  isConnected,
  isSyncedWithHardware,
  onPullFromUsb,
  onPushAllToUsb,
  onCopyHardwareProfile,
  onSaveUserSnapshot,
  onDeleteUserSnapshot,
  onApplyHardwareBackup,
  onExportBackupFile,
  onImportBackupFile
}) => {
  const [snapshotName, setSnapshotName] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  const handleSaveSnapshot = () => {
    onSaveUserSnapshot(snapshotName);
    setSnapshotName('');
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header + Hardware Backup Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-[var(--text-primary)]">
              Hardware Configuration & Backups
            </h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Export/import native `studio-pad-config` NVS backups over USB, clone profiles, or save personal snapshots.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isConnected && (
              <button
                type="button"
                onClick={onPullFromUsb}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Pull from USB</span>
              </button>
            )}

            <button
              type="button"
              onClick={onExportBackupFile}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export `studio-pad-backup.json`</span>
            </button>

            <button
              type="button"
              onClick={() => importRef.current?.click()}
              style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import & Sync JSON</span>
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) onImportBackupFile(file);
                e.target.value = '';
              }}
              className="hidden"
            />
          </div>
        </div>

        {/* Hardware Profile Operations (`MAC` <-> `TV`) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex flex-col justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
                <HardDrive className="w-4 h-4 text-[var(--accent)]" />
                <span>Full Bi-Directional Sync</span>
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                {isConnected
                  ? 'USB Serial link is active. Push all 14 slots and aliases to ESP32 flash or re-read current NVS state.'
                  : 'Connect your MacroPad via USB cable to read or write NVS flash memory.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!isConnected}
                onClick={onPullFromUsb}
                className="flex-1 py-2 px-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-40 cursor-pointer"
              >
                Read from Pad
              </button>
              <button
                type="button"
                disabled={!isConnected}
                onClick={onPushAllToUsb}
                style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
                className="flex-1 py-2 px-3 rounded-xl text-xs font-semibold disabled:opacity-40 hover:opacity-90 cursor-pointer"
              >
                Write to Pad
              </button>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex flex-col justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
                <Copy className="w-4 h-4 text-sky-400" />
                <span>Clone MAC → TV Profile</span>
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Copies all 7 `MAC` bindings (`b1`–`b4`, `dial`, `enc_cw`, `enc_ccw`) onto the `TV` hardware profile via `/api/profile/copy`.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onCopyHardwareProfile('MAC', 'TV')}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer"
            >
              <span>MAC</span>
              <ArrowRight className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>TV</span>
            </button>
          </div>

          <div className="p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex flex-col justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
                <Copy className="w-4 h-4 text-emerald-400" />
                <span>Clone TV → MAC Profile</span>
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Copies all 7 `TV` bindings (`b1`–`b4`, `dial`, `enc_cw`, `enc_ccw`) onto the `MAC` hardware profile via `/api/profile/copy`.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onCopyHardwareProfile('TV', 'MAC')}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer"
            >
              <span>TV</span>
              <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
              <span>MAC</span>
            </button>
          </div>
        </div>

        {/* User Saved Hardware Snapshots (Zero Fake Presets) */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Saved Hardware Snapshots ({userPresets.length})
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Save snapshots of your synced MacroPad layouts to switch setups anytime. Nothing is pre-populated.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={snapshotName}
                onChange={e => setSnapshotName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSaveSnapshot();
                }}
                placeholder="Snapshot name…"
                className="px-3 py-1.5 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              />
              <button
                type="button"
                disabled={!isSyncedWithHardware && !snapshotName.trim()}
                onClick={handleSaveSnapshot}
                style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity cursor-pointer"
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
                <span>Save Current State</span>
              </button>
            </div>
          </div>

          {userPresets.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-center space-y-1.5">
              <div className="text-xs font-semibold text-[var(--text-secondary)]">
                No saved snapshots yet
              </div>
              <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
                Sync your MacroPad over USB, customize your `MAC` and `TV` slots, and save snapshots here for one-click restore.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {userPresets.map(snap => (
                <div
                  key={snap.id}
                  className="p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                          {snap.name}
                        </h3>
                        <p className="text-[11px] font-mono text-[var(--text-muted)]">
                          Saved {snap.createdAt}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteUserSnapshot(snap.id)}
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-rose-400 hover:bg-[var(--bg-input)] transition-colors cursor-pointer"
                        title="Delete snapshot"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono pt-1">
                      <div className="p-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] truncate">
                        <span className="text-sky-400 font-bold">{snap.backup.mac_name}: </span>
                        <span className="text-[var(--text-secondary)]">
                          {describeFirmwareAction(snap.backup.mac_b1).shortLabel},{' '}
                          {describeFirmwareAction(snap.backup.mac_b2).shortLabel}…
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] truncate">
                        <span className="text-emerald-400 font-bold">{snap.backup.tv_name}: </span>
                        <span className="text-[var(--text-secondary)]">
                          {describeFirmwareAction(snap.backup.tv_b1).shortLabel},{' '}
                          {describeFirmwareAction(snap.backup.tv_b2).shortLabel}…
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onApplyHardwareBackup(snap.backup)}
                    style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
                    className="w-full py-2 rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    {isConnected
                      ? 'Restore & Flash to MacroPad over USB'
                      : 'Load Snapshot into Editor'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
