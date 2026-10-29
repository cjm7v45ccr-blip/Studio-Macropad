import { useState, useEffect, useCallback, useRef } from 'react';
import {
  FirmwareInstallProgress,
  FirmwareReleaseInfo,
  FirmwareUpdateState,
  FirmwareUpdateStatus
} from '../types/studio';
import { ToastVariant } from './useStudioState';
import { usbHardware } from '../services/usbHardwareService';
import {
  PUBLIC_FIRMWARE_SOURCE_SLUG,
  compareFirmwareVersions,
  downloadFirmwareBinary,
  fetchPublicFirmwareCatalog,
  formatBytesCompact,
  selectPrimaryOtaBinaryAsset
} from '../services/firmwareUpdateService';

const AUTO_CHECK_INTERVAL_MS = 2 * 60 * 1000; // Re-check /public every 2 minutes & on tab focus
const FLASHED_LEDGER_STORAGE_KEY = 'studio-pad-flashed-fw-v1';

interface FlashedDeviceLedgerEntry {
  rawReportedVersion: string;
  flashedVersion: string;
  sha256?: string;
  flashedAt: string;
}

function readFlashedLedger(deviceId: string | undefined): FlashedDeviceLedgerEntry | null {
  if (!deviceId || typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(FLASHED_LEDGER_STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, FlashedDeviceLedgerEntry>;
    return map?.[deviceId] || null;
  } catch {
    return null;
  }
}

function writeFlashedLedger(
  deviceId: string | undefined,
  entry: FlashedDeviceLedgerEntry
): void {
  if (!deviceId || typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(FLASHED_LEDGER_STORAGE_KEY);
    const map: Record<string, FlashedDeviceLedgerEntry> = raw ? JSON.parse(raw) : {};
    map[deviceId] = entry;
    localStorage.setItem(FLASHED_LEDGER_STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

interface UseFirmwareUpdateCheckOptions {
  connected: boolean;
  installedVersion: string | null | undefined;
  autoCheckEnabled: boolean;
  onExportBackupFile?: () => Promise<void> | void;
  onToast?: (msg: string, variant?: ToastVariant) => void;
  onUpdateAvailableToast?: (release: FirmwareReleaseInfo, installed: string) => void;
}

function evaluateStatus(
  installedVersion: string | null,
  release: FirmwareReleaseInfo | null,
  ledgerEntry?: FlashedDeviceLedgerEntry | null
): FirmwareUpdateStatus {
  if (!release) return 'no_version_found';
  if (!installedVersion) return 'idle';

  const primarySha = release.assets?.[0]?.sha256;
  if (
    ledgerEntry &&
    primarySha &&
    ledgerEntry.sha256 &&
    ledgerEntry.sha256 === primarySha &&
    ledgerEntry.rawReportedVersion === installedVersion
  ) {
    return 'up_to_date';
  }

  const cmp = compareFirmwareVersions(installedVersion, release.version);
  if (cmp === 1) return 'update_available';
  if (cmp === -1) return 'ahead';
  return 'up_to_date';
}

export function useFirmwareUpdateCheck({
  connected,
  installedVersion,
  autoCheckEnabled,
  onExportBackupFile,
  onToast,
  onUpdateAvailableToast
}: UseFirmwareUpdateCheckOptions) {
  const rawHardwareVersion =
    connected && installedVersion && installedVersion !== '—'
      ? installedVersion.trim()
      : null;

  const activeDeviceId = connected ? usbHardware.info.deviceId || 'studio-pad' : undefined;
  const ledgerEntry = readFlashedLedger(activeDeviceId);

  const effectiveInstalled =
    rawHardwareVersion &&
    ledgerEntry &&
    ledgerEntry.rawReportedVersion === rawHardwareVersion &&
    compareFirmwareVersions(rawHardwareVersion, ledgerEntry.flashedVersion) === 1
      ? `v${ledgerEntry.flashedVersion.replace(/^[vV]/, '')}`
      : rawHardwareVersion;

  const [updateState, setUpdateState] = useState<FirmwareUpdateState>({
    status: 'idle',
    installedVersion: effectiveInstalled,
    latestRelease: null,
    recentReleases: [],
    checkedAt: null,
    repoSlug: PUBLIC_FIRMWARE_SOURCE_SLUG,
    error: null
  });

  const [dismissedBannerKey, setDismissedBannerKey] = useState<string | null>(null);
  const [installProgress, setInstallProgress] =
    useState<FirmwareInstallProgress | null>(null);

  const installedRef = useRef<string | null>(effectiveInstalled);
  installedRef.current = effectiveInstalled;

  const notifiedSignatureRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const toastCallbackRef = useRef(onUpdateAvailableToast);
  toastCallbackRef.current = onUpdateAvailableToast;
  const generalToastRef = useRef(onToast);
  generalToastRef.current = onToast;
  const exportBackupRef = useRef(onExportBackupFile);
  exportBackupRef.current = onExportBackupFile;

  const checkForUpdates = useCallback(
    async (opts?: {
      force?: boolean;
      silent?: boolean;
    }): Promise<FirmwareUpdateState> => {
      if (opts?.force) {
        setDismissedBannerKey(null);
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setUpdateState(prev => ({
        ...prev,
        status: 'checking',
        installedVersion: installedRef.current,
        repoSlug: PUBLIC_FIRMWARE_SOURCE_SLUG,
        error: null
      }));

      try {
        const catalog = await fetchPublicFirmwareCatalog({
          signal: controller.signal
        });
        const release = catalog.latestRelease;

        const nowTime = new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        });
        const devId = usbHardware.info.connected
          ? usbHardware.info.deviceId || 'studio-pad'
          : undefined;
        const currentLedger = readFlashedLedger(devId);
        const currentInstalled = installedRef.current;
        const nextStatus = evaluateStatus(currentInstalled, release, currentLedger);

        const nextState: FirmwareUpdateState = {
          status: nextStatus,
          installedVersion: currentInstalled,
          latestRelease: release,
          recentReleases: catalog.recentReleases,
          checkedAt: nowTime,
          repoSlug: PUBLIC_FIRMWARE_SOURCE_SLUG,
          error: null
        };

        setUpdateState(nextState);

        if (
          nextStatus === 'update_available' &&
          release &&
          currentInstalled &&
          opts?.silent
        ) {
          const sig = `${currentInstalled}->${release.version}`;
          if (notifiedSignatureRef.current !== sig) {
            notifiedSignatureRef.current = sig;
            toastCallbackRef.current?.(release, currentInstalled);
          }
        }

        return nextState;
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return updateState;
        }
        const nowTime = new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        });
        const errState: FirmwareUpdateState = {
          status: 'error',
          installedVersion: installedRef.current,
          latestRelease: null,
          checkedAt: nowTime,
          repoSlug: PUBLIC_FIRMWARE_SOURCE_SLUG,
          error: err?.message || 'Unable to check for firmware updates.'
        };
        setUpdateState(errState);
        return errState;
      }
    },
    [updateState]
  );

  // Re-evaluate comparison immediately when installed firmware version or connection changes
  useEffect(() => {
    setUpdateState(prev => {
      if (!prev.latestRelease) {
        return {
          ...prev,
          installedVersion: effectiveInstalled
        };
      }
      if (prev.status === 'checking' || prev.status === 'error') {
        return {
          ...prev,
          installedVersion: effectiveInstalled
        };
      }
      const devId = usbHardware.info.connected
        ? usbHardware.info.deviceId || 'studio-pad'
        : undefined;
      const currentLedger = readFlashedLedger(devId);
      const nextStatus = evaluateStatus(
        effectiveInstalled,
        prev.latestRelease,
        currentLedger
      );
      if (
        nextStatus === 'update_available' &&
        prev.latestRelease &&
        effectiveInstalled
      ) {
        const sig = `${effectiveInstalled}->${prev.latestRelease.version}`;
        if (notifiedSignatureRef.current !== sig) {
          notifiedSignatureRef.current = sig;
          toastCallbackRef.current?.(prev.latestRelease, effectiveInstalled);
        }
      }
      return {
        ...prev,
        installedVersion: effectiveInstalled,
        status: nextStatus
      };
    });
  }, [effectiveInstalled]);

  // Check static /public folder on boot so available version is immediately ready,
  // and keep checking periodically + on tab focus while autoCheckEnabled is active.
  useEffect(() => {
    if (!autoCheckEnabled) {
      return;
    }

    checkForUpdates({ force: false, silent: true });

    const intervalId = window.setInterval(() => {
      checkForUpdates({ force: false, silent: true });
    }, AUTO_CHECK_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdates({ force: false, silent: true });
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, effectiveInstalled, autoCheckEnabled]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const isUploadingFirmware =
    installProgress !== null &&
    installProgress.stage !== 'idle' &&
    installProgress.stage !== 'complete' &&
    installProgress.stage !== 'error';

  const uploadFirmwareToMacropad = useCallback(
    async (opts?: {
      releaseOverride?: FirmwareReleaseInfo | null;
      method?: 'usb_serial' | 'wifi_ota';
      autoBackupBeforeFlash?: boolean;
    }): Promise<boolean> => {
      const method = opts?.method || 'usb_serial';

      if (method === 'wifi_ota' && !connected) {
        generalToastRef.current?.(
          'Connect your MacroPad first to start a Wi-Fi update',
          'error'
        );
        return false;
      }

      if (method === 'usb_serial' && !connected && !usbHardware.browserSupportsWebSerial) {
        generalToastRef.current?.(
          'Open this site in Chrome or Edge on desktop (or start Demo Mode) to upload firmware over USB',
          'error'
        );
        return false;
      }

      const targetRelease = opts?.releaseOverride || updateState.latestRelease;
      const primaryAsset =
        selectPrimaryOtaBinaryAsset(targetRelease?.assets) ||
        targetRelease?.assets?.[0] ||
        null;

      if (!targetRelease || !primaryAsset) {
        generalToastRef.current?.(
          'No firmware .bin file found in the public folder yet',
          'error'
        );
        return false;
      }

      const shouldBackup = Boolean(opts?.autoBackupBeforeFlash && connected);

      let lastProgressSnap: {
        percent: number;
        bytesWritten?: number;
        totalBytes?: number;
        sha256?: string;
      } = { percent: 2 };

      try {
        if (shouldBackup && exportBackupRef.current) {
          lastProgressSnap = { percent: 2 };
          setInstallProgress({
            stage: 'backing_up',
            method,
            percent: 2,
            message: 'Saving profile backup before updating…',
            targetVersion: targetRelease.version
          });
          await exportBackupRef.current();
        }

        if (method === 'wifi_ota') {
          const absoluteBinUrl = new URL(
            primaryAsset.downloadUrl,
            window.location.origin
          ).href;
          lastProgressSnap = { percent: 8 };
          setInstallProgress({
            stage: 'downloading',
            method: 'wifi_ota',
            percent: 8,
            message: `Sending ${primaryAsset.name} to MacroPad over Wi-Fi…`,
            targetVersion: targetRelease.version
          });
          const res = await usbHardware.installFirmwareViaWifiOta({
            url: absoluteBinUrl,
            version: targetRelease.version,
            sha256: primaryAsset.sha256,
            onProgress: (pct, msg, phase) => {
              lastProgressSnap = { percent: pct };
              setInstallProgress({
                stage: phase,
                method: 'wifi_ota',
                percent: pct,
                message: msg,
                targetVersion: targetRelease.version
              });
            }
          });
          setInstallProgress({
            stage: 'complete',
            method: 'wifi_ota',
            percent: 100,
            message: res.message,
            targetVersion: targetRelease.version
          });
          generalToastRef.current?.(res.message, 'success');
          await checkForUpdates({ force: false, silent: true });
          return true;
        }

        lastProgressSnap = {
          percent: 3,
          totalBytes: primaryAsset.sizeBytes || undefined
        };
        setInstallProgress({
          stage: 'downloading',
          method: 'usb_serial',
          percent: 3,
          message: `Loading ${primaryAsset.name}…`,
          totalBytes: primaryAsset.sizeBytes || undefined,
          targetVersion: targetRelease.version
        });

        const { bytes, sha256 } = await downloadFirmwareBinary(
          primaryAsset,
          (loaded, total) => {
            const dlPct =
              total > 0 ? Math.min(7, Math.round((loaded / total) * 4) + 3) : 5;
            lastProgressSnap = {
              percent: dlPct,
              totalBytes: total || undefined
            };
            setInstallProgress({
              stage: 'downloading',
              method: 'usb_serial',
              percent: dlPct,
              totalBytes: total || undefined,
              message: `Loading ${primaryAsset.name} (${formatBytesCompact(loaded)})…`,
              targetVersion: targetRelease.version
            });
          }
        );

        lastProgressSnap = {
          percent: 8,
          totalBytes: bytes.byteLength,
          sha256
        };
        setInstallProgress({
          stage: 'verifying_hash',
          method: 'usb_serial',
          percent: 8,
          totalBytes: bytes.byteLength,
          sha256,
          message: sha256
            ? `Verifying SHA-256 checksum (${sha256.slice(0, 12)}…)…`
            : 'Verifying firmware binary integrity…',
          targetVersion: targetRelease.version
        });

        await new Promise(resolve => window.setTimeout(resolve, 300));

        lastProgressSnap = {
          percent: 9,
          bytesWritten: 0,
          totalBytes: bytes.byteLength,
          sha256
        };
        setInstallProgress({
          stage: 'flashing',
          method: 'usb_serial',
          percent: 9,
          bytesWritten: 0,
          totalBytes: bytes.byteLength,
          sha256,
          message: 'Entering ESP32 hardware bootloader over USB…',
          targetVersion: targetRelease.version
        });

        const res = await usbHardware.installFirmwareViaUsbSerial({
          bytes,
          fileName: primaryAsset.name,
          version: targetRelease.version,
          sha256,
          onProgress: (pct, sent, total, msg) => {
            const clampedPct = Math.min(99, Math.max(10, Math.round(pct)));
            const isRebootPhase = clampedPct >= 96;
            lastProgressSnap = {
              percent: clampedPct,
              bytesWritten: sent,
              totalBytes: total,
              sha256
            };
            setInstallProgress({
              stage: isRebootPhase ? 'rebooting' : 'flashing',
              method: 'usb_serial',
              percent: clampedPct,
              bytesWritten: sent,
              totalBytes: total,
              sha256,
              message: msg,
              targetVersion: targetRelease.version
            });
          }
        });

        // Persist flashed firmware version/hash per deviceId so boards whose .ino code
        // still reports an older hardcoded version string don't endlessly re-prompt for the same .bin.
        const currentHardwareRaw = usbHardware.info.firmwareVersion;
        const devId = usbHardware.info.deviceId || 'studio-pad';
        if (currentHardwareRaw && currentHardwareRaw !== '—') {
          writeFlashedLedger(devId, {
            rawReportedVersion: currentHardwareRaw.trim(),
            flashedVersion: targetRelease.version.replace(/^[vV]/, ''),
            sha256,
            flashedAt: new Date().toISOString()
          });
        }
        installedRef.current = `v${targetRelease.version.replace(/^[vV]/, '')}`;

        setInstallProgress({
          stage: 'complete',
          method: 'usb_serial',
          percent: 100,
          bytesWritten: bytes.byteLength,
          totalBytes: bytes.byteLength,
          sha256,
          message: res.message,
          targetVersion: targetRelease.version
        });
        generalToastRef.current?.(res.message, 'success');
        await checkForUpdates({ force: false, silent: true });
        return true;
      } catch (err: any) {
        const msg = err?.message || 'Could not upload firmware to MacroPad';
        setInstallProgress({
          stage: 'error',
          method,
          percent: lastProgressSnap.percent,
          bytesWritten: lastProgressSnap.bytesWritten,
          totalBytes: lastProgressSnap.totalBytes,
          sha256: lastProgressSnap.sha256,
          message: msg,
          targetVersion: targetRelease.version
        });
        generalToastRef.current?.(msg, 'error');
        return false;
      }
    },
    [checkForUpdates, connected, updateState.latestRelease]
  );

  const currentBannerKey =
    updateState.latestRelease && updateState.installedVersion
      ? `${updateState.installedVersion}->${updateState.latestRelease.version}`
      : null;

  const isBannerDismissed = Boolean(
    currentBannerKey && dismissedBannerKey === currentBannerKey
  );

  const dismissUpdateBanner = useCallback(() => {
    if (currentBannerKey) {
      setDismissedBannerKey(currentBannerKey);
    }
    setInstallProgress(prev =>
      prev && (prev.stage === 'complete' || prev.stage === 'error') ? null : prev
    );
  }, [currentBannerKey]);

  return {
    updateState,
    installProgress,
    isUploadingFirmware,
    isBannerDismissed,
    dismissUpdateBanner,
    checkForUpdates,
    uploadFirmwareToMacropad
  };
}
