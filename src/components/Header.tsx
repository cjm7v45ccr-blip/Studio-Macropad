import React from 'react';
import { ConnectionMode, FirmwareStatus, ProfileMode } from '../types/macropod';
import { Usb, Wifi, Bluetooth, Settings, Unplug } from 'lucide-react';

interface HeaderProps {
  status: FirmwareStatus;
  connectionMode: ConnectionMode;
  isConnected: boolean;
  onToggleMode: () => void;
  onOpenConnectModal: () => void;
  onOpenSettingsModal: () => void;
  onOpenPresetsModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  connectionMode,
  isConnected,
  onToggleMode,
  onOpenConnectModal,
  onOpenSettingsModal,
  onOpenPresetsModal
}) => {
  const activeMode: ProfileMode = status.profiles.active;

  return (
    <header className="sticky top-0 z-40 bg-[#090b10]/95 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-6 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
        
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-sky-400 flex items-center justify-center font-black text-slate-950 text-xs shadow-sm">
            S
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold tracking-tight text-white whitespace-nowrap">
              Studio Pad
            </span>
            <span className="text-[11px] font-mono text-slate-500 hidden sm:inline">v3.2-PRO</span>
          </div>
        </div>

        {/* Center: Hardware Profile Switcher & Quick Navigation */}
        <div className="flex items-center gap-2">
          <div className="flex items-center p-0.5 rounded-lg bg-slate-900 border border-slate-800">
            <button
              onClick={() => { if (activeMode !== 'MAC') onToggleMode(); }}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                activeMode === 'MAC'
                  ? 'bg-sky-400 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Mac Profile
            </button>
            <button
              onClick={() => { if (activeMode !== 'TV') onToggleMode(); }}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                activeMode === 'TV'
                  ? 'bg-sky-400 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              TV Profile
            </button>
          </div>

          {/* Curated Packs Shortcut with requested Camera SVG */}
          <button
            onClick={onOpenPresetsModal}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Explore Curated Profile Packs"
          >
            <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="&lt;svg xmlns=&quot;http://www.w3.org/2000/svg&quot; height=&quot;24px&quot; viewBox=&quot;0 -960 960 960&quot; width=&quot;24px&quot; fill=&quot;919D96&quot;&gt;&lt;path d=&quot;M440-440ZM120-120q-33 0-56.5-23.5T40-200v-480q0-33 23.5-56.5T120-760h126l74-80h240v80H355l-73 80H120v480h640v-360h80v360q0 33-23.5 56.5T760-120H120Zm640-560v-80h-80v-80h80v-80h80v80h80v80h-80v80h-80ZM440-260q75 0 127.5-52.5T620-440q0-75-52.5-127.5T440-620q-75 0-127.5 52.5T260-440q0 75 52.5 127.5T440-260Zm0-80q-42 0-71-29t-29-71q0-42 29-71t71-29q42 0 71 29t29 71q0 42-29 71t-71 29Z&quot;/&gt;&lt;/svg&gt;"><path d="M80-160h280v-280H80v280Zm80-440v-120h240v120H160Zm-80 80h400v-280H80v280Zm440 280v-120h280v120H520Zm-80 80h440v-280H440v280Zm-280-80v-120h120v120H160Zm240-360Zm320 80q-83 0-141.5-58.5T520-720q0-83 58.5-141.5T720-920q83 0 141.5 58.5T920-720q0 83-58.5 141.5T720-520Zm-20-80h40v-100h100v-40H740v-100h-40v100H600v40h100v100ZM520-360Zm-240 0Z"/></svg>
            <span>Packs</span>
          </button>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {/* Connection Status Button */}
          <button
            onClick={onOpenConnectModal}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer border ${
              connectionMode === 'bluetooth'
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-300 hover:border-blue-400'
                : isConnected
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:border-emerald-400'
                : 'bg-slate-900 border-slate-800 hover:border-sky-400/60 text-slate-300'
            }`}
          >
            {connectionMode === 'usb' ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <Usb className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-mono text-emerald-200">USB Connected</span>
              </>
            ) : connectionMode === 'bluetooth' ? (
              <>
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                <Bluetooth className="w-3.5 h-3.5 text-blue-400" />
                <span className="font-mono text-blue-200">Bluetooth</span>
              </>
            ) : connectionMode === 'wifi' ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-mono text-emerald-200">{status.ip || 'Wi-Fi'}</span>
              </>
            ) : (
              <>
                <Unplug className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-mono text-slate-300">Connect Device</span>
              </>
            )}
          </button>

          {/* Settings Button */}
          <button
            onClick={onOpenSettingsModal}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="MacroPad Hardware Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

      </div>
    </header>
  );
};
