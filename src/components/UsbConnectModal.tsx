import React, { useState } from 'react';
import { DeviceConnectionInfo } from '../types/studio';
import { usbHardware } from '../services/usbHardwareService';
import { Usb, X, Check, AlertCircle, Cpu, Terminal } from 'lucide-react';

interface UsbConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  connection: DeviceConnectionInfo;
  onToast: (msg: string) => void;
}

export const UsbConnectModal: React.FC<UsbConnectModalProps> = ({
  isOpen,
  onClose,
  connection,
  onToast
}) => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const handleConnectHid = async () => {
    setErrorMsg(null);
    setBusy(true);
    try {
      const ok = await usbHardware.connectWebHid();
      if (ok) {
        onToast('Connected via WebHID over USB cable');
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not open WebHID device.');
    } finally {
      setBusy(false);
    }
  };

  const handleConnectSerial = async () => {
    setErrorMsg(null);
    setBusy(true);
    try {
      const ok = await usbHardware.connectWebSerial();
      if (ok) {
        onToast('Connected via WebSerial over USB cable');
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not open WebSerial port.');
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    await usbHardware.disconnect();
    onToast('USB cable disconnected');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-strong)] shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2.5">
            <Usb className="w-4 h-4 text-[var(--accent)]" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              USB Cable Hardware Connection
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          Plug in your macropad with a USB cable to stream live key press feedback, preview RGB lighting, and flash profiles directly from Chrome or Edge.
        </p>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="space-y-2.5">
          {/* WebHID Option */}
          <button
            type="button"
            disabled={busy}
            onClick={handleConnectHid}
            className={`w-full p-3.5 rounded-xl bg-[var(--bg-input)] border text-left flex items-center justify-between gap-3 transition-colors cursor-pointer ${
              connection.transport === 'webhid'
                ? 'border-emerald-500/50'
                : 'border-[var(--border-subtle)] hover:border-[var(--accent)]'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--accent)] shrink-0">
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-[var(--text-primary)]">
                  Connect USB Cable (WebHID)
                </div>
                <div className="text-[11px] font-mono text-[var(--text-muted)]">
                  QMK / VIA / Custom Raw HID Protocol
                </div>
              </div>
            </div>
            {connection.transport === 'webhid' && (
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
          </button>

          {/* WebSerial Option */}
          <button
            type="button"
            disabled={busy}
            onClick={handleConnectSerial}
            className={`w-full p-3.5 rounded-xl bg-[var(--bg-input)] border text-left flex items-center justify-between gap-3 transition-colors cursor-pointer ${
              connection.transport === 'webserial'
                ? 'border-emerald-500/50'
                : 'border-[var(--border-subtle)] hover:border-[var(--accent)]'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--accent)] shrink-0">
                <Terminal className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-[var(--text-primary)]">
                  Connect USB Cable (WebSerial)
                </div>
                <div className="text-[11px] font-mono text-[var(--text-muted)] tabular-nums">
                  115,200 baud · ESP32 / RP2040 Serial JSON
                </div>
              </div>
            </div>
            {connection.transport === 'webserial' && (
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
          </button>
        </div>

        {!usbHardware.browserSupportsWebHid && !usbHardware.browserSupportsWebSerial && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 leading-relaxed">
            Your current browser does not expose WebHID or WebSerial. You can still design, test, and export profiles here, then open Chrome or Edge to flash over a USB cable.
          </div>
        )}

        {connection.connected && (
          <div className="pt-2 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={handleDisconnect}
              className="w-full py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 hover:border-rose-400 text-xs font-semibold text-rose-300 cursor-pointer"
            >
              Disconnect USB Cable
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
