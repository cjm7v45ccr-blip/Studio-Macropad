import React, { useState, useEffect } from 'react';
import { X, Usb, PlayCircle, AlertCircle, LoaderCircle, Cpu, RotateCw, Bluetooth, Tv } from 'lucide-react';
import { usbHardware } from '../services/usbHardwareService';

interface ConnectOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onConnectSuccess: () => void;
  onStartDemo: () => void;
  resolvedTheme?: 'light' | 'dark';
}

export const ConnectOverlay: React.FC<ConnectOverlayProps> = ({
  isOpen,
  onClose,
  onConnectSuccess,
  onStartDemo,
  resolvedTheme = 'dark'
}) => {
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, busy, onClose]);

  if (!isOpen) return null;

  const handleConnect = async () => {
    if (!usbHardware.browserSupportsWebSerial) {
      setErrorMsg('Web Serial is not supported in this browser — please use Chrome or Edge on desktop over HTTPS, or try Demo Mode.');
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      const status = await usbHardware.connectWebSerial();
      setBusy(false);
      if (!status) {
        return;
      }
      onConnectSuccess();
      onClose();
    } catch (err: any) {
      setBusy(false);
      setErrorMsg(err?.message || 'Could not open USB port — please ensure no other serial monitor is holding the port.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-black/60 dark:bg-[#14161B]/90 backdrop-blur-2xl text-[var(--text-primary)] select-none animate-panel-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="connect-overlay-title"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      {/* Top Right Close Button */}
      <button
        type="button"
        onClick={onClose}
        disabled={busy}
        aria-label="Close overlay"
        className="absolute top-6 right-6 p-2.5 rounded-xl bg-[var(--bg-panel)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer disabled:opacity-40"
      >
        <X size={20} />
      </button>

      {/* Center Content Card */}
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md flex flex-col items-center text-center px-6 py-7 rounded-3xl bg-[var(--bg-panel)] border border-[var(--border-strong)] shadow-2xl"
      >
        <div className="w-16 h-16 rounded-2xl bg-[var(--accent-soft)] border border-[var(--border-strong)] flex items-center justify-center mb-5 shadow-inner">
          <img
            src={resolvedTheme === 'light' ? '/logo-mark-light.svg' : '/logo-mark-dark.svg'}
            alt="BertoPad"
            className="w-10 h-10 object-contain"
          />
        </div>

        <div className="flex items-center gap-2 mb-1.5">
          <h1 id="connect-overlay-title" className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Connect BertoPad
          </h1>
          <span className="px-2 py-0.5 rounded-md bg-[var(--bg-input)] border border-[var(--border-subtle)] font-mono text-[10px] font-semibold text-[var(--text-secondary)] tabular-nums">
            115,200 BD
          </span>
        </div>
        <p className="text-xs text-[var(--text-secondary)] mb-5 leading-relaxed max-w-sm">
          Plug in your ESP32 BertoPad via USB-C data cable for live NVS sync &amp; hardware telemetry, or launch the interactive hardware simulator.
        </p>

        {/* Hardware Architecture Spec Strip */}
        <div className="w-full grid grid-cols-2 gap-2 mb-5 text-left text-[11px]">
          <div className="p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex items-center gap-2.5">
            <Cpu size={15} className="text-[var(--accent)] shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold text-[var(--text-primary)] truncate">8 Keys + Mode</div>
              <div className="text-[10px] text-[var(--text-muted)] truncate tabular-nums">Tap &amp; 450 ms Hold</div>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex items-center gap-2.5">
            <RotateCw size={15} className="text-[var(--accent)] shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold text-[var(--text-primary)] truncate">Dual Knurled Dials</div>
              <div className="text-[10px] text-[var(--text-muted)] truncate tabular-nums">2×–3× Velocity Step</div>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex items-center gap-2.5">
            <Bluetooth size={15} className="text-[var(--accent)] shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold text-[var(--text-primary)] truncate">3× BLE Hosts</div>
              <div className="text-[10px] text-[var(--text-muted)] truncate tabular-nums">Isolated Bond Slots</div>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex items-center gap-2.5">
            <Tv size={15} className="text-[var(--accent)] shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold text-[var(--text-primary)] truncate">SmartCast + OLED</div>
              <div className="text-[10px] text-[var(--text-muted)] truncate tabular-nums">128×64 SSD1306 HUD</div>
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="w-full mb-5 p-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--accent)] flex items-start gap-2.5 text-xs text-[var(--text-primary)] text-left">
            <AlertCircle size={16} className="text-[var(--accent)] shrink-0 mt-0.5" />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}

        <div className="w-full space-y-2.5">
          <button
            type="button"
            onClick={handleConnect}
            disabled={busy}
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }}
            className="w-full flex items-center justify-center gap-2 py-3.5 px-5 rounded-2xl text-sm font-semibold hover:opacity-90 transition-all cursor-pointer shadow-lg disabled:opacity-50 whitespace-nowrap"
          >
            {busy ? <LoaderCircle size={18} className="animate-spin" /> : <Usb size={18} />}
            <span>{busy ? 'Connecting to BertoPad…' : 'Connect via USB'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onStartDemo();
              onClose();
            }}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-2xl text-sm font-medium bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)] transition-all cursor-pointer border border-[var(--border-subtle)] hover:border-[var(--border-strong)] disabled:opacity-50 whitespace-nowrap"
          >
            <PlayCircle size={18} className="text-[var(--accent)]" />
            <span>Start Demo Mode</span>
          </button>
        </div>

        <p className="text-[11px] text-[var(--text-muted)] mt-4 leading-relaxed">
          Close Arduino IDE Serial Monitor or PlatformIO before connecting so the USB COM port is free.
        </p>
      </div>
    </div>
  );
};

