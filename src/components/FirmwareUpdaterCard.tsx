import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  DeviceConnectionInfo,
  FirmwareInstallProgress,
  FirmwareReleaseInfo,
  FirmwareUpdateState,
  StudioSettings
} from '../types/studio';
import { ToastVariant } from '../hooks/useStudioState';
import { usbHardware } from '../services/usbHardwareService';
import {
  DEFAULT_FIRMWARE_GITHUB_REPO,
  FirmwareCorsError,
  computeSha256Hex,
  downloadFirmwareBinary,
  formatBytesCompact,
  parseGitHubRepoSlug,
  selectPrimaryOtaBinaryAsset
} from '../services/firmwareUpdateService';
import {
  AlertCircle,
  ArrowUpCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FileUp,
  Loader2,
  RefreshCw,
  Usb,
  Wifi,
  X
} from 'lucide-react';

interface FirmwareSharedProps {
  settings: StudioSettings;
  connection: DeviceConnectionInfo;
  firmwareUpdate: FirmwareUpdateState;
  isFirmwareBannerDismissed: boolean;
  onDismissFirmwareBanner: () => void;
  onCheckFirmwareUpdate: (opts?: {
    force?: boolean;
    repoOverride?: string;
    silent?: boolean;
  }) => Promise<FirmwareUpdateState>;
  onUpdateSettings: (patch: Partial<StudioSettings>) => void;
  onExportBackupFile?: () => Promise<void> | void;
  onToast: (msg: string, variant?: ToastVariant) => void;
}

type BlueprintTab = 'manifest' | 'github_actions' | 'esp32_cpp';

const BLUEPRINT_MANIFEST_SNIPPET = `{
  "version": "3.3.0",
  "tag": "v3.3.0",
  "binary": "StudioMacroPad.ino.bin",
  "url": "https://raw.githubusercontent.com/YOUR_USER/studio-macropad-firmware/main/ota/StudioMacroPad.ino.bin",
  "releaseUrl": "https://github.com/YOUR_USER/studio-macropad-firmware/releases/download/v3.3.0/StudioMacroPad.ino.bin",
  "sha256": "REPLACE_WITH_64_CHAR_SHA256_HEX",
  "sizeBytes": 1142784,
  "notes": "Multi-Host BLE stability & direct OTA support"
}`;

const BLUEPRINT_ACTIONS_SNIPPET = `name: Build & Publish ESP32 Firmware
on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  release-firmware:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Compile ESP32 Sketch (.bin)
        uses: arduino/compile-sketches@v1
        with:
          fqbn: esp32:esp32:esp32s3:PartitionScheme=min_spiffs
          platforms: |
            - name: esp32:esp32
              source-url: https://espressif.github.io/arduino-esp32/package_esp32_index.json
          sketch-paths: |
            - StudioMacroPad
          enable-deltas-upload: true
          deltas-upload-path: build-artifacts

      - name: Compute SHA-256 & Release Metadata
        id: meta
        run: |
          BIN_FILE=$(find build-artifacts -name "*.ino.bin" | head -n 1)
          cp "$BIN_FILE" StudioMacroPad.ino.bin
          HASH=$(sha256sum StudioMacroPad.ino.bin | awk '{print $1}')
          SIZE=$(wc -c < StudioMacroPad.ino.bin | tr -d ' ')
          echo "$HASH  StudioMacroPad.ino.bin" > SHA256SUMS.txt
          cat > firmware-manifest.json <<EOF
          {
            "version": "\${GITHUB_REF_NAME#v}",
            "tag": "\${GITHUB_REF_NAME}",
            "binary": "StudioMacroPad.ino.bin",
            "sha256": "$HASH",
            "sizeBytes": $SIZE
          }
          EOF

      - name: Publish GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          body_path: SHA256SUMS.txt
          files: |
            StudioMacroPad.ino.bin
            firmware-manifest.json
            SHA256SUMS.txt`;

const BLUEPRINT_ESP32_CPP_SNIPPET = `// Required ESP32 Arduino headers (Partition Scheme: Minimal SPIFFS with OTA)
#include <Update.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include "mbedtls/base64.h"

// 1) Wi-Fi Direct OTA: {"id":1,"path":"/api/ota/start","url":"https://github.com/.../StudioMacroPad.ino.bin","version":"3.3.0"}
void handleOtaWifiStart(int reqId, const String& url) {
  Serial.printf("{\\"id\\":%d,\\"ok\\":true,\\"message\\":\\"Starting Wi-Fi OTA\\"}\\n", reqId);
  WiFiClientSecure client;
  client.setInsecure(); // Or pin DigiCert / GitHub root CA
  HTTPClient http;
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  if (!http.begin(client, url) || http.GET() != HTTP_CODE_OK) {
    Serial.println("{\\"event\\":\\"ota\\",\\"phase\\":\\"error\\",\\"ok\\":false,\\"message\\":\\"HTTP download failed\\"}");
    return;
  }
  int total = http.getSize();
  if (!Update.begin(total > 0 ? total : UPDATE_SIZE_UNKNOWN)) {
    Serial.println("{\\"event\\":\\"ota\\",\\"phase\\":\\"error\\",\\"ok\\":false,\\"message\\":\\"No OTA partition space\\"}");
    http.end();
    return;
  }
  WiFiClient* stream = http.getStreamPtr();
  uint8_t buf[1024];
  size_t written = 0;
  while (http.connected() && (total <= 0 || written < (size_t)total)) {
    size_t avail = stream->available();
    if (avail) {
      int n = stream->readBytes(buf, min(avail, sizeof(buf)));
      Update.write(buf, n);
      written += n;
      int pct = total > 0 ? (int)((written * 95ULL) / total) : 50;
      Serial.printf("{\\"event\\":\\"ota\\",\\"phase\\":\\"flashing\\",\\"percent\\":%d}\\n", pct);
    }
    delay(1);
  }
  http.end();
  if (Update.end(true)) {
    Serial.println("{\\"event\\":\\"ota\\",\\"phase\\":\\"complete\\",\\"percent\\":100,\\"message\\":\\"Rebooting\\"}");
    delay(250);
    ESP.restart();
  }
}

// 2) Offline USB Serial Stream OTA: /api/ota/begin -> /api/ota/chunk (512B base64) -> /api/ota/end
// Call Update.begin(size) on /api/ota/begin, decode base64 into Update.write(raw, outLen) on /api/ota/chunk,
// and call Update.end(true) + ESP.restart() on /api/ota/end. NVS button profiles stay intact!`;

const STAGE_LABELS: Record<FirmwareInstallProgress['stage'], string> = {
  idle: 'Ready',
  backing_up: 'Saving v2 backup',
  downloading: 'Downloading binary',
  verifying_hash: 'Verifying SHA-256',
  flashing: 'Flashing ESP32',
  rebooting: 'Rebooting & syncing',
  complete: 'Update complete',
  error: 'Flash interrupted'
};

export const FirmwareUpdateBanner: React.FC<{
  connection: DeviceConnectionInfo;
  firmwareUpdate: FirmwareUpdateState;
  isFirmwareBannerDismissed: boolean;
  onDismissFirmwareBanner: () => void;
  onJumpToUpdater: () => void;
}> = ({
  connection,
  firmwareUpdate,
  isFirmwareBannerDismissed,
  onDismissFirmwareBanner,
  onJumpToUpdater
}) => {
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const latestRelease = firmwareUpdate.latestRelease;

  const showUpdateNotification =
    connection.connected &&
    firmwareUpdate.status === 'update_available' &&
    Boolean(latestRelease) &&
    !isFirmwareBannerDismissed;

  if (!showUpdateNotification || !latestRelease) return null;

  const primaryAsset = selectPrimaryOtaBinaryAsset(latestRelease.assets) || latestRelease.assets[0] || null;
  const formattedReleaseDate = latestRelease.publishedAt
    ? new Date(latestRelease.publishedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    : null;
  const releaseSourceLabel =
    latestRelease.source === 'release'
      ? 'GitHub Release'
      : latestRelease.source === 'tag'
      ? 'GitHub Tag'
      : 'Default Branch';

  return (
    <div
      role="region"
      aria-label="ESP32 firmware update available"
      className="p-4 sm:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/35 space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <ArrowUpCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 min-w-0">
            <div className="text-sm font-semibold text-[var(--text-primary)]">
              Newer ESP32 firmware available ({latestRelease.version})
            </div>
            <div className="flex items-center gap-2 flex-wrap font-mono text-[11px] text-amber-200/85 tabular-nums">
              <span>Installed {firmwareUpdate.installedVersion}</span>
              <span aria-hidden="true">·</span>
              <span>Latest {latestRelease.version}</span>
              <span aria-hidden="true">·</span>
              <span>{releaseSourceLabel}</span>
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
        Published on{' '}
        <span className="font-mono text-[var(--text-primary)]">
          {firmwareUpdate.repoSlug}
        </span>
        . Flash directly from this app via USB Serial below — NVS button profiles, Bluetooth hosts, and Wi-Fi credentials remain intact.
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
          onClick={onJumpToUpdater}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap shrink-0"
        >
          <ArrowUpCircle className="w-3.5 h-3.5" />
          <span>Install {latestRelease.version} in App</span>
        </button>

        {primaryAsset && (
          <a
            href={primaryAsset.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-strong)] hover:border-[var(--accent)] text-xs font-semibold text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>
              Download {primaryAsset.name}
              {primaryAsset.sizeBytes > 0
                ? ` (${formatBytesCompact(primaryAsset.sizeBytes)})`
                : ''}
            </span>
          </a>
        )}

        <a
          href={latestRelease.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0"
        >
          <span>View on GitHub</span>
          <ExternalLink className="w-3.5 h-3.5 text-[var(--accent)]" />
        </a>
      </div>
    </div>
  );
};

export const FirmwareUpdaterCard: React.FC<FirmwareSharedProps> = ({
  settings,
  connection,
  firmwareUpdate,
  onCheckFirmwareUpdate,
  onUpdateSettings,
  onExportBackupFile,
  onToast
}) => {
  const [repoDraft, setRepoDraft] = useState<string>(
    settings.firmwareRepo || DEFAULT_FIRMWARE_GITHUB_REPO
  );
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [autoBackupBeforeFlash, setAutoBackupBeforeFlash] = useState<boolean>(true);
  const [installProgress, setInstallProgress] = useState<FirmwareInstallProgress | null>(
    null
  );
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const [showBlueprint, setShowBlueprint] = useState(false);
  const [blueprintTab, setBlueprintTab] = useState<BlueprintTab>('github_actions');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleLocalBinSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!connection.connected) {
      onToast('Connect your MacroPad via USB (or start Demo Mode) first', 'error');
      return;
    }

    try {
      const arrayBuf = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);
      const sha256 = await computeSha256Hex(bytes);
      const versionLabel = file.name.replace(/\.[^/.]+$/, '');

      await runOptionalBackupStep('usb_serial', versionLabel);

      setInstallProgress({
        stage: 'verifying_hash',
        method: 'usb_serial',
        percent: 38,
        bytesWritten: bytes.byteLength,
        totalBytes: bytes.byteLength,
        sha256,
        message: `Loaded local ${file.name} (${formatBytesCompact(bytes.byteLength)}) · SHA-256 (${sha256.slice(0, 12)}…) · Starting USB stream…`,
        targetVersion: versionLabel
      });

      const res = await usbHardware.installFirmwareViaUsbSerial({
        bytes,
        version: versionLabel,
        sha256,
        onProgress: (pct, sent, total, msg) => {
          const scaledPct = Math.min(99, Math.round(38 + (pct / 100) * 61));
          setInstallProgress({
            stage: pct >= 96 ? 'rebooting' : 'flashing',
            method: 'usb_serial',
            percent: scaledPct,
            bytesWritten: sent,
            totalBytes: total,
            sha256,
            message: msg,
            targetVersion: versionLabel
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
        targetVersion: versionLabel
      });
      onToast(res.message, 'success');
      await onCheckFirmwareUpdate({ force: true, silent: true });
    } catch (err: any) {
      const msg = err?.message || 'Local firmware flash failed';
      setInstallProgress({
        stage: 'error',
        method: 'usb_serial',
        percent: 0,
        message: msg,
        targetVersion: file.name
      });
      onToast(msg, 'error');
    }
  };

  useEffect(() => {
    setRepoDraft(settings.firmwareRepo || DEFAULT_FIRMWARE_GITHUB_REPO);
  }, [settings.firmwareRepo]);

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

  const isFlashing =
    installProgress !== null &&
    installProgress.stage !== 'idle' &&
    installProgress.stage !== 'complete' &&
    installProgress.stage !== 'error';

  const padWifiOnline = Boolean(connection.connected && connection.telemetry?.wifiConnected);

  const handleSaveAndCheckRepo = async () => {
    const parsed = parseGitHubRepoSlug(repoDraft);
    if (!parsed) {
      onToast('Enter a valid GitHub repository such as owner/repo', 'error');
      return;
    }
    setRepoDraft(parsed.slug);
    onUpdateSettings({ firmwareRepo: parsed.slug });
    const result = await onCheckFirmwareUpdate({
      force: true,
      repoOverride: parsed.slug,
      silent: false
    });
    if (result.status === 'error') {
      onToast(result.error || 'Could not reach GitHub repository', 'error');
    } else if (result.status === 'update_available' && result.latestRelease) {
      onToast(`Firmware ${result.latestRelease.version} is available on ${parsed.slug}`);
    } else if (result.status === 'up_to_date' && result.latestRelease) {
      onToast(`ESP32 firmware (${result.installedVersion}) is up to date`);
    } else if (result.latestRelease) {
      onToast(`Latest firmware on ${parsed.slug}: ${result.latestRelease.version}`);
    } else {
      onToast(`Checked ${parsed.slug} — no tagged firmware version found yet`);
    }
  };

  const handleManualFirmwareCheck = async () => {
    const parsed = parseGitHubRepoSlug(repoDraft);
    if (!parsed) {
      onToast('Enter a valid GitHub repository such as owner/repo', 'error');
      return;
    }
    if (parsed.slug !== settings.firmwareRepo) {
      onUpdateSettings({ firmwareRepo: parsed.slug });
    }
    const result = await onCheckFirmwareUpdate({
      force: true,
      repoOverride: parsed.slug,
      silent: false
    });
    if (result.status === 'error') {
      onToast(result.error || 'Firmware update check failed', 'error');
    } else if (result.status === 'update_available' && result.latestRelease) {
      onToast(
        `Update available: ${result.installedVersion} → ${result.latestRelease.version}`
      );
    } else if (result.status === 'up_to_date') {
      onToast(`Firmware ${result.installedVersion} is up to date`);
    } else if (result.status === 'ahead' && result.latestRelease) {
      onToast(
        `Installed ${result.installedVersion} is ahead of GitHub (${result.latestRelease.version})`
      );
    } else if (result.latestRelease) {
      onToast(
        `Latest GitHub version: ${result.latestRelease.version} (connect pad to compare)`
      );
    } else {
      onToast('No firmware release or version macro found on GitHub yet');
    }
  };

  const runOptionalBackupStep = async (method: FirmwareInstallProgress['method'], targetVersion: string) => {
    if (autoBackupBeforeFlash && onExportBackupFile) {
      setInstallProgress({
        stage: 'backing_up',
        method,
        percent: 4,
        message: 'Downloading v2 JSON backup before flashing…',
        targetVersion
      });
      await onExportBackupFile();
    }
  };

  const handleUsbSerialOta = async () => {
    if (!connection.connected) {
      onToast('Connect your MacroPad via USB (or start Demo Mode) first', 'error');
      return;
    }
    if (!selectedRelease || !primaryBinAsset) {
      onToast('No .bin asset published on this release — use Flash Local .bin File', 'error');
      return;
    }

    try {
      await runOptionalBackupStep('usb_serial', selectedRelease.version);

      setInstallProgress({
        stage: 'downloading',
        method: 'usb_serial',
        percent: 6,
        message: `Downloading ${primaryBinAsset.name} from GitHub…`,
        totalBytes: primaryBinAsset.sizeBytes || undefined,
        targetVersion: selectedRelease.version
      });

      const { bytes, sha256 } = await downloadFirmwareBinary(
        primaryBinAsset,
        (loaded, total) => {
          const dlPct = total > 0 ? Math.min(35, Math.round((loaded / total) * 30) + 5) : 20;
          setInstallProgress({
            stage: 'downloading',
            method: 'usb_serial',
            percent: dlPct,
            bytesWritten: loaded,
            totalBytes: total || undefined,
            message: `Downloading ${primaryBinAsset.name} (${formatBytesCompact(loaded)})…`,
            targetVersion: selectedRelease.version
          });
        }
      );

      setInstallProgress({
        stage: 'verifying_hash',
        method: 'usb_serial',
        percent: 38,
        bytesWritten: bytes.byteLength,
        totalBytes: bytes.byteLength,
        sha256,
        message: `Verified SHA-256 (${sha256.slice(0, 12)}…) · Starting USB stream…`,
        targetVersion: selectedRelease.version
      });

      const res = await usbHardware.installFirmwareViaUsbSerial({
        bytes,
        version: selectedRelease.version,
        sha256,
        onProgress: (pct, sent, total, msg) => {
          const scaledPct = Math.min(99, Math.round(38 + (pct / 100) * 61));
          setInstallProgress({
            stage: pct >= 96 ? 'rebooting' : 'flashing',
            method: 'usb_serial',
            percent: scaledPct,
            bytesWritten: sent,
            totalBytes: total,
            sha256,
            message: msg,
            targetVersion: selectedRelease.version
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
        targetVersion: selectedRelease.version
      });
      onToast(res.message, 'success');
      await onCheckFirmwareUpdate({ force: true, silent: true });
    } catch (err: any) {
      const isCors = err instanceof FirmwareCorsError || err?.name === 'FirmwareCorsError';
      const msg = err?.message || 'USB Serial firmware flash failed';
      setInstallProgress({
        stage: 'error',
        method: 'usb_serial',
        percent: 0,
        message: msg,
        corsBlocked: isCors,
        targetVersion: selectedRelease.version
      });
      onToast(
        isCors
          ? 'GitHub Release S3 redirect blocked browser fetch — use Wi-Fi Direct OTA or drop the .bin file'
          : msg,
        'error'
      );
    }
  };

  const activeSnippet =
    blueprintTab === 'manifest'
      ? BLUEPRINT_MANIFEST_SNIPPET
      : blueprintTab === 'github_actions'
      ? BLUEPRINT_ACTIONS_SNIPPET
      : BLUEPRINT_ESP32_CPP_SNIPPET;

  const handleCopySnippet = async () => {
    try {
      await navigator.clipboard.writeText(activeSnippet);
      onToast('Copied setup snippet to clipboard');
    } catch {
      onToast('Could not access clipboard', 'error');
    }
  };

  const latestRelease = firmwareUpdate.latestRelease;

  return (
    <div
      id="firmware-updater-card"
      className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-4"
    >
      {/* Card Header + Auto-Check + Manual Check */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
            <RefreshCw
              className={`w-4 h-4 text-[var(--accent)] ${
                firmwareUpdate.status === 'checking' ? 'animate-spin' : ''
              }`}
            />
            <span>ESP32 Firmware & Separate GitHub Repo Updater</span>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Point at any public GitHub firmware repository to check releases, verify SHA-256 checksums, and flash over USB Serial.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isFlashing}
            onClick={() =>
              onUpdateSettings({
                autoCheckFirmwareUpdates: !settings.autoCheckFirmwareUpdates
              })
            }
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] disabled:opacity-45 cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>Auto-Check</span>
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
            disabled={firmwareUpdate.status === 'checking' || isFlashing}
            onClick={handleManualFirmwareCheck}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-45 cursor-pointer whitespace-nowrap shrink-0"
          >
            {firmwareUpdate.status === 'checking' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            <span>
              {firmwareUpdate.status === 'checking' ? 'Checking…' : 'Check GitHub'}
            </span>
          </button>
        </div>
      </div>

      {/* Live Comparison Status Line */}
      <div className="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-[var(--border-subtle)] text-xs">
        <div className="flex items-center gap-2 min-w-0 flex-wrap font-mono text-[11px] tabular-nums">
          {firmwareUpdate.status === 'checking' ? (
            <span className="text-[var(--text-secondary)]">
              Querying {firmwareUpdate.repoSlug} on GitHub…
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
                Update available · {firmwareUpdate.installedVersion} → {latestRelease.version}
              </span>
            </span>
          ) : firmwareUpdate.status === 'up_to_date' && latestRelease ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>
                Up to date · Installed {firmwareUpdate.installedVersion} matches GitHub ({latestRelease.version})
              </span>
            </span>
          ) : firmwareUpdate.status === 'ahead' && latestRelease ? (
            <span className="inline-flex items-center gap-1.5 text-sky-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>
                Ahead of GitHub · Installed {firmwareUpdate.installedVersion} · Published {latestRelease.version}
              </span>
            </span>
          ) : firmwareUpdate.status === 'no_version_found' ? (
            <span className="text-[var(--text-muted)] font-sans text-xs">
              Checked {firmwareUpdate.repoSlug} · No tagged firmware release or version header found yet.
            </span>
          ) : latestRelease && !connection.connected ? (
            <span className="text-[var(--text-secondary)]">
              Latest on GitHub: {latestRelease.version} · Connect MacroPad via USB to compare & flash
            </span>
          ) : (
            <span className="text-[var(--text-muted)] font-sans text-xs">
              {connection.connected
                ? `Connected firmware: ${connection.firmwareVersion} · Click Check GitHub to inspect releases`
                : 'Connect your Studio MacroPad over USB (or start Demo Mode) to auto-check and flash firmware.'}
            </span>
          )}
        </div>

        {firmwareUpdate.checkedAt && (
          <span className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums shrink-0">
            Checked {firmwareUpdate.checkedAt}
          </span>
        )}
      </div>

      {/* Configurable Separate GitHub Firmware Repository Source */}
      <div className="space-y-1.5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <label
            htmlFor="firmware-github-repo-input"
            className="text-[11px] text-[var(--text-muted)] whitespace-nowrap shrink-0"
          >
            Firmware GitHub repo:
          </label>
          <input
            id="firmware-github-repo-input"
            type="text"
            disabled={isFlashing}
            value={repoDraft}
            onChange={e => setRepoDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                handleSaveAndCheckRepo();
              }
            }}
            placeholder="owner/firmware-repo (or https://github.com/owner/firmware-repo)"
            aria-label="GitHub firmware repository (owner/repo)"
            className="flex-1 px-3 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] disabled:opacity-50 focus:outline-none focus:border-[var(--accent)]"
          />
          {repoDraft.trim() !== settings.firmwareRepo && (
            <button
              type="button"
              disabled={isFlashing}
              onClick={handleSaveAndCheckRepo}
              className="px-3 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-strong)] hover:border-[var(--accent)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0"
            >
              Save & Check
            </button>
          )}
          {settings.firmwareRepo !== DEFAULT_FIRMWARE_GITHUB_REPO && (
            <button
              type="button"
              disabled={isFlashing}
              onClick={() => {
                setRepoDraft(DEFAULT_FIRMWARE_GITHUB_REPO);
                onUpdateSettings({ firmwareRepo: DEFAULT_FIRMWARE_GITHUB_REPO });
                onCheckFirmwareUpdate({
                  force: true,
                  repoOverride: DEFAULT_FIRMWARE_GITHUB_REPO,
                  silent: false
                });
              }}
              className="px-2.5 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0"
            >
              Reset default
            </button>
          )}
        </div>
      </div>

      {/* Release Selector + Binary Asset Inspector + Direct In-App Flash Controls */}
      <div className="p-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="space-y-0.5 min-w-0">
            <div className="text-xs font-semibold text-[var(--text-primary)]">
              Direct In-App Firmware Flash
            </div>
            <div className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums truncate">
              {selectedRelease ? (
                primaryBinAsset ? (
                  <>
                    <span>{primaryBinAsset.name}</span>
                    {primaryBinAsset.sizeBytes > 0 && (
                      <>
                        <span aria-hidden="true"> · </span>
                        <span>{formatBytesCompact(primaryBinAsset.sizeBytes)}</span>
                      </>
                    )}
                    <span aria-hidden="true"> · </span>
                    <span>
                      {primaryBinAsset.sha256
                        ? `SHA-256 ${primaryBinAsset.sha256.slice(0, 10)}…`
                        : 'SHA-256 computed on download'}
                    </span>
                  </>
                ) : (
                  <span>
                    Release {selectedRelease.version} has no .bin asset attached — attach a .bin in GitHub Releases or flash a local .bin file
                  </span>
                )
              ) : (
                <span>
                  Flash a published GitHub .bin release or select any compiled local .bin image
                </span>
              )}
            </div>
          </div>

          {availableReleases.length > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              <select
                aria-label="Target firmware version to install"
                disabled={isFlashing}
                value={selectedRelease?.version || ''}
                onChange={e => setSelectedVersion(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] tabular-nums"
              >
                {availableReleases.map((rel, idx) => (
                  <option key={rel.version} value={rel.version}>
                    v{rel.version}
                    {idx === 0 ? ' (Latest)' : ''}
                    {selectPrimaryOtaBinaryAsset(rel.assets) ? ' · .bin' : ' · source'}
                  </option>
                ))}
              </select>

              {selectedRelease?.notes && (
                <button
                  type="button"
                  onClick={() => setShowReleaseNotes(v => !v)}
                  className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                >
                  {showReleaseNotes ? 'Hide notes' : 'Notes'}
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

        {/* Pre-flash safety backup toggle */}
        {onExportBackupFile && (
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoBackupBeforeFlash}
              disabled={isFlashing}
              onChange={e => setAutoBackupBeforeFlash(e.target.checked)}
              className="rounded border-[var(--border-strong)] accent-[var(--accent)]"
            />
            <span>Download v2 JSON profile backup automatically before flashing</span>
          </label>
        )}

        {/* Flash Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".bin"
            className="hidden"
            onChange={handleLocalBinSelected}
          />
          <button
            type="button"
            disabled={isFlashing || !connection.connected || !primaryBinAsset}
            onClick={handleUsbSerialOta}
            title={
              !connection.connected
                ? 'Connect MacroPad via USB or Demo Mode first'
                : !primaryBinAsset
                ? 'Selected GitHub release does not contain a .bin binary'
                : 'Downloads .bin in browser, verifies SHA-256, and streams 512B chunks over USB WebSerial'
            }
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-40 disabled:pointer-events-none transition-opacity cursor-pointer whitespace-nowrap shrink-0"
          >
            <Usb className="w-3.5 h-3.5" />
            <span>
              {selectedRelease && primaryBinAsset
                ? `Flash v${selectedRelease.version} via USB Serial`
                : 'Flash via USB Serial'}
            </span>
          </button>

          <button
            type="button"
            disabled={isFlashing || !connection.connected}
            onClick={() => fileInputRef.current?.click()}
            title="Select any custom compiled .bin file from your computer and flash over USB WebSerial"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-strong)] hover:border-[var(--accent)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileUp className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>Flash Local .bin File</span>
          </button>

          {padWifiOnline && primaryBinAsset && selectedRelease && (
            <button
              type="button"
              disabled={isFlashing}
              onClick={async () => {
                try {
                  await runOptionalBackupStep('wifi_ota', selectedRelease.version);
                  setInstallProgress({
                    stage: 'downloading',
                    method: 'wifi_ota',
                    percent: 10,
                    message: `Instructing ESP32 to download ${primaryBinAsset.name} over Wi-Fi…`,
                    targetVersion: selectedRelease.version
                  });
                  const res = await usbHardware.installFirmwareViaWifiOta({
                    url: primaryBinAsset.downloadUrl,
                    version: selectedRelease.version,
                    sha256: primaryBinAsset.sha256,
                    onProgress: (pct, msg, phase) => {
                      setInstallProgress({
                        stage: phase,
                        method: 'wifi_ota',
                        percent: pct,
                        message: msg,
                        targetVersion: selectedRelease.version
                      });
                    }
                  });
                  setInstallProgress({
                    stage: 'complete',
                    method: 'wifi_ota',
                    percent: 100,
                    message: res.message,
                    targetVersion: selectedRelease.version
                  });
                  onToast(res.message, 'success');
                  await onCheckFirmwareUpdate({ force: true, silent: true });
                } catch (err: any) {
                  const msg = err?.message || 'Wi-Fi OTA update failed';
                  setInstallProgress({
                    stage: 'error',
                    method: 'wifi_ota',
                    percent: 0,
                    message: msg,
                    targetVersion: selectedRelease.version
                  });
                  onToast(msg, 'error');
                }
              }}
              title="ESP32 downloads the firmware binary directly from GitHub over Wi-Fi"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-45 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              <span>Install v{selectedRelease.version} via Wi-Fi OTA</span>
            </button>
          )}
        </div>

        {/* Live Staged Flash Progress */}
        {installProgress && installProgress.stage !== 'idle' && (
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
                {isFlashing && <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />}
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
                  style={{ width: `${Math.max(2, Math.min(100, installProgress.percent))}%` }}
                />
              </div>
            )}

            <div className="text-[11px] leading-relaxed opacity-90">
              {installProgress.message}
              {installProgress.sha256 && (
                <span className="font-mono opacity-80">
                  {' '}
                  · SHA-256 {installProgress.sha256.slice(0, 12)}…
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Collapsible Separate GitHub Repo & ESP32 OTA Engineering Blueprint */}
      <div className="pt-2 border-t border-[var(--border-subtle)] space-y-3">
        <button
          type="button"
          onClick={() => setShowBlueprint(v => !v)}
          className="w-full flex items-center justify-between gap-2 text-left text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-[var(--accent)] shrink-0" />
            <span>
              How to Connect a Separate GitHub Firmware Repo (CI Release + ESP32 OTA Code)
            </span>
          </span>
          {showBlueprint ? (
            <ChevronUp className="w-4 h-4 shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 shrink-0" />
          )}
        </button>

        {showBlueprint && (
          <div className="space-y-3 p-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Keep your ESP32 C++ firmware in its own dedicated GitHub repository (for example{' '}
              <span className="font-mono text-[var(--text-primary)]">
                your-org/studio-macropad-firmware
              </span>
              ) and set <span className="font-mono text-[var(--text-primary)]">VITE_FIRMWARE_GITHUB_REPO</span> in{' '}
              <span className="font-mono text-[var(--text-primary)]">.env</span> or paste the slug above. Pushing a git tag like{' '}
              <span className="font-mono text-[var(--text-primary)]">v3.3.0</span> compiles the{' '}
              <span className="font-mono text-[var(--text-primary)]">.bin</span>, publishes its{' '}
              <span className="font-mono text-[var(--text-primary)]">SHA-256</span>, and makes it immediately flashable here.
            </p>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                {(
                  [
                    { id: 'github_actions', label: '1. GitHub Actions (.yml)' },
                    { id: 'manifest', label: '2. CORS Manifest (Optional)' },
                    { id: 'esp32_cpp', label: '3. ESP32 OTA Handlers (.ino)' }
                  ] as const
                ).map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setBlueprintTab(tab.id)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      blueprintTab === tab.id
                        ? 'bg-[var(--bg-panel)] text-[var(--text-primary)] shadow-sm'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleCopySnippet}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-[11px] font-semibold text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy snippet</span>
              </button>
            </div>

            <pre className="p-3 rounded-xl bg-[#090B0F] border border-[var(--border-subtle)] font-mono text-[11px] text-zinc-300 overflow-x-auto max-h-64 overflow-y-auto leading-relaxed">
              {activeSnippet}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
