import React, { useState, useEffect } from 'react';
import {
  BleHostProfileId,
  BleHostSlot,
  DebugLogEntry,
  DeviceConnectionInfo,
  FirmwareInstallProgress,
  FirmwareReleaseInfo,
  FirmwareUpdateState,
  HostOsType,
  KeyboardLayoutId,
  MotionSlotId,
  StudioProfile,
  StudioSettings,
  SyncStatusPill,
  ThemeMode,
  bleSlotToProfileId
} from '../types/studio';
import { ToastVariant } from '../hooks/useStudioState';
import { STUDIO_VERSION, FIRMWARE_VERSION, FIRMWARE_INO_FILENAME } from '../utils/version';
import { getVisibleHardwareSlots } from '../data/firmwareCatalog';
import { isTvDisabledResponse, usbHardware } from '../services/usbHardwareService';
import { SoundProfile } from '../services/soundEffects';
import { generateBitmapsHeader, generateConfigHeader } from '../utils/firmwareHeaderExport';
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
  Upload,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  RefreshCw,
  Send,
  Sparkles
} from 'lucide-react';
import { FirmwareBinGuideModal } from './FirmwareBinGuideModal';
import { MotionSettings } from './MotionSettings';
import { BleManagementCard } from './BleManagementCard';
import { PWAInstallButton } from './PWAInstallButton';

interface SettingsViewProps {
  profiles: StudioProfile[];
  settings: StudioSettings;
  connection: DeviceConnectionInfo;
  tvEnabled?: boolean;
  onSyncTvEnabled?: (enabled: boolean) => void;
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
  onSetHostOs?: (hostId: BleHostProfileId, nextOs: HostOsType) => void;
  onPullFromUsb: () => Promise<boolean>;
  onSwitchBleHost: (slot: BleHostSlot) => Promise<void> | void;
  onResetBothProfiles: () => Promise<void> | void;
  onClearLocalCache: () => void;
  onOpenSetupWizard?: () => void;
  onEnterHardwareSetupMode?: () => Promise<void> | void;
  onExportBackupFile?: () => Promise<void> | void;
  onImportBackupFile?: (file: File) => Promise<void> | void;
  onJumpToMotionSlot?: (slot: MotionSlotId) => void;
  onOpenOledComposer?: () => void;
  onOpenAbout?: () => void;
  soundProfile?: SoundProfile;
  onSelectSoundProfile?: (profile: SoundProfile) => void;
  onToast: (msg: string, variant?: ToastVariant) => void;
}

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
  | 'display'
  | 'motion'
  | 'firmware'
  | 'wifi_tv'
  | 'preferences'
  | 'developer';

const BASE_SETTINGS_TABS: { id: SettingsSectionTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'connection', label: 'Connection & Hosts' },
  { id: 'display', label: 'Display' },
  { id: 'firmware', label: 'Firmware' },
  { id: 'wifi_tv', label: 'Wi-Fi & TV' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'developer', label: 'Developer' }
];

const DISPLAY_DIM_PRESETS: { label: string; seconds: number }[] = [
  { label: 'Never', seconds: 0 },
  { label: '30s', seconds: 30 },
  { label: '1m', seconds: 60 },
  { label: '2m', seconds: 120 },
  { label: '5m', seconds: 300 },
  { label: '15m', seconds: 900 }
];

const DISPLAY_OFF_PRESETS: { label: string; seconds: number }[] = [
  { label: 'Never', seconds: 0 },
  { label: '1m', seconds: 60 },
  { label: '5m', seconds: 300 },
  { label: '10m', seconds: 600 },
  { label: '30m', seconds: 1800 },
  { label: '1h', seconds: 3600 }
];

const DISPLAY_CONTRAST_PRESETS: { label: string; value: number }[] = [
  { label: 'Low', value: 64 },
  { label: 'Medium', value: 140 },
  { label: 'High', value: 200 },
  { label: 'Max', value: 255 }
];

function formatDisplayTimeout(seconds: number): string {
  const clean = Math.max(0, Math.round(seconds));
  if (clean === 0) return 'Never';
  if (clean < 60) return `${clean}s`;
  if (clean % 3600 === 0) return `${clean / 3600}h`;
  if (clean % 60 === 0) return `${clean / 60}m`;
  const mins = Math.floor(clean / 60);
  const rem = clean % 60;
  return `${mins}m ${rem}s`;
}

function formatUptime(seconds?: number): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return '—';
  }
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  profiles,
  settings,
  connection,
  tvEnabled,
  onSyncTvEnabled,
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
  onSetHostOs,
  onPullFromUsb,
  onSwitchBleHost,
  onResetBothProfiles,
  onClearLocalCache,
  onOpenSetupWizard,
  onEnterHardwareSetupMode,
  onExportBackupFile,
  onImportBackupFile,
  onJumpToMotionSlot,
  onOpenOledComposer,
  onOpenAbout,
  soundProfile = 'thock',
  onSelectSoundProfile,
  onToast
}) => {
  const importBackupFileRef = React.useRef<HTMLInputElement>(null);
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
  const [tvModeBusy, setTvModeBusy] = useState(false);
  const [tvTestResult, setTvTestResult] = useState<{
    ok: boolean;
    neutral?: boolean;
    text: string;
  } | null>(null);
  const [forgetTvModalOpen, setForgetTvModalOpen] = useState(false);

  // OLED Display Power & Contrast State (v4.8+ `/api/display/set`)
  const [displayDim, setDisplayDim] = useState<number>(60);
  const [displayOff, setDisplayOff] = useState<number>(300);
  const [displayContrast, setDisplayContrast] = useState<number>(255);
  const [displayBusy, setDisplayBusy] = useState<boolean>(false);
  const [clearingCrashBusy, setClearingCrashBusy] = useState<boolean>(false);


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

  // Interactive Web Serial Command & JSON Inspector
  const [rawCmdInput, setRawCmdInput] = useState('/api/status');
  const [rawCmdBusy, setRawCmdBusy] = useState(false);
  const [rawCmdResult, setRawCmdResult] = useState<{
    ok: boolean;
    request: string;
    response: string;
  } | null>(null);

  useEffect(() => {
    const unsub = usbHardware.onDebugLogsChange(entries => {
      setDebugLogs(entries);
    });
    return unsub;
  }, []);

  const telemetry = connection.telemetry;
  const isDemo = connection.transport === 'demo';
  const visibleSlotCount = getVisibleHardwareSlots(telemetry?.capabilities).length;
  const supportsTvToggle =
    !connection.connected ||
    !telemetry ||
    telemetry.capabilities.includes('tv_toggle');
  const supportsDisplayPower =
    !connection.connected ||
    !telemetry ||
    telemetry.capabilities.includes('display_power') ||
    typeof telemetry.displayDimSeconds === 'number';
  const supportsMotion = Boolean(telemetry?.capabilities?.includes('motion'));
  const visibleSettingsTabs = supportsMotion
    ? [
        BASE_SETTINGS_TABS[0],
        BASE_SETTINGS_TABS[1],
        BASE_SETTINGS_TABS[2],
        { id: 'motion' as const, label: 'Motion' },
        ...BASE_SETTINGS_TABS.slice(3)
      ]
    : BASE_SETTINGS_TABS;

  useEffect(() => {
    if (settingsTab === 'motion' && !supportsMotion) {
      setSettingsTab('all');
    }
  }, [settingsTab, supportsMotion]);

  const isTvModeEnabled =
    connection.connected && telemetry
      ? telemetry.tvEnabled !== false
      : tvEnabled ?? true;

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

  useEffect(() => {
    if (!connection.connected || !telemetry) return;
    if (typeof telemetry.displayDimSeconds === 'number') {
      setDisplayDim(telemetry.displayDimSeconds);
    }
    if (typeof telemetry.displayOffSeconds === 'number') {
      setDisplayOff(telemetry.displayOffSeconds);
    }
    if (typeof telemetry.displayContrast === 'number') {
      setDisplayContrast(telemetry.displayContrast);
    }
  }, [
    connection.connected,
    telemetry?.displayDimSeconds,
    telemetry?.displayOffSeconds,
    telemetry?.displayContrast
  ]);

  const handleCopyDiagnostics = () => {
    const fullDeviceId = connection.deviceId || currentDeviceId || '';
    const liveRev =
      connection.connected && typeof connection.rev === 'number'
        ? connection.rev
        : currentRev;
    const diagReport = [
      `=== BERTOPAD DIAGNOSTICS REPORT ===`,
      `Timestamp: ${new Date().toISOString()}`,
      `Device Name: ${connection.deviceName || 'ESP32 BertoPad'}`,
      `Device ID: ${fullDeviceId || '—'}`,
      `Firmware Version: v${connection.firmwareVersion || STUDIO_VERSION.replace('v', '')} (Rev ${liveRev})`,
      `Transport: ${connection.transport}`,
      `Connected: ${connection.connected}`,
      `Capabilities: ${telemetry?.capabilities?.join(', ') || 'none'}`,
      `Boot Reason: ${telemetry?.bootReason || 'Nominal'}`,
      `Abnormal Resets: ${telemetry?.abnormalResets ?? 0}`,
      `NVS Used/Free: ${telemetry?.nvsUsed ?? '—'} / ${telemetry?.nvsFree ?? '—'}`,
      `Free Heap: ${telemetry?.freeHeap ? `${(telemetry.freeHeap / 1024).toFixed(1)} KB` : '—'}`,
      `Uptime: ${telemetry?.uptimeSeconds ? formatUptime(telemetry.uptimeSeconds) : '—'}`,
      `Motion Sensor: ${telemetry?.motion?.present ? `Present (Enabled: ${telemetry.motion.enabled}, Sensitivity: ${telemetry.motion.sensitivity})` : 'Not present'}`,
      `===================================`
    ].join('\n');

    navigator.clipboard.writeText(diagReport).then(() => {
      onToast('Copied full diagnostics report to clipboard');
    }).catch(() => {
      onToast('Could not copy diagnostics report', 'error');
    });
  };

  const handleDownloadGeneratedHeader = (kind: 'config' | 'bitmaps') => {
    const content =
      kind === 'config'
        ? generateConfigHeader({
            profiles,
            settings,
            activeProfileId: telemetry?.activeProfile || 'HOST1',
            tvEnabled: isTvModeEnabled
          })
        : generateBitmapsHeader(settings.oledComposer);
    const filename = kind === 'config' ? 'config.h' : 'bitmaps.h';
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onToast(`Exported ${filename} for ESP32 firmware`);
  };

  const handleSendRawCommand = async (overrideCmd?: string) => {
    const cmd = (overrideCmd ?? rawCmdInput).trim();
    if (!cmd || rawCmdBusy) return;
    setRawCmdBusy(true);
    try {
      const res = await usbHardware.sendRawCommand(cmd);
      setRawCmdResult({
        ok: res.ok,
        request: JSON.stringify(res.request),
        response: JSON.stringify(res.response, null, 2)
      });
    } catch (err: any) {
      setRawCmdResult({
        ok: false,
        request: cmd,
        response: err?.message || 'Command failed'
      });
      onToast(err?.message || 'Serial command failed', 'error');
    } finally {
      setRawCmdBusy(false);
    }
  };

  const handleSaveDisplaySettings = async () => {
    if (!connection.connected || displayBusy) return;
    setDisplayBusy(true);
    try {
      const clampedDim = Math.max(0, Math.min(36000, Math.round(Number(displayDim) || 0)));
      const clampedOff = Math.max(0, Math.min(36000, Math.round(Number(displayOff) || 0)));
      const clampedContrast = Math.max(
        0,
        Math.min(255, Math.round(Number(displayContrast) || 0))
      );
      setDisplayDim(clampedDim);
      setDisplayOff(clampedOff);
      setDisplayContrast(clampedContrast);
      const res = await usbHardware.setDisplaySettings({
        dim: clampedDim,
        off: clampedOff,
        contrast: clampedContrast
      });
      onToast(res.message || 'Saved OLED display settings to BertoPad');
    } catch (err: any) {
      onToast(err?.message || 'Could not save OLED display settings', 'error');
    } finally {
      setDisplayBusy(false);
    }
  };

  const handleClearCrashDiagnostics = async () => {
    if (!connection.connected || clearingCrashBusy) return;
    setClearingCrashBusy(true);
    try {
      const res = await usbHardware.clearCrashDiagnostics();
      onToast(res.message || 'Cleared abnormal reset counter on BertoPad');
    } catch (err: any) {
      onToast(err?.message || 'Could not clear crash counter', 'error');
    } finally {
      setClearingCrashBusy(false);
    }
  };

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
      if (isTvDisabledResponse(testRes)) {
        const msg = `PIN saved to BertoPad. ${
          testRes?.message || 'TV mode is turned off on the pad.'
        }`;
        setTvTestResult({ ok: true, neutral: true, text: msg });
        onToast(msg);
        return;
      }
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
        if (isTvDisabledResponse(testRes)) {
          setTvTestResult({
            ok: true,
            neutral: true,
            text: `Token saved (${tvIp}:${Number(tvPort) || 7345}). ${
              testRes.message || 'TV mode is turned off on the pad.'
            }`
          });
        } else {
          const passed = Boolean(testRes.ok);
          setTvTestResult({
            ok: passed,
            text: passed
              ? `Token saved & TV test passed (${tvIp}:${Number(tvPort) || 7345})`
              : `Token saved, but TV test failed: ${testRes.message || 'Unreachable'}`
          });
        }
      }
      onToast(res.message || 'Saved TV IP, port, and auth token to BertoPad');
    } catch (err: any) {
      onToast(err?.message || 'Failed to save TV configuration', 'error');
    } finally {
      setTvBusy(false);
    }
  };

  const handleToggleTvMode = async () => {
    if (!connection.connected || tvModeBusy) return;
    const nextEnabled = !isTvModeEnabled;
    setTvModeBusy(true);
    try {
      const res = await usbHardware.setTvEnabled(nextEnabled);
      const refreshed = await usbHardware.fetchStatus();
      const confirmedEnabled = refreshed.tv?.enabled !== false;
      onSyncTvEnabled?.(confirmedEnabled);
      onToast(
        res?.message || (confirmedEnabled ? 'TV mode enabled.' : 'TV mode disabled.'),
        'success'
      );
    } catch (err: any) {
      onToast(err?.message || 'Could not update TV mode on BertoPad', 'error');
    } finally {
      setTvModeBusy(false);
    }
  };

  const handleTestTv = async () => {
    setTvBusy(true);
    setTvTestResult(null);
    try {
      const res = await usbHardware.testTv();
      if (isTvDisabledResponse(res)) {
        const infoText = res?.message || 'TV mode is turned off on the pad.';
        setTvTestResult({ ok: true, neutral: true, text: infoText });
        onToast(infoText);
        return;
      }
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
      onToast(res.message || 'Cleared TV settings on BertoPad');
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
      onToast(res.message || 'Updated HTTP API token on BertoPad');
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

  const handleDownloadV47Source = async () => {
    setSourceBusy(true);
    try {
      const res = await fetch(`/firmware-source/${FIRMWARE_INO_FILENAME}`);
      if (!res.ok) throw new Error('Could not load firmware source sketch');
      const code = await res.text();
      const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = FIRMWARE_INO_FILENAME;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onToast(`Downloaded ${FIRMWARE_INO_FILENAME}`);
    } catch (err: any) {
      onToast(err?.message || 'Failed to download C++ sketch', 'error');
    } finally {
      setSourceBusy(false);
    }
  };

  const handleCopyV47Source = async () => {
    setSourceBusy(true);
    try {
      const res = await fetch(`/firmware-source/${FIRMWARE_INO_FILENAME}`);
      if (!res.ok) throw new Error('Could not load firmware source sketch');
      const code = await res.text();
      await navigator.clipboard.writeText(code);
      onToast(`Copied ${FIRMWARE_INO_FILENAME} to clipboard`);
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
  const showDisplay = settingsTab === 'all' || settingsTab === 'display';
  const showMotion = (settingsTab === 'all' || settingsTab === 'motion') && supportsMotion;
  const showFirmware = settingsTab === 'all' || settingsTab === 'firmware';
  const showWifiTv = settingsTab === 'all' || settingsTab === 'wifi_tv';
  const showPreferences = settingsTab === 'all' || settingsTab === 'preferences';
  const showDeveloper = settingsTab === 'developer';

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--bg-canvas)] px-4 sm:px-6 lg:px-10 py-6 sm:py-8 animate-workspace-section">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row gap-8 lg:gap-12 items-start">
        {/* Sticky Left Sub-Navigation */}
        <aside className="w-full md:w-44 shrink-0 md:sticky md:top-6 space-y-3">
          <div className="px-2">
            <h1 className="text-base font-semibold tracking-tight text-[var(--text-primary)]">
              Settings
            </h1>
          </div>

          <nav
            aria-label="Settings sections"
            className="flex md:flex-col gap-0.5 overflow-x-auto pb-1 md:pb-0 border-b md:border-b-0 border-[var(--border-subtle)]"
          >
            {visibleSettingsTabs.map(tab => {
              const active = settingsTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSettingsTab(tab.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[var(--bg-selected)] text-[var(--text-primary)] font-medium'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] font-normal'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Flat Hairline-Separated Content Column */}
        <div className="flex-1 min-w-0 w-full max-w-2xl divide-y divide-[var(--border-subtle)]">
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
            <section className="py-7 first:pt-0 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                    <SlidersHorizontal className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                    <span>Guided Setup &amp; Provisioning</span>
                  </div>
                  <p className="font-mono text-[11px] text-[var(--text-muted)]">
                    OS layouts · 3 BLE hosts · Wi-Fi &amp; TV · switch test
                    {connection.connected && (
                      <>
                        {' · '}
                        <span
                          className={
                            telemetry?.setupMode
                              ? 'text-[var(--accent)] font-semibold'
                              : 'text-[var(--text-secondary)]'
                          }
                        >
                          {telemetry?.setupMode ? 'Setup Mode Active' : 'Provisioned'}
                        </span>
                      </>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  {connection.connected && onEnterHardwareSetupMode && (
                    <button
                      type="button"
                      onClick={onEnterHardwareSetupMode}
                      className="studio-btn px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0"
                      title="Put the connected BertoPad into on-device Setup Mode"
                    >
                      Enter Setup Mode
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onOpenSetupWizard}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>Open Guided Setup</span>
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* 1. Consumer Device Status Summary (Connection & Hosts) */}
          {showConnection && (
            <section className="py-7 first:pt-0 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <Cpu className="w-4 h-4 text-[var(--text-secondary)]" />
                  <span>Device Status</span>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  <div className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--text-muted)] tabular-nums">
                    <span>
                      {connection.connected
                        ? `${syncStatus} · ${connection.deviceName}`
                        : 'Offline'}
                    </span>
                    {connection.connected && connection.lastSyncedAt && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Live {connection.lastSyncedAt}</span>
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
                          onToast('Refreshed device status');
                        } catch (err: any) {
                          onToast(err?.message || 'Could not query BertoPad status', 'error');
                        } finally {
                          setDiagRefreshing(false);
                        }
                      }}
                      title="Refresh live status from BertoPad"
                      className="studio-btn inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-45 cursor-pointer whitespace-nowrap"
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${diagRefreshing ? 'animate-spin' : ''}`}
                      />
                      <span>Refresh</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)] text-xs">
                <div className="py-2.5 flex items-center justify-between gap-4">
                  <span className="text-[var(--text-muted)]">Connection</span>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-[var(--text-primary)] truncate">
                      {connection.connected
                        ? isDemo
                          ? 'Demo Mode'
                          : 'USB Connected'
                        : 'Offline'}
                    </span>
                    <span className="font-mono text-[11px] text-[var(--text-muted)] truncate">
                      {connection.connected
                        ? connection.deviceName
                        : currentDeviceId
                        ? 'Local drafts'
                        : 'Connect USB'}
                    </span>
                  </div>
                </div>

                <div className="py-2.5 flex items-center justify-between gap-4">
                  <span className="text-[var(--text-muted)]">Firmware</span>
                  <div className="flex items-center gap-2 font-mono tabular-nums">
                    <span className="font-semibold text-[var(--text-primary)]">
                      {connection.connected
                        ? connection.firmwareVersion
                        : settings.lastKnownFirmware || '—'}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      {connection.connected
                        ? firmwareUpdate.status === 'update_available' &&
                          firmwareUpdate.latestRelease
                          ? `v${firmwareUpdate.latestRelease.version} available`
                          : firmwareUpdate.status === 'checking'
                          ? 'Checking…'
                          : firmwareUpdate.status === 'ahead'
                          ? 'Ahead of catalog'
                          : 'Up to date'
                        : 'Connect USB to read'}
                    </span>
                  </div>
                </div>

                <div className="py-2.5 flex items-center justify-between gap-4">
                  <span className="text-[var(--text-muted)]">Wireless Host</span>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-[var(--text-primary)] truncate">
                      {connection.connected && telemetry
                        ? profiles.find(p => p.id === bleSlotToProfileId(telemetry.bleActiveHost))?.name ||
                          telemetry.bleDeviceName
                        : '—'}
                    </span>
                    <span className="font-mono text-[11px] text-[var(--text-muted)]">
                      {connection.connected && telemetry
                        ? telemetry.bleConnected
                          ? 'Bluetooth connected'
                          : 'Advertising'
                        : '3 saved hosts'}
                    </span>
                  </div>
                </div>

                <div className="py-2.5 flex items-center justify-between gap-4">
                  <span className="text-[var(--text-muted)]">Wi-Fi &amp; TV</span>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-[var(--text-primary)] truncate">
                      {connection.connected && telemetry
                        ? telemetry.wifiConnected
                          ? telemetry.ssid || 'Wi-Fi Online'
                          : telemetry.tvPaired
                          ? 'TV Paired'
                          : 'Not configured'
                        : '—'}
                    </span>
                    <span className="font-mono text-[11px] text-[var(--text-muted)] truncate">
                      {connection.connected && telemetry
                        ? telemetry.tvPaired
                          ? `SmartCast (${telemetry.tvHost})`
                          : telemetry.wifiConnected
                          ? 'TV not paired'
                          : 'Configure in Wi-Fi & TV'
                        : 'Stored on pad'}
                    </span>
                  </div>
                </div>
              </div>

              {isDemo && telemetry && (
                <div className="pt-1 flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[11px] text-[var(--text-muted)]">
                    Demo Mode Simulator
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() =>
                        usbHardware.setDemoLinkState({
                          bleConnected: !telemetry.bleConnected
                        })
                      }
                      className="studio-btn px-2.5 py-1 rounded-md text-[11px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0"
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
                      className="studio-btn px-2.5 py-1 rounded-md text-[11px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Toggle Wi-Fi ({telemetry.wifiConnected ? 'Connected' : 'Down'})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const isOlder =
                          connection.firmwareVersion === '4.10.1' ||
                          connection.firmwareVersion === 'v4.10.1' ||
                          connection.firmwareVersion === '1.0.0';
                        usbHardware.setDemoLinkState({
                          firmwareVersion: isOlder ? FIRMWARE_VERSION : '4.10.1'
                        });
                      }}
                      className="studio-btn px-2.5 py-1 rounded-md text-[11px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0 tabular-nums"
                      title="Simulate older connected firmware (v4.10.1) in Demo Mode to test capability gating and firmware update flow"
                    >
                      Simulate FW (
                      {connection.firmwareVersion === '4.10.1' ||
                      connection.firmwareVersion === 'v4.10.1' ||
                      connection.firmwareVersion === '1.0.0'
                        ? `Restore ${FIRMWARE_VERSION}`
                        : 'Set 4.10.1'}
                      )
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* 1B. MacroPad Firmware Updates */}
          {showFirmware && (
            <section className="py-7 first:pt-0">
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
            </section>
          )}

          {/* 2. Multi-Host Bluetooth Engine */}
          {showConnection && (
            <section className="py-7 first:pt-0 space-y-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)] flex-wrap">
                    <Bluetooth className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                    <span>Multi-Host Bluetooth Engine</span>
                    {connection.connected && telemetry && (
                      <span className="font-mono text-[11px] font-normal text-[var(--text-muted)] tabular-nums">
                        · {telemetry.bleDeviceName}
                      </span>
                    )}
                  </div>
                  <p className="font-mono text-[11px] text-[var(--text-muted)]">
                    3 Bluetooth hosts · OS-adaptive shortcuts
                  </p>
                </div>

                <span
                  className={`inline-flex items-center gap-1.5 font-mono text-[11px] font-medium whitespace-nowrap shrink-0 tabular-nums ${
                    connection.connected && telemetry?.bleConnected
                      ? 'text-[var(--text-primary)]'
                      : 'text-[var(--text-muted)]'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      connection.connected && telemetry?.bleConnected
                        ? 'bg-[var(--accent)]'
                        : 'bg-[var(--text-muted)]'
                    }`}
                  />
                  {!connection.connected
                    ? 'Pad Offline'
                    : telemetry?.bleConnected
                    ? 'BLE Connected'
                    : 'BLE Disconnected'}
                </span>
              </div>

              <div
                role="group"
                aria-label="Multi-Host BLE slot switcher"
                className="divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]"
              >
                {([1, 2, 3] as const).map(slot => {
                  const isActive = connection.connected && (telemetry?.bleActiveHost ?? 1) === slot;
                  const hostId = bleSlotToProfileId(slot);
                  const hostProf = profiles.find(p => p.id === hostId);
                  const customName = hostProf?.name || `Device ${slot}`;
                  const currentOs = settings.hostOsMap?.[hostId] || 'mac';
                  return (
                    <div
                      key={slot}
                      className={`py-2.5 px-2 -mx-2 rounded-lg transition-colors flex items-center justify-between gap-3 flex-wrap ${
                        isActive ? 'bg-[var(--bg-selected)]' : 'hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      <button
                        type="button"
                        disabled={!connection.connected || bleBusy}
                        onClick={() => handleSwitchBleHost(slot)}
                        className="min-w-0 text-left cursor-pointer disabled:cursor-default flex items-center gap-2.5 flex-1"
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            isActive ? 'bg-[var(--accent)]' : 'bg-transparent border border-[var(--border-strong)]'
                          }`}
                        />
                        <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                          {customName}
                        </span>
                        <span className="font-mono text-[11px] text-[var(--text-muted)] shrink-0">
                          Host {slot}
                        </span>
                        {isActive && (
                          <span className="font-mono text-[10px] font-semibold text-[var(--accent)] shrink-0">
                            Active
                          </span>
                        )}
                      </button>

                      {/* Per-device OS selector */}
                      <div
                        role="group"
                        aria-label={`${customName} operating system`}
                        className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] shrink-0"
                      >
                        {(
                          [
                            { id: 'mac', label: 'Mac' },
                            { id: 'windows', label: 'Windows' },
                            { id: 'linux', label: 'Linux' }
                          ] as const
                        ).map(osOpt => {
                          const selectedOs = currentOs === osOpt.id;
                          return (
                            <button
                              key={osOpt.id}
                              type="button"
                              onClick={() => {
                                if (onSetHostOs) {
                                  onSetHostOs(hostId, osOpt.id);
                                } else {
                                  onUpdateSettings({
                                    hostOsMap: {
                                      ...settings.hostOsMap,
                                      [hostId]: osOpt.id
                                    }
                                  });
                                }
                              }}
                              className={`py-1 px-2 rounded-md text-[11px] transition-colors cursor-pointer whitespace-nowrap ${
                                selectedOs
                                  ? 'bg-[var(--bg-selected)] text-[var(--text-primary)] font-semibold'
                                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                              }`}
                            >
                              {osOpt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <BleManagementCard
                connection={connection}
                activeProfileId={profiles.find(p => p.id === telemetry?.activeProfile)?.id || 'HOST1'}
                profiles={profiles}
                onToast={onToast}
                onPullFromUsb={onPullFromUsb}
              />
            </section>
          )}

        {/* Display Section (OLED Power & Contrast — dim, off, contrast) */}
        {showDisplay && (
          <section
            aria-labelledby="settings-display-heading"
            className="py-7 first:pt-0 space-y-5"
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <Monitor className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                  <h2 id="settings-display-heading">Display</h2>
                </div>
                <p className="font-mono text-[11px] text-[var(--text-muted)]">
                  OLED idle dim · sleep timeout · peak contrast
                </p>
              </div>

              <span className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums shrink-0">
                {connection.connected && telemetry
                  ? supportsDisplayPower
                    ? `Dim ${formatDisplayTimeout(
                        telemetry.displayDimSeconds ?? 60
                      )} · Off ${formatDisplayTimeout(
                        telemetry.displayOffSeconds ?? 300
                      )} · Contrast ${telemetry.displayContrast ?? 255}`
                    : 'Requires firmware v4.8+'
                  : 'Connect USB pad to manage'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-1">
              {/* Dim Timeout (`dim`, 0–36000s) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="display-dim-seconds"
                    className="text-xs font-medium text-[var(--text-primary)]"
                  >
                    Dim after
                  </label>
                  <span className="font-mono text-[11px] text-[var(--text-secondary)] font-medium tabular-nums">
                    {formatDisplayTimeout(displayDim)}
                  </span>
                </div>

                <div className="flex items-center gap-1 flex-wrap">
                  {DISPLAY_DIM_PRESETS.map(p => {
                    const active = displayDim === p.seconds;
                    return (
                      <button
                        key={p.seconds}
                        type="button"
                        disabled={!connection.connected || !supportsDisplayPower || displayBusy}
                        onClick={() => setDisplayDim(p.seconds)}
                        className={`px-2.5 py-1 rounded-md font-mono text-[11px] transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums disabled:opacity-45 ${
                          active
                            ? 'bg-[var(--text-primary)] text-[var(--bg-canvas)] font-semibold'
                            : 'bg-transparent hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="display-dim-seconds"
                    type="number"
                    min={0}
                    max={36000}
                    step={5}
                    disabled={!connection.connected || !supportsDisplayPower || displayBusy}
                    value={displayDim}
                    onChange={e =>
                      setDisplayDim(
                        Math.max(0, Math.min(36000, Math.round(Number(e.target.value) || 0)))
                      )
                    }
                    className="w-24 px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] font-mono text-xs text-[var(--text-primary)] tabular-nums disabled:opacity-50 focus:outline-none focus:border-[var(--border-strong)]"
                  />
                  <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                    sec (0 = never)
                  </span>
                </div>
              </div>

              {/* Screen Off Timeout (`off`, 0–36000s) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="display-off-seconds"
                    className="text-xs font-medium text-[var(--text-primary)]"
                  >
                    Turn off after
                  </label>
                  <span className="font-mono text-[11px] text-[var(--text-secondary)] font-medium tabular-nums">
                    {formatDisplayTimeout(displayOff)}
                  </span>
                </div>

                <div className="flex items-center gap-1 flex-wrap">
                  {DISPLAY_OFF_PRESETS.map(p => {
                    const active = displayOff === p.seconds;
                    return (
                      <button
                        key={p.seconds}
                        type="button"
                        disabled={!connection.connected || !supportsDisplayPower || displayBusy}
                        onClick={() => setDisplayOff(p.seconds)}
                        className={`px-2.5 py-1 rounded-md font-mono text-[11px] transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums disabled:opacity-45 ${
                          active
                            ? 'bg-[var(--text-primary)] text-[var(--bg-canvas)] font-semibold'
                            : 'bg-transparent hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="display-off-seconds"
                    type="number"
                    min={0}
                    max={36000}
                    step={10}
                    disabled={!connection.connected || !supportsDisplayPower || displayBusy}
                    value={displayOff}
                    onChange={e =>
                      setDisplayOff(
                        Math.max(0, Math.min(36000, Math.round(Number(e.target.value) || 0)))
                      )
                    }
                    className="w-24 px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] font-mono text-xs text-[var(--text-primary)] tabular-nums disabled:opacity-50 focus:outline-none focus:border-[var(--border-strong)]"
                  />
                  <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                    sec (0 = never)
                  </span>
                </div>
              </div>
            </div>

            {/* OLED Contrast (`contrast`, 0–255) */}
            <div className="pt-4 border-t border-[var(--border-subtle)] space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label
                  htmlFor="display-contrast-range"
                  className="text-xs font-medium text-[var(--text-primary)]"
                >
                  Active OLED contrast
                </label>
                <span className="font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
                  {displayContrast} / 255 ({Math.round((displayContrast / 255) * 100)}%)
                </span>
              </div>

              <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                <input
                  id="display-contrast-range"
                  type="range"
                  min={0}
                  max={255}
                  step={1}
                  disabled={!connection.connected || !supportsDisplayPower || displayBusy}
                  value={displayContrast}
                  onChange={e =>
                    setDisplayContrast(
                      Math.max(0, Math.min(255, Math.round(Number(e.target.value) || 0)))
                    )
                  }
                  className="flex-1 min-w-[140px] accent-[var(--accent)] cursor-pointer disabled:opacity-45"
                />
                <input
                  type="number"
                  min={0}
                  max={255}
                  disabled={!connection.connected || !supportsDisplayPower || displayBusy}
                  value={displayContrast}
                  onChange={e =>
                    setDisplayContrast(
                      Math.max(0, Math.min(255, Math.round(Number(e.target.value) || 0)))
                    )
                  }
                  aria-label="OLED contrast numeric value (0 to 255)"
                  className="w-20 px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] font-mono text-xs text-[var(--text-primary)] tabular-nums disabled:opacity-50 focus:outline-none focus:border-[var(--border-strong)]"
                />
                <div className="flex items-center gap-1 shrink-0">
                  {DISPLAY_CONTRAST_PRESETS.map(preset => {
                    const active = displayContrast === preset.value;
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        disabled={!connection.connected || !supportsDisplayPower || displayBusy}
                        onClick={() => setDisplayContrast(preset.value)}
                        className={`px-2 py-1 rounded-md font-mono text-[11px] transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums disabled:opacity-45 ${
                          active
                            ? 'bg-[var(--text-primary)] text-[var(--bg-canvas)] font-semibold'
                            : 'bg-transparent hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {displayDim > 0 && displayOff > 0 && displayOff < displayDim && (
              <div className="text-[11px] text-[#D97706] tabular-nums">
                Screen-off timeout ({formatDisplayTimeout(displayOff)}) is shorter than dim timeout ({formatDisplayTimeout(displayDim)}), so the OLED will turn off before dimming.
              </div>
            )}

            <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2 flex-wrap">
              <button
                type="button"
                disabled={!connection.connected || !supportsDisplayPower || displayBusy}
                onClick={() => {
                  setDisplayDim(60);
                  setDisplayOff(300);
                  setDisplayContrast(255);
                }}
                className="studio-btn px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-45 cursor-pointer whitespace-nowrap shrink-0"
              >
                Defaults (1m · 5m · 255)
              </button>

              <button
                type="button"
                disabled={!connection.connected || !supportsDisplayPower || displayBusy}
                onClick={handleSaveDisplaySettings}
                className="studio-cta flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
              >
                {displayBusy && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
                <span>{displayBusy ? 'Saving…' : 'Save Display'}</span>
              </button>
            </div>

            {/* 128x64 OLED Screen Composer Row */}
            {onOpenOledComposer && (
              <div className="pt-5 border-t border-[var(--border-subtle)] flex items-center justify-between gap-4 flex-wrap">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                    <Sparkles className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
                    <span>128×64 OLED Screen Composer</span>
                    {settings.oledComposer?.enabled && (
                      <span className="font-mono text-[10px] font-semibold text-[var(--accent)]">
                        · Custom active
                      </span>
                    )}
                  </div>
                  <p className="font-mono text-[11px] text-[var(--text-muted)]">
                    1-bit pixel canvas · PNG/SVG dithering · bitmaps.h
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onOpenOledComposer}
                  className="studio-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Monitor className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                  <span>Open OLED Composer</span>
                </button>
              </div>
            )}
          </section>
        )}

        {/* Motion Sensor Section (shown strictly when `capabilities` includes `"motion"`) */}
        {showMotion && (
          <section aria-labelledby="settings-motion-heading" className="py-7 first:pt-0 space-y-4">
            <h2 id="settings-motion-heading" className="sr-only">
              Motion
            </h2>

            <MotionSettings
              motion={telemetry?.motion}
              supported={supportsMotion}
              connected={connection.connected}
              onToast={onToast}
              onJumpToMotionSlot={onJumpToMotionSlot}
              gyroCalibration={settings.gyroCalibration}
              onUpdateGyroCalibration={calib => onUpdateSettings({ gyroCalibration: calib })}
            />
          </section>
        )}

        {/* Wi-Fi & TV Section */}
        {showWifiTv && (
          <section aria-labelledby="settings-wifi-tv-heading" className="py-7 first:pt-0 space-y-6">
            <div className="flex items-center justify-between gap-2">
              <h2
                id="settings-wifi-tv-heading"
                className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2"
              >
                <Wifi className="w-4 h-4 text-[var(--text-secondary)]" />
                <span>Wi-Fi &amp; TV</span>
              </h2>
              <span className="font-mono text-[11px] text-[var(--text-muted)]">
                {connection.connected
                  ? telemetry?.tvEnabled === false
                    ? 'TV mode off'
                    : 'Stored on pad'
                  : 'Connect USB pad to manage'}
              </span>
            </div>

            {supportsTvToggle && (
              <div className="py-3 border-y border-[var(--border-subtle)] flex items-center justify-between gap-4">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <Tv className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
                    <span
                      id="settings-tv-mode-label"
                      className="text-xs font-medium text-[var(--text-primary)]"
                    >
                      TV mode
                    </span>
                    <span className="font-mono text-[11px] text-[var(--text-muted)]">
                      ·{' '}
                      {connection.connected && telemetry
                        ? isTvModeEnabled
                          ? 'On'
                          : 'Off'
                        : `${isTvModeEnabled ? 'On' : 'Off'} · Disconnected`}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Enables SmartCast TV profile · saved bindings remain intact when off
                  </p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-labelledby="settings-tv-mode-label"
                  aria-checked={isTvModeEnabled}
                  disabled={!connection.connected || tvModeBusy}
                  onClick={handleToggleTvMode}
                  title={
                    !connection.connected
                      ? 'Connect BertoPad via USB to toggle TV mode'
                      : isTvModeEnabled
                      ? 'Turn off TV mode'
                      : 'Turn on TV mode'
                  }
                  className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                    !connection.connected || tvModeBusy
                      ? 'opacity-40 cursor-not-allowed'
                      : 'cursor-pointer'
                  } ${
                    isTvModeEnabled
                      ? 'bg-[var(--accent)] border-transparent'
                      : 'bg-[var(--bg-input)] border-[var(--border-strong)]'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full shadow-sm ring-0 transition duration-200 ease-in-out ${
                      isTvModeEnabled
                        ? 'translate-x-4 bg-[var(--accent-contrast)]'
                        : 'translate-x-0 bg-[var(--text-secondary)]'
                    }`}
                  />
                </button>
              </div>
            )}

            {/* 3. Wi-Fi Provisioning */}
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  Wi-Fi Network
                </span>
                <div className="font-mono text-[11px] text-[var(--text-muted)]">
                  {connection.connected && telemetry ? (
                    telemetry.wifiConnected ? (
                      <span className="text-[var(--text-primary)]">
                        {telemetry.ssid || 'Wi-Fi'} · {telemetry.ip}
                      </span>
                    ) : telemetry.ssid ? (
                      <span>Saved: {telemetry.ssid} (Disconnected)</span>
                    ) : (
                      <span>No network saved</span>
                    )
                  ) : (
                    <span>Stored on pad only</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  maxLength={32}
                  disabled={!connection.connected || wifiBusy}
                  value={wifiSsid}
                  onChange={e => setWifiSsid(e.target.value)}
                  placeholder="2.4 GHz Network Name (SSID)"
                  aria-label="Wi-Fi Network Name (SSID)"
                  className="px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] disabled:opacity-50 focus:outline-none focus:border-[var(--border-strong)]"
                />
                <input
                  type="password"
                  maxLength={63}
                  autoComplete="new-password"
                  disabled={!connection.connected || wifiBusy}
                  value={wifiPass}
                  onChange={e => setWifiPass(e.target.value)}
                  placeholder="Password (pad only)"
                  aria-label="Wi-Fi Password"
                  className="px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] disabled:opacity-50 focus:outline-none focus:border-[var(--border-strong)]"
                />
                <button
                  type="button"
                  disabled={!connection.connected || wifiBusy || !wifiSsid.trim()}
                  onClick={handleSaveWifi}
                  className="studio-cta py-2 px-3.5 rounded-lg text-xs font-semibold disabled:opacity-40 cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  {wifiBusy && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
                  <span>{wifiBusy ? 'Connecting…' : 'Save & Connect'}</span>
                </button>
              </div>

              {wifiStatusBanner && (
                <div
                  className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                    wifiStatusBanner.ok
                      ? 'bg-[var(--bg-selected)] border-[var(--border-strong)] text-[var(--text-primary)]'
                      : 'bg-[var(--bg-input)] border-[#D97706] text-[var(--text-primary)]'
                  }`}
                >
                  {wifiStatusBanner.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
                  )}
                  <span>{wifiStatusBanner.text}</span>
                </div>
              )}
            </div>

            {/* 4. SmartCast TV Pairing */}
            <div className="pt-5 border-t border-[var(--border-subtle)] space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  Vizio SmartCast TV Pairing
                </span>
                <span className="font-mono text-[11px] text-[var(--text-muted)]">
                  {connection.connected && telemetry
                    ? telemetry.tvPaired
                      ? `Paired (${telemetry.tvHost}:${telemetry.tvPort})`
                      : telemetry.tvConfigured
                      ? `Host set (${telemetry.tvHost})`
                      : 'Not paired'
                    : 'Stored on pad only'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  disabled={!connection.connected || tvBusy}
                  value={tvIp}
                  onChange={e => setTvIp(e.target.value)}
                  placeholder="TV IP (e.g. 192.168.1.50)"
                  aria-label="Vizio TV IP address"
                  className="sm:col-span-2 px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] disabled:opacity-50 focus:outline-none focus:border-[var(--border-strong)]"
                />
                <input
                  type="number"
                  disabled={!connection.connected || tvBusy}
                  value={tvPort}
                  onChange={e => setTvPort(e.target.value)}
                  placeholder="Port (7345)"
                  aria-label="Vizio TV Port"
                  className="px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] disabled:opacity-50 focus:outline-none focus:border-[var(--border-strong)] tabular-nums"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!connection.connected || tvBusy || !tvIp.trim()}
                  onClick={handleStartTvPairing}
                  className="px-3.5 py-1.5 rounded-lg bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-semibold disabled:opacity-40 hover:opacity-90 cursor-pointer whitespace-nowrap"
                >
                  Start pairing
                </button>

                <button
                  type="button"
                  disabled={!connection.connected || tvBusy}
                  onClick={handleTestTv}
                  className="studio-btn px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-primary)] disabled:opacity-40 cursor-pointer whitespace-nowrap"
                >
                  Test TV
                </button>

                <button
                  type="button"
                  disabled={!connection.connected || tvBusy}
                  onClick={() => setShowManualTokenMode(v => !v)}
                  className="studio-btn px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                >
                  <KeyRound className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  <span>I already have an auth token</span>
                </button>

                <button
                  type="button"
                  disabled={!connection.connected || tvBusy}
                  onClick={() => setForgetTvModalOpen(true)}
                  className="studio-btn px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 cursor-pointer whitespace-nowrap ml-auto"
                >
                  Forget TV
                </button>
              </div>

              {pairingActive && (
                <div className="p-3 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-strong)] space-y-2">
                  <div className="text-xs font-medium text-[var(--text-primary)]">
                    Enter the 4-digit PIN displayed on your TV screen:
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
                      className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)]"
                    />
                    <button
                      type="button"
                      disabled={tvBusy || !tvPin.trim()}
                      onClick={handleSubmitTvPinAndAutoTest}
                      className="studio-cta px-3.5 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                    >
                      {tvBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>Submit PIN &amp; Test</span>
                    </button>
                  </div>
                </div>
              )}

              {showManualTokenMode && (
                <div className="p-3 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-2">
                  <div className="text-[11px] text-[var(--text-muted)]">
                    Save existing SmartCast auth token directly to pad:
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
                      className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] disabled:opacity-50"
                    />
                    <button
                      type="button"
                      disabled={!connection.connected || tvBusy || !tvIp.trim() || !tvToken.trim()}
                      onClick={handleSaveTvManualToken}
                      className="studio-cta px-3.5 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 cursor-pointer whitespace-nowrap"
                    >
                      Save IP, Port &amp; Token
                    </button>
                  </div>
                </div>
              )}

              {tvTestResult && (
                <div
                  className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                    tvTestResult.neutral
                      ? 'bg-[var(--bg-panel)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                      : tvTestResult.ok
                      ? 'bg-[var(--bg-selected)] border-[var(--border-strong)] text-[var(--text-primary)]'
                      : 'bg-[var(--bg-input)] border-[#D97706] text-[var(--text-primary)]'
                  }`}
                >
                  {tvTestResult.neutral ? (
                    <Tv className="w-4 h-4 text-[var(--text-muted)] shrink-0 mt-0.5" />
                  ) : tvTestResult.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
                  )}
                  <span>{tvTestResult.text}</span>
                </div>
              )}
            </div>

            {/* 5. Local HTTP API Security (Pad Only) */}
            <div className="pt-5 border-t border-[var(--border-subtle)] space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                  <Shield className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
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
                  className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] disabled:opacity-50"
                />
                <button
                  type="button"
                  disabled={!connection.connected || authBusy}
                  onClick={handleSaveHttpAuth}
                  className="studio-btn px-3.5 py-2 rounded-lg text-xs font-medium text-[var(--text-primary)] disabled:opacity-40 cursor-pointer whitespace-nowrap"
                >
                  Save Token
                </button>
              </div>
            </div>
          </section>
        )}

        {/* 6. Theme, Live Events Toggle, Audio & Keyboard Layout */}
        {showPreferences && (
          <section className="py-7 first:pt-0 space-y-5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Theme
                </h2>
                <p className="text-[11px] text-[var(--text-muted)]">
                  System, Dark, or Light appearance
                </p>
              </div>
              <div
                role="group"
                aria-label="Theme mode"
                className="flex items-center p-0.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]"
              >
                {themeOptions.map(opt => {
                  const Icon = opt.icon;
                  const active = settings.theme === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onUpdateSettings({ theme: opt.id })}
                      className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap transition-colors ${
                        active
                          ? 'bg-[var(--bg-selected)] text-[var(--text-primary)]'
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

            <div className="divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
              {/* Live Events Toggle */}
              <div className="py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 min-w-0">
                  <Activity className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                  <span className="text-xs font-medium text-[var(--text-primary)]">
                    Live Pad Stream
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSettings({ liveEventsEnabled: !settings.liveEventsEnabled })
                  }
                  className="studio-btn px-3 py-1 rounded-lg font-mono text-[11px] font-medium text-[var(--text-primary)] cursor-pointer"
                >
                  {settings.liveEventsEnabled ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* Switch Sound & Mechanical Audio Profile */}
              <div className="py-3 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  {settings.soundEnabled ? (
                    <Volume2 className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                  )}
                  <span className="text-xs font-medium text-[var(--text-primary)]">
                    Switch Sound
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {onSelectSoundProfile && (
                    <div
                      role="group"
                      aria-label="Mechanical switch sound profile"
                      className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]"
                    >
                      {(
                        [
                          { id: 'thock' as const, label: 'Thock' },
                          { id: 'click' as const, label: 'Click' },
                          { id: 'tactile' as const, label: 'Tactile' }
                        ] as const
                      ).map(opt => {
                        const active = soundProfile === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              if (!settings.soundEnabled) {
                                onUpdateSettings({ soundEnabled: true });
                              }
                              onSelectSoundProfile(opt.id);
                            }}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                              active
                                ? 'bg-[var(--bg-selected)] text-[var(--text-primary)] font-semibold'
                                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSettings({ soundEnabled: !settings.soundEnabled })
                    }
                    className="studio-btn px-3 py-1 rounded-lg font-mono text-[11px] font-medium text-[var(--text-primary)] cursor-pointer"
                  >
                    {settings.soundEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>

              {/* Shortcut Recorder Layout */}
              <div className="py-3 flex items-center justify-between gap-4 flex-wrap">
                <label className="text-xs font-medium text-[var(--text-primary)]">
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
                  className="px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
                >
                  {KEYBOARD_LAYOUTS.map(layout => (
                    <option key={layout.id} value={layout.id}>
                      {layout.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>
        )}

        {/* Backup & Restore Workspace */}
        {showPreferences && (
          <section className="py-7 first:pt-0 space-y-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="space-y-0.5">
                <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <Download className="w-4 h-4 text-[var(--text-secondary)]" />
                  <span>Backup &amp; Restore Workspace</span>
                </h2>
                <p className="font-mono text-[11px] text-[var(--text-muted)]">
                  4 profiles · macros · encoders · JSON snapshot
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="file"
                  ref={importBackupFileRef}
                  accept=".json"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file && onImportBackupFile) {
                      onImportBackupFile(file);
                      e.target.value = '';
                    }
                  }}
                />
                {onExportBackupFile && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await onExportBackupFile();
                      } catch (err: any) {
                        onToast(err?.message || 'Could not export backup file', 'error');
                      }
                    }}
                    className="studio-cta flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Backup (.json)</span>
                  </button>
                )}
                {onImportBackupFile && (
                  <button
                    type="button"
                    onClick={() => importBackupFileRef.current?.click()}
                    className="studio-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                    <span>Import &amp; Restore</span>
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Standalone Desktop & Mobile App Installation */}
        {showPreferences && (
          <section className="py-7 first:pt-0 flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1 space-y-0.5">
              <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <Monitor className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                <span>Desktop &amp; Mobile App</span>
              </h2>
              <p className="font-mono text-[11px] text-[var(--text-muted)]">
                Standalone PWA · offline cache · Web Serial
              </p>
            </div>
            <PWAInstallButton showInstalledState />
          </section>
        )}

        {/* Developer Tab: Hardware Internals, Raw IDs, Source Studio & Serial Console */}
        {showDeveloper && (
          <div className="divide-y divide-[var(--border-subtle)]">
            {/* Detailed Hardware & Memory Diagnostics */}
            <section className="py-7 first:pt-0 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <Cpu className="w-4 h-4 text-[var(--text-secondary)]" />
                  <span>Hardware &amp; Memory Diagnostics</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyDiagnostics}
                    title="Copy full diagnostics report to clipboard"
                    className="studio-btn inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copy diagnostics</span>
                  </button>
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
                          onToast(err?.message || 'Could not query BertoPad status', 'error');
                        } finally {
                          setDiagRefreshing(false);
                        }
                      }}
                      title="Poll /api/status from BertoPad right now (also auto-updates every 4s)"
                      className="studio-btn inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-45 cursor-pointer whitespace-nowrap"
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${diagRefreshing ? 'animate-spin' : ''}`}
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
                const hasNvs =
                  connection.connected &&
                  typeof telemetry?.nvsUsed === 'number' &&
                  typeof telemetry?.nvsFree === 'number';
                const nvsUsed = hasNvs ? Math.max(0, telemetry!.nvsUsed!) : 0;
                const nvsFree = hasNvs ? Math.max(0, telemetry!.nvsFree!) : 0;
                const nvsTotal = nvsUsed + nvsFree;
                const nvsPct =
                  hasNvs && nvsTotal > 0
                    ? Math.min(100, Math.round((nvsUsed / nvsTotal) * 100))
                    : 0;
                const isHighNvs = hasNvs && nvsPct >= 85;

                return (
                  <div className="divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)] text-xs">
                    <div className="py-2.5 flex items-center justify-between gap-4 flex-wrap">
                      <span className="text-[var(--text-muted)]">Device ID</span>
                      <div className="flex items-center gap-2 font-mono tabular-nums">
                        <span className="font-semibold text-[var(--text-primary)] break-all">
                          {fullDeviceId || '—'}
                        </span>
                        <span className="text-[11px] text-[var(--text-muted)] hidden sm:inline">
                          {connection.connected
                            ? isDemo
                              ? 'Demo'
                              : `115,200 bd${connection.vendorProduct ? ` · ${connection.vendorProduct}` : ''}`
                            : currentDeviceId
                            ? 'Cached'
                            : 'Offline'}
                        </span>
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
                            className="inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="py-2.5 flex items-center justify-between gap-4">
                      <span className="text-[var(--text-muted)]">
                        {connection.connected ? 'Firmware version' : 'Last synced FW'}
                      </span>
                      <div className="flex items-center gap-2 font-mono tabular-nums">
                        <span className="font-semibold text-[var(--text-primary)]">
                          {connection.connected
                            ? connection.firmwareVersion
                            : settings.lastKnownFirmware || '—'}
                        </span>
                        <span className="text-[11px] text-[var(--text-muted)]">
                          {hasEmbeddedFwDiff
                            ? `config.h: ${reportedRawFw}`
                            : connection.connected
                            ? telemetry?.supportsNativeDelay
                              ? 'Native Delay + 512B'
                              : 'Standard BertoLink'
                            : 'Connect USB'}
                        </span>
                      </div>
                    </div>

                    <div className="py-2.5 flex items-center justify-between gap-4">
                      <span className="text-[var(--text-muted)]">API &amp; Revision</span>
                      <div className="flex items-center gap-2 font-mono tabular-nums">
                        <span className="font-semibold text-[var(--text-primary)]">
                          {connection.connected && telemetry ? `v${telemetry.apiVersion}` : '—'} · rev {liveRev}
                        </span>
                        <span className="text-[11px] text-[var(--text-muted)]">
                          {connection.connected && telemetry
                            ? `${telemetry.connectionType || 'USB'} · ${telemetry.activeProfile}`
                            : 'Local NVS mirror'}
                        </span>
                      </div>
                    </div>

                    <div className="py-2.5 flex items-center justify-between gap-4">
                      <span className="text-[var(--text-muted)]">Free SRAM</span>
                      <div className="flex items-center gap-2 font-mono tabular-nums">
                        <span className="font-semibold text-[var(--text-primary)]">
                          {connection.connected && telemetry && heapBytes > 0
                            ? `${(heapBytes / 1024).toFixed(1)} KB`
                            : '—'}
                        </span>
                        <span className="text-[11px] text-[var(--text-muted)]">
                          {connection.connected && telemetry && heapBytes > 0
                            ? typeof telemetry.minFreeHeap === 'number' && telemetry.minFreeHeap > 0
                              ? `Min ${(telemetry.minFreeHeap / 1024).toFixed(1)} KB`
                              : `${heapBytes.toLocaleString()} B free`
                            : 'ESP32 heap'}
                        </span>
                      </div>
                    </div>

                    <div className="py-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-[var(--text-muted)]">NVS storage</span>
                        <div className="flex items-center gap-2 font-mono tabular-nums">
                          <span className="font-semibold text-[var(--text-primary)]">
                            {hasNvs
                              ? `${nvsUsed.toLocaleString()} / ${nvsTotal.toLocaleString()} entries`
                              : '—'}
                          </span>
                          <span
                            className={`text-[11px] font-medium ${
                              !hasNvs
                                ? 'text-[var(--text-muted)]'
                                : isHighNvs
                                ? 'text-[#D97706]'
                                : 'text-[var(--text-secondary)]'
                            }`}
                          >
                            {hasNvs ? `${nvsPct}% used · ${nvsFree.toLocaleString()} free` : 'Connect USB'}
                          </span>
                        </div>
                      </div>
                      <div
                        role="progressbar"
                        aria-label="NVS storage usage"
                        aria-valuemin={0}
                        aria-valuemax={hasNvs && nvsTotal > 0 ? nvsTotal : 100}
                        aria-valuenow={hasNvs ? nvsUsed : 0}
                        className="h-1.5 w-full rounded-full bg-[var(--bg-input)] overflow-hidden"
                      >
                        <div
                          style={{
                            width: hasNvs
                              ? `${Math.max(nvsUsed > 0 ? 2 : 0, nvsPct)}%`
                              : '0%'
                          }}
                          className={`h-full rounded-full transition-opacity ${
                            isHighNvs ? 'bg-[#D97706]' : 'bg-[var(--accent)]'
                          }`}
                        />
                      </div>
                    </div>

                    <div className="py-2.5 flex items-center justify-between gap-4">
                      <span className="text-[var(--text-muted)]">Uptime &amp; boot</span>
                      <div className="flex items-center gap-2 font-mono tabular-nums">
                        <span className="font-semibold text-[var(--text-primary)]">
                          {connection.connected ? formatUptime(telemetry?.uptimeSeconds) : '—'}
                        </span>
                        <span className="text-[11px] text-[var(--text-muted)]">
                          {connection.connected && telemetry
                            ? telemetry.abnormalResets && telemetry.abnormalResets > 0
                              ? `${telemetry.abnormalResets} crash${
                                  telemetry.abnormalResets === 1 ? '' : 'es'
                                }${
                                  telemetry.lastAbnormalReset
                                    ? ` · ${telemetry.lastAbnormalReset}`
                                    : ''
                                }`
                              : telemetry.bootReason
                              ? `Boot: ${telemetry.bootReason}`
                              : 'Nominal'
                            : 'ESP32 reset health'}
                        </span>
                        {connection.connected &&
                          typeof telemetry?.abnormalResets === 'number' &&
                          telemetry.abnormalResets > 0 && (
                            <button
                              type="button"
                              disabled={clearingCrashBusy}
                              onClick={handleClearCrashDiagnostics}
                              title="Clear abnormal reset counter in NVS"
                              className="text-[10px] text-[#D97706] hover:underline cursor-pointer disabled:opacity-45"
                            >
                              Clear ({telemetry.abnormalResets})
                            </button>
                          )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </section>

            {/* Raw Firmware IDs Toggle */}
            <section className="py-7 flex items-center justify-between gap-4 flex-wrap">
              <div className="space-y-0.5">
                <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-[var(--text-secondary)]" />
                  <span>Raw Firmware IDs</span>
                </h2>
                <p className="font-mono text-[11px] text-[var(--text-muted)]">
                  Display firmware tokens (PLAY_PAUSE, VOL_DOWN, slot codes)
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({ showAdvancedIds: !settings.showAdvancedIds })
                }
                className="studio-btn px-3 py-1.5 rounded-lg font-mono text-[11px] font-medium text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
              >
                {settings.showAdvancedIds ? 'Shown' : 'Hidden'}
              </button>
            </section>

            {/* ESP32 Firmware Source Studio */}
            <section className="py-7 space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)] flex-wrap">
                    <Code2 className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                    <span>ESP32 Firmware {STUDIO_VERSION} Source Studio</span>
                  </div>
                  <p className="font-mono text-[11px] text-[var(--text-muted)]">
                    Arduino / PlatformIO · 9 keys + dual encoders · multi-host BLE
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setFirmwareBinGuideOpen(true)}
                    className="studio-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                    <span>Firmware .bin Guide</span>
                  </button>
                  <button
                    type="button"
                    disabled={sourceBusy}
                    onClick={handleCopyV47Source}
                    className="studio-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-primary)] disabled:opacity-45 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                    <span>Copy C++ Sketch</span>
                  </button>
                  <button
                    type="button"
                    disabled={sourceBusy}
                    onClick={handleDownloadV47Source}
                    className="studio-cta flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-45 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download {FIRMWARE_INO_FILENAME}</span>
                  </button>
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--border-subtle)] grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-xs text-[var(--text-secondary)]">
                <div>
                  <div className="font-medium text-[var(--text-primary)]">
                    Dual Rotary Encoders &amp; GPIO Pinout
                  </div>
                  <div className="font-mono text-[11px] text-[var(--text-muted)] mt-0.5 tabular-nums">
                    Knob 1: GPIO 32/33/25 · Knob 2: GPIO 34/35/15
                  </div>
                </div>
                <div>
                  <div className="font-medium text-[var(--text-primary)]">
                    Native DELAY:&lt;ms&gt; &amp; 8 KB Serial Buffer
                  </div>
                  <div className="font-mono text-[11px] text-[var(--text-muted)] mt-0.5 tabular-nums">
                    Up to 10s/step · 512 B NVS/slot · 8,192 B frames
                  </div>
                </div>
              </div>
            </section>

            {/* Direct C++ Firmware Header Exports (config.h & bitmaps.h) */}
            <section className="py-7 flex items-center justify-between gap-4 flex-wrap">
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <Code2 className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                  <span>Firmware Header Export</span>
                </div>
                <p className="font-mono text-[11px] text-[var(--text-muted)]">
                  config.h (keymaps &amp; calibration) · bitmaps.h (128×64 OLED)
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleDownloadGeneratedHeader('config')}
                  className="studio-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                  <span>Export config.h</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadGeneratedHeader('bitmaps')}
                  className="studio-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                  <span>Export bitmaps.h</span>
                </button>
              </div>
            </section>

            {/* Debug Console (Redacted Serial Traffic + Copy & Clear) */}
            <section className="py-7 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <Terminal className="w-4 h-4 text-[var(--text-secondary)]" />
                  <span>Debug console</span>
                  <span className="font-mono text-[11px] font-normal text-[var(--text-muted)] tabular-nums">
                    ({debugLogs.length} lines · redacted)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyDebugConsole}
                    className="studio-btn flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
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
                    className="studio-btn flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 cursor-pointer whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear</span>
                  </button>
                </div>
              </div>

              <div className="h-44 overflow-y-auto rounded-lg bg-[#0D0F14] border border-[var(--border-subtle)] p-3 font-mono text-[11px] space-y-1 tabular-nums">
                {debugLogs.length === 0 ? (
                  <div className="text-[#A1A1AA] py-4 text-center">
                    No serial traffic logged yet. Connect the USB pad or start demo mode to inspect JSON lines.
                  </div>
                ) : (
                  debugLogs.map(entry => (
                    <div key={entry.id} className="flex items-start gap-2 leading-relaxed break-all">
                      <span className="text-[#71717A] shrink-0">{entry.timestamp}</span>
                      <span
                        className={`uppercase font-bold shrink-0 ${
                          entry.direction === 'tx'
                            ? 'text-[#F2A33A]'
                            : entry.direction === 'rx'
                            ? 'text-[#ECEAE4]'
                            : entry.direction === 'error'
                            ? 'text-[#D97706]'
                            : 'text-[#A1A1AA]'
                        }`}
                      >
                        {entry.direction}
                      </span>
                      <span className="text-[#ECEAE4]">{entry.line}</span>
                    </div>
                  ))
                )}
              </div>

              {/* Interactive Web Serial Command & JSON Inspector */}
              <div className="pt-2 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-medium text-[var(--text-primary)]">
                    Interactive Command &amp; JSON Inspector
                  </span>
                  <div className="flex items-center gap-1 flex-wrap">
                    {(['/api/status', '/api/profiles', '/api/motion/read'] as const).map(preset => (
                      <button
                        key={preset}
                        type="button"
                        disabled={!connection.connected || rawCmdBusy}
                        onClick={() => {
                          setRawCmdInput(preset);
                          handleSendRawCommand(preset);
                        }}
                        className="px-2 py-0.5 rounded-md bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] font-mono text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-45 cursor-pointer"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={rawCmdInput}
                    onChange={e => setRawCmdInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSendRawCommand();
                    }}
                    placeholder='{"path":"/api/status"} or /api/profiles'
                    aria-label="Web Serial JSON command or API path"
                    className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] font-mono text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-strong)]"
                  />
                  <button
                    type="button"
                    disabled={!connection.connected || rawCmdBusy || !rawCmdInput.trim()}
                    onClick={() => handleSendRawCommand()}
                    className="px-3.5 py-1.5 rounded-lg bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-semibold disabled:opacity-40 cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    {rawCmdBusy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>Send</span>
                  </button>
                </div>

                {rawCmdResult && (
                  <pre
                    className={`p-3 rounded-lg bg-[#0D0F14] border text-[11px] font-mono overflow-x-auto max-h-48 tabular-nums ${
                      rawCmdResult.ok
                        ? 'border-[var(--border-subtle)] text-[#ECEAE4]'
                        : 'border-[#D97706] text-[#FBBF24]'
                    }`}
                  >
                    {`TX ${rawCmdResult.request}\n\nRX ${rawCmdResult.response}`}
                  </pre>
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
                  <span>Advanced serial &amp; HTTP protocol details</span>
                </button>
                {showAdvancedProtocol && (
                  <div className="mt-2.5 py-2.5 border-y border-[var(--border-subtle)] font-mono text-[11px] text-[var(--text-muted)] space-y-1 leading-relaxed">
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
            </section>
          </div>
        )}

        {/* 8. Reset All 4 Profiles & Clear Browser Cache */}
        {showPreferences && (
          <section className="py-7 space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="space-y-0.5">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Reset all 4 profiles to factory defaults
                </h2>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Requires typing <span className="font-mono font-semibold">RESET</span> · keeps Wi-Fi &amp; TV pairing
                </p>
              </div>

              <button
                type="button"
                onClick={() => setResetProfilesModalOpen(true)}
                className="studio-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:border-[#D97706] text-xs font-medium text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[#D97706]" />
                <span>Reset all profiles</span>
              </button>
            </div>

            <div className="flex items-center justify-between gap-4 flex-wrap pt-4 border-t border-[var(--border-subtle)]">
              <div className="space-y-0.5">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Clear Browser Local Cache
                </h2>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Removes offline drafts, local macros, and snapshots in this browser
                </p>
              </div>

              {!confirmClearLocal ? (
                <button
                  type="button"
                  onClick={() => setConfirmClearLocal(true)}
                  className="studio-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:border-[#D97706] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0"
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
                    className="px-3 py-1.5 rounded-lg bg-[#D97706] text-[#14161B] text-xs font-semibold hover:opacity-90 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Confirm Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearLocal(false)}
                    className="studio-btn px-3 py-1.5 rounded-lg text-xs text-[var(--text-muted)] cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* About BertoPad Studio */}
        <section className="py-7 flex items-center justify-between gap-4 flex-wrap">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              About BertoPad Studio ({STUDIO_VERSION})
            </h2>
            <p className="font-mono text-[11px] text-[var(--text-muted)]">
              Version · open-source licenses · changelog
            </p>
          </div>
          {onOpenAbout && (
            <button
              type="button"
              onClick={onOpenAbout}
              className="studio-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>View About &amp; Licenses</span>
            </button>
          )}
        </section>
        </div>
      </div>

      {/* Forget TV Modal (requires typing FORGET) */}
      <DiffConfirmModal
        isOpen={forgetTvModalOpen}
        title="Forget SmartCast TV?"
        description="This clears the saved TV IP, port, and pairing token on your BertoPad."
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
        description={`All ${visibleSlotCount * 4} controls across Host 1, Host 2, Host 3, and TV will be restored to universal factory actions. Wi-Fi and TV pairing remain untouched.`}
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
