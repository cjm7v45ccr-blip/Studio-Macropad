import React, { useState } from 'react';
import {
  CanvasViewMode,
  ConflictWarning,
  ControlId,
  CustomMacroItem,
  DeviceConnectionInfo,
  EncoderPlacement,
  HardwareProfileId,
  KeyId,
  LayerConfig,
  LiveInputEvent
} from '../types/studio';
import { KeycapIcon, summarizeAction } from '../data/iconRegistry';
import { describeFirmwareAction } from '../data/firmwareCatalog';
import { soundEngine } from '../services/soundEffects';
import {
  AlertTriangle,
  RotateCcw,
  RotateCw,
  Trash2,
  SlidersHorizontal,
  Play,
  Usb,
  RefreshCw,
  Bluetooth,
  Wifi
} from 'lucide-react';

interface MacropadCanvasProps {
  activeProfileId: HardwareProfileId;
  activeProfileName: string;
  layer: LayerConfig;
  selectedControl: ControlId;
  viewMode: CanvasViewMode;
  encoderPlacement: EncoderPlacement;
  conflicts: ConflictWarning[];
  customMacros: CustomMacroItem[];
  connection: DeviceConnectionInfo;
  isSyncedWithHardware: boolean;
  onSelectControl: (id: ControlId) => void;
  onChangeViewMode: (mode: CanvasViewMode) => void;
  onChangeEncoderPlacement: (placement: EncoderPlacement) => void;
  onToggleHardwareMode: () => void;
  onOpenConnectModal: () => void;
  onPullFromUsb: () => void;
  onExecuteHardwareAction: (actionStr: string) => Promise<boolean>;
}

const KEY_ORDER: KeyId[] = ['k1', 'k2', 'k3', 'k4', 'k5'];

export const MacropadCanvas: React.FC<MacropadCanvasProps> = ({
  activeProfileId,
  activeProfileName,
  layer,
  selectedControl,
  viewMode,
  encoderPlacement,
  conflicts,
  customMacros,
  connection,
  isSyncedWithHardware,
  onSelectControl,
  onChangeViewMode,
  onChangeEncoderPlacement,
  onToggleHardwareMode,
  onOpenConnectModal,
  onPullFromUsb,
  onExecuteHardwareAction
}) => {
  const [pressedKey, setPressedKey] = useState<KeyId | null>(null);
  const [knobAngle, setKnobAngle] = useState(0);
  const [knobPressed, setKnobPressed] = useState(false);
  const [testLog, setTestLog] = useState<LiveInputEvent[]>([]);

  const pushLog = (
    controlLabel: string,
    triggerLabel: string,
    actionSummary: string,
    dispatchedHardware = false
  ) => {
    const now = new Date();
    const timestamp = now.toTimeString().slice(0, 8);
    setTestLog(prev => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp,
        controlLabel,
        triggerLabel,
        actionSummary,
        dispatchedHardware
      },
      ...prev.slice(0, 14)
    ]);
  };

  const hasConflict = (id: ControlId) =>
    conflicts.some(c => c.controlA === id || c.controlB === id);

  const handleKeyPressDown = (kid: KeyId) => {
    setPressedKey(kid);
    soundEngine.playKeyClick();
  };

  const handleKeyPressUp = async (kid: KeyId) => {
    setPressedKey(null);

    if (viewMode === 'edit') {
      onSelectControl(kid);
      return;
    }

    // Live Hardware Test Mode
    const cfg = layer.keys[kid];
    if (!cfg) return;

    if (cfg.isModeSwitch || kid === 'k5') {
      onToggleHardwareMode();
      pushLog(
        'MODE (GPIO 23)',
        'Tap',
        `Switched editor view to ${activeProfileId === 'MAC' ? 'TV' : 'MAC'}`
      );
      return;
    }

    const slotLabel = (cfg.slot || kid).toUpperCase();
    const rawAction = cfg.triggers.tap.value;
    const summary = summarizeAction(cfg.triggers.tap, customMacros);

    if (connection.connected && rawAction) {
      const sent = await onExecuteHardwareAction(rawAction);
      pushLog(slotLabel, 'Tap', summary, sent);
    } else {
      pushLog(slotLabel, 'Tap', summary, false);
    }
  };

  const triggerEncoderSpin = async (dir: 'cw' | 'ccw') => {
    setKnobAngle(a => a + (dir === 'cw' ? 24 : -24));
    soundEngine.playDialTick();

    if (viewMode === 'edit') {
      onSelectControl('encoder');
      return;
    }

    const binding = dir === 'cw' ? layer.encoder.cw : layer.encoder.ccw;
    const summary = summarizeAction(binding, customMacros);
    const label = dir === 'cw' ? 'Turn CW' : 'Turn CCW';

    if (connection.connected && binding.value) {
      const sent = await onExecuteHardwareAction(binding.value);
      pushLog('Encoder', label, summary, sent);
    } else {
      pushLog('Encoder', label, summary, false);
    }
  };

  const handleEncoderWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    triggerEncoderSpin(e.deltaY > 0 ? 'cw' : 'ccw');
  };

  const handleEncoderPressDown = () => {
    setKnobPressed(true);
    soundEngine.playKeyClick();
  };

  const handleEncoderPressUp = async () => {
    setKnobPressed(false);
    if (viewMode === 'edit') {
      onSelectControl('encoder');
      return;
    }

    const binding = layer.encoder.dial;
    const summary = summarizeAction(binding, customMacros);
    if (connection.connected && binding.value) {
      const sent = await onExecuteHardwareAction(binding.value);
      pushLog('Encoder', 'Dial Push', summary, sent);
    } else {
      pushLog('Encoder', 'Dial Push', summary, false);
    }
  };

  const renderEncoderUnit = (size: 'compact' | 'large') => {
    const isSelected = selectedControl === 'encoder' && viewMode === 'edit';
    const outerDim = size === 'large' ? 'w-28 h-28' : 'w-24 h-24';
    const innerDim = size === 'large' ? 'w-20 h-20' : 'w-16 h-16';
    const dialInfo = describeFirmwareAction(layer.encoder.dial.value);
    const cwInfo = describeFirmwareAction(layer.encoder.cw.value);
    const ccwInfo = describeFirmwareAction(layer.encoder.ccw.value);

    return (
      <div className="flex flex-col items-center justify-center gap-1.5">
        <div className="relative flex items-center justify-center">
          {/* CCW Quick Spin */}
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              triggerEncoderSpin('ccw');
            }}
            title={`CCW: ${ccwInfo.fullLabel}`}
            className="p-1.5 rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-black/25 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Physical Knurled Encoder */}
          <div
            role="button"
            tabIndex={0}
            onWheel={handleEncoderWheel}
            onMouseDown={handleEncoderPressDown}
            onMouseUp={handleEncoderPressUp}
            onMouseLeave={() => setKnobPressed(false)}
            style={{
              borderColor: isSelected ? 'var(--accent)' : 'rgba(255,255,255,0.12)',
              boxShadow: isSelected
                ? '0 0 0 3px rgba(var(--accent-rgb), 0.28), 0 12px 24px rgba(0,0,0,0.45)'
                : '0 10px 22px rgba(0,0,0,0.45), inset 0 1px 1px rgba(255,255,255,0.08)'
            }}
            className={`${outerDim} mx-1 rounded-full bg-gradient-to-b from-[#262A34] to-[#171A21] border-2 flex items-center justify-center transition-all cursor-pointer select-none ${
              knobPressed ? 'scale-95' : 'hover:scale-[1.02]'
            }`}
          >
            <div
              style={{
                borderColor: layer.encoder.color,
                transform: `rotate(${knobAngle}deg)`
              }}
              className={`${innerDim} rounded-full bg-[#12141A] border-2 flex items-center justify-center relative transition-transform duration-150 ease-out shadow-inner`}
            >
              <span
                className="w-1.5 h-3 rounded-full absolute top-1.5"
                style={{ backgroundColor: layer.encoder.color }}
              />
              <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-400">
                DIAL
              </span>
            </div>
          </div>

          {/* CW Quick Spin */}
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              triggerEncoderSpin('cw');
            }}
            title={`CW: ${cwInfo.fullLabel}`}
            className="p-1.5 rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-black/25 transition-colors cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <span className="text-[10px] font-mono text-zinc-400 tracking-tight text-center max-w-[140px] truncate">
          {dialInfo.shortLabel} · {ccwInfo.shortLabel}/{cwInfo.shortLabel}
        </span>
      </div>
    );
  };

  const renderKeycap = (kid: KeyId, index: number) => {
    const cfg = layer.keys[kid];
    const isSelected = selectedControl === kid && viewMode === 'edit';
    const isDown = pressedKey === kid;
    const conflict = hasConflict(kid);
    const isUnassigned = !cfg.isModeSwitch && !cfg.triggers.tap.value;

    const badgeText = cfg.isModeSwitch
      ? 'MODE'
      : (cfg.slot || `b${index + 1}`).toUpperCase();

    return (
      <button
        key={kid}
        type="button"
        onMouseDown={() => handleKeyPressDown(kid)}
        onMouseUp={() => handleKeyPressUp(kid)}
        onMouseLeave={() => {
          if (pressedKey === kid) setPressedKey(null);
        }}
        style={{
          borderColor: isSelected
            ? 'var(--accent)'
            : conflict
            ? '#F59E0B'
            : cfg.isModeSwitch
            ? 'rgba(56,189,248,0.35)'
            : 'rgba(255,255,255,0.09)',
          boxShadow: isSelected
            ? '0 0 0 3px rgba(var(--accent-rgb), 0.25), 0 8px 18px rgba(0,0,0,0.4)'
            : isDown
            ? '0 2px 4px rgba(0,0,0,0.5), inset 0 2px 4px rgba(0,0,0,0.4)'
            : '0 8px 0 #101217, 0 12px 20px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.1)'
        }}
        className={`relative w-28 h-28 rounded-2xl bg-gradient-to-b from-[#252933] to-[#1B1E26] border-2 p-2.5 flex flex-col items-center justify-between select-none transition-all cursor-pointer ${
          isDown ? 'translate-y-1.5' : 'hover:-translate-y-0.5'
        } ${isUnassigned ? 'opacity-80' : ''}`}
      >
        {/* Top Row: Hardware Slot Label (B1..B4 / MODE) + Warning */}
        <div className="w-full flex items-center justify-between">
          <span
            className={`font-mono text-[10px] leading-none font-semibold ${
              cfg.isModeSwitch ? 'text-sky-400' : 'text-zinc-400'
            }`}
          >
            {badgeText}
          </span>
          {conflict ? (
            <AlertTriangle className="w-3 h-3 text-amber-400" />
          ) : cfg.triggers.tap.value ? (
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: cfg.appearance.labelColor }}
            />
          ) : null}
        </div>

        {/* Center Icon */}
        <div className="my-auto flex items-center justify-center">
          <KeycapIcon
            icon={cfg.appearance.icon}
            className="w-6 h-6 transition-transform"
            style={{ color: cfg.appearance.labelColor }}
          />
        </div>

        {/* Bottom Legend */}
        <span
          className={`text-[11px] font-medium truncate max-w-full tracking-tight ${
            isUnassigned ? 'text-zinc-500 italic' : 'text-zinc-200'
          }`}
        >
          {cfg.appearance.label}
        </span>
      </button>
    );
  };

  const telemetry = connection.telemetry;

  return (
    <div className="flex-1 flex flex-col items-center justify-between p-6 overflow-y-auto relative">
      {/* Top Canvas Controls */}
      <div className="w-full max-w-2xl flex items-center justify-between gap-3 flex-wrap">
        {/* Edit vs Live USB Test Toggle */}
        <div className="flex items-center p-1 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => onChangeViewMode('edit')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              viewMode === 'edit'
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Configure</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeViewMode('test')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              viewMode === 'test'
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span>Live Hardware Test</span>
          </button>
        </div>

        {/* Encoder Layout Option */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
          <span className="text-[11px] text-[var(--text-muted)] px-2">Dial View:</span>
          <button
            type="button"
            onClick={() => onChangeEncoderPlacement('grid')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              encoderPlacement === 'grid'
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            2×3 Grid
          </button>
          <button
            type="button"
            onClick={() => onChangeEncoderPlacement('top')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              encoderPlacement === 'top'
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            Top Crown
          </button>
        </div>
      </div>

      {/* Zero-Preset USB Sync Status Banner */}
      {!connection.connected && !isSyncedWithHardware && (
        <div className="w-full max-w-2xl mt-3 px-4 py-3 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <Usb className="w-4 h-4 text-[var(--accent)] shrink-0" />
            <div className="text-xs text-[var(--text-secondary)]">
              <strong className="text-[var(--text-primary)]">Zero presets loaded.</strong>{' '}
              Connect your MacroPad via USB to pull its live `MAC` & `TV` macros directly into the studio.
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenConnectModal}
            style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap"
          >
            Connect USB Port
          </button>
        </div>
      )}

      {/* Center: Physical Anodized Aluminum MacroPad */}
      <div className="my-auto py-6 flex flex-col items-center justify-center">
        <div
          className="rounded-[34px] p-7 bg-gradient-to-b from-[#20232C] to-[#14161C] border border-white/10 shadow-[0_28px_60px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.08)]"
          style={{ minWidth: '340px' }}
        >
          {/* Simulated 128x64 SSD1306 Hardware OLED Strip */}
          <div className="mb-6 px-3.5 py-2.5 rounded-xl bg-[#090B0E] border border-white/10 shadow-inner flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: layer.color }}
              />
              <span className="font-mono text-[11px] font-bold text-sky-300 uppercase tracking-wider">
                {activeProfileName} ({activeProfileId})
              </span>
            </div>

            <div className="flex items-center gap-2.5 font-mono text-[10px]">
              {connection.connected ? (
                <>
                  <span
                    className={`flex items-center gap-1 ${
                      telemetry?.bleConnected ? 'text-sky-400' : 'text-zinc-600'
                    }`}
                    title={telemetry?.bleConnected ? 'BLE Keyboard Connected' : 'BLE Idle'}
                  >
                    <Bluetooth className="w-3 h-3" />
                    <span>BLE</span>
                  </span>
                  <span
                    className={`flex items-center gap-1 ${
                      telemetry?.wifiConnected ? 'text-emerald-400' : 'text-zinc-600'
                    }`}
                    title={
                      telemetry?.wifiConnected
                        ? `Wi-Fi: ${telemetry.ssid || telemetry.ip}`
                        : 'Wi-Fi Offline'
                    }
                  >
                    <Wifi className="w-3 h-3" />
                    <span>{telemetry?.wifiConnected ? 'WIFI' : 'OFF'}</span>
                  </span>
                  <button
                    type="button"
                    onClick={onPullFromUsb}
                    title="Re-read hardware bindings over USB"
                    className="text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    <span>LIVE</span>
                  </button>
                </>
              ) : (
                <span className="text-zinc-500">
                  {viewMode === 'test' ? 'SIM TEST' : 'USB OFFLINE'}
                </span>
              )}
            </div>
          </div>

          {encoderPlacement === 'top' ? (
            <div className="flex flex-col items-center gap-6">
              {renderEncoderUnit('large')}
              <div className="grid grid-cols-3 gap-4 justify-items-center">
                {KEY_ORDER.map((kid, idx) => renderKeycap(kid, idx))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4 items-center justify-items-center">
              {KEY_ORDER.map((kid, idx) => renderKeycap(kid, idx))}
              {renderEncoderUnit('compact')}
            </div>
          )}
        </div>
      </div>

      {/* Bottom: Conflict Alert or Live Hardware Test Feed */}
      <div className="w-full max-w-2xl space-y-2">
        {conflicts.length > 0 && viewMode === 'edit' && (
          <div className="px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-2.5 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>{conflicts[0].summary}</span>
          </div>
        )}

        {viewMode === 'test' && (
          <div className="rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-3.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">
                Live Input Tester{' '}
                {connection.connected
                  ? '— Clicking keys or dial executes `/api/test/action` live on your MacroPad'
                  : '— Connect USB to fire real actions on your MacroPad'}
              </span>
              {testLog.length > 0 && (
                <button
                  type="button"
                  onClick={() => setTestLog([])}
                  className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            {testLog.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] py-2">
                Click B1–B4, press the Dial, or spin CW/CCW above to test your synced macros.
              </p>
            ) : (
              <div className="max-h-28 overflow-y-auto space-y-1 font-mono text-[11px]">
                {testLog.map(item => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 py-1 px-2 rounded bg-[var(--bg-input)]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[var(--text-muted)]">{item.timestamp}</span>
                      <span className="font-semibold text-[var(--text-primary)]">
                        {item.controlLabel}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] text-[10px] text-[var(--accent)]">
                        {item.triggerLabel}
                      </span>
                      {item.dispatchedHardware && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[9px] font-bold">
                          USB SENT
                        </span>
                      )}
                    </div>
                    <span className="text-[var(--text-secondary)] truncate">
                      {item.actionSummary}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
