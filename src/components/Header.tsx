import React from 'react';
import { FirmwareStatus, ProfileMode } from '../types/macropod';
import { Usb, Wifi, Settings, Unplug } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

interface HeaderProps {
  status: FirmwareStatus;
  connectionMode: 'usb' | 'wifi' | 'disconnected';
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

          {/* Curated Packs Shortcut */}
          <button
            onClick={onOpenPresetsModal}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Explore Curated Profile Packs"
          >
            <svg xmlns="http://www.w3.org/2000/svg" height="15px" viewBox="0 -960 960 960" width="15px" fill="#e3e3e3">
              <path d="M400-600ZM280-360Zm240 120v-120h280v120H520ZM160-600v-120h240v120H160Zm0 360v-120h120v120H160Zm280 80h440v-280H440v280ZM80-520h400v-280H80v280Zm0 360h280v-280H80v280Zm440-200Zm160-160v-120H560v-80h120v-120h80v120h120v80H760v120h-80Z"/>
            </svg>
            <span>Packs</span>
          </button>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {/* PWA Install / Download Button */}
          <PWAInstallButton />

          {/* Connection Status Button */}
          <button
            onClick={onOpenConnectModal}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer border ${
              isConnected
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
