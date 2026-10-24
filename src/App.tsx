/**
 * Studio MacroPad - Flagship Hardware Control Center
 * Direct ESP32 Web Serial & Wi-Fi REST Connection (No Simulation)
 */

import React, { useState, useEffect } from 'react';
import { hardwareDriver } from './services/hardwareDriver';
import { AutoScanChannel, ConnectionMode, FirmwareStatus, ProfileMode, SlotId } from './types/macropod';
import { Header } from './components/Header';
import { PhysicalPad } from './components/PhysicalPad';
import { KeyRemapper } from './components/KeyRemapper';
import { ConnectModal } from './components/ConnectModal';
import { SettingsModal } from './components/SettingsModal';
import { PresetGalleryModal } from './components/PresetGalleryModal';
import { ProfilePreset } from './data/presetProfiles';
import { CheckCircle2, AlertCircle, Usb, Bluetooth, Wifi } from 'lucide-react';

export default function App() {
  const [status, setStatus] = useState<FirmwareStatus>(hardwareDriver.getStatus());
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>(hardwareDriver.connectionMode);
  const [autoScanChannel, setAutoScanChannel] = useState<AutoScanChannel>(hardwareDriver.autoScanState);
  const [selectedSlot, setSelectedSlot] = useState<SlotId>('b1');
  const [activeToast, setActiveToast] = useState<string | null>(null);

  // Modals & Panels
  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPresetsOpen, setIsPresetsOpen] = useState(false);

  // UI Toast
  const [bannerToast, setBannerToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showBanner = (message: string, type: 'success' | 'error' = 'success') => {
    setBannerToast({ message, type });
    setTimeout(() => {
      setBannerToast(prev => (prev?.message === message ? null : prev));
    }, 3200);
  };

  useEffect(() => {
    const unsubStatus = hardwareDriver.onStatus(newStatus => {
      setStatus({ ...newStatus });
      setConnectionMode(hardwareDriver.connectionMode);
      setAutoScanChannel(hardwareDriver.autoScanState);
    });

    const unsubToast = hardwareDriver.onToast(msg => {
      setActiveToast(msg);
      setTimeout(() => setActiveToast(null), 1200);
    });

    const unsubBanner = hardwareDriver.onBanner((msg, type) => {
      showBanner(msg, type);
    });

    return () => {
      unsubStatus();
      unsubToast();
      unsubBanner();
    };
  }, []);

  const handleToggleMode = () => {
    const nextMode: ProfileMode = status.profiles.active === 'MAC' ? 'TV' : 'MAC';
    hardwareDriver.setMode(nextMode);
  };

  const handleTriggerAction = async (actionId: string) => {
    if (!hardwareDriver.isConnected) {
      hardwareDriver.emitToast('Offline');
      return;
    }
    try {
      await hardwareDriver.request('/api/test/action', { action: actionId });
    } catch (_) {}
  };

  const handleSaveAction = async (profile: ProfileMode, slot: SlotId, actionId: string) => {
    try {
      const res = await hardwareDriver.request('/api/customizer/save', {
        profile,
        slot,
        action: actionId
      });
      if (res && res.ok) {
        if (res.offline) {
          showBanner(`Saved to ${slot.toUpperCase()} (Connect USB to flash to ESP32)`);
        } else {
          showBanner(`Flashed to ${slot.toUpperCase()} on MacroPad`);
        }
      } else {
        showBanner(res?.message || 'Could not save to device', 'error');
      }
    } catch (err: any) {
      showBanner(err.message || 'Save failed', 'error');
    }
  };

  const handleApplyPreset = async (preset: ProfilePreset) => {
    hardwareDriver.setMode(preset.mode);
    const slots: SlotId[] = ['b1', 'b2', 'b3', 'b4', 'dial'];
    try {
      for (const s of slots) {
        await hardwareDriver.request('/api/customizer/save', {
          profile: preset.mode,
          slot: s,
          action: preset.bindings[s]
        });
      }
      showBanner(`Applied "${preset.title}" pack to ${preset.mode === 'MAC' ? 'Mac' : 'TV'} profile!`);
    } catch (_) {
      showBanner(`Applied "${preset.title}" locally.`);
    }
  };

  const handleTestAction = async (actionId: string) => {
    if (!hardwareDriver.isConnected) {
      showBanner('Connect MacroPad via USB, Bluetooth, or Wi-Fi to test on device', 'error');
      return;
    }
    try {
      const res = await hardwareDriver.request('/api/test/action', { action: actionId });
      if (res && res.ok) {
        showBanner('Dispatched to MacroPad');
      }
    } catch (err: any) {
      showBanner(err.message || 'Action dispatch failed', 'error');
    }
  };

  // Wi-Fi & TV Settings Handlers
  const handleSaveWifi = async (ssid: string, pass: string) => {
    try {
      const res = await hardwareDriver.request('/api/wifi', { ssid, pass });
      showBanner(res?.message || 'Wi-Fi credentials saved to device');
    } catch (err: any) {
      showBanner(err.message, 'error');
    }
  };

  const handleSaveTv = async (ip: string, port: number, token: string) => {
    try {
      const res = await hardwareDriver.request('/api/token/save', {
        tv_ip: ip,
        tv_port: port,
        token
      });
      if (token) {
        showBanner(res?.message || 'TV Auth Token saved to flash (PIN bypassed)!');
      } else {
        showBanner(res?.message || 'TV configuration saved to flash.');
      }
    } catch (err: any) {
      showBanner(err.message, 'error');
    }
  };

  const handleTestTv = async (): Promise<{ ok: boolean; message: string }> => {
    try {
      const res = await hardwareDriver.request('/api/tv/test');
      if (res && res.ok) {
        return { ok: true, message: res.message || 'TV Responded: 200 OK (Online)' };
      }
      return { ok: false, message: res?.message || 'TV did not respond over network.' };
    } catch (err: any) {
      return { ok: false, message: err.message || 'TV unreachable.' };
    }
  };

  const handlePairStart = async (ip: string, port: number) => {
    try {
      const res = await hardwareDriver.request('/api/pair/start', {
        tv_ip: ip,
        tv_port: port
      });
      showBanner(res?.message || 'PIN requested. Check TV screen.');
    } catch (err: any) {
      showBanner(err.message, 'error');
    }
  };

  const handlePairSubmit = async (pin: string) => {
    try {
      const res = await hardwareDriver.request('/api/pair/submit', { pin });
      showBanner(res?.message || 'TV pairing completed!');
    } catch (err: any) {
      showBanner(err.message, 'error');
    }
  };

  const handleResetDefaults = async () => {
    if (!window.confirm('Restore firmware defaults for Mac and TV profiles?')) return;
    try {
      const res = await hardwareDriver.request('/api/device/reset-settings', { confirm: 'RESET' });
      showBanner(res?.message || 'Restored factory defaults.');
    } catch (err: any) {
      showBanner(err.message, 'error');
    }
  };

  return (
    <div className="min-h-screen bg-[#08090d] text-slate-100 flex flex-col font-sans selection:bg-sky-500/20 selection:text-sky-300 relative">
      
      {/* Full-Viewport No Device Connected Overlay */}
      {connectionMode === 'disconnected' && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#0d1017] border border-slate-800 rounded-2xl max-w-md w-full p-8 shadow-2xl text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mx-auto shadow-inner">
              <AlertCircle className="w-8 h-8 animate-pulse" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-100">No Device Connected</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Automatically looking for an open USB-C, Bluetooth, or Wi-Fi connection. Plug in a cable at any time to switch to wired USB.
              </p>
            </div>

            {/* Live Open-Channel Auto-Scan Status */}
            <div className="flex items-center justify-center gap-3 py-2 px-3 rounded-xl bg-slate-950 border border-slate-800/80 text-[11px] font-mono text-slate-400">
              <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping shrink-0" />
              <span>
                {autoScanChannel === 'usb'
                  ? 'Checking USB-C Cable...'
                  : autoScanChannel === 'bluetooth'
                  ? 'Scanning Bluetooth LE...'
                  : autoScanChannel === 'wifi'
                  ? 'Checking Saved Wi-Fi...'
                  : 'Listening for USB Cable & Bluetooth'}
              </span>
            </div>

            <div className="pt-1 flex flex-col gap-2.5">
              <button
                onClick={async () => {
                  try {
                    await hardwareDriver.connectBluetooth();
                  } catch (err: any) {
                    showBanner(err.message || 'Bluetooth connection failed', 'error');
                  }
                }}
                className="w-full py-3 rounded-xl bg-blue-500 hover:bg-blue-400 text-slate-950 font-bold text-xs cursor-pointer shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <Bluetooth className="w-4 h-4" />
                <span>Connect via Bluetooth</span>
              </button>

              <button
                onClick={async () => {
                  try {
                    await hardwareDriver.connectSerial();
                  } catch (err: any) {
                    showBanner(err.message || 'USB connection failed', 'error');
                  }
                }}
                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <Usb className="w-4 h-4" />
                <span>Connect USB-C Cable</span>
              </button>

              <button
                onClick={() => setIsConnectOpen(true)}
                className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold text-xs cursor-pointer transition-all flex items-center justify-center gap-2"
              >
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span>Connect via Wi-Fi IP</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Header */}
      <Header
        status={status}
        connectionMode={connectionMode}
        isConnected={connectionMode !== 'disconnected'}
        onToggleMode={handleToggleMode}
        onOpenConnectModal={() => setIsConnectOpen(true)}
        onOpenSettingsModal={() => setIsSettingsOpen(true)}
        onOpenPresetsModal={() => setIsPresetsOpen(true)}
      />

      {/* Main Studio Workspace */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        
        {/* Responsive Grid: Physical Device + Control Remapper */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: Physical Macropod Device */}
          <div className="lg:col-span-5">
            <PhysicalPad
              status={status}
              isConnected={connectionMode !== 'disconnected'}
              connectionMode={connectionMode}
              selectedSlot={selectedSlot}
              onSelectSlot={setSelectedSlot}
              onToggleMode={handleToggleMode}
              onTriggerAction={handleTriggerAction}
              activeToast={activeToast}
            />
          </div>

          {/* Right Column: Key Remapper */}
          <div className="lg:col-span-7">
            <KeyRemapper
              status={status}
              selectedSlot={selectedSlot}
              onSelectSlot={setSelectedSlot}
              onSaveAction={handleSaveAction}
              onTestAction={handleTestAction}
              onSelectProfile={mode => hardwareDriver.setMode(mode)}
            />
          </div>

        </div>

      </main>

      {/* Connection Modal */}
      <ConnectModal
        isOpen={isConnectOpen}
        onClose={() => setIsConnectOpen(false)}
        isConnected={connectionMode !== 'disconnected'}
        connectionMode={connectionMode}
        autoScanChannel={autoScanChannel}
        onConnectSerial={() => hardwareDriver.connectSerial()}
        onConnectBluetooth={() => hardwareDriver.connectBluetooth()}
        onConnectWifi={ip => hardwareDriver.connectWifi(ip)}
        onDisconnect={() => hardwareDriver.disconnect()}
      />

      {/* Hardware Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        status={status}
        onSaveWifi={handleSaveWifi}
        onSaveTv={handleSaveTv}
        onPairStart={handlePairStart}
        onPairSubmit={handlePairSubmit}
        onResetDefaults={handleResetDefaults}
        onTestTv={handleTestTv}
        onOpenPresetsModal={() => setIsPresetsOpen(true)}
      />

      {/* Curated Profile Packs Modal */}
      <PresetGalleryModal
        isOpen={isPresetsOpen}
        onClose={() => setIsPresetsOpen(false)}
        activeMode={status.profiles.active}
        onApplyPreset={handleApplyPreset}
      />

      {/* Banner Toast Notification */}
      {bannerToast && (
        <div className="fixed bottom-6 right-6 z-[70] flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl text-xs font-semibold animate-in slide-in-from-bottom-2 duration-150">
          {bannerToast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span className="text-slate-200">{bannerToast.message}</span>
        </div>
      )}

      {/* Clean Minimalist Hardware Footer */}
      <footer className="border-t border-slate-900/80 py-3.5 px-6 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between max-w-6xl mx-auto w-full gap-2">
        <div className="flex items-center gap-2">
          <span>Studio Pad</span>
        </div>
        <div className="font-mono text-slate-500">
          Firmware v3.2-PRO
        </div>
      </footer>

    </div>
  );
}
