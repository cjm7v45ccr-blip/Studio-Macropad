import React from 'react';
import { ConnectionMode, ProfileMode } from '../types/macropod';
import { Wifi, Bluetooth } from 'lucide-react';

interface OledScreenProps {
  mode: ProfileMode;
  toast: string | null;
  wifiConnected: boolean;
  bleConnected: boolean;
  ip: string;
  isConnected: boolean;
  connectionMode: ConnectionMode;
}

export const OledScreen: React.FC<OledScreenProps> = ({
  mode,
  toast,
  wifiConnected,
  bleConnected,
  ip,
  isConnected,
  connectionMode
}) => {
  const transportLabel =
    connectionMode === 'usb'
      ? 'USB'
      : connectionMode === 'bluetooth'
      ? 'BLE'
      : connectionMode === 'wifi'
      ? ip.replace('192.168.', '..')
      : 'SCAN';

  return (
    <div className="relative w-44 h-22 rounded-md bg-[#02060a] border-2 border-slate-700/80 p-2 shadow-inner flex flex-col justify-between font-mono select-none overflow-hidden text-cyan-300">
      
      {/* Top Status Bar (OLED 128x12) */}
      <div className="flex items-center justify-between text-[9px] border-b border-cyan-400/20 pb-1 tracking-wider">
        <span className="font-bold text-cyan-200">
          {isConnected ? mode : 'OFFLINE'}
        </span>
        <div className="flex items-center gap-1.5">
          {(bleConnected || connectionMode === 'bluetooth') && (
            <Bluetooth className="w-2.5 h-2.5 text-cyan-300" />
          )}
          {wifiConnected && connectionMode === 'wifi' && (
            <Wifi className="w-2.5 h-2.5 text-cyan-300" />
          )}
          <span className="text-[8px] text-cyan-400/80">
            {transportLabel}
          </span>
        </div>
      </div>

      {/* Main OLED Canvas Area */}
      <div className="my-auto flex flex-col items-center justify-center">
        {!isConnected ? (
          <div className="flex flex-col items-center text-center">
            <span className="text-[11px] font-bold tracking-wider text-cyan-400">AUTO SCAN</span>
            <span className="text-[8px] text-cyan-400/60 mt-0.5">USB · BLE · WIFI</span>
          </div>
        ) : toast ? (
          <div className="px-3 py-1 rounded border border-cyan-300 bg-cyan-950/70 text-center animate-in fade-in duration-100">
            <span className="text-xs font-bold text-cyan-100 tracking-wide uppercase">{toast}</span>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            <span className="text-sm font-extrabold tracking-widest text-cyan-100">
              {mode === 'MAC' ? 'MAC MODE' : 'TV MODE'}
            </span>
            <span className="text-[8px] text-cyan-400/70 tracking-tight mt-0.5">
              {mode === 'MAC' ? 'SHORTCUTS & MEDIA' : 'SMARTCAST REMOTE'}
            </span>
          </div>
        )}
      </div>

      {/* Subtle Screen Scanline Texture */}
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-cyan-400/5 to-transparent pointer-events-none" />
    </div>
  );
};
