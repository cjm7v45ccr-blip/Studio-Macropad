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
  Tv,
  Loader2,
  Info
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
      const status = await usbHardware.connectWebSerial();
      if (status) {
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
      setErrorMsg(err?.message || 'Failed to read status from MacroPad.');
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
  const isConnecting = busy || Boolean(connection.connecting);

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
                MacroPad USB Link
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                115,200 baud · Live Events & Revision Sync
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
                    ID: {connection.deviceId || 'studio-pad'} · rev {connection.rev ?? 0} ·{' '}
                    {connection.firmwareVersion}
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
                  <span>Read Status</span>
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
          ) : isConnecting ? (
            <div className="p-4 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-start gap-3">
              <Loader2 className="w-5 h-5 text-sky-400 animate-spin shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="text-xs font-semibold text-sky-300">
                  Opening USB port & waiting for board boot…
                </div>
                <p className="text-[11px] text-sky-200/80 leading-relaxed">
                  Many ESP32 boards reset when the USB port opens (~2 seconds), so Bluetooth may briefly drop and reconnect. Enabling live events and reading status…
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-2 text-xs text-[var(--text-secondary)] leading-relaxed">
              <p>
                Connect your Studio MacroPad with a USB data cable. After your first approval, the site automatically reconnects via{' '}
                <span className="font-mono text-[11px]">navigator.serial.getPorts()</span>{' '}
                without showing the port picker.
              </p>
              <div className="flex items-start gap-2 pt-1 text-[11px] text-[var(--text-muted)]">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-sky-400" />
                <span>
                  Note: ESP32 boards normally reboot on USB connect, so Bluetooth briefly drops and reconnects for a few seconds.
                </span>
              </div>
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
            disabled={isConnecting || !usbHardware.browserSupportsWebSerial}
            onClick={handleConnectSerial}
            style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-40 hover:opacity-90 transition-opacity cursor-pointer"
          >
            {isConnecting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Usb className="w-4 h-4" />
            )}
            <span>
              {isConnecting
                ? 'Connecting (~2s)…'
                : connection.connected
                ? 'Switch USB Port'
                : 'Select MacroPad USB Port'}
            </span>
          </button>

          {!usbHardware.browserSupportsWebSerial && (
            <p className="text-[11px] text-amber-400 text-center">
              Chrome or Edge on HTTPS is required for Web Serial.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
