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
  release: FirmwareReleaseInfo | null
): FirmwareUpdateStatus {
  if (!release) return 'no_version_found';
  if (!installedVersion) return 'idle';
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
  const effectiveInstalled =
    connected && installedVersion && installedVersion !== '—'
      ? installedVersion.trim()
      : null;

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
        const currentInstalled = installedRef.current;
        const nextStatus = evaluateStatus(currentInstalled, release);

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
      const nextStatus = evaluateStatus(effectiveInstalled, prev.latestRelease);
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
      if (!connected) {
        generalToastRef.current?.(
          'Connect your MacroPad via USB (or start Demo Mode) first',
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

      const method = opts?.method || 'usb_serial';
      const shouldBackup = opts?.autoBackupBeforeFlash ?? false;

      try {
        if (shouldBackup && exportBackupRef.current) {
          setInstallProgress({
            stage: 'backing_up',
            method,
            percent: 4,
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
          setInstallProgress({
            stage: 'downloading',
            method: 'wifi_ota',
            percent: 10,
            message: `Sending ${primaryAsset.name} to MacroPad over Wi-Fi…`,
            targetVersion: targetRelease.version
          });
          const res = await usbHardware.installFirmwareViaWifiOta({
            url: absoluteBinUrl,
            version: targetRelease.version,
            sha256: primaryAsset.sha256,
            onProgress: (pct, msg, phase) => {
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

        setInstallProgress({
          stage: 'downloading',
          method: 'usb_serial',
          percent: 4,
          message: `Loading ${primaryAsset.name}…`,
          totalBytes: primaryAsset.sizeBytes || undefined,
          targetVersion: targetRelease.version
        });

        const { bytes, sha256 } = await downloadFirmwareBinary(
          primaryAsset,
          (loaded, total) => {
            const dlPct =
              total > 0 ? Math.min(12, Math.round((loaded / total) * 8) + 4) : 8;
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

        setInstallProgress({
          stage: 'verifying_hash',
          method: 'usb_serial',
          percent: 14,
          totalBytes: bytes.byteLength,
          sha256,
          message: 'SHA-256 checksum verified · Preparing MacroPad flash partition…',
          targetVersion: targetRelease.version
        });

        setInstallProgress({
          stage: 'flashing',
          method: 'usb_serial',
          percent: 15,
          bytesWritten: 0,
          totalBytes: bytes.byteLength,
          sha256,
          message: 'Erasing OTA partition & starting binary write…',
          targetVersion: targetRelease.version
        });

        const res = await usbHardware.installFirmwareViaUsbSerial({
          bytes,
          version: targetRelease.version,
          sha256,
          onProgress: (pct, sent, total, msg) => {
            const isRebootPhase = pct >= 96;
            const writeRatio = total > 0 ? Math.min(1, Math.max(0, sent / total)) : 0;
            const scaledPct = isRebootPhase
              ? 98
              : Math.min(96, Math.round(15 + writeRatio * 81));
            setInstallProgress({
              stage: isRebootPhase ? 'rebooting' : 'flashing',
              method: 'usb_serial',
              percent: scaledPct,
              bytesWritten: sent,
              totalBytes: total,
              sha256,
              message: msg,
              targetVersion: targetRelease.version
            });
          }
        });

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
          percent: 0,
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
