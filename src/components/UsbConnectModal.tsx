import React, { useState } from 'react';
import { DeviceConnectionInfo } from '../types/studio';
import { usbHardware } from '../services/usbHardwareService';
import {
  X,
  Usb,
  CheckCircle2,
  AlertCircle,
  Unplug,
  RefreshCw,
  Bluetooth,
  Wifi,
  Tv
} from 'lucide-react';

interface UsbConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  connection: DeviceConnectionInfo;
  onPullFromUsb: () => Promise<boolean>;
}

export const UsbConnectModal: React.FC<UsbConnectModalProps> = ({
  isOpen,
  onClose,
  connection,
  onPullFromUsb
}) => {
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConnectSerial = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const ok = await usbHardware.connectWebSerial();
      if (ok) {
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not open USB Serial port (115,200 baud).');
    } finally {
      setBusy(false);
    }
  };

  const handleManualSync = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await onPullFromUsb();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to sync from MacroPad.');
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    await usbHardware.disconnect(true);
    setBusy(false);
  };

  const telemetry = connection.telemetry;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-strong)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              <Usb className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                USB Hardware Link
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                ESP32 Web Serial · 115,200 baud JSON Sync
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {connection.connected ? (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-emerald-300">
                    {connection.deviceName} Connected
                  </div>
                  <div className="text-[11px] font-mono text-emerald-400/80 mt-0.5">
                    FW {connection.firmwareVersion}
                    {connection.vendorProduct ? ` · USB ${connection.vendorProduct}` : ''}
                    {connection.lastSyncedAt ? ` · Synced ${connection.lastSyncedAt}` : ''}
                  </div>
                </div>
              </div>

              {telemetry && (
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-emerald-500/20 font-mono text-[10px]">
                  <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                    <Bluetooth
                      className={`w-3.5 h-3.5 ${
                        telemetry.bleConnected ? 'text-sky-400' : 'text-zinc-500'
                      }`}
                    />
                    <span>{telemetry.bleConnected ? 'BLE Ready' : 'BLE Idle'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                    <Wifi
                      className={`w-3.5 h-3.5 ${
                        telemetry.wifiConnected ? 'text-emerald-400' : 'text-zinc-500'
                      }`}
                    />
                    <span className="truncate">
                      {telemetry.wifiConnected ? telemetry.ip || 'Wi-Fi' : 'No Wi-Fi'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                    <Tv
                      className={`w-3.5 h-3.5 ${
                        telemetry.tvPaired ? 'text-purple-400' : 'text-zinc-500'
                      }`}
                    />
                    <span>{telemetry.tvPaired ? 'TV Paired' : 'TV Unpaired'}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleManualSync}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-xs font-semibold text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
                  <span>Re-Sync Macros Now</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleDisconnect}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-rose-500/40 text-xs font-medium text-rose-400 transition-colors cursor-pointer"
                >
                  <Unplug className="w-3.5 h-3.5" />
                  <span>Disconnect</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] leading-relaxed">
              Plug your ESP32 Studio MacroPad into a USB port using a data cable. As soon as connected, all 14 `MAC` & `TV` bindings sync live into this app, and any edits sync right back to the pad.
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="button"
            disabled={busy || !usbHardware.browserSupportsWebSerial}
            onClick={handleConnectSerial}
            style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-40 hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Usb className="w-4 h-4" />
            <span>
              {connection.connected
                ? 'Switch USB Serial Port'
                : 'Select MacroPad USB Port & Sync'}
            </span>
          </button>

          {!usbHardware.browserSupportsWebSerial && (
            <p className="text-[11px] text-amber-400 text-center">
              Web Serial API requires Google Chrome, Microsoft Edge, or Brave on desktop.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
