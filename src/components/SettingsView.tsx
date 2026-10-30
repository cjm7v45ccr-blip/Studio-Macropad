import React, { useState, useEffect } from 'react';
import {
  BleHostSlot,
  DebugLogEntry,
  DeviceConnectionInfo,
  FirmwareInstallProgress,
  FirmwareReleaseInfo,
  FirmwareUpdateState,
  KeyboardLayoutId,
  StudioProfile,
  StudioSettings,
  SyncStatusPill,
  ThemeMode,
  bleSlotToProfileId
} from '../types/studio';
import { ToastVariant } from '../hooks/useStudioState';
import { usbHardware } from '../services/usbHardwareService';
import { DiffConfirmModal } from './DiffConfirmModal';
import {
  FirmwareUpdateBanner,
  FirmwareUpdaterCard
} from './FirmwareUpdaterCard';
import {
  Sun,
  Moon,
  Monitor,
  Volume2,
  VolumeX,
  RotateCcw,
  Check,
  Wifi,
  Tv,
  Shield,
  Cpu,
  Bluetooth,
  Activity,
  Terminal,
  Copy,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  SlidersHorizontal,
  Code2,
  Download,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  RefreshCw
} from 'lucide-react';
import { FirmwareBinGuideModal } from './FirmwareBinGuideModal';

interface SettingsViewProps {
  profiles: StudioProfile[];
  settings: StudioSettings;
  connection: DeviceConnectionInfo;
  syncStatus: SyncStatusPill;
  currentRev: number;
  currentDeviceId: string | null;
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
  onUploadLocalFirmwareFile?: (
    file: File,
    opts?: { autoBackupBeforeFlash?: boolean }
  ) => Promise<boolean>;
  onUpdateSettings: (patch: Partial<StudioSettings>) => void;
  onPullFromUsb: () => Promise<boolean>;
  onSwitchBleHost: (slot: BleHostSlot) => Promise<void> | void;
  onResetBothProfiles: () => Promise<void> | void;
  onClearLocalCache: () => void;
  onOpenSetupWizard?: () => void;
  onEnterHardwareSetupMode?: () => Promise<void> | void;
  onExportBackupFile?: () => Promise<void> | void;
  onToast: (msg: string, variant?: ToastVariant) => void;
}

const ACCENT_PRESETS = [
  { label: 'Cobalt Blue', hex: '#3B82F6' },
  { label: 'Emerald', hex: '#10B981' },
  { label: 'Violet', hex: '#8B5CF6' },
  { label: 'Amber', hex: '#F59E0B' },
  { label: 'Rose', hex: '#EC4899' },
  { label: 'Cyan', hex: '#06B6D4' }
];

const KEYBOARD_LAYOUTS: { id: KeyboardLayoutId; label: string }[] = [
  { id: 'us_qwerty', label: 'US English (QWERTY)' },
  { id: 'uk_qwerty', label: 'UK English (ISO)' },
  { id: 'de_qwertz', label: 'German (QWERTZ)' },
  { id: 'fr_azerty', label: 'French (AZERTY)' },
  { id: 'es_iso', label: 'Spanish (ISO)' },
  { id: 'nordic_iso', label: 'Nordic (ISO)' },
  { id: 'jp_jis', label: 'Japanese (JIS)' }
];

type SettingsSectionTab =
  | 'all'
  | 'connection'
  | 'firmware'
  | 'wifi_tv'
  | 'preferences'
  | 'console';

const SETTINGS_TABS: { id: SettingsSectionTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'connection', label: 'Connection & Hosts' },
  { id: 'firmware', label: 'Firmware' },
  { id: 'wifi_tv', label: 'Wi-Fi & TV' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'console', label: 'Console & Reset' }
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  profiles,
  settings,
  connection,
  syncStatus,
  currentRev,
  currentDeviceId,
  firmwareUpdate,
  installProgress,
  isUploadingFirmware,
  isFirmwareBannerDismissed,
  onDismissFirmwareBanner,
  onCheckFirmwareUpdate,
  onUploadFirmwareToMacropad,
  onUploadLocalFirmwareFile,
  onUpdateSettings,
  onPullFromUsb,
  onSwitchBleHost,
  onResetBothProfiles,
  onClearLocalCache,
  onOpenSetupWizard,
  onEnterHardwareSetupMode,
  onExportBackupFile,
  onToast
}) => {
  const [firmwareBinGuideOpen, setFirmwareBinGuideOpen] = useState<boolean>(false);
  const [diagRefreshing, setDiagRefreshing] = useState<boolean>(false);
  // Wi-Fi Provisioning State (live from pad only — never stored in localStorage)
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPass, setWifiPass] = useState('');
  const [wifiBusy, setWifiBusy] = useState(false);
  const [wifiStatusBanner, setWifiStatusBanner] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  // SmartCast TV State (live from pad only — never stored in localStorage)
  const [tvIp, setTvIp] = useState('');
  const [tvPort, setTvPort] = useState('7345');
  const [tvPin, setTvPin] = useState('');
  const [pairingActive, setPairingActive] = useState(false);
  const [showManualTokenMode, setShowManualTokenMode] = useState(false);
  const [tvToken, setTvToken] = useState('');
  const [tvBusy, setTvBusy] = useState(false);
  const [tvTestResult, setTvTestResult] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [forgetTvModalOpen, setForgetTvModalOpen] = useState(false);

  // HTTP API Security State (live from pad only — never stored in localStorage)
  const [httpToken, setHttpToken] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [bleBusy, setBleBusy] = useState(false);

  // Sub-navigation, Advanced Disclosures & Firmware v4.5.0 Source Studio
  const [settingsTab, setSettingsTab] = useState<SettingsSectionTab>('all');
  const [showAdvancedProtocol, setShowAdvancedProtocol] = useState(false);
  const [sourceBusy, setSourceBusy] = useState(false);

  // Reset Confirmations
  const [resetProfilesModalOpen, setResetProfilesModalOpen] = useState(false);
  const [confirmClearLocal, setConfirmClearLocal] = useState(false);

  // Debug Console Logs (secrets already redacted in usbHardwareService)
  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>(() =>
    usbHardware.getDebugLogs()
  );

  useEffect(() => {
    const unsub = usbHardware.onDebugLogsChange(entries => {
      setDebugLogs(entries);
    });
    return unsub;
  }, []);

  const telemetry = connection.telemetry;
  const isDemo = connection.transport === 'demo';

  // Populate live pad-only fields strictly from live `/api/status` telemetry
  useEffect(() => {
    if (!connection.connected || !telemetry) {
      setWifiSsid('');
      setTvIp('');
      setTvPort('7345');
      return;
    }
    setWifiSsid(telemetry.ssid || '');
    setTvIp(telemetry.tvHost || '');
    setTvPort(String(telemetry.tvPort || 7345));
  }, [connection.connected, telemetry?.ssid, telemetry?.tvHost, telemetry?.tvPort]);

  const handleSaveWifi = async () => {
    if (!wifiSsid.trim()) return;
    setWifiBusy(true);
    setWifiStatusBanner(null);
    const submittedPass = wifiPass;
    // Clear password field immediately so it never lingers in state or DOM
    setWifiPass('');

    try {
      const outcome = await usbHardware.saveWifiAndWait(wifiSsid, submittedPass, 20000);
      setWifiStatusBanner({
        ok: outcome.connected,
        text: outcome.message
      });
      onToast(outcome.message, outcome.connected ? 'success' : 'error');
    } catch (err: any) {
      const msg = err?.message || 'Could not save Wi-Fi credentials';
      setWifiStatusBanner({ ok: false, text: msg });
      onToast(msg, 'error');
    } finally {
      setWifiBusy(false);
    }
  };

  const handleStartTvPairing = async () => {
    if (!tvIp.trim()) {
      onToast('Enter your SmartCast TV IP address first', 'error');
      return;
    }
    setTvBusy(true);
    setTvTestResult(null);
    try {
      const res = await usbHardware.startTvPairing(tvIp, Number(tvPort) || 7345);
      setPairingActive(true);
      onToast(res.message || 'Check your TV screen for the 4-digit PIN');
    } catch (err: any) {
      onToast(err?.message || 'Failed to start TV pairing', 'error');
    } finally {
      setTvBusy(false);
    }
  };

  const handleSubmitTvPinAndAutoTest = async () => {
    if (!tvPin.trim()) return;
    setTvBusy(true);
    setTvTestResult(null);
    try {
      await usbHardware.submitTvPin(tvPin);
      setPairingActive(false);
      setTvPin('');

      // Automatically run `/api/tv/test` after PIN submission and report pass/fail!
      const testRes = await usbHardware.testTv();
      const passed = Boolean(testRes?.ok);
      const summary = passed
        ? `Pairing & automatic TV test passed: ${testRes.message || 'TV reachable'}`
        : `PIN saved, but automatic TV test failed: ${testRes?.message || 'TV unreachable'}`;
      setTvTestResult({ ok: passed, text: summary });
      onToast(summary, passed ? 'success' : 'error');
    } catch (err: any) {
      const msg = err?.message || 'Invalid PIN or TV rejected pairing';
      setTvTestResult({ ok: false, text: msg });
      onToast(msg, 'error');
    } finally {
      setTvBusy(false);
    }
  };

  const handleSaveTvManualToken = async () => {
    if (!tvIp.trim()) {
      onToast('Enter TV IP address first', 'error');
      return;
    }
    if (!tvToken.trim()) {
      onToast('Enter your SmartCast auth token', 'error');
      return;
    }
    setTvBusy(true);
    setTvTestResult(null);
    const tokenToSave = tvToken;
    // Never store token in browser — clear input right away
    setTvToken('');

    try {
      const res = await usbHardware.saveTvConfig(
        tvIp,
        Number(tvPort) || 7345,
        tokenToSave
      );
      setShowManualTokenMode(false);
      const testRes = await usbHardware.testTv().catch(() => null);
      if (testRes) {
        const passed = Boolean(testRes.ok);
        setTvTestResult({
          ok: passed,
          text: passed
            ? `Token saved & TV test passed (${tvIp}:${Number(tvPort) || 7345})`
            : `Token saved, but TV test failed: ${testRes.message || 'Unreachable'}`
        });
      }
      onToast(res.message || 'Saved TV IP, port, and auth token to MacroPad');
    } catch (err: any) {
      onToast(err?.message || 'Failed to save TV configuration', 'error');
    } finally {
      setTvBusy(false);
    }
  };

  const handleTestTv = async () => {
    setTvBusy(true);
    setTvTestResult(null);
    try {
      const res = await usbHardware.testTv();
      const passed = Boolean(res?.ok);
      const text = passed
        ? `Pass: ${res.message || 'SmartCast TV is reachable'}`
        : `Fail: ${res?.message || 'SmartCast TV did not respond'}`;
      setTvTestResult({ ok: passed, text });
      onToast(text, passed ? 'success' : 'error');
    } catch (err: any) {
      const msg = `Fail: ${err?.message || 'TV test failed'}`;
      setTvTestResult({ ok: false, text: msg });
      onToast(msg, 'error');
    } finally {
      setTvBusy(false);
    }
  };

  const handleConfirmForgetTv = async () => {
    setForgetTvModalOpen(false);
    setTvBusy(true);
    setTvTestResult(null);
    try {
      const res = await usbHardware.forgetTv();
      setTvIp('');
      setTvToken('');
      setPairingActive(false);
      onToast(res.message || 'Cleared TV settings on MacroPad');
    } catch (err: any) {
      onToast(err?.message || 'Failed to forget TV', 'error');
    } finally {
      setTvBusy(false);
    }
  };

  const handleSaveHttpAuth = async () => {
    setAuthBusy(true);
    const tokenVal = httpToken;
    setHttpToken('');
    try {
      const res = await usbHardware.setHttpApiToken(tokenVal);
      onToast(res.message || 'Updated HTTP API token on MacroPad');
    } catch (err: any) {
      onToast(
        err?.message || 'Token must be 8–64 chars, or empty to disable',
        'error'
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSwitchBleHost = async (slot: BleHostSlot) => {
    if (!connection.connected || bleBusy) return;
    setBleBusy(true);
    try {
      await onSwitchBleHost(slot);
    } finally {
      setBleBusy(false);
    }
  };

  const handleCopyDebugConsole = async () => {
    const formatted = debugLogs
      .map(e => `[${e.timestamp}] ${e.direction.toUpperCase()}: ${e.line}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(formatted || 'No serial logs recorded.');
      onToast('Copied debug console log to clipboard');
    } catch {
      onToast('Could not access clipboard', 'error');
    }
  };

  const themeOptions: {
    id: ThemeMode;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'system', label: 'System', icon: Monitor },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'light', label: 'Light', icon: Sun }
  ];

  const handleDownloadV45Source = async () => {
    setSourceBusy(true);
    try {
      const res = await fetch('/firmware-source/StudioMacroPad_v4.5.0.ino');
      if (!res.ok) throw new Error('Could not load firmware source sketch');
      const code = await res.text();
      const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'StudioMacroPad_v4.5.0.ino';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onToast('Downloaded StudioMacroPad_v4.5.0.ino');
    } catch (err: any) {
      onToast(err?.message || 'Failed to download C++ sketch', 'error');
    } finally {
      setSourceBusy(false);
    }
  };

  const handleCopyV45Source = async () => {
    setSourceBusy(true);
    try {
      const res = await fetch('/firmware-source/StudioMacroPad_v4.5.0.ino');
      if (!res.ok) throw new Error('Could not load firmware source sketch');
      const code = await res.text();
      await navigator.clipboard.writeText(code);
      onToast('Copied StudioMacroPad_v4.5.0.ino to clipboard');
    } catch (err: any) {
      onToast(err?.message || 'Could not copy C++ sketch', 'error');
    } finally {
      setSourceBusy(false);
    }
  };

  const handleJumpToUpdater = () => {
    if (settingsTab !== 'all' && settingsTab !== 'firmware') {
      setSettingsTab('firmware');
      window.setTimeout(() => {
        document
          .getElementById('firmware-updater-card')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
      return;
    }
    const el = document.getElementById('firmware-updater-card');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const showConnection = settingsTab === 'all' || settingsTab === 'connection';
  const showFirmware = settingsTab === 'all' || settingsTab === 'firmware';
  const showWifiTv = settingsTab === 'all' || settingsTab === 'wifi_tv';
  const showPreferences = settingsTab === 'all' || settingsTab === 'preferences';
  const showConsole = settingsTab === 'all' || settingsTab === 'console';

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="space-y-3.5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-lg font-bold text-[var(--text-primary)]">
                Settings & Diagnostics
              </h1>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Device diagnostics, firmware updates, Bluetooth hosts, Wi-Fi, SmartCast TV pairing, preferences, and serial console.
              </p>
            </div>
            {connection.connected && (
              <button
                type="button"
                onClick={onPullFromUsb}
                className="px-3 py-1.5 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0"
              >
                Refresh Status
              </button>
            )}
          </div>

          {/* Segmented Settings Sub-Navigation */}
          <nav
            aria-label="Settings sections"
            className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] overflow-x-auto"
          >
            {SETTINGS_TABS.map(tab => {
              const active = settingsTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSettingsTab(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        <FirmwareUpdateBanner
          connection={connection}
          firmwareUpdate={firmwareUpdate}
          installProgress={installProgress}
          isUploadingFirmware={isUploadingFirmware}
          isFirmwareBannerDismissed={isFirmwareBannerDismissed}
          onDismissFirmwareBanner={onDismissFirmwareBanner}
          onUploadToMacropad={() => onUploadFirmwareToMacropad()}
          onJumpToUpdater={handleJumpToUpdater}
        />

        {/* Guided Setup & Hardware Setup Mode Provisioning */}
        {showConnection && onOpenSetupWizard && (
          <section className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <SlidersHorizontal className="w-4 h-4 text-[var(--accent)] shrink-0" />
                  <span>Guided Setup & Provisioning</span>
                </div>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Walk through starter OS layouts, 3 Bluetooth host names, optional Wi-Fi & SmartCast TV pairing, and live switch verification. Opens automatically when a fresh or reset board enters Setup Mode.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap shrink-0">
                {connection.connected && onEnterHardwareSetupMode && (
                  <button
                    type="button"
                    onClick={onEnterHardwareSetupMode}
                    className="px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    title="Put the connected MacroPad into on-device Setup Mode"
                  >
                    Enter Setup Mode
                  </button>
                )}
                <button
                  type="button"
                  onClick={onOpenSetupWizard}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap shrink-0"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Open Guided Setup</span>
                </button>
              </div>
            </div>

            {connection.connected && (
              <div className="pt-2.5 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2 flex-wrap font-mono text-[11px] text-[var(--text-muted)] tabular-nums">
                <span>
                  Current board state:{' '}
                  <span
                    className={
                      telemetry?.setupMode
                        ? 'text-amber-300 font-semibold'
                        : 'text-emerald-400 font-semibold'
                    }
                  >
                    {telemetry?.setupMode ? 'Setup Mode Active' : 'Provisioned (Normal)'}
                  </span>
                </span>
              </div>
            )}
          </section>
        )}

        {/* 1. Live Device Diagnostics Card */}
        {showConnection && (
          <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
                <Cpu className="w-4 h-4 text-[var(--accent)]" />
                <span>Device Diagnostics</span>
              </div>

              <div className="flex items-center gap-2.5 flex-wrap">
                <div className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
                  <span>{syncStatus}</span>
                  <span className="text-[var(--text-muted)]" aria-hidden="true">
                    ·
                  </span>
                  <span>{connection.connected ? connection.deviceName : 'Disconnected'}</span>
                  {connection.connected && connection.lastSyncedAt && (
                    <>
                      <span className="text-[var(--text-muted)]" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-[var(--text-muted)]">
                        Live {connection.lastSyncedAt}
                      </span>
                    </>
                  )}
                </div>

                {connection.connected && (
                  <button
                    type="button"
                    disabled={diagRefreshing}
                    onClick={async () => {
                      setDiagRefreshing(true);
                      try {
                        await usbHardware.fetchStatus();
                        onToast('Refreshed live hardware diagnostics');
                      } catch (err: any) {
                        onToast(err?.message || 'Could not query MacroPad status', 'error');
                      } finally {
                        setDiagRefreshing(false);
                      }
                    }}
                    title="Poll /api/status from MacroPad right now (also auto-updates every 4s)"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-45 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${diagRefreshing ? 'animate-spin text-[var(--accent)]' : ''}`}
                    />
                    <span>Refresh</span>
                  </button>
                )}
              </div>
            </div>

            {(() => {
              const fullDeviceId = connection.deviceId || currentDeviceId || '';
              const liveRev =
                connection.connected && typeof connection.rev === 'number'
                  ? connection.rev
                  : currentRev;
              const reportedRawFw = telemetry?.reportedFirmwareVersion;
              const hasEmbeddedFwDiff = Boolean(
                connection.connected &&
                  reportedRawFw &&
                  reportedRawFw !== connection.firmwareVersion
              );
              const heapBytes = telemetry?.freeHeap ?? 0;

              return (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-6 gap-2.5 text-xs">
                    {/* Device ID (2 cols on desktop so full ESP32 MAC ID never truncates) */}
                    <div className="sm:col-span-2 p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex flex-col justify-between gap-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-[var(--text-muted)]">Device ID</span>
                        {fullDeviceId && (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(fullDeviceId);
                                onToast(`Copied Device ID (${fullDeviceId})`);
                              } catch {
                                onToast('Could not copy Device ID', 'error');
                              }
                            }}
                            title="Copy full Device ID"
                            className="inline-flex items-center gap-1 text-[10px] font-mono text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </button>
                        )}
                      </div>
                      <div className="font-mono font-bold text-[var(--text-primary)] break-all tabular-nums">
                        {fullDeviceId || '—'}
                      </div>
                      <div className="font-mono text-[10px] text-[var(--text-muted)] tabular-nums">
                        {connection.connected
                          ? isDemo
                            ? 'Virtual Demo Transport'
                            : `USB Serial 115,200 bd${
                                connection.vendorProduct ? ` · ${connection.vendorProduct}` : ''
                              }`
                          : currentDeviceId
                          ? 'Cached offline workspace'
                          : 'No MacroPad connected'}
                      </div>
                    </div>

                    {/* Firmware Version */}
                    <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex flex-col justify-between gap-1">
                      <div className="text-[11px] text-[var(--text-muted)]">
                        {connection.connected ? 'Firmware version' : 'Last synced FW'}
                      </div>
                      <div className="font-mono font-bold text-[var(--text-primary)] tabular-nums">
                        {connection.connected
                          ? connection.firmwareVersion
                          : settings.lastKnownFirmware || '—'}
                      </div>
                      <div className="font-mono text-[10px] text-[var(--text-muted)] tabular-nums">
                        {hasEmbeddedFwDiff
                          ? `config.h: ${reportedRawFw}`
                          : connection.connected
                          ? telemetry?.supportsNativeDelay
                            ? 'Native Delay + 512B'
                            : 'Standard PadLink'
                          : 'Connect USB to read'}
                      </div>
                    </div>

                    {/* API Version */}
                    <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex flex-col justify-between gap-1">
                      <div className="text-[11px] text-[var(--text-muted)]">API version</div>
                      <div className="font-mono font-bold text-[var(--text-primary)] tabular-nums">
                        {connection.connected && telemetry ? `v${telemetry.apiVersion}` : '—'}
                      </div>
                      <div className="font-mono text-[10px] text-[var(--text-muted)] tabular-nums">
                        {connection.connected && telemetry
                          ? telemetry.connectionType || 'USB'
                          : 'PadLink JSON'}
                      </div>
                    </div>

                    {/* Config Revision */}
                    <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex flex-col justify-between gap-1">
                      <div className="text-[11px] text-[var(--text-muted)]">Config revision</div>
                      <div className="font-mono font-bold text-[var(--text-primary)] tabular-nums">
                        rev {liveRev}
                      </div>
                      <div className="font-mono text-[10px] text-[var(--text-muted)] tabular-nums">
                        {connection.connected && telemetry
                          ? `Active: ${telemetry.activeProfile}`
                          : 'Local NVS mirror'}
                      </div>
                    </div>

                    {/* Free SRAM */}
                    <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex flex-col justify-between gap-1">
                      <div className="text-[11px] text-[var(--text-muted)]">Free SRAM</div>
                      <div className="font-mono font-bold text-[var(--text-primary)] tabular-nums">
                        {connection.connected && telemetry && heapBytes > 0
                          ? `${(heapBytes / 1024).toFixed(1)} KB`
                          : '—'}
                      </div>
                      <div className="font-mono text-[10px] text-[var(--text-muted)] tabular-nums">
                        {connection.connected && telemetry && heapBytes > 0
                          ? `${heapBytes.toLocaleString()} B free`
                          : 'ESP32 heap'}
                      </div>
                    </div>
                  </div>

                  {connection.connected && telemetry && (
                    <div className="pt-2.5 border-t border-[var(--border-subtle)] flex items-center gap-x-2.5 gap-y-1 flex-wrap font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
                      <span>
                        BLE:{' '}
                        <span
                          className={
                            telemetry.bleConnected ? 'text-emerald-400' : 'text-amber-300'
                          }
                        >
                          H{telemetry.bleActiveHost} {telemetry.bleDeviceName} (
                          {telemetry.bleConnected ? 'Connected' : 'Advertising'})
                        </span>
                      </span>
                      <span className="text-[var(--text-muted)]" aria-hidden="true">
                        ·
                      </span>
                      <span>
                        Wi-Fi:{' '}
                        <span
                          className={
                            telemetry.wifiConnected
                              ? 'text-emerald-400'
                              : 'text-[var(--text-muted)]'
                          }
                        >
                          {telemetry.wifiConnected
                            ? `${telemetry.ssid || 'Online'}${
                                telemetry.ip ? ` (${telemetry.ip})` : ''
                              }`
                            : telemetry.ssid
                            ? `${telemetry.ssid} (Offline)`
                            : 'Not configured'}
                        </span>
                      </span>
                      <span className="text-[var(--text-muted)]" aria-hidden="true">
                        ·
                      </span>
                      <span>
                        TV:{' '}
                        <span
                          className={
                            telemetry.tvPaired
                              ? 'text-emerald-400'
                              : 'text-[var(--text-muted)]'
                          }
                        >
                          {telemetry.tvPaired
                            ? `Paired (${telemetry.tvHost}:${telemetry.tvPort})`
                            : telemetry.tvConfigured
                            ? `${telemetry.tvHost} (Unpaired)`
                            : 'Unpaired'}
                        </span>
                      </span>
                      <span className="text-[var(--text-muted)]" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-[var(--text-muted)]">
                        Events: {telemetry.eventsEnabled !== false ? 'Live' : 'Muted'}
                      </span>
                    </div>
                  )}
                </>
              );
            })()}

            {isDemo && telemetry && (
              <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[11px] text-[var(--text-muted)]">
                  Demo Mode Simulator:
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() =>
                      usbHardware.setDemoLinkState({
                        bleConnected: !telemetry.bleConnected
                      })
                    }
                    className="px-2.5 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Toggle BLE ({telemetry.bleConnected ? 'Connected' : 'Disconnected'})
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      usbHardware.setDemoLinkState({
                        wifiConnected: !telemetry.wifiConnected
                      })
                    }
                    className="px-2.5 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Toggle Wi-Fi ({telemetry.wifiConnected ? 'Connected' : 'Down'})
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      usbHardware.setDemoLinkState({
                        firmwareVersion:
                          connection.firmwareVersion === 'v1.0.0' ||
                          connection.firmwareVersion === '1.0.0'
                            ? '4.5.0'
                            : '1.0.0'
                      })
                    }
                    className="px-2.5 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0 tabular-nums"
                    title="Simulate older connected firmware in Demo Mode to test the firmware update flow"
                  >
                    Simulate FW (
                    {connection.firmwareVersion === 'v1.0.0' ||
                    connection.firmwareVersion === '1.0.0'
                      ? 'Restore 4.5.0'
                      : 'Set 1.0.0'}
                    )
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 1B. MacroPad Firmware Updates + v4.5.0 Source Studio */}
        {showFirmware && (
          <>
            <FirmwareUpdaterCard
              settings={settings}
              connection={connection}
              firmwareUpdate={firmwareUpdate}
              installProgress={installProgress}
              isUploadingFirmware={isUploadingFirmware}
              isFirmwareBannerDismissed={isFirmwareBannerDismissed}
              onDismissFirmwareBanner={onDismissFirmwareBanner}
              onCheckFirmwareUpdate={onCheckFirmwareUpdate}
              onUploadFirmwareToMacropad={onUploadFirmwareToMacropad}
              onUploadLocalFirmwareFile={onUploadLocalFirmwareFile}
              onUpdateSettings={onUpdateSettings}
              onExportBackupFile={onExportBackupFile}
              onToast={onToast}
            />

            <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)] flex-wrap">
                    <Code2 className="w-4 h-4 text-[var(--accent)] shrink-0" />
                    <span>ESP32 Firmware v4.5.0 Source Studio</span>
                    <span className="font-mono text-[11px] font-medium text-emerald-400">
                      · Arduino / PlatformIO
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    Complete C++ sketch engineered for your 9-button + rotary dial ESP32 MacroPad with standalone multi-screen macro delays and hardware safety upgrades.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                   <button
                    type="button"
                    onClick={() => setFirmwareBinGuideOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-sky-400" />
                    <span>Firmware .bin Guide</span>
                  </button>
                  <button
                    type="button"
                    disabled={sourceBusy}
                    onClick={handleCopyV45Source}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-45 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                    <span>Copy C++ Sketch</span>
                  </button>
                  <button
                    type="button"
                    disabled={sourceBusy}
                    onClick={handleDownloadV45Source}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-45 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download StudioMacroPad_v4.5.0.ino</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[var(--text-secondary)]">
                <div className="p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
                  <div className="font-semibold text-[var(--text-primary)]">
                    Native DELAY:&lt;ms&gt; Engine
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    Runs 1 ms–60 s multi-screen login & 2FA waits completely unplugged in &lt;80 bytes.
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
                  <div className="font-semibold text-[var(--text-primary)]">
                    512-Byte Slot & Whitespace Parity
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    Matches single-slot saves and live tests to 512 B and preserves leading/trailing spaces in TEXT steps.
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
                  <div className="font-semibold text-[var(--text-primary)]">
                    Hardware Panic-Cancel & Velocity Dial
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    Tap any physical key during a wait to abort a running macro; fast knob spins step 2×–3×.
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
                  <div className="font-semibold text-[var(--text-primary)]">
                    Radio-Safe USB OTA + OLED Progress
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    Quiesces BLE/Wi-Fi radios before flash writes and renders a live progress bar on the 128×64 OLED.
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* 2. Multi-Host Bluetooth Engine */}
        {showConnection && (
        <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                  connection.connected && telemetry?.bleConnected
                    ? 'bg-sky-500/15 border-sky-500/35 text-sky-400'
                    : 'bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                }`}
              >
                <Bluetooth className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-2 flex-wrap">
                  <span>Multi-Host Bluetooth Engine</span>
                  {connection.connected && telemetry && (
                    <span className="font-mono text-[11px] font-semibold text-sky-400 tabular-nums">
                      · H{telemetry.bleActiveHost} {telemetry.bleDeviceName}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  3 independent Bluetooth host profiles with unique MAC addresses (<span className="font-mono">Studio Pad 1–3</span>) and separate 11-control button layouts. Hold <span className="font-mono">Mode</span> + rotate the dial on hardware to cycle instantly.
                </p>
              </div>
            </div>

            <span
              className={`font-mono text-[11px] font-semibold whitespace-nowrap shrink-0 tabular-nums ${
                !connection.connected
                  ? 'text-[var(--text-muted)]'
                  : telemetry?.bleConnected
                  ? 'text-emerald-400'
                  : 'text-amber-300'
              }`}
            >
              {!connection.connected
                ? 'Pad Disconnected'
                : telemetry?.bleConnected
                ? 'BLE Connected'
                : 'BLE Disconnected'}
            </span>
          </div>

          <div
            role="group"
            aria-label="Multi-Host BLE slot switcher"
            className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
          >
            {([1, 2, 3] as const).map(slot => {
              const isActive = connection.connected && (telemetry?.bleActiveHost ?? 1) === slot;
              const hostProf = profiles.find(p => p.id === bleSlotToProfileId(slot));
              const customName = hostProf?.name || `Host ${slot}`;
              return (
                <button
                  key={slot}
                  type="button"
                  disabled={!connection.connected || bleBusy}
                  onClick={() => handleSwitchBleHost(slot)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-45 disabled:pointer-events-none flex items-center justify-between gap-2 ${
                    isActive
                      ? 'border-[var(--accent)] bg-[rgba(var(--accent-rgb),0.14)] text-[var(--text-primary)] shadow-sm'
                      : 'bg-[var(--bg-input)] border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-[var(--text-secondary)]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[11px] font-bold text-sky-400 tabular-nums shrink-0">
                        H{slot}
                      </span>
                      <span className="text-[var(--text-muted)]" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                        {customName}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-[var(--text-muted)] mt-1 truncate tabular-nums">
                      Studio Pad {slot} · 11 controls
                    </div>
                  </div>
                  {isActive && (
                    <span className="text-[10px] font-mono font-semibold text-sky-400 shrink-0">
                      Active
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        )}

        {/* 3. Wi-Fi Provisioning Card */}
        {showWifiTv && (
        <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-3.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
              <Wifi className="w-4 h-4 text-emerald-400" />
              <span>Wi-Fi Network</span>
            </div>
            <div className="font-mono text-[11px] text-[var(--text-secondary)]">
              {connection.connected && telemetry ? (
                telemetry.wifiConnected ? (
                  <span className="text-emerald-400">
                    Saved: {telemetry.ssid || 'Wi-Fi'} · IP {telemetry.ip}
                  </span>
                ) : telemetry.ssid ? (
                  <span className="text-amber-300">
                    Saved network: {telemetry.ssid} (Disconnected)
                  </span>
                ) : (
                  <span className="text-[var(--text-muted)]">No network saved</span>
                )
              ) : (
                <span className="text-[var(--text-muted)]">Stored on pad only</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <input
              type="text"
              maxLength={32}
              disabled={!connection.connected || wifiBusy}
              value={wifiSsid}
              onChange={e => setWifiSsid(e.target.value)}
              placeholder="2.4 GHz Network Name (SSID)"
              aria-label="Wi-Fi Network Name (SSID)"
              className="px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] disabled:opacity-50 focus:outline-none focus:border-[var(--accent)]"
            />
            <input
              type="password"
              maxLength={63}
              autoComplete="new-password"
              disabled={!connection.connected || wifiBusy}
              value={wifiPass}
              onChange={e => setWifiPass(e.target.value)}
              placeholder="Password (never stored in browser)"
              aria-label="Wi-Fi Password"
              className="px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] disabled:opacity-50 focus:outline-none focus:border-[var(--accent)]"
            />
            <button
              type="button"
              disabled={!connection.connected || wifiBusy || !wifiSsid.trim()}
              onClick={handleSaveWifi}
              className="py-2 px-4 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold disabled:opacity-40 hover:opacity-90 cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
            >
              {wifiBusy && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
              <span>{wifiBusy ? 'Connecting…' : 'Save & Connect'}</span>
            </button>
          </div>

          {wifiStatusBanner && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                wifiStatusBanner.ok
                  ? 'bg-emerald-500/12 border-emerald-500/35 text-emerald-300'
                  : 'bg-rose-500/12 border-rose-500/35 text-rose-300'
              }`}
            >
              {wifiStatusBanner.ok ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <span>{wifiStatusBanner.text}</span>
            </div>
          )}
        </div>
        )}

        {/* 4. SmartCast TV Pairing Card */}
        {showWifiTv && (
        <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
              <Tv className="w-4 h-4 text-purple-400" />
              <span>Vizio SmartCast TV Pairing</span>
            </div>
            <span className="font-mono text-[11px] text-[var(--text-secondary)]">
              {connection.connected && telemetry
                ? telemetry.tvPaired
                  ? `Paired (${telemetry.tvHost}:${telemetry.tvPort})`
                  : telemetry.tvConfigured
                  ? `Host set (${telemetry.tvHost})`
                  : 'Not paired'
                : 'Stored on pad only'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <input
              type="text"
              disabled={!connection.connected || tvBusy}
              value={tvIp}
              onChange={e => setTvIp(e.target.value)}
              placeholder="TV IP (e.g. 192.168.1.50)"
              aria-label="Vizio TV IP address"
              className="sm:col-span-2 px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] disabled:opacity-50 focus:outline-none focus:border-[var(--accent)]"
            />
            <input
              type="number"
              disabled={!connection.connected || tvBusy}
              value={tvPort}
              onChange={e => setTvPort(e.target.value)}
              placeholder="Port (7345)"
              aria-label="Vizio TV Port"
              className="px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] disabled:opacity-50 focus:outline-none focus:border-[var(--accent)] tabular-nums"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!connection.connected || tvBusy || !tvIp.trim()}
              onClick={handleStartTvPairing}
              className="px-3.5 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold disabled:opacity-40 hover:opacity-90 cursor-pointer whitespace-nowrap"
            >
              Start pairing
            </button>

            <button
              type="button"
              disabled={!connection.connected || tvBusy}
              onClick={handleTestTv}
              className="px-3.5 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-40 cursor-pointer whitespace-nowrap"
            >
              Test TV
            </button>

            <button
              type="button"
              disabled={!connection.connected || tvBusy}
              onClick={() => setShowManualTokenMode(v => !v)}
              className="px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
            >
              <KeyRound className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>I already have an auth token</span>
            </button>

            <button
              type="button"
              disabled={!connection.connected || tvBusy}
              onClick={() => setForgetTvModalOpen(true)}
              className="px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-rose-500/40 text-xs font-medium text-rose-400 disabled:opacity-40 cursor-pointer whitespace-nowrap ml-auto"
            >
              Forget TV
            </button>
          </div>

          {pairingActive && (
            <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--accent)] space-y-2">
              <div className="text-xs font-medium text-[var(--text-primary)]">
                Enter the 4-digit PIN displayed on your TV screen (submitting automatically tests the TV link):
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={8}
                  value={tvPin}
                  onChange={e => setTvPin(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && tvPin.trim()) {
                      handleSubmitTvPinAndAutoTest();
                    }
                  }}
                  placeholder="PIN on TV (e.g. 1234)"
                  aria-label="PIN shown on TV"
                  className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)]"
                />
                <button
                  type="button"
                  disabled={tvBusy || !tvPin.trim()}
                  onClick={handleSubmitTvPinAndAutoTest}
                  className="px-4 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold disabled:opacity-40 cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                >
                  {tvBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Submit PIN & Test</span>
                </button>
              </div>
            </div>
          )}

          {showManualTokenMode && (
            <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-2">
              <div className="text-[11px] text-[var(--text-secondary)]">
                Save your existing SmartCast auth token directly to the pad (never stored in browser Local Storage):
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  autoComplete="new-password"
                  disabled={!connection.connected || tvBusy}
                  value={tvToken}
                  onChange={e => setTvToken(e.target.value)}
                  placeholder="SmartCast Auth Token"
                  aria-label="SmartCast Auth Token"
                  className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] disabled:opacity-50"
                />
                <button
                  type="button"
                  disabled={!connection.connected || tvBusy || !tvIp.trim() || !tvToken.trim()}
                  onClick={handleSaveTvManualToken}
                  className="px-3.5 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold disabled:opacity-40 cursor-pointer whitespace-nowrap"
                >
                  Save IP, Port & Token
                </button>
              </div>
            </div>
          )}

          {tvTestResult && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                tvTestResult.ok
                  ? 'bg-emerald-500/12 border-emerald-500/35 text-emerald-300'
                  : 'bg-rose-500/12 border-rose-500/35 text-rose-300'
              }`}
            >
              {tvTestResult.ok ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <span>{tvTestResult.text}</span>
            </div>
          )}
        </div>
        )}

        {/* 5. Local HTTP API Security (Pad Only) */}
        {showWifiTv && (
          <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
                <Shield className="w-4 h-4 text-sky-400" />
                <span>Local Network API Access</span>
              </div>
              <span className="font-mono text-[10px] text-[var(--text-muted)]">
                {connection.connected && telemetry
                  ? telemetry.httpApiEnabled
                    ? 'HTTP API Enabled'
                    : 'HTTP API Disabled'
                  : 'Stored on pad only'}
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                maxLength={64}
                autoComplete="new-password"
                disabled={!connection.connected || authBusy}
                value={httpToken}
                onChange={e => setHttpToken(e.target.value)}
                placeholder="8–64 char bearer token (leave empty to disable)"
                aria-label="HTTP API Token"
                className="flex-1 px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] disabled:opacity-50"
              />
              <button
                type="button"
                disabled={!connection.connected || authBusy}
                onClick={handleSaveHttpAuth}
                className="px-4 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-40 cursor-pointer whitespace-nowrap"
              >
                Save Token
              </button>
            </div>
          </div>
        )}

        {/* 6. Theme, Live Events Toggle, Audio & Keyboard Layout */}
        {showPreferences && (
        <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Theme
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Follow your OS theme or lock Dark / Light appearance
              </p>
            </div>
            <div
              role="group"
              aria-label="Theme mode"
              className="flex items-center p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]"
            >
              {themeOptions.map(opt => {
                const Icon = opt.icon;
                const active = settings.theme === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUpdateSettings({ theme: opt.id })}
                    className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap transition-colors ${
                      active
                        ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {ACCENT_PRESETS.map(item => {
              const active =
                settings.accentColor.toLowerCase() === item.hex.toLowerCase();
              return (
                <button
                  key={item.hex}
                  type="button"
                  onClick={() => onUpdateSettings({ accentColor: item.hex })}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                    active
                      ? 'bg-[var(--bg-elevated)] border-[var(--border-strong)] text-[var(--text-primary)]'
                      : 'bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0"
                      style={{ backgroundColor: item.hex }}
                    />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {active && <Check className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-[var(--border-subtle)]">
            {/* Live Events Toggle */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                Live Pad Feedback
              </label>
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({ liveEventsEnabled: !settings.liveEventsEnabled })
                }
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Activity
                    className={`w-4 h-4 ${
                      settings.liveEventsEnabled
                        ? 'text-emerald-400'
                        : 'text-[var(--text-muted)]'
                    }`}
                  />
                  <span>Live Pad Stream</span>
                </span>
                <span className="font-mono text-[11px] text-[var(--text-muted)]">
                  {settings.liveEventsEnabled ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>

            {/* Tactile Switch Audio */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                Tactile Switch Audio
              </label>
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({ soundEnabled: !settings.soundEnabled })
                }
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  {settings.soundEnabled ? (
                    <Volume2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-[var(--text-muted)]" />
                  )}
                  <span>Switch Sound</span>
                </span>
                <span className="font-mono text-[11px] text-[var(--text-muted)]">
                  {settings.soundEnabled ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>

            {/* Shortcut Recorder Layout */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                Keyboard Layout
              </label>
              <select
                value={settings.keyboardLayout}
                onChange={e =>
                  onUpdateSettings({
                    keyboardLayout: e.target.value as KeyboardLayoutId
                  })
                }
                aria-label="Keyboard Layout"
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
              >
                {KEYBOARD_LAYOUTS.map(layout => (
                  <option key={layout.id} value={layout.id}>
                    {layout.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        )}

        {/* 7. Debug Console (Redacted Serial Traffic + Copy & Clear) */}
        {showConsole && (
        <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
              <Terminal className="w-4 h-4 text-[var(--accent)]" />
              <span>Debug console</span>
              <span className="font-mono text-[10px] text-[var(--text-muted)] tabular-nums">
                ({debugLogs.length} lines · secrets redacted)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyDebugConsole}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </button>
              <button
                type="button"
                disabled={debugLogs.length === 0}
                onClick={() => {
                  usbHardware.clearDebugLogs();
                  onToast('Cleared debug console');
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            </div>
          </div>

          <div className="h-44 overflow-y-auto rounded-xl bg-[#090B0F] border border-[var(--border-subtle)] p-3 font-mono text-[11px] space-y-1 tabular-nums">
            {debugLogs.length === 0 ? (
              <div className="text-zinc-500 py-4 text-center">
                No serial traffic logged yet. Connect the USB pad or start demo mode to inspect JSON lines.
              </div>
            ) : (
              debugLogs.map(entry => (
                <div key={entry.id} className="flex items-start gap-2 leading-relaxed break-all">
                  <span className="text-zinc-500 shrink-0">{entry.timestamp}</span>
                  <span
                    className={`uppercase font-bold shrink-0 ${
                      entry.direction === 'tx'
                        ? 'text-sky-400'
                        : entry.direction === 'rx'
                        ? 'text-emerald-400'
                        : entry.direction === 'error'
                        ? 'text-rose-400'
                        : 'text-amber-300'
                    }`}
                  >
                    {entry.direction}
                  </span>
                  <span className="text-zinc-300">{entry.line}</span>
                </div>
              ))
            )}
          </div>

          {/* Collapsible Advanced Developer Protocol Reference */}
          <div className="pt-2 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => setShowAdvancedProtocol(v => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer"
            >
              {showAdvancedProtocol ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
              <span>Advanced serial & HTTP protocol details</span>
            </button>
            {showAdvancedProtocol && (
              <div className="mt-2.5 p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] font-mono text-[11px] text-[var(--text-muted)] space-y-1 leading-relaxed">
                <div>
                  USB Serial: 115200 baud NDJSON ·{' '}
                  <span className="text-[var(--text-secondary)]">/api/status</span>,{' '}
                  <span className="text-[var(--text-secondary)]">/api/profiles</span>,{' '}
                  <span className="text-[var(--text-secondary)]">/api/customizer/save</span>,{' '}
                  <span className="text-[var(--text-secondary)]">/api/macro/test</span>,{' '}
                  <span className="text-[var(--text-secondary)]">/api/macro/cancel</span>
                </div>
                <div>
                  Provisioning:{' '}
                  <span className="text-[var(--text-secondary)]">{"{\"mode\":\"setup\"}"}</span>{' '}
                  · <span className="text-[var(--text-secondary)]">/api/setup/complete</span> ·{' '}
                  <span className="text-[var(--text-secondary)]">/api/auth/set</span> ·{' '}
                  <span className="text-[var(--text-secondary)]">/api/events/set</span>
                </div>
                <div>
                  ESP32 Flash Layout: Compatible with Standard Dual-OTA and Huge APP (3MB No OTA) via WebSerial bootloader or{' '}
                  <span className="text-[var(--text-secondary)]">/api/ota/begin</span>.
                </div>
              </div>
            )}
          </div>
        </div>
        )}

        {/* 8. Reset All 4 Profiles & Clear Browser Cache */}
        {showConsole && (
        <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Reset all 4 profiles to factory defaults
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Asks you to type <span className="font-mono font-semibold">RESET</span> and restores universal defaults across Host 1, Host 2, Host 3, and TV while keeping Wi-Fi & TV pairing intact.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setResetProfilesModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/12 hover:bg-rose-500/20 border border-rose-500/35 text-xs font-semibold text-rose-300 cursor-pointer whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset all profiles</span>
            </button>
          </div>

          <div className="flex items-center justify-between gap-4 flex-wrap pt-3 border-t border-[var(--border-subtle)]">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Clear Browser Local Cache
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Clears saved offline device drafts, custom macros, and profile snapshots stored in this browser.
              </p>
            </div>

            {!confirmClearLocal ? (
              <button
                type="button"
                onClick={() => setConfirmClearLocal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-rose-500/40 text-xs font-semibold text-[var(--text-secondary)] hover:text-rose-400 cursor-pointer whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear Local Cache</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClearLocalCache();
                    setConfirmClearLocal(false);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-rose-500 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                >
                  Confirm Clear
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearLocal(false)}
                  className="px-3 py-2 rounded-xl bg-[var(--bg-input)] text-xs text-[var(--text-muted)] cursor-pointer whitespace-nowrap shrink-0"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
        )}
      </div>

      {/* Forget TV Modal (requires typing FORGET) */}
      <DiffConfirmModal
        isOpen={forgetTvModalOpen}
        title="Forget SmartCast TV?"
        description="This clears the saved TV IP, port, and pairing token on your Studio MacroPad."
        confirmLabel="Forget TV"
        tone="danger"
        requireWord="FORGET"
        onConfirm={handleConfirmForgetTv}
        onCancel={() => setForgetTvModalOpen(false)}
      />

      {/* Reset All 4 Profiles Modal (requires typing RESET) */}
      <DiffConfirmModal
        isOpen={resetProfilesModalOpen}
        title="Reset all 4 profiles to universal defaults?"
        description="All 44 controls across Host 1, Host 2, Host 3, and TV will be restored to universal factory actions. Wi-Fi and TV pairing remain untouched."
        confirmLabel="Reset All 4 Profiles"
        tone="danger"
        requireWord="RESET"
        onConfirm={async () => {
          setResetProfilesModalOpen(false);
          await onResetBothProfiles();
        }}
        onCancel={() => setResetProfilesModalOpen(false)}
      />

      <FirmwareBinGuideModal
        isOpen={firmwareBinGuideOpen}
        onClose={() => setFirmwareBinGuideOpen(false)}
      />
    </div>
  );
};
