import React, { useState, useEffect } from 'react';
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
  Info,
  PlayCircle
} from 'lucide-react';

interface UsbConnectModalProps {
  isOpen: boolean;
  initialError?: string | null;
  onClose: () => void;
  connection: DeviceConnectionInfo;
  onPullFromUsb: () => Promise<boolean>;
}

export const UsbConnectModal: React.FC<UsbConnectModalProps> = ({
  isOpen,
  initialError,
  onClose,
  connection,
  onPullFromUsb
}) => {
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(initialError || null);

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(initialError || null);
    }
  }, [isOpen, initialError]);

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
      setErrorMsg(
        err?.message ||
          'Could not open USB port — close the Serial Monitor or any other serial tool and try again.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleStartDemo = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await usbHardware.connectDemoMode();
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not start demo mode.');
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
  const isDemo = connection.transport === 'demo';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="usb-connect-modal-title"
    >
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
              <h3
                id="usb-connect-modal-title"
                className="text-sm font-bold text-[var(--text-primary)]"
              >
                Connect Studio MacroPad
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                115,200 baud · Firmware 2.1.0 (API v2)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {!usbHardware.browserSupportsWebSerial && (
            <div className="p-3.5 rounded-xl bg-amber-500/12 border border-amber-500/35 flex items-start gap-2.5 text-xs text-amber-200 leading-relaxed">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-amber-300">
                  Unsupported browser for USB Web Serial
                </div>
                <p className="mt-0.5 text-[11px] text-amber-200/90">
                  Firefox and Safari do not support Web Serial. Open this site in{' '}
                  <strong>Chrome</strong> or <strong>Edge</strong> on desktop over HTTPS to
                  connect a physical pad, or click <strong>Try demo mode</strong> below.
                </p>
              </div>
            </div>
          )}

          {connection.connected ? (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-emerald-300">
                    {connection.deviceName} Connected
                  </div>
                  <div className="text-[11px] font-mono text-emerald-400/80 mt-0.5 tabular-nums">
                    ID: {connection.deviceId || 'studio-pad'} · rev {connection.rev ?? 0} · fw{' '}
                    {connection.firmwareVersion} · API v{telemetry?.apiVersion ?? 2}
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
                    <span>{telemetry.bleConnected ? 'BLE Ready' : 'BLE Down'}</span>
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

              {isDemo && telemetry && (
                <div className="pt-2 border-t border-emerald-500/20 space-y-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300/80">
                    Demo Link Simulator (test link-down states)
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        usbHardware.setDemoLinkState({
                          bleConnected: !telemetry.bleConnected
                        })
                      }
                      className="px-2 py-1 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[10px] font-mono text-[var(--text-primary)] cursor-pointer"
                    >
                      BLE: {telemetry.bleConnected ? 'Connected' : 'Down'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        usbHardware.setDemoLinkState({
                          wifiConnected: !telemetry.wifiConnected
                        })
                      }
                      className="px-2 py-1 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[10px] font-mono text-[var(--text-primary)] cursor-pointer"
                    >
                      Wi-Fi: {telemetry.wifiConnected ? 'Connected' : 'Down'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        usbHardware.setDemoLinkState({
                          tvPaired: !telemetry.tvPaired
                        })
                      }
                      className="px-2 py-1 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[10px] font-mono text-[var(--text-primary)] cursor-pointer"
                    >
                      TV: {telemetry.tvPaired ? 'Paired' : 'Unpaired'}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleManualSync}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-xs font-semibold text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
                  <span>Read Status</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleDisconnect}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-rose-500/40 text-xs font-medium text-rose-400 transition-colors cursor-pointer whitespace-nowrap"
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
                  Opening USB port & syncing profiles…
                </div>
                <p className="text-[11px] text-sky-200/80 leading-relaxed">
                  Waiting for board readiness, enabling live events, and reading real profiles…
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-2 text-xs text-[var(--text-secondary)] leading-relaxed">
              <p>
                Plug in your Studio MacroPad over USB. Make sure the Arduino{' '}
                <strong>Serial Monitor</strong> and any other serial tools are closed so the
                port is free.
              </p>
              <div className="flex items-start gap-2 pt-1 text-[11px] text-[var(--text-muted)]">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-sky-400" />
                <span>
                  After your first connection, refreshing the page reconnects automatically
                  without showing the port picker again.
                </span>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/12 border border-rose-500/35 flex items-start gap-2.5 text-xs text-rose-200 leading-relaxed">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="space-y-2">
            <button
              type="button"
              disabled={isConnecting || !usbHardware.browserSupportsWebSerial}
              onClick={handleConnectSerial}
              style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-40 hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap"
            >
              {isConnecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Usb className="w-4 h-4" />
              )}
              <span>
                {isConnecting
                  ? 'Connecting…'
                  : connection.connected && !isDemo
                  ? 'Switch USB Port'
                  : 'Connect USB pad'}
              </span>
            </button>

            {(!connection.connected || !isDemo) && (
              <button
                type="button"
                disabled={isConnecting}
                onClick={handleStartDemo}
                className="w-full py-2.5 px-4 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
              >
                <PlayCircle className="w-4 h-4 text-emerald-400" />
                <span>Try demo mode</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
