import React, { useState } from 'react';
import { ConnectionMode, FirmwareStatus, ProfileMode, SlotId } from '../types/macropod';
import { getActionDetails } from '../data/actionLibrary';
import { OledScreen } from './OledScreen';
import { RotateCw, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { soundEngine } from '../services/soundEffects';

interface PhysicalPadProps {
  status: FirmwareStatus | null;
  isConnected: boolean;
  connectionMode: ConnectionMode;
  selectedSlot: SlotId;
  onSelectSlot: (slot: SlotId) => void;
  onToggleMode: () => void;
  onTriggerAction: (actionId: string) => void;
  activeToast: string | null;
}

export const PhysicalPad: React.FC<PhysicalPadProps> = ({
  status,
  isConnected,
  connectionMode,
  selectedSlot,
  onSelectSlot,
  onToggleMode,
  onTriggerAction,
  activeToast
}) => {
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const [dialRotation, setDialRotation] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(soundEngine.isEnabled);

  const activeMode: ProfileMode = status?.profiles?.active || 'MAC';
  
  // Controls fallback if not connected yet
  const defaultControls = {
    b1: activeMode === 'MAC' ? 'MEDIA:PLAY_PAUSE' : 'TV:POWER',
    b2: activeMode === 'MAC' ? 'KEY:F13' : 'APP:YOUTUBE',
    b3: activeMode === 'MAC' ? 'KEY:F14' : 'APP:DISNEY',
    b4: activeMode === 'MAC' ? 'KEY:F15' : 'APP:TUBI',
    dial: 'MEDIA:MUTE'
  };

  const currentProfile = status?.profiles?.items?.find(p => p.id === activeMode);
  const controls = currentProfile?.controls || defaultControls;

  const toggleSound = () => {
    const next = soundEngine.toggle();
    setSoundEnabled(next);
  };

  const handleKeyClick = (slot: SlotId) => {
    soundEngine.playKeyClick();
    setPressedKey(slot);
    onSelectSlot(slot);
    onTriggerAction(controls[slot]);
    setTimeout(() => setPressedKey(null), 180);
  };

  const handleDialTurn = (direction: 'cw' | 'ccw') => {
    soundEngine.playDialTick();
    setDialRotation(prev => prev + (direction === 'cw' ? 18 : -18));
    const action = activeMode === 'MAC'
      ? (direction === 'cw' ? 'MEDIA:VOL_UP' : 'MEDIA:VOL_DOWN')
      : (direction === 'cw' ? 'TV:VOL_UP' : 'TV:VOL_DOWN');
    onTriggerAction(action);
  };

  const handleDialPress = () => {
    soundEngine.playKeyClick();
    setPressedKey('dial');
    onSelectSlot('dial');
    onTriggerAction(controls.dial);
    setTimeout(() => setPressedKey(null), 180);
  };

  const keys: { slot: SlotId; label: string; pin: string }[] = [
    { slot: 'b1', label: 'B1', pin: 'GPIO 4' },
    { slot: 'b2', label: 'B2', pin: 'GPIO 5' },
    { slot: 'b3', label: 'B3', pin: 'GPIO 6' },
    { slot: 'b4', label: 'B4', pin: 'GPIO 7' }
  ];

  return (
    <div className="flex flex-col items-center justify-center p-5 sm:p-6 rounded-2xl bg-[#0b0e14] border border-slate-800/90 shadow-2xl relative select-none">
      
      {/* CNC Anodized Aluminum Enclosure */}
      <div className="relative w-full max-w-[440px] p-5 rounded-3xl bg-gradient-to-b from-[#181d29] via-[#121622] to-[#0d1017] border border-slate-700/80 shadow-[0_20px_50px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.12)]">
        
        {/* Top Section: OLED Screen + Hardware Status LEDs + Mode Switch */}
        <div className="flex items-center justify-between gap-4 pb-4 mb-4 border-b border-slate-800/80">
          
          {/* Physical 128x64 OLED Display */}
          <OledScreen
            mode={activeMode}
            toast={activeToast}
            wifiConnected={!!status?.wifi_connected}
            bleConnected={!!status?.connection?.ble_connected || connectionMode === 'bluetooth'}
            ip={status?.ip || '192.168.4.1'}
            isConnected={isConnected}
            connectionMode={connectionMode}
          />

          {/* Right Controls: LEDs and Mode Button */}
          <div className="flex flex-col items-end justify-between h-22 py-0.5">
            {/* Status LEDs & Haptic Sound Toggle */}
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSound}
                className="text-slate-500 hover:text-slate-300 transition-colors p-0.5 cursor-pointer"
                title={soundEnabled ? 'Mechanical Switch Audio: On' : 'Mechanical Switch Audio: Muted'}
              >
                {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-sky-400" /> : <VolumeX className="w-3.5 h-3.5 text-slate-600" />}
              </button>

              <div className="flex flex-col items-center gap-0.5">
                <span className={`w-2 h-2 rounded-full transition-all ${
                  connectionMode === 'bluetooth' || status?.connection?.ble_connected
                    ? 'bg-blue-400 shadow-[0_0_8px_#60a5fa]'
                    : 'bg-slate-700'
                }`} />
                <span className="text-[8px] font-mono text-slate-500 font-bold">BT</span>
              </div>

              <div className="flex flex-col items-center gap-0.5">
                <span className={`w-2 h-2 rounded-full transition-all ${
                  status?.wifi_connected
                    ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                    : 'bg-slate-700'
                }`} />
                <span className="text-[8px] font-mono text-slate-500 font-bold">WIFI</span>
              </div>
            </div>

            {/* Hardware Mode Button */}
            <button
              onClick={onToggleMode}
              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 active:scale-95 transition-all text-[11px] font-mono font-bold text-sky-400 flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Click to toggle hardware profile (Mac / TV)"
            >
              <span>MODE</span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-300">{activeMode}</span>
            </button>
          </div>

        </div>

        {/* Lower Section: 4 Mechanical Switches + Rotary Encoder */}
        <div className="grid grid-cols-5 gap-3 items-center">
          
          {/* 4 Mechanical Cherry MX Switches */}
          <div className="col-span-4 grid grid-cols-4 gap-2.5">
            {keys.map((k) => {
              const action = getActionDetails(controls[k.slot]);
              const isSelected = selectedSlot === k.slot;
              const isPressed = pressedKey === k.slot;

              return (
                <button
                  key={k.slot}
                  onClick={() => handleKeyClick(k.slot)}
                  className={`relative flex flex-col items-center justify-between h-28 rounded-xl p-2 transition-all cursor-pointer border ${
                    isPressed
                      ? 'keycap-pressed border-sky-400 bg-slate-900 text-white'
                      : isSelected
                      ? 'keycap-bevel border-sky-400 text-white shadow-lg shadow-sky-500/20'
                      : 'keycap-bevel border-slate-700/70 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <div className="w-full flex items-center justify-between text-[10px] font-mono text-slate-400 font-bold">
                    <span>{k.label}</span>
                    <span className="text-[8px] text-slate-600">{k.pin}</span>
                  </div>

                  <div className="my-auto text-center px-0.5">
                    <div className="text-xs font-bold text-slate-100 line-clamp-2 leading-tight">
                      {action.name}
                    </div>
                  </div>

                  <span className="text-[9px] font-mono text-slate-500 uppercase truncate max-w-full">
                    {action.category}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Rotary Encoder Knob */}
          <div className="col-span-1 flex flex-col items-center justify-center gap-2">
            <button
              onClick={handleDialPress}
              className={`relative w-16 h-16 rounded-full knurled-dial border-2 transition-all flex items-center justify-center cursor-pointer ${
                pressedKey === 'dial' || selectedSlot === 'dial'
                  ? 'border-sky-400 scale-95 shadow-md shadow-sky-500/20'
                  : 'border-slate-600 hover:border-sky-400'
              }`}
              style={{
                transform: `rotate(${dialRotation}deg)`
              }}
              title="Click to push knob (Mute / Select)"
            >
              <div className="absolute top-1.5 w-1 h-2 rounded-full bg-sky-400" />
              <div className="w-7 h-7 rounded-full bg-[#121620] border border-slate-700/80" />
            </button>

            {/* Stepper Buttons for Volume Up/Down */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleDialTurn('ccw')}
                className="p-1.5 rounded-md bg-slate-900 border border-slate-800 hover:border-slate-600 text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Rotate CCW (Vol -)"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
              <button
                onClick={() => handleDialTurn('cw')}
                className="p-1.5 rounded-md bg-slate-900 border border-slate-800 hover:border-slate-600 text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Rotate CW (Vol +)"
              >
                <RotateCw className="w-3 h-3" />
              </button>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
