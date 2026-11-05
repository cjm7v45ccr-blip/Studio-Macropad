import React, { useState } from 'react';
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
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-[#14161B]/95 backdrop-blur-2xl text-white select-none animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="connect-overlay-title"
    >
      {/* Minimal Top Right Close Button */}
      <button
        type="button"
        onClick={onClose}
        disabled={busy}
        aria-label="Close overlay"
        className="absolute top-6 right-6 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition cursor-pointer disabled:opacity-40"
      >
        <X size={20} />
      </button>

      {/* Center Content Card */}
      <div className="w-full max-w-md flex flex-col items-center text-center px-6 py-8 rounded-3xl bg-[var(--bg-panel)] border border-[var(--border-strong)] shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center mb-6 shadow-inner">
          <img
            src={resolvedTheme === 'light' ? '/logo-mark-light.svg' : '/logo-mark-dark.svg'}
            alt="BertoPad"
            className="w-10 h-10 object-contain"
          />
        </div>

        <h1 id="connect-overlay-title" className="text-2xl font-bold tracking-tight text-white mb-2">
          To connect pad
        </h1>
        <p className="text-sm text-zinc-400 mb-8 leading-relaxed">
          Plug in your ESP32 BertoPad via USB and connect instantly using Web Serial, or explore the studio simulator in Demo Mode.
        </p>

        {errorMsg && (
          <div className="w-full mb-6 p-3.5 rounded-xl bg-red-500/15 border border-red-500/30 flex items-start gap-2.5 text-xs text-red-200 text-left">
            <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
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
            className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-2xl text-sm font-medium bg-white/5 hover:bg-white/10 text-zinc-200 transition-all cursor-pointer border border-white/5 disabled:opacity-50"
          >
            <PlayCircle size={18} className="text-amber-400" />
            <span>Start Demo Mode</span>
          </button>
        </div>
      </div>
    </div>
  );
};
