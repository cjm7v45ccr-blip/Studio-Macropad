import React, { useState } from 'react';
import { Usb, X, AlertCircle, Check } from 'lucide-react';
import { ConnectionMode } from '../types/macropod';

interface ConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  isConnected: boolean;
  connectionMode: ConnectionMode;
  onConnectSerial: () => Promise<boolean>;
  onDisconnect: () => Promise<void>;
}

export const ConnectModal: React.FC<ConnectModalProps> = ({
  isOpen,
  onClose,
  isConnected,
  connectionMode,
  onConnectSerial,
  onDisconnect
}) => {
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

  const handleDisconnect = async () => {
    await onDisconnect();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl bg-[#0d1017] border border-slate-800 shadow-2xl p-6 space-y-4">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <h3 className="text-sm font-bold text-slate-100">USB Cable Hardware Connection</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          Plug in your Studio MacroPad via USB cable and select the serial port to sync profiles and configure device settings.
        </p>

        {errorMsg && (
          <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* USB Cable Serial Option */}
        <button
          onClick={handleSerial}
          disabled={isBusy}
          className={`w-full p-4 rounded-xl bg-slate-950 border text-left flex items-center justify-between gap-3 transition-all cursor-pointer group ${
            connectionMode === 'usb'
              ? 'border-emerald-500/50 bg-emerald-950/10'
              : 'border-slate-800 hover:border-sky-400'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 group-hover:bg-sky-400 group-hover:text-slate-950 transition-all shrink-0">
              <Usb className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-100">
                {connectionMode === 'usb' ? 'USB Cable Connected' : 'Connect USB Cable'}
              </div>
              <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                115,200 baud · Web Serial
              </div>
            </div>
          </div>
          {connectionMode === 'usb' && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
        </button>

        {isConnected && (
          <div className="pt-2 border-t border-slate-800">
            <button
              onClick={handleDisconnect}
              className="w-full py-2 rounded-lg bg-slate-950 border border-slate-700 hover:border-rose-500 text-rose-300 text-xs font-semibold cursor-pointer transition-colors"
            >
              Disconnect USB
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
