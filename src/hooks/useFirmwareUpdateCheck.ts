import { useState, useEffect, useCallback, useRef } from 'react';
import {
  FirmwareReleaseInfo,
  FirmwareUpdateState,
  FirmwareUpdateStatus
} from '../types/studio';
import {
  DEFAULT_FIRMWARE_GITHUB_REPO,
  compareFirmwareVersions,
  fetchGitHubFirmwareCatalog,
  parseGitHubRepoSlug
} from '../services/firmwareUpdateService';

const AUTO_CHECK_INTERVAL_MS = 30 * 60 * 1000; // Re-check every 30 minutes while connected

interface UseFirmwareUpdateCheckOptions {
  connected: boolean;
  installedVersion: string | null | undefined;
  autoCheckEnabled: boolean;
  firmwareRepo: string;
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
  firmwareRepo,
  onUpdateAvailableToast
}: UseFirmwareUpdateCheckOptions) {
  const effectiveInstalled =
    connected && installedVersion && installedVersion !== '—'
      ? installedVersion.trim()
      : null;

  const normalizedSlug =
    parseGitHubRepoSlug(firmwareRepo)?.slug || DEFAULT_FIRMWARE_GITHUB_REPO;

  const [updateState, setUpdateState] = useState<FirmwareUpdateState>({
    status: 'idle',
    installedVersion: effectiveInstalled,
    latestRelease: null,
    recentReleases: [],
    checkedAt: null,
    repoSlug: normalizedSlug,
    error: null
  });

  const [dismissedBannerKey, setDismissedBannerKey] = useState<string | null>(null);

  const installedRef = useRef<string | null>(effectiveInstalled);
  installedRef.current = effectiveInstalled;

  const notifiedSignatureRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const toastCallbackRef = useRef(onUpdateAvailableToast);
  toastCallbackRef.current = onUpdateAvailableToast;

  const checkForUpdates = useCallback(
    async (opts?: {
      force?: boolean;
      repoOverride?: string;
      silent?: boolean;
    }): Promise<FirmwareUpdateState> => {
      const targetInput = (opts?.repoOverride ?? firmwareRepo).trim() || DEFAULT_FIRMWARE_GITHUB_REPO;
      const parsed = parseGitHubRepoSlug(targetInput);
      const slug = parsed?.slug || targetInput;

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
        repoSlug: slug,
        error: null
      }));

      try {
        const catalog = await fetchGitHubFirmwareCatalog(targetInput, {
          force: Boolean(opts?.force),
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
          repoSlug: release?.repoSlug || slug,
          error: null
        };

        setUpdateState(nextState);

        if (
          nextStatus === 'update_available' &&
          release &&
          currentInstalled &&
          opts?.silent
        ) {
          const sig = `${release.repoSlug}:${currentInstalled}->${release.version}`;
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
          repoSlug: slug,
          error: err?.message || 'Unable to check GitHub for firmware updates.'
        };
        setUpdateState(errState);
        return errState;
      }
    },
    [firmwareRepo, updateState]
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
      return {
        ...prev,
        installedVersion: effectiveInstalled,
        status: evaluateStatus(effectiveInstalled, prev.latestRelease)
      };
    });
  }, [effectiveInstalled]);

  // Automatic check when an ESP32 pad connects (and periodic background check while connected)
  useEffect(() => {
    if (!connected || !effectiveInstalled || !autoCheckEnabled) {
      return;
    }

    checkForUpdates({ force: false, silent: true });

    const intervalId = window.setInterval(() => {
      checkForUpdates({ force: true, silent: true });
    }, AUTO_CHECK_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, effectiveInstalled, autoCheckEnabled, normalizedSlug]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const currentBannerKey =
    updateState.latestRelease && updateState.installedVersion
      ? `${updateState.repoSlug}:${updateState.installedVersion}->${updateState.latestRelease.version}`
      : null;

  const isBannerDismissed = Boolean(
    currentBannerKey && dismissedBannerKey === currentBannerKey
  );

  const dismissUpdateBanner = useCallback(() => {
    if (currentBannerKey) {
      setDismissedBannerKey(currentBannerKey);
    }
  }, [currentBannerKey]);

  return {
    updateState,
    isBannerDismissed,
    dismissUpdateBanner,
    checkForUpdates
  };
}
