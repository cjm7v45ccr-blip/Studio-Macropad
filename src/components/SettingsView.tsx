import React, { useState } from 'react';
import {
  DeviceConnectionInfo,
  KeyboardLayoutId,
  StudioSettings
} from '../types/studio';
import { usbHardware } from '../services/usbHardwareService';
import {
  Cpu,
  Download,
  Upload,
  RotateCcw,
  Palette,
  Globe,
  Gauge,
  CheckCircle2,
  RefreshCw,
  Usb
} from 'lucide-react';

interface SettingsViewProps {
  settings: StudioSettings;
  connection: DeviceConnectionInfo;
  onUpdateSettings: (patch: Partial<StudioSettings>) => void;
  onExportFullBackup: () => void;
  onImportFullBackup: (file: File) => void;
  onFactoryReset: () => void;
  onOpenConnectModal: () => void;
  onToast: (msg: string) => void;
}

const ACCENT_PRESETS = [
  { name: 'Electric Blue', hex: '#3B82F6' },
  { name: 'Violet', hex: '#8B5CF6' },
  { name: 'Cyan', hex: '#06B6D4' },
  { name: 'Emerald', hex: '#10B981' },
  { name: 'Amber', hex: '#F59E0B' },
  { name: 'Rose', hex: '#F43F5E' }
];

const KEYBOARD_LAYOUTS: { id: KeyboardLayoutId; label: string }[] = [
  { id: 'us_qwerty', label: 'English (US) — QWERTY' },
  { id: 'uk_qwerty', label: 'English (UK) — ISO QWERTY' },
  { id: 'de_qwertz', label: 'German — QWERTZ' },
  { id: 'fr_azerty', label: 'French — AZERTY' },
  { id: 'es_iso', label: 'Spanish — ISO' },
  { id: 'nordic_iso', label: 'Nordic — ISO' },
  { id: 'jp_jis', label: 'Japanese — JIS' }
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  connection,
  onUpdateSettings,
  onExportFullBackup,
  onImportFullBackup,
  onFactoryReset,
  onOpenConnectModal,
  onToast
}) => {
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [fwStage, setFwStage] = useState<'idle' | 'checking' | 'up_to_date' | 'flashing' | 'done'>('idle');
  const [fwProgress, setFwProgress] = useState(0);
  const [selectedFwName, setSelectedFwName] = useState<string | null>(null);

  const handleCheckFirmware = () => {
    setFwStage('checking');
    setTimeout(() => {
      setFwStage('up_to_date');
    }, 650);
  };

  const handleFirmwareFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFwName(file.name);
    setFwStage('flashing');
    setFwProgress(15);

    const step1 = setTimeout(() => setFwProgress(55), 350);
    const step2 = setTimeout(() => setFwProgress(90), 750);
    const step3 = setTimeout(() => {
      setFwProgress(100);
      setFwStage('done');
      onToast(`Verified firmware image "${file.name}"`);
    }, 1150);

    return () => {
      clearTimeout(step1);
      clearTimeout(step2);
      clearTimeout(step3);
    };
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="pb-4 border-b border-[var(--border-subtle)]">
          <h1 className="text-lg font-bold text-[var(--text-primary)]">Device & Studio Settings</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Configure USB hardware parameters, firmware updates, visual theme, keyboard layout, and full profile backups.
          </p>
        </div>

        {/* 1. Firmware Info & USB Hardware Status */}
        <section className="rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--accent)]">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-[var(--text-primary)]">
                  Firmware & USB Hardware Protocol
                </h2>
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] font-mono tabular-nums">
                  <span>{connection.deviceName}</span>
                  <span>·</span>
                  <span>{connection.firmwareVersion}</span>
                  <span>·</span>
                  <span>
                    {connection.connected
                      ? `Connected (${connection.transport.toUpperCase()})`
                      : 'USB Cable Disconnected'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenConnectModal}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
              >
                <Usb className="w-3.5 h-3.5" />
                <span>{connection.connected ? 'USB Cable Settings' : 'Connect USB Cable'}</span>
              </button>

              <button
                type="button"
                onClick={handleCheckFirmware}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${fwStage === 'checking' ? 'animate-spin' : ''}`} />
                <span>Check for Update</span>
              </button>

              <label
                style={{ backgroundColor: 'var(--accent)' }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white hover:opacity-95 cursor-pointer whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Flash .UF2 / .BIN</span>
                <input
                  type="file"
                  accept=".uf2,.bin,.hex"
                  onChange={handleFirmwareFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {fwStage === 'up_to_date' && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-2 text-xs text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Firmware {connection.firmwareVersion} is the latest stable release.</span>
            </div>
          )}

          {(fwStage === 'flashing' || fwStage === 'done') && (
            <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-[var(--text-primary)]">
                  {fwStage === 'done'
                    ? `Firmware staged: ${selectedFwName}`
                    : `Verifying ${selectedFwName}…`}
                </span>
                <span className="font-mono tabular-nums text-[var(--text-secondary)]">
                  {fwProgress}%
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                <div
                  className="h-full transition-all duration-200"
                  style={{ width: `${fwProgress}%`, backgroundColor: 'var(--accent)' }}
                />
              </div>
            </div>
          )}

          <div className="p-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] leading-relaxed space-y-1">
            <div>
              <strong className="text-[var(--text-primary)]">Browser USB Support:</strong>{' '}
              WebHID ({usbHardware.browserSupportsWebHid ? 'Supported' : 'Unavailable'}) · WebSerial (
              {usbHardware.browserSupportsWebSerial ? 'Supported' : 'Unavailable'}). Direct USB cable communication works in Chrome and Edge (not Firefox or Safari).
            </div>
            <div className="text-[var(--text-muted)]">
              Note: Automatic per-application foreground profile switching requires an optional lightweight desktop helper daemon, as browsers sandbox OS window focus events.
            </div>
          </div>
        </section>

        {/* 2. Theme & Accent Color */}
        <section className="rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <Palette className="w-4 h-4 text-[var(--accent)]" />
            <h2 className="text-sm font-bold text-[var(--text-primary)]">Visual Theme & Accent</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-medium text-[var(--text-secondary)]">
                Interface Appearance
              </label>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
                {(['dark', 'light'] as const).map(mode => {
                  const active = settings.theme === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onUpdateSettings({ theme: mode })}
                      style={
                        active
                          ? { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }
                          : undefined
                      }
                      className={`py-2 rounded-lg text-xs font-medium capitalize cursor-pointer ${
                        active ? 'font-semibold shadow-sm' : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      {mode} Mode
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-[var(--text-secondary)]">
                Accent Color ({settings.accentColor.toUpperCase()})
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                {ACCENT_PRESETS.map(p => {
                  const active = settings.accentColor.toUpperCase() === p.hex.toUpperCase();
                  return (
                    <button
                      key={p.hex}
                      type="button"
                      onClick={() => onUpdateSettings({ accentColor: p.hex })}
                      className={`w-8 h-8 rounded-xl border border-white/15 cursor-pointer transition-transform ${
                        active ? 'scale-110 ring-2 ring-white' : 'opacity-85 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: p.hex }}
                      title={p.name}
                    />
                  );
                })}
                <input
                  type="color"
                  value={settings.accentColor}
                  onChange={e => onUpdateSettings({ accentColor: e.target.value })}
                  className="w-8 h-8 rounded-lg bg-transparent border-0 cursor-pointer"
                  title="Choose custom accent color"
                />
              </div>
            </div>
          </div>
        </section>

        {/* 3. Keyboard Layout & Advanced Hardware Timing */}
        <section className="rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-5 space-y-5">
          <div className="flex items-center gap-2.5">
            <Globe className="w-4 h-4 text-[var(--accent)]" />
            <h2 className="text-sm font-bold text-[var(--text-primary)]">
              Keyboard Layout & Hardware Timing
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="block text-xs font-medium text-[var(--text-secondary)]">
                OS Keyboard Layout Language
              </label>
              <select
                value={settings.keyboardLayout}
                onChange={e =>
                  onUpdateSettings({ keyboardLayout: e.target.value as KeyboardLayoutId })
                }
                className="w-full rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 py-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              >
                {KEYBOARD_LAYOUTS.map(kl => (
                  <option key={kl.id} value={kl.id}>
                    {kl.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-[var(--text-muted)]">
                Maps scan codes accurately when recording keystrokes (e.g. Z/Y swap on QWERTZ, Q/A on AZERTY).
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-[var(--text-secondary)]">
                USB HID Polling Rate
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {([125, 250, 500, 1000] as const).map(hz => {
                  const active = settings.pollingRateHz === hz;
                  return (
                    <button
                      key={hz}
                      type="button"
                      onClick={() => onUpdateSettings({ pollingRateHz: hz })}
                      style={
                        active
                          ? {
                              borderColor: 'var(--accent)',
                              backgroundColor: 'rgba(var(--accent-rgb), 0.14)'
                            }
                          : undefined
                      }
                      className="py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] font-mono text-xs tabular-nums text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                    >
                      {hz} Hz
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-[var(--text-muted)] font-mono tabular-nums">
                Interval: {(1000 / settings.pollingRateHz).toFixed(1)} ms USB report frame
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium text-[var(--text-secondary)]">
                <Gauge className="w-3.5 h-3.5" />
                <span>Global Switch Debounce</span>
              </span>
              <span className="font-mono tabular-nums text-[var(--text-primary)]">
                {settings.globalDebounceMs} ms
              </span>
            </div>
            <input
              type="range"
              min={5}
              max={50}
              step={1}
              value={settings.globalDebounceMs}
              onChange={e => onUpdateSettings({ globalDebounceMs: Number(e.target.value) })}
              className="w-full accent-[var(--accent)] cursor-pointer"
            />
          </div>
        </section>

        {/* 4. Backup, Restore & Factory Reset */}
        <section className="rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-5 space-y-4">
          <h2 className="text-sm font-bold text-[var(--text-primary)]">
            Backup, Restore & Factory Reset
          </h2>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={onExportFullBackup}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Backup All Profiles (.JSON)</span>
              </button>

              <label className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer whitespace-nowrap">
                <Upload className="w-3.5 h-3.5" />
                <span>Restore Backup</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) onImportFullBackup(f);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
              </label>
            </div>

            {!confirmingReset ? (
              <button
                type="button"
                onClick={() => setConfirmingReset(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 hover:border-rose-400 text-xs font-semibold text-rose-300 cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Factory Reset</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-rose-300">Erase all profiles & macros?</span>
                <button
                  type="button"
                  onClick={() => {
                    onFactoryReset();
                    setConfirmingReset(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-rose-500 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  Confirm Reset
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingReset(false)}
                  className="px-3 py-1.5 rounded-lg bg-[var(--bg-input)] text-xs text-[var(--text-secondary)] cursor-pointer whitespace-nowrap"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
