import React, { useState } from 'react';
import { FirmwareStatus } from '../types/macropod';
import { X, Wifi, Tv, RotateCcw, Download, Check, Key, ShieldCheck, Play, ChevronDown, ChevronUp } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: FirmwareStatus;
  onSaveWifi: (ssid: string, pass: string) => Promise<void>;
  onSaveTv: (ip: string, port: number, token: string) => Promise<void>;
  onPairStart: (ip: string, port: number) => Promise<void>;
  onPairSubmit: (pin: string) => Promise<void>;
  onResetDefaults: () => Promise<void>;
  onTestTv: () => Promise<{ ok: boolean; message: string }>;
  onOpenPresetsModal: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  status,
  onSaveWifi,
  onSaveTv,
  onPairStart,
  onPairSubmit,
  onResetDefaults,
  onTestTv,
  onOpenPresetsModal
}) => {
  const [tab, setTab] = useState<'tv' | 'wifi' | 'packs' | 'backup'>('tv');

  // Wi-Fi form
  const [ssid, setSsid] = useState(status.ssid || '');
  const [pass, setPass] = useState('');

  // TV Direct Auth Form
  const [tvIp, setTvIp] = useState(status.tv_ip || '192.168.1.100');
  const [tvPort, setTvPort] = useState(status.tv_port || 7345);
  const [tvToken, setTvToken] = useState('');
  const [tvPin, setTvPin] = useState('');
  const [showPinPairing, setShowPinPairing] = useState(false);
  const [tvTestResult, setTvTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isTestingTv, setIsTestingTv] = useState(false);

  if (!isOpen) return null;

  const handleWifiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveWifi(ssid, pass);
    setPass('');
  };

  const handleTvDirectTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveTv(tvIp, tvPort, tvToken.trim());
    handleTestTvLink();
  };

  const handleTestTvLink = async () => {
    setIsTestingTv(true);
    setTvTestResult(null);
    try {
      const res = await onTestTv();
      setTvTestResult(res);
    } catch (e: any) {
      setTvTestResult({ ok: false, message: e.message || 'TV did not respond.' });
    } finally {
      setIsTestingTv(false);
    }
  };

  const handleExportBackup = () => {
    const backup = {
      schema: 'studio-pad-config',
      version: 1,
      mac_name: status.profiles.items.find(p => p.id === 'MAC')?.name || 'Mac',
      tv_name: status.profiles.items.find(p => p.id === 'TV')?.name || 'TV',
      mac_b1: status.mac_b1,
      mac_b2: status.mac_b2,
      mac_b3: status.mac_b3,
      mac_b4: status.mac_b4,
      mac_dial: status.mac_dial,
      tv_b1: status.tv_b1,
      tv_b2: status.tv_b2,
      tv_b3: status.tv_b3,
      tv_b4: status.tv_b4,
      tv_dial: status.tv_dial
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'studio-pad-backup.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const isTvPaired = status.has_auth || status.tv?.paired;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-2xl bg-[#0d1017] border border-slate-800 shadow-2xl p-6 space-y-4">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <h3 className="text-sm font-bold text-slate-100">Hardware & Integration Settings</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sub-tabs */}
        <div className="grid grid-cols-4 gap-1 p-0.5 rounded-lg bg-slate-950 border border-slate-800">
          <button
            onClick={() => setTab('tv')}
            className={`py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center justify-center gap-1 ${
              tab === 'tv' ? 'bg-sky-400 text-slate-950 font-bold shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Tv className="w-3.5 h-3.5" />
            <span>Smart TV</span>
          </button>
          <button
            onClick={() => setTab('wifi')}
            className={`py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center justify-center gap-1 ${
              tab === 'wifi' ? 'bg-sky-400 text-slate-950 font-bold shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wifi className="w-3.5 h-3.5" />
            <span>Wi-Fi</span>
          </button>
          <button
            onClick={() => setTab('packs')}
            className={`py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center justify-center gap-1 ${
              tab === 'packs' ? 'bg-sky-400 text-slate-950 font-bold shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 -960 960 960" width="14px" fill="currentColor">
              <path d="M80-160h280v-280H80v280Zm80-440v-120h240v120H160Zm-80 80h400v-280H80v280Zm440 280v-120h280v120H520Zm-80 80h440v-280H440v280Zm-280-80v-120h120v120H160Zm240-360Zm320 80q-83 0-141.5-58.5T520-720q0-83 58.5-141.5T720-920q83 0 141.5 58.5T920-720q0 83-58.5 141.5T720-520Zm-20-80h40v-100h100v-40H740v-100h-40v100H600v40h100v100ZM520-360Zm-240 0Z"/>
            </svg>
            <span>Packs</span>
          </button>
          <button
            onClick={() => setTab('backup')}
            className={`py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center justify-center gap-1 ${
              tab === 'backup' ? 'bg-sky-400 text-slate-950 font-bold shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Backup</span>
          </button>
        </div>

        {/* Tab 1: Smart TV Direct Auth Token */}
        {tab === 'tv' && (
          <div className="space-y-4">
            <div className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
              isTvPaired
                ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                : 'bg-slate-950 border-slate-800 text-slate-400'
            }`}>
              <div className="flex items-center gap-2">
                <ShieldCheck className={`w-4 h-4 ${isTvPaired ? 'text-emerald-400' : 'text-slate-500'}`} />
                <span>
                  {isTvPaired ? 'Auth Token Configured · Ready for Commands' : 'Direct Auth Token Not Saved Yet'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleTestTvLink}
                disabled={isTestingTv}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-semibold text-slate-200 transition-colors cursor-pointer"
              >
                <Play className="w-3 h-3" />
                <span>{isTestingTv ? 'Testing...' : 'Ping TV'}</span>
              </button>
            </div>

            {tvTestResult && (
              <div className={`p-2.5 rounded-lg border text-xs flex items-center gap-2 ${
                tvTestResult.ok
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}>
                <span className="font-mono">{tvTestResult.message}</span>
              </div>
            )}

            <form onSubmit={handleTvDirectTokenSubmit} className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-slate-300">TV IP Address</label>
                  <input
                    type="text"
                    required
                    value={tvIp}
                    onChange={e => setTvIp(e.target.value)}
                    placeholder="192.168.1.100"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white mt-1 focus:outline-none focus:border-sky-400 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300">Port</label>
                  <input
                    type="number"
                    required
                    value={tvPort}
                    onChange={e => setTvPort(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white mt-1 focus:outline-none focus:border-sky-400 font-mono"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-amber-400" />
                    <span>TV Auth Token (Zero-PIN Direct Access)</span>
                  </label>
                </div>
                <input
                  type="text"
                  value={tvToken}
                  onChange={e => setTvToken(e.target.value)}
                  placeholder="Paste your auth token..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-400 font-mono"
                />
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-sky-400 hover:bg-sky-300 text-slate-950 cursor-pointer shadow-sm"
                >
                  <Check className="w-3.5 h-3.5" />
                  Save Auth Token to Flash
                </button>
              </div>
            </form>

            <div className="pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowPinPairing(!showPinPairing)}
                className="flex items-center justify-between w-full text-xs text-slate-400 hover:text-slate-200 transition-colors py-1 cursor-pointer"
              >
                <span>Pair via on-screen TV PIN instead</span>
                {showPinPairing ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showPinPairing && (
                <div className="mt-2.5 p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onPairStart(tvIp, tvPort)}
                      className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                    >
                      Request PIN on TV Screen
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={tvPin}
                      onChange={e => setTvPin(e.target.value)}
                      placeholder="4-digit PIN"
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => onPairSubmit(tvPin)}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-sky-400 hover:bg-sky-300 text-slate-950 cursor-pointer"
                    >
                      Submit PIN
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Wi-Fi */}
        {tab === 'wifi' && (
          <form onSubmit={handleWifiSubmit} className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-300">Network Name (SSID)</label>
              <input
                type="text"
                required
                value={ssid}
                onChange={e => setSsid(e.target.value)}
                placeholder="Wi-Fi SSID"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white mt-1 focus:outline-none focus:border-sky-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-300">Password</label>
              <input
                type="password"
                value={pass}
                onChange={e => setPass(e.target.value)}
                placeholder="Wi-Fi Password"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white mt-1 focus:outline-none focus:border-sky-400"
              />
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="px-4 py-2 rounded-lg text-xs font-bold bg-sky-400 hover:bg-sky-300 text-slate-950 cursor-pointer shadow-sm"
              >
                Save Wi-Fi to MacroPad
              </button>
            </div>
          </form>
        )}

        {/* Tab 3: Curated Packs Gallery (Moved here with requested SVG icon) */}
        {tab === 'packs' && (
          <div className="space-y-4 py-2 text-center">
            <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mx-auto text-sky-400">
              <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
                <path d="M80-160h280v-280H80v280Zm80-440v-120h240v120H160Zm-80 80h400v-280H80v280Zm440 280v-120h280v120H520Zm-80 80h440v-280H440v280Zm-280-80v-120h120v120H160Zm240-360Zm320 80q-83 0-141.5-58.5T520-720q0-83 58.5-141.5T720-920q83 0 141.5 58.5T920-720q0 83-58.5 141.5T720-520Zm-20-80h40v-100h100v-40H740v-100h-40v100H600v40h100v100ZM520-360Zm-240 0Z"/>
              </svg>
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-200">Curated Profile Packs</h4>
              <p className="text-xs text-slate-400">
                Instantly apply pre-configured macro layouts for development, video editing, gaming, and Smart TV control.
              </p>
            </div>
            <button
              onClick={() => {
                onClose();
                onOpenPresetsModal();
              }}
              className="w-full py-2.5 rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 font-bold text-xs cursor-pointer shadow-sm transition-all flex items-center justify-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor">
                <path d="M80-160h280v-280H80v280Zm80-440v-120h240v120H160Zm-80 80h400v-280H80v280Zm440 280v-120h280v120H520Zm-80 80h440v-280H440v280Zm-280-80v-120h120v120H160Zm240-360Zm320 80q-83 0-141.5-58.5T520-720q0-83 58.5-141.5T720-920q83 0 141.5 58.5T920-720q0 83-58.5 141.5T720-520Zm-20-80h40v-100h100v-40H740v-100h-40v100H600v40h100v100ZM520-360Zm-240 0Z"/>
              </svg>
              <span>Open Profile Packs Gallery</span>
            </button>
          </div>
        )}

        {/* Tab 4: Backup & Recovery */}
        {tab === 'backup' && (
          <div className="space-y-3">
            <button
              onClick={handleExportBackup}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg bg-slate-950 border border-slate-700 hover:border-sky-400 text-xs font-semibold text-slate-200 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              Download Full Backup JSON
            </button>
            <button
              onClick={onResetDefaults}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg bg-slate-950 border border-rose-900/60 hover:border-rose-500 text-xs font-semibold text-rose-300 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
              Restore Firmware Defaults
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
