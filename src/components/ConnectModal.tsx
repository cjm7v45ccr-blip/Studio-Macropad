import React, { useState } from 'react';
import { Usb, Wifi, X, AlertCircle, Zap, ShieldCheck } from 'lucide-react';

interface ConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  isConnected: boolean;
  connectionMode: 'usb' | 'wifi' | 'disconnected';
  onConnectSerial: () => Promise<boolean>;
  onConnectWifi: (ip: string) => Promise<boolean>;
  onDisconnect: () => Promise<void>;
}

export const ConnectModal: React.FC<ConnectModalProps> = ({
  isOpen,
  onClose,
  isConnected,
  connectionMode,
  onConnectSerial,
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
      setErrorMsg(e.message || 'Could not connect via serial.');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-sm rounded-2xl bg-[#0d1017] border border-slate-800 shadow-2xl p-6 space-y-4">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-100">Connect Studio MacroPad</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Auto-Pairing Notice */}
        <div className="p-3 rounded-xl bg-sky-950/20 border border-sky-500/20 text-xs text-sky-300 space-y-1">
          <div className="flex items-center gap-2 font-semibold">
            <Zap className="w-3.5 h-3.5 text-sky-400" />
            <span>Cable Auto-Pairing Active</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Plugging in your USB-C cable auto-connects to previously authorized ports in real-time.
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
          {/* USB Serial */}
          <button
            onClick={handleSerial}
            disabled={isBusy}
            className="w-full p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-sky-400 text-left flex items-center gap-3 transition-all cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 group-hover:bg-sky-400 group-hover:text-slate-950 transition-all">
              <Usb className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-100">Authorize / Select USB Port</div>
              <div className="text-[11px] text-slate-400">Direct 115,200 baud Web Serial link</div>
            </div>
          </button>

          {/* Wi-Fi IP */}
          <form onSubmit={handleWifi} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center gap-2">
              <Wifi className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-slate-100">Connect via Wi-Fi IP</span>
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
