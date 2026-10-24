import React, { useState } from 'react';
import { Usb, Wifi, Bluetooth, X, AlertCircle, Zap, Check } from 'lucide-react';
import { AutoScanChannel, ConnectionMode } from '../types/macropod';

interface ConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  isConnected: boolean;
  connectionMode: ConnectionMode;
  autoScanChannel: AutoScanChannel;
  onConnectSerial: () => Promise<boolean>;
  onConnectBluetooth: () => Promise<boolean>;
  onConnectWifi: (ip: string) => Promise<boolean>;
  onDisconnect: () => Promise<void>;
}

export const ConnectModal: React.FC<ConnectModalProps> = ({
  isOpen,
  onClose,
  isConnected,
  connectionMode,
  autoScanChannel,
  onConnectSerial,
  onConnectBluetooth,
  onConnectWifi,
  onDisconnect
}) => {
  const [wifiIp, setWifiIp] = useState('192.168.4.1');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  if (!isOpen) return null;

  const handleSerial = async () => {
    setErrorMsg(null);
    setIsBusy(true);
    try {
      const ok = await onConnectSerial();
      if (ok) onClose();
    } catch (e: any) {
      setErrorMsg(e.message || 'Could not connect via USB serial.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleBluetooth = async () => {
    setErrorMsg(null);
    setIsBusy(true);
    try {
      const ok = await onConnectBluetooth();
      if (ok) onClose();
    } catch (e: any) {
      setErrorMsg(e.message || 'Could not connect via Bluetooth.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleWifi = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsBusy(true);
    try {
      const ok = await onConnectWifi(wifiIp.trim());
      if (ok) onClose();
    } catch (e: any) {
      setErrorMsg(e.message || 'Could not connect via Wi-Fi.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDisconnect = async () => {
    await onDisconnect();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl bg-[#0d1017] border border-slate-800 shadow-2xl p-6 space-y-4">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-100">Connect Studio MacroPad Pro</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Smart Auto-Handoff Notice */}
        <div className="p-3 rounded-xl bg-sky-950/20 border border-sky-500/20 text-xs text-sky-300 space-y-1">
          <div className="flex items-center justify-between gap-2 font-semibold">
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-sky-400" />
              <span>Smart Auto-Connect & Cable Priority</span>
            </div>
            {!isConnected && autoScanChannel !== 'idle' && (
              <span className="text-[10px] font-mono text-sky-400 uppercase">
                Scanning {autoScanChannel}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Automatically connects to open USB or Bluetooth channels. Plugging in a USB-C cable while on Bluetooth automatically switches to wired USB.
          </p>
        </div>

        {errorMsg && (
          <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Connection Options */}
        <div className="space-y-3">
          {/* USB Serial (Priority #1) */}
          <button
            onClick={handleSerial}
            disabled={isBusy}
            className={`w-full p-3.5 rounded-xl bg-slate-950 border text-left flex items-center justify-between gap-3 transition-all cursor-pointer group ${
              connectionMode === 'usb'
                ? 'border-emerald-500/50 bg-emerald-950/10'
                : 'border-slate-800 hover:border-sky-400'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 group-hover:bg-sky-400 group-hover:text-slate-950 transition-all shrink-0">
                <Usb className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100 flex items-center gap-2">
                  <span>USB-C Wired Cable</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-sky-400">
                    PRIORITY
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">Direct 115,200 baud Serial · Overrides Bluetooth</div>
              </div>
            </div>
            {connectionMode === 'usb' && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
          </button>

          {/* Bluetooth LE */}
          <button
            onClick={handleBluetooth}
            disabled={isBusy}
            className={`w-full p-3.5 rounded-xl bg-slate-950 border text-left flex items-center justify-between gap-3 transition-all cursor-pointer group ${
              connectionMode === 'bluetooth'
                ? 'border-blue-500/50 bg-blue-950/10'
                : 'border-slate-800 hover:border-blue-400'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 group-hover:bg-blue-400 group-hover:text-slate-950 transition-all shrink-0">
                <Bluetooth className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100">Bluetooth Wireless (BLE)</div>
                <div className="text-[11px] text-slate-400">Auto-connects when unplugged · Hands off to USB cable</div>
              </div>
            </div>
            {connectionMode === 'bluetooth' && <Check className="w-4 h-4 text-blue-400 shrink-0" />}
          </button>

          {/* Wi-Fi IP */}
          <form onSubmit={handleWifi} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wifi className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-slate-100">Connect via Wi-Fi IP</span>
              </div>
              {connectionMode === 'wifi' && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={wifiIp}
                onChange={e => setWifiIp(e.target.value)}
                placeholder="192.168.4.1"
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono text-white focus:outline-none focus:border-emerald-400"
              />
              <button
                type="submit"
                disabled={isBusy}
                className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer"
              >
                Connect
              </button>
            </div>
          </form>
        </div>

        {isConnected && (
          <div className="pt-2 border-t border-slate-800">
            <button
              onClick={handleDisconnect}
              className="w-full py-2 rounded-lg bg-slate-950 border border-slate-700 hover:border-rose-500 text-rose-300 text-xs font-semibold cursor-pointer"
            >
              Disconnect ({connectionMode.toUpperCase()})
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
