import React, { useState, useEffect } from 'react';
import {
  DeviceConnectionInfo,
  KeyboardLayoutId,
  StudioSettings
} from '../types/studio';
import { usbHardware } from '../services/usbHardwareService';
import {
  Sun,
  Moon,
  Volume2,
  VolumeX,
  RotateCcw,
  Check,
  Wifi,
  Tv,
  Shield,
  Cpu,
  Zap,
  AlertTriangle
} from 'lucide-react';

interface SettingsViewProps {
  settings: StudioSettings;
  connection: DeviceConnectionInfo;
  onUpdateSettings: (patch: Partial<StudioSettings>) => void;
  onClearLocalCache: () => void;
  onToast: (msg: string) => void;
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
  settings,
  connection,
  onUpdateSettings,
  onClearLocalCache,
  onToast
}) => {
  // Wi-Fi Provisioning State
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPass, setWifiPass] = useState('');
  const [wifiBusy, setWifiBusy] = useState(false);

  // SmartCast TV State
  const [tvIp, setTvIp] = useState('');
  const [tvPort, setTvPort] = useState('7345');
  const [tvToken, setTvToken] = useState('');
  const [tvPin, setTvPin] = useState('');
  const [pairingActive, setPairingActive] = useState(false);
  const [tvBusy, setTvBusy] = useState(false);
  const [confirmForgetTv, setConfirmForgetTv] = useState(false);

  // HTTP API Security State
  const [httpToken, setHttpToken] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  // Reset Confirmations
  const [confirmResetNvs, setConfirmResetNvs] = useState(false);
  const [confirmClearLocal, setConfirmClearLocal] = useState(false);

  const telemetry = connection.telemetry;

  useEffect(() => {
    if (telemetry?.ssid && !wifiSsid) {
      setWifiSsid(telemetry.ssid);
    }
    if (telemetry?.tvHost && !tvIp) {
      setTvIp(telemetry.tvHost);
    }
    if (telemetry?.tvPort) {
      setTvPort(String(telemetry.tvPort));
    }
  }, [telemetry?.ssid, telemetry?.tvHost, telemetry?.tvPort]);

  const handleSaveWifi = async () => {
    if (!wifiSsid.trim()) return;
    setWifiBusy(true);
    try {
      const res = await usbHardware.saveWifi(wifiSsid, wifiPass);
      onToast(res.message || 'Wi-Fi saved! MacroPad is connecting…');
      setWifiPass('');
    } catch (err: any) {
      onToast(err?.message || 'Could not save Wi-Fi credentials');
    } finally {
      setWifiBusy(false);
    }
  };

  const handleStartTvPairing = async () => {
    if (!tvIp.trim()) {
      onToast('Enter your SmartCast TV IP address first');
      return;
    }
    setTvBusy(true);
    try {
      const res = await usbHardware.startTvPairing(tvIp, Number(tvPort) || 7345);
      setPairingActive(true);
      onToast(res.message || 'Check your TV screen for the 4-digit PIN!');
    } catch (err: any) {
      onToast(err?.message || 'Failed to start TV pairing');
    } finally {
      setTvBusy(false);
    }
  };

  const handleSubmitTvPin = async () => {
    if (!tvPin.trim()) return;
    setTvBusy(true);
    try {
      const res = await usbHardware.submitTvPin(tvPin);
      setPairingActive(false);
      setTvPin('');
      onToast(res.message || 'TV paired and token saved to MacroPad NVS!');
    } catch (err: any) {
      onToast(err?.message || 'Invalid PIN or TV rejected pairing');
    } finally {
      setTvBusy(false);
    }
  };

  const handleSaveTvManualToken = async () => {
    if (!tvIp.trim()) {
      onToast('Enter TV IP address');
      return;
    }
    setTvBusy(true);
    try {
      const res = await usbHardware.saveTvConfig(tvIp, Number(tvPort) || 7345, tvToken);
      onToast(res.message || 'Saved TV host & token to MacroPad');
      setTvToken('');
    } catch (err: any) {
      onToast(err?.message || 'Failed to save TV configuration');
    } finally {
      setTvBusy(false);
    }
  };

  const handleTestTv = async () => {
    setTvBusy(true);
    try {
      const res = await usbHardware.testTv();
      onToast(res.message || (res.ok ? 'TV reachable!' : 'TV unreachable'));
    } catch (err: any) {
      onToast(err?.message || 'TV test failed');
    } finally {
      setTvBusy(false);
    }
  };

  const handleForgetTv = async () => {
    setTvBusy(true);
    try {
      const res = await usbHardware.forgetTv();
      setConfirmForgetTv(false);
      setTvIp('');
      onToast(res.message || 'Cleared TV pairing on MacroPad');
    } catch (err: any) {
      onToast(err?.message || 'Failed to forget TV');
    } finally {
      setTvBusy(false);
    }
  };

  const handleSaveHttpAuth = async () => {
    setAuthBusy(true);
    try {
      const res = await usbHardware.setHttpApiToken(httpToken);
      onToast(res.message || 'Updated HTTP API token on MacroPad');
      setHttpToken('');
    } catch (err: any) {
      onToast(err?.message || 'Token must be 8-64 chars, or empty to disable');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleResetHardwareNvs = async () => {
    try {
      const res = await usbHardware.resetHardwareDefaults();
      setConfirmResetNvs(false);
      onToast(res.message || 'MacroPad NVS profiles reset & re-synced');
    } catch (err: any) {
      onToast(err?.message || 'Failed to reset MacroPad NVS');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">
            Hardware & Studio Settings
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Configure USB synchronization, ESP32 Wi-Fi, SmartCast TV pairing, and studio preferences.
          </p>
        </div>

        {/* Live ESP32 Hardware Diagnostics & Instant Sync */}
        <div className="p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
              <Cpu className="w-4 h-4 text-[var(--accent)]" />
              <span>ESP32 Hardware Telemetry & Sync Behavior</span>
            </div>
            <span
              className={`font-mono text-[11px] px-2 py-0.5 rounded border ${
                connection.connected
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--text-muted)]'
              }`}
            >
              {connection.connected
                ? `USB Connected · ${connection.firmwareVersion}`
                : 'USB Disconnected'}
            </span>
          </div>

          {telemetry && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
                <div className="text-[10px] text-[var(--text-muted)]">Active Pad Mode</div>
                <div className="font-mono font-bold text-[var(--text-primary)] mt-0.5">
                  {telemetry.activeProfile}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
                <div className="text-[10px] text-[var(--text-muted)]">BLE Keyboard</div>
                <div className="font-mono font-bold text-[var(--text-primary)] mt-0.5">
                  {telemetry.bleConnected ? 'Connected' : 'Advertising'}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
                <div className="text-[10px] text-[var(--text-muted)]">Wi-Fi LAN</div>
                <div className="font-mono font-bold text-[var(--text-primary)] truncate mt-0.5">
                  {telemetry.wifiConnected ? telemetry.ip : 'Offline'}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
                <div className="text-[10px] text-[var(--text-muted)]">Free Heap</div>
                <div className="font-mono font-bold text-[var(--text-primary)] mt-0.5">
                  {Math.round(telemetry.freeHeap / 1024)} KB
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
            <div>
              <div className="text-xs font-semibold text-[var(--text-primary)]">
                Instant USB Auto-Sync on Edit
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                Immediately write `/api/customizer/save` over USB whenever you change any button or dial binding
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                onUpdateSettings({ autoSyncOnEdit: !settings.autoSyncOnEdit })
              }
              style={
                settings.autoSyncOnEdit
                  ? { backgroundColor: 'var(--accent)', color: '#FFFFFF' }
                  : undefined
              }
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                settings.autoSyncOnEdit
                  ? 'border-transparent'
                  : 'bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{settings.autoSyncOnEdit ? 'Auto-Sync ON' : 'Manual Sync'}</span>
            </button>
          </div>
        </div>

        {/* ESP32 Wi-Fi Provisioning over USB (`/api/wifi`) */}
        <div className="p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-3.5">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
            <Wifi className="w-4 h-4 text-emerald-400" />
            <span>MacroPad Wi-Fi Setup over USB (`/api/wifi`)</span>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Provision 2.4 GHz Wi-Fi credentials directly over USB so your MacroPad can control SmartCast TVs on your local network.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <input
              type="text"
              maxLength={32}
              value={wifiSsid}
              onChange={e => setWifiSsid(e.target.value)}
              placeholder="2.4 GHz Wi-Fi SSID"
              className="px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            />
            <input
              type="password"
              maxLength={63}
              value={wifiPass}
              onChange={e => setWifiPass(e.target.value)}
              placeholder="Wi-Fi Password"
              className="px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            />
            <button
              type="button"
              disabled={!connection.connected || wifiBusy || !wifiSsid.trim()}
              onClick={handleSaveWifi}
              style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
              className="py-2 px-4 rounded-xl text-xs font-semibold disabled:opacity-40 hover:opacity-90 cursor-pointer"
            >
              {wifiBusy ? 'Sending…' : 'Save Wi-Fi to Pad'}
            </button>
          </div>
        </div>

        {/* Vizio SmartCast TV Pairing over USB */}
        <div className="p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
              <Tv className="w-4 h-4 text-purple-400" />
              <span>SmartCast TV Pairing & Control over USB</span>
            </div>
            {telemetry && (
              <span className="font-mono text-[11px] text-[var(--text-muted)]">
                {telemetry.tvPaired
                  ? `Paired (${telemetry.tvHost}:${telemetry.tvPort})`
                  : telemetry.tvConfigured
                  ? `Host set (${telemetry.tvHost})`
                  : 'Not paired'}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <input
              type="text"
              value={tvIp}
              onChange={e => setTvIp(e.target.value)}
              placeholder="TV IP (e.g. 192.168.1.50)"
              className="sm:col-span-2 px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            />
            <input
              type="number"
              value={tvPort}
              onChange={e => setTvPort(e.target.value)}
              placeholder="Port (7345)"
              className="px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          {/* Interactive PIN Pairing */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!connection.connected || tvBusy || !tvIp.trim()}
              onClick={handleStartTvPairing}
              style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold disabled:opacity-40 hover:opacity-90 cursor-pointer"
            >
              Start TV PIN Pairing
            </button>

            <button
              type="button"
              disabled={!connection.connected || tvBusy}
              onClick={handleTestTv}
              className="px-3.5 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-40 cursor-pointer"
            >
              Test TV Connection
            </button>

            {!confirmForgetTv ? (
              <button
                type="button"
                disabled={!connection.connected || tvBusy}
                onClick={() => setConfirmForgetTv(true)}
                className="px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-rose-500/40 text-xs font-medium text-rose-400 disabled:opacity-40 cursor-pointer"
              >
                Forget TV
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleForgetTv}
                  className="px-3 py-2 rounded-xl bg-rose-500 text-white text-xs font-semibold cursor-pointer"
                >
                  Confirm Forget
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmForgetTv(false)}
                  className="px-2.5 py-2 rounded-xl bg-[var(--bg-input)] text-xs text-[var(--text-muted)] cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {pairingActive && (
            <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--accent)] flex items-center gap-2">
              <input
                type="text"
                maxLength={8}
                value={tvPin}
                onChange={e => setTvPin(e.target.value)}
                placeholder="Enter 4-digit PIN shown on TV…"
                className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)]"
              />
              <button
                type="button"
                disabled={tvBusy || !tvPin.trim()}
                onClick={handleSubmitTvPin}
                style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 cursor-pointer"
              >
                Submit PIN
              </button>
            </div>
          )}

          {/* Optional Direct Token Entry */}
          <div className="pt-2 border-t border-[var(--border-subtle)] flex gap-2">
            <input
              type="password"
              value={tvToken}
              onChange={e => setTvToken(e.target.value)}
              placeholder="Or paste existing SmartCast Auth Token…"
              className="flex-1 px-3 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)]"
            />
            <button
              type="button"
              disabled={!connection.connected || tvBusy || !tvIp.trim()}
              onClick={handleSaveTvManualToken}
              className="px-3.5 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-40 cursor-pointer"
            >
              Save Token
            </button>
          </div>
        </div>

        {/* Local HTTP API Security (`/api/auth/set`) */}
        <div className="p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
              <Shield className="w-4 h-4 text-sky-400" />
              <span>Local HTTP API Token (`/api/auth/set`)</span>
            </div>
            <span className="font-mono text-[10px] text-[var(--text-muted)]">
              {telemetry?.httpApiEnabled ? 'HTTP API Enabled' : 'HTTP API Disabled'}
            </span>
          </div>
          <div className="flex gap-2">
            <input
              type="password"
              maxLength={64}
              value={httpToken}
              onChange={e => setHttpToken(e.target.value)}
              placeholder="8–64 char token (or leave blank to disable wireless HTTP API)"
              className="flex-1 px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)]"
            />
            <button
              type="button"
              disabled={!connection.connected || authBusy}
              onClick={handleSaveHttpAuth}
              className="px-4 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-40 cursor-pointer"
            >
              Apply
            </button>
          </div>
        </div>

        {/* Studio Appearance, Audio & Keyboard Layout */}
        <div className="p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Theme & Accent
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Customize your Studio workspace look and feel
              </p>
            </div>
            <div className="flex items-center p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => onUpdateSettings({ theme: 'dark' })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                  settings.theme === 'dark'
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-muted)]'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                <span>Dark</span>
              </button>
              <button
                type="button"
                onClick={() => onUpdateSettings({ theme: 'light' })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                  settings.theme === 'light'
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-muted)]'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>Light</span>
              </button>
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
                  <span className="flex items-center gap-2">
                    <span
                      className="w-3.5 h-3.5 rounded-full"
                      style={{ backgroundColor: item.hex }}
                    />
                    <span>{item.label}</span>
                  </span>
                  {active && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[var(--border-subtle)]">
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                Shortcut Recorder Keyboard Layout
              </label>
              <select
                value={settings.keyboardLayout}
                onChange={e =>
                  onUpdateSettings({
                    keyboardLayout: e.target.value as KeyboardLayoutId
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
              >
                {KEYBOARD_LAYOUTS.map(layout => (
                  <option key={layout.id} value={layout.id}>
                    {layout.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                Tactile Switch Audio
              </label>
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({ soundEnabled: !settings.soundEnabled })
                }
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  {settings.soundEnabled ? (
                    <Volume2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-[var(--text-muted)]" />
                  )}
                  <span>Mechanical Key & Dial Sound</span>
                </span>
                <span className="font-mono text-[11px] text-[var(--text-muted)]">
                  {settings.soundEnabled ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Hardware & Local Reset Controls */}
        <div className="p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Reset Hardware NVS Profiles (`/api/device/reset-settings`)
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Restores factory bindings on the physical ESP32 MacroPad while keeping Wi-Fi & TV pairing intact.
              </p>
            </div>

            {!confirmResetNvs ? (
              <button
                type="button"
                disabled={!connection.connected}
                onClick={() => setConfirmResetNvs(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-xs font-semibold text-rose-400 disabled:opacity-40 cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Reset Pad Profiles</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetHardwareNvs}
                  className="px-3.5 py-2 rounded-xl bg-rose-500 text-white text-xs font-semibold cursor-pointer"
                >
                  Confirm Hardware Reset
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmResetNvs(false)}
                  className="px-3 py-2 rounded-xl bg-[var(--bg-input)] text-xs text-[var(--text-muted)] cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 flex-wrap pt-3 border-t border-[var(--border-subtle)]">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Clear Browser Local Cache
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Clears local snapshots, custom icon overrides, and UI preferences in this browser.
              </p>
            </div>

            {!confirmClearLocal ? (
              <button
                type="button"
                onClick={() => setConfirmClearLocal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-rose-500/40 text-xs font-semibold text-[var(--text-secondary)] hover:text-rose-400 cursor-pointer"
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
                  className="px-3.5 py-2 rounded-xl bg-rose-500 text-white text-xs font-semibold cursor-pointer"
                >
                  Confirm Clear
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearLocal(false)}
                  className="px-3 py-2 rounded-xl bg-[var(--bg-input)] text-xs text-[var(--text-muted)] cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
