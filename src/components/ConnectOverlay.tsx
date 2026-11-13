import React, { useState, useEffect } from 'react';
import { X, Usb, PlayCircle, AlertCircle, LoaderCircle } from 'lucide-react';
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
      await usbHardware.connectWebSerial();
      setBusy(false);
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
        className="w-full max-w-md flex flex-col items-center text-center px-6 py-8 rounded-3xl bg-[var(--bg-panel)] border border-[var(--border-strong)] shadow-2xl"
      >
        <div className="w-16 h-16 rounded-2xl bg-[var(--accent-soft)] border border-[var(--border-strong)] flex items-center justify-center mb-6 shadow-inner">
          <img
            src={resolvedTheme === 'light' ? '/logo-mark-light.svg' : '/logo-mark-dark.svg'}
            alt="BertoPad"
            className="w-10 h-10 object-contain"
          />
        </div>

        <h1 id="connect-overlay-title" className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mb-2">
          Connect BertoPad
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mb-8 leading-relaxed">
          Plug in your ESP32 BertoPad via USB and connect instantly using Web Serial, or explore the studio simulator in Demo Mode.
        </p>

        {errorMsg && (
          <div className="w-full mb-6 p-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--accent)] flex items-start gap-2.5 text-xs text-[var(--text-primary)] text-left">
            <AlertCircle size={16} className="text-[var(--accent)] shrink-0 mt-0.5" />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}

        <div className="w-full space-y-3">
          <button
            type="button"
            onClick={handleConnect}
            disabled={busy}
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }}
            className="w-full flex items-center justify-center gap-2 py-3.5 px-5 rounded-2xl text-sm font-semibold hover:opacity-90 transition-all cursor-pointer shadow-lg disabled:opacity-50"
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
            className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-2xl text-sm font-medium bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)] transition-all cursor-pointer border border-[var(--border-subtle)] hover:border-[var(--border-strong)] disabled:opacity-50"
          >
            <PlayCircle size={18} className="text-[var(--accent)]" />
            <span>Start Demo Mode</span>
          </button>
        </div>
      </div>
    </div>
  );
};
