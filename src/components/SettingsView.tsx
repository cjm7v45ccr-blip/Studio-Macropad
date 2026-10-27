import React, { useState, useEffect } from 'react';
import {
  BleHostSlot,
  DebugLogEntry,
  DeviceConnectionInfo,
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
  SlidersHorizontal
} from 'lucide-react';

interface SettingsViewProps {
  profiles: StudioProfile[];
  settings: StudioSettings;
  connection: DeviceConnectionInfo;
  syncStatus: SyncStatusPill;
  currentRev: number;
  currentDeviceId: string | null;
  firmwareUpdate: FirmwareUpdateState;
  isFirmwareBannerDismissed: boolean;
  onDismissFirmwareBanner: () => void;
  onCheckFirmwareUpdate: (opts?: {
    force?: boolean;
    repoOverride?: string;
    silent?: boolean;
  }) => Promise<FirmwareUpdateState>;
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

export const SettingsView: React.FC<SettingsViewProps> = ({
  profiles,
  settings,
  connection,
  syncStatus,
  currentRev,
  currentDeviceId,
  firmwareUpdate,
  isFirmwareBannerDismissed,
  onDismissFirmwareBanner,
  onCheckFirmwareUpdate,
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

  const handleJumpToUpdater = () => {
    const el = document.getElementById('firmware-updater-card');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-lg font-bold text-[var(--text-primary)]">
              Settings & Diagnostics
            </h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Device diagnostics, firmware updates, Bluetooth, Wi-Fi, SmartCast TV pairing, preferences, and serial debug console.
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

        {/* Guided Setup & Hardware Setup Mode Provisioning */}
        {onOpenSetupWizard && (
          <section className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <SlidersHorizontal className="w-4 h-4 text-[var(--accent)] shrink-0" />
                  <span>Guided Setup & Provisioning</span>
                </div>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Walk through starter OS layouts, 3 Bluetooth host aliases, optional Wi-Fi & SmartCast TV pairing, and live switch verification. Opens automatically whenever a board reports{' '}
                  <span className="font-mono text-[var(--text-secondary)]">setup_mode: true</span> or{' '}
                  <span className="font-mono text-[var(--text-secondary)]">{"{\"mode\":\"setup\"}"}</span>.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap shrink-0">
                {connection.connected && onEnterHardwareSetupMode && (
                  <button
                    type="button"
                    onClick={onEnterHardwareSetupMode}
                    className="px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    title="Send /api/setup/enter so the connected MacroPad enters Setup Mode"
                  >
                    Trigger Board Setup Mode
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
                <span>Clears on finish via /api/setup/complete</span>
              </div>
            )}
          </section>
        )}

        <FirmwareUpdateBanner
          connection={connection}
          firmwareUpdate={firmwareUpdate}
          isFirmwareBannerDismissed={isFirmwareBannerDismissed}
          onDismissFirmwareBanner={onDismissFirmwareBanner}
          onJumpToUpdater={handleJumpToUpdater}
        />

        {/* 1. Device Diagnostics Card (Device ID, Firmware Version, API Version, Config Revision, Free Memory) */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
              <Cpu className="w-4 h-4 text-[var(--accent)]" />
              <span>Device Diagnostics</span>
            </div>
            <span className="font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
              {syncStatus} · {connection.connected ? connection.deviceName : 'Disconnected'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
            <div className="p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
              <div className="text-[10px] text-[var(--text-muted)]">Device ID</div>
              <div className="font-mono font-bold text-[var(--text-primary)] mt-0.5 truncate">
                {connection.deviceId || currentDeviceId || '—'}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
              <div className="text-[10px] text-[var(--text-muted)]">Firmware version</div>
              <div className="font-mono font-bold text-[var(--text-primary)] mt-0.5 tabular-nums">
                {connection.connected ? connection.firmwareVersion : '—'}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
              <div className="text-[10px] text-[var(--text-muted)]">API version</div>
              <div className="font-mono font-bold text-[var(--text-primary)] mt-0.5 tabular-nums">
                {connection.connected && telemetry ? telemetry.apiVersion : '—'}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
              <div className="text-[10px] text-[var(--text-muted)]">Config revision</div>
              <div className="font-mono font-bold text-[var(--text-primary)] mt-0.5 tabular-nums">
                rev {currentRev}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] col-span-2 sm:col-span-1">
              <div className="text-[10px] text-[var(--text-muted)]">Free memory</div>
              <div className="font-mono font-bold text-[var(--text-primary)] mt-0.5 tabular-nums">
                {connection.connected && telemetry
                  ? `${Math.round(telemetry.freeHeap / 1024)} KB`
                  : '—'}
              </div>
            </div>
          </div>

          {isDemo && telemetry && (
            <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[11px] text-[var(--text-muted)]">
                Demo Mode Link Controls:
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
                        connection.firmwareVersion === '1.0.0' ? '3.2-PRO' : '1.0.0'
                    })
                  }
                  className="px-2.5 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0"
                  title="Simulate older connected firmware in Demo Mode to test the GitHub update notification"
                >
                  Simulate FW ({connection.firmwareVersion === '1.0.0' ? 'Restore 3.2-PRO' : 'Set 1.0.0'})
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 1B. ESP32 Firmware & Direct GitHub Flash Card */}
        <FirmwareUpdaterCard
          settings={settings}
          connection={connection}
          firmwareUpdate={firmwareUpdate}
          isFirmwareBannerDismissed={isFirmwareBannerDismissed}
          onDismissFirmwareBanner={onDismissFirmwareBanner}
          onCheckFirmwareUpdate={onCheckFirmwareUpdate}
          onUpdateSettings={onUpdateSettings}
          onExportBackupFile={onExportBackupFile}
          onToast={onToast}
        />

        {/* 2. Multi-Host Bluetooth Engine (`/api/ble/switch`) */}
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

        {/* 3. Wi-Fi Provisioning Card (saved SSID, never stores password, Connecting… -> IP or error within 20s) */}
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

        {/* 4. SmartCast TV Pairing Card */}
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

        {/* 5. Local HTTP API Token (`/api/auth/set` — Pad Only) */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
              <Shield className="w-4 h-4 text-sky-400" />
              <span>Pad Local HTTP API Token (`/api/auth/set`)</span>
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
              placeholder="8–64 char token (leave empty to disable)"
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

        {/* 6. Theme (System, Dark, Light), Live Events Toggle, Audio & Keyboard Layout */}
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
                Live events (`/api/events/set`)
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

        {/* 7. Debug Console (Redacted Serial Traffic + Copy & Clear) */}
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
        </div>

        {/* 8. Reset All 4 Profiles & Clear Browser Cache */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Reset all 4 profiles (`/api/device/reset-settings`)
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
                Clears saved `localStorage["pad:" + id]` records, offline drafts, and My presets.
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
    </div>
  );
};
