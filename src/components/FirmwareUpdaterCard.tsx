import React, { useEffect, useMemo, useState } from 'react';
import {
  DeviceConnectionInfo,
  FirmwareInstallProgress,
  FirmwareReleaseInfo,
  FirmwareUpdateState,
  StudioSettings
} from '../types/studio';
import { ToastVariant } from '../hooks/useStudioState';
import {
  formatBytesCompact,
  selectPrimaryOtaBinaryAsset
} from '../services/firmwareUpdateService';
import {
  AlertCircle,
  ArrowUpCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Upload,
  Wifi,
  X
} from 'lucide-react';

interface FirmwareSharedProps {
  settings: StudioSettings;
  connection: DeviceConnectionInfo;
  firmwareUpdate: FirmwareUpdateState;
  installProgress: FirmwareInstallProgress | null;
  isUploadingFirmware: boolean;
  isFirmwareBannerDismissed: boolean;
  onDismissFirmwareBanner: () => void;
  onCheckFirmwareUpdate: (opts?: {
    force?: boolean;
    silent?: boolean;
  }) => Promise<FirmwareUpdateState>;
  onUploadFirmwareToMacropad: (opts?: {
    releaseOverride?: FirmwareReleaseInfo | null;
    method?: 'usb_serial' | 'wifi_ota';
    autoBackupBeforeFlash?: boolean;
  }) => Promise<boolean>;
  onUpdateSettings: (patch: Partial<StudioSettings>) => void;
  onExportBackupFile?: () => Promise<void> | void;
  onToast: (msg: string, variant?: ToastVariant) => void;
}

const STAGE_LABELS: Record<FirmwareInstallProgress['stage'], string> = {
  idle: 'Ready',
  backing_up: 'Saving profile backup',
  downloading: 'Loading update',
  verifying_hash: 'Verifying checksum',
  flashing: 'Uploading to MacroPad',
  rebooting: 'Restarting MacroPad',
  complete: 'Update complete',
  error: 'Update interrupted'
};

const FirmwareProgressBox: React.FC<{
  installProgress: FirmwareInstallProgress | null;
  isUploading: boolean;
}> = ({ installProgress, isUploading }) => {
  if (!installProgress || installProgress.stage === 'idle') return null;

  return (
    <div
      className={`p-3 rounded-xl border space-y-2 text-xs ${
        installProgress.stage === 'error'
          ? 'bg-rose-500/10 border-rose-500/35 text-rose-200'
          : installProgress.stage === 'complete'
          ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-200'
          : 'bg-[var(--bg-elevated)] border-[var(--border-strong)] text-[var(--text-primary)]'
      }`}
    >
      <div className="flex items-center justify-between gap-2 font-mono text-[11px] tabular-nums">
        <span className="font-semibold flex items-center gap-1.5">
          {isUploading && (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />
          )}
          {installProgress.stage === 'complete' && (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          )}
          {installProgress.stage === 'error' && (
            <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
          )}
          <span>{STAGE_LABELS[installProgress.stage]}</span>
        </span>
        <span>
          {installProgress.stage !== 'error' && `${installProgress.percent}%`}
          {installProgress.bytesWritten !== undefined &&
            installProgress.totalBytes !== undefined &&
            installProgress.totalBytes > 0 &&
            ` · ${formatBytesCompact(installProgress.bytesWritten)} / ${formatBytesCompact(
              installProgress.totalBytes
            )}`}
        </span>
      </div>

      {installProgress.stage !== 'error' && (
        <div className="w-full h-1.5 rounded-full bg-black/35 overflow-hidden">
          <div
            className={`h-full transition-all duration-200 ${
              installProgress.stage === 'complete'
                ? 'bg-emerald-400'
                : 'bg-[var(--accent)]'
            }`}
            style={{
              width: `${Math.max(2, Math.min(100, installProgress.percent))}%`
            }}
          />
        </div>
      )}

      <div className="text-[11px] leading-relaxed opacity-90">
        {installProgress.message}
      </div>
    </div>
  );
};

export const FirmwareUpdateBanner: React.FC<{
  connection: DeviceConnectionInfo;
  firmwareUpdate: FirmwareUpdateState;
  installProgress: FirmwareInstallProgress | null;
  isUploadingFirmware: boolean;
  isFirmwareBannerDismissed: boolean;
  onDismissFirmwareBanner: () => void;
  onUploadToMacropad: () => void;
  onJumpToUpdater?: () => void;
  compact?: boolean;
}> = ({
  connection,
  firmwareUpdate,
  installProgress,
  isUploadingFirmware,
  isFirmwareBannerDismissed,
  onDismissFirmwareBanner,
  onUploadToMacropad,
  onJumpToUpdater,
  compact = false
}) => {
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const latestRelease = firmwareUpdate.latestRelease;

  const hasAvailableUpdate =
    connection.connected &&
    firmwareUpdate.status === 'update_available' &&
    Boolean(latestRelease) &&
    !isFirmwareBannerDismissed;

  const showActiveUploadInBanner =
    compact &&
    installProgress !== null &&
    installProgress.stage !== 'idle' &&
    !isFirmwareBannerDismissed;

  if (!hasAvailableUpdate && !showActiveUploadInBanner) return null;

  const primaryAsset = latestRelease
    ? selectPrimaryOtaBinaryAsset(latestRelease.assets) || latestRelease.assets[0] || null
    : null;

  const formattedReleaseDate = latestRelease?.publishedAt
    ? new Date(latestRelease.publishedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    : null;

  if (compact) {
    return (
      <div
        role="region"
        aria-label="MacroPad firmware update notification"
        className="shrink-0 bg-amber-500/10 border-b border-amber-500/30 px-3 sm:px-5 py-2.5 space-y-2"
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <ArrowUpCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="flex items-center gap-2 flex-wrap text-xs min-w-0">
              <span className="font-semibold text-[var(--text-primary)]">
                {latestRelease
                  ? `New MacroPad update available (v${latestRelease.version})`
                  : 'MacroPad firmware update'}
              </span>
              {latestRelease && firmwareUpdate.installedVersion && (
                <>
                  <span className="text-[var(--text-muted)]" aria-hidden="true">
                    ·
                  </span>
                  <span className="font-mono text-[11px] text-amber-200/85 tabular-nums">
                    Installed {firmwareUpdate.installedVersion} → v{latestRelease.version}
                  </span>
                </>
              )}
              {primaryAsset && primaryAsset.sizeBytes > 0 && (
                <>
                  <span className="text-[var(--text-muted)] hidden md:inline" aria-hidden="true">
                    ·
                  </span>
                  <span className="font-mono text-[11px] text-[var(--text-secondary)] tabular-nums hidden md:inline">
                    {formatBytesCompact(primaryAsset.sizeBytes)}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {hasAvailableUpdate && (
              <button
                type="button"
                disabled={isUploadingFirmware || !primaryAsset}
                onClick={onUploadToMacropad}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-45 transition-opacity cursor-pointer whitespace-nowrap"
              >
                {isUploadingFirmware ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                <span>
                  {isUploadingFirmware ? 'Uploading…' : 'Upload to MacroPad'}
                </span>
              </button>
            )}

            {onJumpToUpdater && (
              <button
                type="button"
                onClick={onJumpToUpdater}
                className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap"
              >
                Details
              </button>
            )}

            {!isUploadingFirmware && (
              <button
                type="button"
                onClick={onDismissFirmwareBanner}
                aria-label="Dismiss firmware update notification"
                title="Dismiss notification"
                className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {installProgress && installProgress.stage !== 'idle' && (
          <FirmwareProgressBox
            installProgress={installProgress}
            isUploading={isUploadingFirmware}
          />
        )}
      </div>
    );
  }

  if (!latestRelease) return null;

  return (
    <div
      role="region"
      aria-label="MacroPad firmware update available"
      className="p-4 sm:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/35 space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <ArrowUpCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 min-w-0">
            <div className="text-sm font-semibold text-[var(--text-primary)]">
              New MacroPad firmware update available (v{latestRelease.version})
            </div>
            <div className="flex items-center gap-2 flex-wrap font-mono text-[11px] text-amber-200/85 tabular-nums">
              <span>Installed {firmwareUpdate.installedVersion}</span>
              <span aria-hidden="true">·</span>
              <span>Available v{latestRelease.version}</span>
              {primaryAsset && primaryAsset.sizeBytes > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{formatBytesCompact(primaryAsset.sizeBytes)}</span>
                </>
              )}
              {formattedReleaseDate && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{formattedReleaseDate}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onDismissFirmwareBanner}
          aria-label="Dismiss firmware update notification"
          title="Dismiss for this session"
          className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
        Press <span className="font-semibold text-[var(--text-primary)]">Upload to MacroPad</span>{' '}
        below to install the update directly over USB — saved button profiles, Bluetooth hosts, and Wi-Fi settings stay intact.
      </p>

      {latestRelease.notes && (
        <div className="space-y-2 border-t border-amber-500/20 pt-2.5">
          <button
            type="button"
            onClick={() => setShowReleaseNotes(v => !v)}
            className="text-xs font-medium text-amber-300 hover:underline cursor-pointer whitespace-nowrap"
          >
            {showReleaseNotes ? 'Hide release notes' : 'View release notes'}
          </button>
          {showReleaseNotes && (
            <pre className="text-[11px] font-mono text-[var(--text-secondary)] whitespace-pre-wrap break-words max-h-40 overflow-y-auto leading-relaxed">
              {latestRelease.notes}
            </pre>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap pt-0.5">
        <button
          type="button"
          disabled={isUploadingFirmware || !primaryAsset}
          onClick={onUploadToMacropad}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-45 transition-opacity cursor-pointer whitespace-nowrap shrink-0"
        >
          {isUploadingFirmware ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Upload className="w-3.5 h-3.5" />
          )}
          <span>
            {isUploadingFirmware
              ? 'Uploading to MacroPad…'
              : `Upload v${latestRelease.version} to MacroPad`}
          </span>
        </button>
      </div>
    </div>
  );
};

export const FirmwareUpdaterCard: React.FC<FirmwareSharedProps> = ({
  settings,
  connection,
  firmwareUpdate,
  installProgress,
  isUploadingFirmware,
  onCheckFirmwareUpdate,
  onUploadFirmwareToMacropad,
  onUpdateSettings,
  onExportBackupFile,
  onToast
}) => {
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [autoBackupBeforeFlash, setAutoBackupBeforeFlash] = useState<boolean>(false);
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);

  const availableReleases: FirmwareReleaseInfo[] = useMemo(() => {
    if (firmwareUpdate.recentReleases && firmwareUpdate.recentReleases.length > 0) {
      return firmwareUpdate.recentReleases;
    }
    return firmwareUpdate.latestRelease ? [firmwareUpdate.latestRelease] : [];
  }, [firmwareUpdate.latestRelease, firmwareUpdate.recentReleases]);

  useEffect(() => {
    if (availableReleases.length === 0) {
      setSelectedVersion('');
      return;
    }
    const stillExists = availableReleases.some(r => r.version === selectedVersion);
    if (!stillExists) {
      setSelectedVersion(availableReleases[0].version);
    }
  }, [availableReleases, selectedVersion]);

  const selectedRelease: FirmwareReleaseInfo | null = useMemo(() => {
    if (availableReleases.length === 0) return null;
    return (
      availableReleases.find(r => r.version === selectedVersion) || availableReleases[0]
    );
  }, [availableReleases, selectedVersion]);

  const primaryBinAsset = useMemo(
    () => selectPrimaryOtaBinaryAsset(selectedRelease?.assets),
    [selectedRelease]
  );

  const padWifiOnline = Boolean(connection.connected && connection.telemetry?.wifiConnected);
  const latestRelease = firmwareUpdate.latestRelease;

  const handleManualFirmwareCheck = async () => {
    const result = await onCheckFirmwareUpdate({
      force: true,
      silent: false
    });
    if (result.status === 'error') {
      onToast(result.error || 'Firmware update check failed', 'error');
    } else if (result.status === 'update_available' && result.latestRelease) {
      onToast(
        `New update available: ${result.installedVersion} → v${result.latestRelease.version}`
      );
    } else if (result.status === 'up_to_date') {
      onToast(`MacroPad firmware (${result.installedVersion}) is up to date`);
    } else if (result.status === 'ahead' && result.latestRelease) {
      onToast(`MacroPad firmware (${result.installedVersion}) is up to date`);
    } else if (result.latestRelease) {
      onToast(
        `Firmware v${result.latestRelease.version} is ready — connect your MacroPad to update`
      );
    } else {
      onToast('Your MacroPad firmware is up to date — no new update posted yet');
    }
  };

  return (
    <div
      id="firmware-updater-card"
      className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-4"
    >
      {/* Header + Auto-Check + Check for Updates */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
            <RefreshCw
              className={`w-4 h-4 text-[var(--accent)] ${
                firmwareUpdate.status === 'checking' ? 'animate-spin' : ''
              }`}
            />
            <span>MacroPad Firmware Updates</span>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Notifies you automatically when a new firmware update is available and uploads it directly to your MacroPad.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isUploadingFirmware}
            onClick={() =>
              onUpdateSettings({
                autoCheckFirmwareUpdates: !settings.autoCheckFirmwareUpdates
              })
            }
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] disabled:opacity-45 cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>Auto-Notify</span>
            <span
              className={`font-mono text-[11px] font-semibold ${
                settings.autoCheckFirmwareUpdates
                  ? 'text-emerald-400'
                  : 'text-[var(--text-muted)]'
              }`}
            >
              {settings.autoCheckFirmwareUpdates ? 'ON' : 'OFF'}
            </span>
          </button>

          <button
            type="button"
            disabled={firmwareUpdate.status === 'checking' || isUploadingFirmware}
            onClick={handleManualFirmwareCheck}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-strong)] hover:border-[var(--accent)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-45 cursor-pointer whitespace-nowrap shrink-0"
          >
            {firmwareUpdate.status === 'checking' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 text-[var(--accent)]" />
            )}
            <span>
              {firmwareUpdate.status === 'checking' ? 'Checking…' : 'Check for Updates'}
            </span>
          </button>
        </div>
      </div>

      {/* Live Status Row */}
      <div className="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-[var(--border-subtle)] text-xs">
        <div className="flex items-center gap-2 min-w-0 flex-wrap font-mono text-[11px] tabular-nums">
          {firmwareUpdate.status === 'checking' ? (
            <span className="text-[var(--text-secondary)]">
              Checking for firmware updates…
            </span>
          ) : firmwareUpdate.status === 'error' ? (
            <span className="inline-flex items-center gap-1.5 text-rose-300 font-sans text-xs">
              <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>{firmwareUpdate.error}</span>
            </span>
          ) : firmwareUpdate.status === 'update_available' && latestRelease ? (
            <span className="inline-flex items-center gap-1.5 text-amber-300">
              <ArrowUpCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>
                Update available · {firmwareUpdate.installedVersion} → v{latestRelease.version}
              </span>
            </span>
          ) : firmwareUpdate.status === 'up_to_date' && latestRelease ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>
                Up to date · Installed {firmwareUpdate.installedVersion}
              </span>
            </span>
          ) : firmwareUpdate.status === 'ahead' && latestRelease ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>
                Up to date · Installed {firmwareUpdate.installedVersion}
              </span>
            </span>
          ) : latestRelease && !connection.connected ? (
            <span className="text-[var(--text-secondary)]">
              Available firmware: v{latestRelease.version} · Connect MacroPad via USB to update
            </span>
          ) : (
            <span className="text-[var(--text-muted)] font-sans text-xs">
              {connection.connected
                ? `Installed firmware: ${connection.firmwareVersion} · Up to date`
                : 'Connect your MacroPad via USB to check your firmware version and install updates.'}
            </span>
          )}
        </div>

        {firmwareUpdate.checkedAt && (
          <span className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums shrink-0">
            Checked {firmwareUpdate.checkedAt}
          </span>
        )}
      </div>

      {/* Upload to MacroPad Controls */}
      <div className="p-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="space-y-0.5 min-w-0">
            <div className="text-xs font-semibold text-[var(--text-primary)]">
              {selectedRelease && primaryBinAsset
                ? `Firmware v${selectedRelease.version}`
                : 'No Firmware Update Posted Yet'}
            </div>
            <div className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums truncate">
              {selectedRelease && primaryBinAsset ? (
                <>
                  <span>{primaryBinAsset.name}</span>
                  {primaryBinAsset.sizeBytes > 0 && (
                    <>
                      <span aria-hidden="true"> · </span>
                      <span>{formatBytesCompact(primaryBinAsset.sizeBytes)}</span>
                    </>
                  )}
                  {primaryBinAsset.sha256 && (
                    <>
                      <span aria-hidden="true"> · </span>
                      <span>SHA-256 {primaryBinAsset.sha256.slice(0, 10)}…</span>
                    </>
                  )}
                </>
              ) : (
                <span className="font-sans">
                  When a new firmware update is released, you will get a notification here to upload it to your MacroPad.
                </span>
              )}
            </div>
          </div>

          {availableReleases.length > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              {availableReleases.length > 1 && (
                <select
                  aria-label="Target firmware version"
                  disabled={isUploadingFirmware}
                  value={selectedRelease?.version || ''}
                  onChange={e => setSelectedVersion(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] tabular-nums"
                >
                  {availableReleases.map((rel, idx) => (
                    <option key={rel.version} value={rel.version}>
                      v{rel.version}
                      {idx === 0 ? ' (Latest)' : ''}
                    </option>
                  ))}
                </select>
              )}

              {selectedRelease?.notes && (
                <button
                  type="button"
                  onClick={() => setShowReleaseNotes(v => !v)}
                  className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                >
                  {showReleaseNotes ? 'Hide notes' : 'Release notes'}
                </button>
              )}
            </div>
          )}
        </div>

        {showReleaseNotes && selectedRelease?.notes && (
          <pre className="p-2.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-secondary)] whitespace-pre-wrap break-words max-h-36 overflow-y-auto leading-relaxed">
            {selectedRelease.notes}
          </pre>
        )}

        {onExportBackupFile && primaryBinAsset && (
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoBackupBeforeFlash}
              disabled={isUploadingFirmware}
              onChange={e => setAutoBackupBeforeFlash(e.target.checked)}
              className="rounded border-[var(--border-strong)] accent-[var(--accent)]"
            />
            <span>Download profile backup automatically before updating</span>
          </label>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <button
            type="button"
            disabled={isUploadingFirmware || !connection.connected || !primaryBinAsset}
            onClick={() =>
              onUploadFirmwareToMacropad({
                releaseOverride: selectedRelease,
                method: 'usb_serial',
                autoBackupBeforeFlash
              })
            }
            title={
              !connection.connected
                ? 'Connect your MacroPad via USB first'
                : !primaryBinAsset
                ? 'No firmware update available yet'
                : 'Uploads firmware directly to your connected MacroPad over USB'
            }
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-40 disabled:pointer-events-none transition-opacity cursor-pointer whitespace-nowrap shrink-0"
          >
            {isUploadingFirmware && installProgress?.method === 'usb_serial' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            <span>
              {isUploadingFirmware && installProgress?.method === 'usb_serial'
                ? 'Uploading to MacroPad…'
                : selectedRelease && primaryBinAsset
                ? firmwareUpdate.status === 'update_available'
                  ? `Upload Update to MacroPad (v${selectedRelease.version})`
                  : `Upload v${selectedRelease.version} to MacroPad`
                : 'Upload to MacroPad'}
            </span>
          </button>

          {padWifiOnline && primaryBinAsset && selectedRelease && (
            <button
              type="button"
              disabled={isUploadingFirmware}
              onClick={() =>
                onUploadFirmwareToMacropad({
                  releaseOverride: selectedRelease,
                  method: 'wifi_ota',
                  autoBackupBeforeFlash
                })
              }
              title="MacroPad downloads and installs the update over Wi-Fi"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-45 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              <span>Upload via Wi-Fi</span>
            </button>
          )}
        </div>

        <FirmwareProgressBox
          installProgress={installProgress}
          isUploading={isUploadingFirmware}
        />
      </div>
    </div>
  );
};
