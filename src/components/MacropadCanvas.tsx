import React, { useState, useEffect, useRef } from 'react';
import {
  ActionBinding,
  BleHostSlot,
  CanvasViewMode,
  ConflictWarning,
  ControlId,
  CustomMacroItem,
  DeviceConnectionInfo,
  EncoderPlacement,
  HardwareEventPacket,
  HardwareFlashSlot,
  HardwareProfileId,
  KeyId,
  LayerConfig,
  LiveInputEvent,
  bleSlotToProfileId,
  defaultProfileAlias,
  isBleHostProfile,
  normalizeHardwareProfileId,
  profileIdToBleSlot
} from '../types/studio';
import { KeycapIcon, summarizeAction } from '../data/iconRegistry';
import { describeFirmwareAction } from '../data/firmwareCatalog';
import { usbHardware } from '../services/usbHardwareService';
import { soundEngine } from '../services/soundEffects';
import {
  AlertTriangle,
  AlertCircle,
  RotateCcw,
  RotateCw,
  Trash2,
  SlidersHorizontal,
  Play,
  Usb,
  RefreshCw,
  Bluetooth,
  Wifi,
  PlayCircle,
  Disc
} from 'lucide-react';

interface MacropadCanvasProps {
  activeProfileId: HardwareProfileId;
  activeProfileName: string;
  layer: LayerConfig;
  selectedControl: ControlId;
  viewMode: CanvasViewMode;
  encoderPlacement: EncoderPlacement;
  liveEventsEnabled: boolean;
  conflicts: ConflictWarning[];
  customMacros: CustomMacroItem[];
  connection: DeviceConnectionInfo;
  isSyncedWithHardware: boolean;
  onSelectControl: (id: ControlId) => void;
  onSelectProfile: (id: HardwareProfileId) => void;
  onChangeViewMode: (mode: CanvasViewMode) => void;
  onChangeEncoderPlacement: (placement: EncoderPlacement) => void;
  onToggleHardwareMode: () => void;
  onConnectUsbPad: () => void;
  onStartDemoMode: () => void;
  onPullFromUsb: () => void;
  onExecuteHardwareBinding: (binding: ActionBinding) => Promise<boolean>;
  onSwitchBleHost: (slot: BleHostSlot) => Promise<void> | void;
  onOpenSetupWizard?: () => void;
}

const KEY_ORDER: KeyId[] = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9'];

const SLOT_TO_KEY: Record<string, KeyId> = {
  b1: 'k1',
  b2: 'k2',
  b3: 'k3',
  b4: 'k4',
  b5: 'k5',
  b6: 'k6',
  b7: 'k7',
  b8: 'k8',
  mode: 'k9'
};

const ELEVEN_CONTROLS: { id: ControlId; label: string }[] = [
  { id: 'k1', label: 'Key 1' },
  { id: 'k2', label: 'Key 2' },
  { id: 'k3', label: 'Key 3' },
  { id: 'k4', label: 'Key 4' },
  { id: 'k5', label: 'Key 5' },
  { id: 'k6', label: 'Key 6' },
  { id: 'k7', label: 'Key 7' },
  { id: 'k8', label: 'Key 8' },
  { id: 'dial', label: 'Knob Press' },
  { id: 'enc_cw', label: 'Turn Right' },
  { id: 'enc_ccw', label: 'Turn Left' }
];

export const MacropadCanvas: React.FC<MacropadCanvasProps> = ({
  activeProfileId,
  activeProfileName,
  layer,
  selectedControl,
  viewMode,
  encoderPlacement,
  liveEventsEnabled,
  conflicts,
  customMacros,
  connection,
  isSyncedWithHardware,
  onSelectControl,
  onSelectProfile,
  onChangeViewMode,
  onChangeEncoderPlacement,
  onToggleHardwareMode,
  onConnectUsbPad,
  onStartDemoMode,
  onPullFromUsb,
  onExecuteHardwareBinding,
  onSwitchBleHost,
  onOpenSetupWizard
}) => {
  const [pressedKey, setPressedKey] = useState<KeyId | null>(null);
  const [knobAngle, setKnobAngle] = useState(0);
  const [knobPressed, setKnobPressed] = useState(false);
  const [flashedSlots, setFlashedSlots] = useState<Set<HardwareFlashSlot>>(new Set());
  const [testLog, setTestLog] = useState<LiveInputEvent[]>([]);
  const [offlineBleHost, setOfflineBleHost] = useState<BleHostSlot>(1);

  useEffect(() => {
    const slotFromProf = profileIdToBleSlot(activeProfileId);
    if (slotFromProf) {
      setOfflineBleHost(slotFromProf);
    }
  }, [activeProfileId]);

  const flashTimersRef = useRef<Record<string, number>>({});
  const pendingAngleDeltaRef = useRef<number>(0);
  const angleRafRef = useRef<number | null>(null);
  const layerRef = useRef(layer);
  layerRef.current = layer;
  const customMacrosRef = useRef(customMacros);
  customMacrosRef.current = customMacros;
  const liveEventsEnabledRef = useRef(liveEventsEnabled);
  liveEventsEnabledRef.current = liveEventsEnabled;

  const queueKnobAngleDelta = (deltaDeg: number) => {
    pendingAngleDeltaRef.current += deltaDeg;
    if (angleRafRef.current === null) {
      angleRafRef.current = window.requestAnimationFrame(() => {
        const d = pendingAngleDeltaRef.current;
        pendingAngleDeltaRef.current = 0;
        angleRafRef.current = null;
        if (d !== 0) {
          setKnobAngle(a => a + d);
        }
      });
    }
  };

  const pushLog = (
    controlLabel: string,
    triggerLabel: string,
    actionSummary: string,
    source: LiveInputEvent['source'] = 'sim'
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
        source
      },
      ...prev.slice(0, 29)
    ]);
  };

  /**
   * Light up the on-screen key or knob when physical `press` / `turn` / `profile` events arrive over USB.
   * Coalesces rapid knob turns via rAF so fast spinning never lags or freezes the page.
   */
  useEffect(() => {
    const triggerSlotFlash = (slot: HardwareFlashSlot) => {
      setFlashedSlots(prev => {
        if (prev.has(slot)) return prev;
        const next = new Set(prev);
        next.add(slot);
        return next;
      });

      if (flashTimersRef.current[slot]) {
        window.clearTimeout(flashTimersRef.current[slot]);
      }
      flashTimersRef.current[slot] = window.setTimeout(() => {
        setFlashedSlots(prev => {
          if (!prev.has(slot)) return prev;
          const next = new Set(prev);
          next.delete(slot);
          return next;
        });
      }, 260);
    };

    const unsub = usbHardware.onHardwareEvent((e: HardwareEventPacket) => {
      if (!liveEventsEnabledRef.current) return;

      if (e.event === 'profile') {
        triggerSlotFlash('mode');
        soundEngine.playKeyClick();
        const currHost = usbHardware.info.telemetry?.bleActiveHost ?? 1;
        const nextProf = defaultProfileAlias(
          normalizeHardwareProfileId(e.active || e.profile, currHost)
        );
        pushLog('Mode', 'Press', `Switched profile to ${nextProf}`, 'hardware');
        return;
      }

      if (e.event === 'ble_host') {
        const hostNum = e.ble_slot === 2 ? 2 : e.ble_slot === 3 ? 3 : 1;
        triggerSlotFlash('mode');
        soundEngine.playDialTick();
        pushLog(
          'Mode + Dial',
          `[H${hostNum}]`,
          `Switched BLE to Studio Pad ${hostNum} (Host ${hostNum})`,
          'hardware'
        );
        return;
      }

      if (e.event !== 'press' && e.event !== 'turn') return;

      const rawSlot = String(e.slot || '').toLowerCase();
      const rawDir = String(e.dir || '').toLowerCase();
      const currLayer = layerRef.current;
      const macros = customMacrosRef.current;

      // Rotary Turn (`enc_cw` / `enc_ccw` or `turn` + `dir`)
      if (
        e.event === 'turn' ||
        rawSlot === 'enc_cw' ||
        rawSlot === 'enc_ccw' ||
        rawSlot === 'cw' ||
        rawSlot === 'ccw'
      ) {
        const isCcw =
          rawSlot === 'enc_ccw' || rawSlot === 'ccw' || rawDir === 'ccw';
        const flashId: HardwareFlashSlot = isCcw ? 'enc_ccw' : 'enc_cw';

        queueKnobAngleDelta(isCcw ? -24 : 24);
        soundEngine.playDialTick();
        triggerSlotFlash(flashId);

        const binding = isCcw ? currLayer.encoder.ccw : currLayer.encoder.cw;
        const actionDesc = binding.repeatConfig
          ? summarizeAction(binding, macros)
          : e.action
          ? describeFirmwareAction(e.action).fullLabel
          : summarizeAction(binding, macros);
        pushLog(
          isCcw ? 'Turn Left' : 'Turn Right',
          isCcw ? 'CCW' : 'CW',
          actionDesc,
          'hardware'
        );
        return;
      }

      // Encoder Push (`dial`)
      if (rawSlot === 'dial') {
        soundEngine.playKeyClick();
        triggerSlotFlash('dial');
        const dialBinding = currLayer.encoder.dial;
        const actionDesc = dialBinding.repeatConfig
          ? summarizeAction(dialBinding, macros)
          : e.action
          ? describeFirmwareAction(e.action).fullLabel
          : summarizeAction(dialBinding, macros);
        pushLog('Knob Press', 'Press', actionDesc, 'hardware');
        return;
      }

      // Mechanical Key Press (`b1`..`b8` or `mode`)
      const mappedKey = SLOT_TO_KEY[rawSlot];
      if (mappedKey) {
        soundEngine.playKeyClick();
        triggerSlotFlash(rawSlot as HardwareFlashSlot);
        if (mappedKey === 'k9') {
          return;
        }
        const keyCfg = currLayer.keys[mappedKey];
        const keyNum = mappedKey.slice(1);
        const actionDesc = keyCfg.triggers.tap.repeatConfig
          ? summarizeAction(keyCfg.triggers.tap, macros)
          : e.action
          ? describeFirmwareAction(e.action).fullLabel
          : summarizeAction(keyCfg.triggers.tap, macros);
        pushLog(`Key ${keyNum}`, 'Press', actionDesc, 'hardware');
      }
    });

    return () => {
      unsub();
      if (angleRafRef.current !== null) {
        window.cancelAnimationFrame(angleRafRef.current);
      }
      Object.values(flashTimersRef.current).forEach(id => window.clearTimeout(id));
    };
  }, []);

  const hasConflict = (id: ControlId) =>
    conflicts.some(c => c.controlA === id || c.controlB === id);

  const activateKeyControl = async (kid: KeyId) => {
    soundEngine.playKeyClick();

    if (viewMode === 'edit') {
      onSelectControl(kid);
      return;
    }

    if (connection.transport === 'demo') {
      const slotMap: Record<KeyId, HardwareFlashSlot> = {
        k1: 'b1',
        k2: 'b2',
        k3: 'b3',
        k4: 'b4',
        k5: 'b5',
        k6: 'b6',
        k7: 'b7',
        k8: 'b8',
        k9: 'mode'
      };
      usbHardware.simulateDemoPadInput(slotMap[kid]);
      return;
    }

    const cfg = layer.keys[kid];
    if (!cfg) return;

    if (cfg.isModeSwitch || kid === 'k9') {
      const targetLabel =
        activeProfileId === 'TV' ? `Host ${activeBleHost}` : 'TV';
      onToggleHardwareMode();
      pushLog(
        'Mode',
        'Press',
        `Activated ${targetLabel} profile`,
        connection.connected ? 'usb-test' : 'sim'
      );
      return;
    }

    const keyLabel = `Key ${kid.slice(1)}`;
    const tapBinding = cfg.triggers.tap;
    const summary = summarizeAction(tapBinding, customMacros);

    if (connection.connected && tapBinding.value) {
      const sent = await onExecuteHardwareBinding(tapBinding);
      pushLog(keyLabel, 'Press', summary, sent ? 'usb-test' : 'sim');
    } else {
      if (
        tapBinding.value === 'BLE:HOST1' ||
        tapBinding.value === 'BLE:HOST2' ||
        tapBinding.value === 'BLE:HOST3'
      ) {
        const targetSlot = Number(tapBinding.value.slice(-1)) as BleHostSlot;
        setOfflineBleHost(targetSlot);
        onSelectProfile(bleSlotToProfileId(targetSlot));
      } else if (tapBinding.value === 'BLE:NEXT_HOST') {
        const nextSlot = (((activeBleHost % 3) + 1) as BleHostSlot);
        setOfflineBleHost(nextSlot);
        onSelectProfile(bleSlotToProfileId(nextSlot));
      }
      pushLog(keyLabel, 'Press', summary, 'sim');
    }
  };

  const viewedBleHost = profileIdToBleSlot(activeProfileId);
  const activeBleHost: BleHostSlot = connection.connected
    ? connection.telemetry?.bleActiveHost ?? 1
    : viewedBleHost ?? offlineBleHost;
  const oledBadgeHost: BleHostSlot = viewedBleHost ?? activeBleHost;

  const triggerModePlusDialHostSwitch = async (dir: 'cw' | 'ccw') => {
    queueKnobAngleDelta(dir === 'cw' ? 24 : -24);
    soundEngine.playDialTick();

    const delta = dir === 'cw' ? 1 : -1;
    if (connection.transport === 'demo') {
      usbHardware.simulateDemoHostCycle(delta);
      return;
    }

    const baseHost = viewedBleHost ?? activeBleHost;
    const nextIdx = (baseHost - 1 + (delta > 0 ? 1 : 2)) % 3;
    const nextSlot = (nextIdx + 1) as BleHostSlot;

    if (connection.connected) {
      await onSwitchBleHost(nextSlot);
      pushLog(
        'Mode + Dial',
        `[H${nextSlot}]`,
        `Switched BLE to Studio Pad ${nextSlot} (Host ${nextSlot})`,
        'usb-test'
      );
    } else {
      setOfflineBleHost(nextSlot);
      onSelectProfile(bleSlotToProfileId(nextSlot));
      pushLog(
        'Mode + Dial',
        `[H${nextSlot}]`,
        `Switched workspace to Host ${nextSlot} (Studio Pad ${nextSlot})`,
        'sim'
      );
    }
  };

  const triggerEncoderSpin = async (dir: 'cw' | 'ccw', holdModeCombo = false) => {
    if (viewMode === 'test' && (holdModeCombo || pressedKey === 'k9')) {
      await triggerModePlusDialHostSwitch(dir);
      return;
    }

    const subId: ControlId = dir === 'cw' ? 'enc_cw' : 'enc_ccw';
    queueKnobAngleDelta(dir === 'cw' ? 24 : -24);
    soundEngine.playDialTick();

    if (viewMode === 'edit') {
      onSelectControl(subId);
      return;
    }

    if (connection.transport === 'demo') {
      usbHardware.simulateDemoPadInput(subId);
      return;
    }

    const binding = dir === 'cw' ? layer.encoder.cw : layer.encoder.ccw;
    const summary = summarizeAction(binding, customMacros);
    const label = dir === 'cw' ? 'Turn Right' : 'Turn Left';

    if (connection.connected && binding.value) {
      const sent = await onExecuteHardwareBinding(binding);
      pushLog(label, dir.toUpperCase(), summary, sent ? 'usb-test' : 'sim');
    } else {
      pushLog(label, dir.toUpperCase(), summary, 'sim');
    }
  };

  const handleEncoderWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    triggerEncoderSpin(e.deltaY > 0 ? 'cw' : 'ccw', e.shiftKey);
  };

  const activateDialPush = async () => {
    soundEngine.playKeyClick();
    if (viewMode === 'edit') {
      onSelectControl('dial');
      return;
    }

    if (connection.transport === 'demo') {
      usbHardware.simulateDemoPadInput('dial');
      return;
    }

    const binding = layer.encoder.dial;
    const summary = summarizeAction(binding, customMacros);
    if (connection.connected && binding.value) {
      const sent = await onExecuteHardwareBinding(binding);
      pushLog('Knob Press', 'Press', summary, sent ? 'usb-test' : 'sim');
    } else {
      pushLog('Knob Press', 'Press', summary, 'sim');
    }
  };

  const renderEncoderUnit = (size: 'compact' | 'large') => {
    const isDialSelected =
      (selectedControl === 'dial' || selectedControl === 'encoder') && viewMode === 'edit';
    const isCwSelected = selectedControl === 'enc_cw' && viewMode === 'edit';
    const isCcwSelected = selectedControl === 'enc_ccw' && viewMode === 'edit';

    const isDialFlashed = flashedSlots.has('dial');
    const isCwFlashed = flashedSlots.has('enc_cw');
    const isCcwFlashed = flashedSlots.has('enc_ccw');

    const outerDim =
      size === 'large'
        ? 'w-20 h-20 sm:w-26 sm:h-26'
        : 'w-16 h-16 sm:w-20 sm:h-20';
    const innerDim =
      size === 'large'
        ? 'w-14 h-14 sm:w-18 sm:h-18'
        : 'w-11 h-11 sm:w-14 sm:h-14';

    const dialInfo = describeFirmwareAction(
      layer.encoder.dial.value,
      layer.encoder.dial.repeatConfig
    );
    const cwInfo = describeFirmwareAction(
      layer.encoder.cw.value,
      layer.encoder.cw.repeatConfig
    );
    const ccwInfo = describeFirmwareAction(
      layer.encoder.ccw.value,
      layer.encoder.ccw.repeatConfig
    );

    return (
      <div className="flex flex-col items-center justify-center gap-1">
        <div className="relative flex items-center justify-center gap-0.5 sm:gap-1">
          {/* Turn Left (`enc_ccw`) Control */}
          <button
            type="button"
            aria-label={`Turn Left: ${ccwInfo.fullLabel}`}
            onClick={e => {
              e.stopPropagation();
              triggerEncoderSpin('ccw');
            }}
            title={`Turn Left: ${ccwInfo.fullLabel}`}
            style={
              isCcwSelected
                ? {
                    borderColor: 'var(--accent)',
                    backgroundColor: 'rgba(var(--accent-rgb), 0.22)'
                  }
                : undefined
            }
            className={`p-1.5 rounded-full border transition-all cursor-pointer ${
              isCcwFlashed
                ? 'bg-sky-500/30 border-sky-400 text-sky-300 scale-125 shadow-[0_0_14px_rgba(56,189,248,0.55)]'
                : isCcwSelected
                ? 'text-[var(--text-primary)]'
                : 'border-transparent text-zinc-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>

          {/* Knob Press (`dial`) Control */}
          <button
            type="button"
            aria-label={`Knob Press: ${dialInfo.fullLabel}`}
            onWheel={handleEncoderWheel}
            onMouseDown={() => setKnobPressed(true)}
            onMouseUp={() => setKnobPressed(false)}
            onMouseLeave={() => setKnobPressed(false)}
            onClick={activateDialPush}
            onKeyDown={e => {
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                triggerEncoderSpin('cw');
              } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                triggerEncoderSpin('ccw');
              }
            }}
            style={{
              borderColor: isDialFlashed
                ? '#38BDF8'
                : isDialSelected
                ? 'var(--accent)'
                : 'rgba(255,255,255,0.14)',
              boxShadow: isDialFlashed
                ? '0 0 0 4px rgba(56, 189, 248, 0.45), 0 0 24px rgba(56, 189, 248, 0.35)'
                : isDialSelected
                ? '0 0 0 3px rgba(var(--accent-rgb), 0.3), 0 10px 20px rgba(0,0,0,0.45)'
                : '0 8px 18px rgba(0,0,0,0.45), inset 0 1px 1px rgba(255,255,255,0.08)'
            }}
            className={`${outerDim} rounded-full bg-gradient-to-b from-[#262A34] to-[#171A21] border-2 flex items-center justify-center transition-all cursor-pointer select-none ${
              knobPressed || isDialFlashed ? 'scale-95' : 'hover:scale-[1.02]'
            }`}
          >
            <span
              style={{
                borderColor: isDialFlashed ? '#38BDF8' : layer.encoder.color,
                transform: `rotate(${knobAngle}deg)`
              }}
              className={`${innerDim} rounded-full bg-[#12141A] border-2 flex items-center justify-center relative transition-transform duration-100 ease-out shadow-inner`}
            >
              <span
                className="w-1.5 h-2.5 rounded-full absolute top-1"
                style={{
                  backgroundColor: isDialFlashed ? '#38BDF8' : layer.encoder.color
                }}
              />
              <span className="font-mono text-[8px] sm:text-[9px] uppercase tracking-wider text-zinc-300">
                KNOB
              </span>
            </span>
          </button>

          {/* Turn Right (`enc_cw`) Control */}
          <button
            type="button"
            aria-label={`Turn Right: ${cwInfo.fullLabel}`}
            onClick={e => {
              e.stopPropagation();
              triggerEncoderSpin('cw');
            }}
            title={`Turn Right: ${cwInfo.fullLabel}`}
            style={
              isCwSelected
                ? {
                    borderColor: 'var(--accent)',
                    backgroundColor: 'rgba(var(--accent-rgb), 0.22)'
                  }
                : undefined
            }
            className={`p-1.5 rounded-full border transition-all cursor-pointer ${
              isCwFlashed
                ? 'bg-sky-500/30 border-sky-400 text-sky-300 scale-125 shadow-[0_0_14px_rgba(56,189,248,0.55)]'
                : isCwSelected
                ? 'text-[var(--text-primary)]'
                : 'border-transparent text-zinc-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <RotateCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>

        <span className="text-[9px] sm:text-[10px] font-mono text-zinc-400 tracking-tight text-center max-w-[115px] sm:max-w-[140px] truncate">
          {dialInfo.shortLabel} · {ccwInfo.shortLabel}/{cwInfo.shortLabel}
        </span>
      </div>
    );
  };

  const renderKeycap = (kid: KeyId, index: number) => {
    const cfg = layer.keys[kid];
    const slotKey: HardwareFlashSlot = cfg.isModeSwitch
      ? 'mode'
      : cfg.slot || (`b${index + 1}` as HardwareFlashSlot);
    const isFlashed = flashedSlots.has(slotKey);
    const isSelected = selectedControl === kid && viewMode === 'edit';
    const isDown = pressedKey === kid || isFlashed;
    const conflict = hasConflict(kid);
    const isUnassigned = !cfg.isModeSwitch && !cfg.triggers.tap.value;

    const badgeText = cfg.isModeSwitch ? 'MODE' : `KEY ${index + 1}`;

    return (
      <button
        key={kid}
        type="button"
        aria-label={`${badgeText}: ${cfg.appearance.label}`}
        onMouseDown={() => setPressedKey(kid)}
        onMouseUp={() => setPressedKey(null)}
        onMouseLeave={() => {
          if (pressedKey === kid) setPressedKey(null);
        }}
        onClick={() => activateKeyControl(kid)}
        style={{
          borderColor: isFlashed
            ? '#38BDF8'
            : isSelected
            ? 'var(--accent)'
            : conflict
            ? '#F59E0B'
            : cfg.isModeSwitch
            ? 'rgba(56,189,248,0.35)'
            : 'rgba(255,255,255,0.09)',
          boxShadow: isFlashed
            ? '0 0 0 4px rgba(56, 189, 248, 0.45), 0 0 24px rgba(56, 189, 248, 0.35)'
            : isSelected
            ? '0 0 0 3px rgba(var(--accent-rgb), 0.28), 0 8px 18px rgba(0,0,0,0.4)'
            : isDown
            ? '0 2px 4px rgba(0,0,0,0.5), inset 0 2px 4px rgba(0,0,0,0.4)'
            : '0 6px 0 #101217, 0 10px 18px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.1)'
        }}
        className={`relative w-[82px] h-[82px] sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-b from-[#252933] to-[#1B1E26] border-2 p-2 sm:p-2.5 flex flex-col items-center justify-between select-none transition-all cursor-pointer ${
          isDown ? 'translate-y-1' : 'hover:-translate-y-0.5'
        } ${isUnassigned && !isFlashed ? 'opacity-80' : ''}`}
      >
        <div className="w-full flex items-center justify-between">
          <span
            className={`font-mono text-[9px] sm:text-[10px] leading-none font-semibold ${
              isFlashed || cfg.isModeSwitch ? 'text-sky-400' : 'text-zinc-400'
            }`}
          >
            {badgeText}
          </span>
          {conflict ? (
            <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
          ) : cfg.triggers.tap.value ? (
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{
                backgroundColor: isFlashed ? '#38BDF8' : cfg.appearance.labelColor
              }}
            />
          ) : null}
        </div>

        <div className="my-auto flex items-center justify-center">
          <KeycapIcon
            icon={cfg.appearance.icon}
            className={`w-5 h-5 sm:w-6 sm:h-6 transition-transform ${
              isFlashed ? 'scale-110' : ''
            }`}
            style={{ color: isFlashed ? '#38BDF8' : cfg.appearance.labelColor }}
          />
        </div>

        <span
          className={`text-[10px] sm:text-[11px] font-medium truncate max-w-full tracking-tight ${
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
    <div className="flex-1 flex flex-col items-center justify-between p-3 sm:p-6 lg:overflow-y-auto relative min-w-0">
      {/* Top Canvas Controls */}
      <div className="w-full max-w-2xl flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center p-1 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => onChangeViewMode('edit')}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
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
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              viewMode === 'test'
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span>Test</span>
          </button>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
          <span className="text-[11px] text-[var(--text-muted)] px-1.5 hidden sm:inline whitespace-nowrap">
            Knob Layout:
          </span>
          <button
            type="button"
            onClick={() => onChangeEncoderPlacement('grid')}
            className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              encoderPlacement === 'grid'
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            Side Knob
          </button>
          <button
            type="button"
            onClick={() => onChangeEncoderPlacement('top')}
            className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              encoderPlacement === 'top'
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            Top Crown
          </button>
        </div>
      </div>

      {/* Unsupported Browser Banner (Firefox / Safari) */}
      {!usbHardware.browserSupportsWebSerial && !connection.connected && (
        <div className="w-full max-w-2xl mt-3 px-4 py-3 rounded-xl bg-amber-500/12 border border-amber-500/35 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-200 leading-relaxed">
              <strong className="text-amber-300">Unsupported browser:</strong> Web Serial is
              only available in <strong>Chrome</strong> or <strong>Edge</strong> on desktop
              over HTTPS. You can explore the full app right now in demo mode.
            </div>
          </div>
          <button
            type="button"
            onClick={onStartDemoMode}
            style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <PlayCircle className="w-3.5 h-3.5" />
            <span>Try demo mode</span>
          </button>
        </div>
      )}

      {/* Active Hardware Setup Mode Banner */}
      {connection.connected && connection.telemetry?.setupMode && onOpenSetupWizard && (
        <div className="w-full max-w-2xl mt-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/35 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <SlidersHorizontal className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
              <strong className="text-amber-300">Board is in Setup Mode.</strong> Choose your OS starter layout, name your 3 Bluetooth host slots, and optionally pair Wi-Fi or SmartCast TV.
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenSetupWizard}
            className="px-3.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/45 text-xs font-semibold text-amber-200 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 shrink-0"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Open Setup Wizard</span>
          </button>
        </div>
      )}

      {/* Connect / Demo Prompt Banner when disconnected on supported browsers */}
      {usbHardware.browserSupportsWebSerial && !connection.connected && !isSyncedWithHardware && (
        <div className="w-full max-w-2xl mt-3 px-3.5 py-3 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <Usb className="w-4 h-4 text-[var(--accent)] shrink-0" />
            <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
              <strong className="text-[var(--text-primary)]">No pad connected.</strong> Plug in
              your Studio Pad over USB to load its real profiles, or run demo mode with no pad
              attached.
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              type="button"
              onClick={onConnectUsbPad}
              className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap flex items-center gap-1.5"
            >
              <Usb className="w-3.5 h-3.5" />
              <span>Connect USB pad</span>
            </button>
            <button
              type="button"
              onClick={onStartDemoMode}
              className="px-3 py-1.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5"
            >
              <PlayCircle className="w-3.5 h-3.5 text-emerald-400" />
              <span>Try demo mode</span>
            </button>
            {onOpenSetupWizard && (
              <button
                type="button"
                onClick={onOpenSetupWizard}
                className="px-3 py-1.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Guided Setup</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Center: Physical Anodized Aluminum 9-Button MacroPad + 11-Control Quick Bar */}
      <div className="my-auto py-3 sm:py-5 flex flex-col items-center justify-center w-full gap-3.5">
        <div
          className={`w-full ${
            encoderPlacement === 'top'
              ? 'max-w-[340px] sm:max-w-[392px]'
              : 'max-w-[340px] sm:max-w-[536px]'
          } rounded-[28px] sm:rounded-[34px] p-4 sm:p-6 bg-gradient-to-b from-[#20232C] to-[#14161C] border border-white/10 shadow-[0_28px_60px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.08)]`}
        >
          {/* 128x64 SSD1306 Hardware OLED Strip */}
          <div className="mb-4 sm:mb-5 px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-xl bg-[#090B0E] border border-white/10 shadow-inner flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  backgroundColor:
                    connection.connected && connection.telemetry?.setupMode
                      ? '#F59E0B'
                      : layer.color
                }}
              />
              <span
                className={`font-mono text-[10px] sm:text-[11px] font-bold uppercase tracking-wider truncate tabular-nums ${
                  connection.connected && connection.telemetry?.setupMode
                    ? 'text-amber-300'
                    : 'text-sky-300'
                }`}
              >
                {connection.connected && connection.telemetry?.setupMode
                  ? `SETUP · ${activeProfileName}`
                  : activeProfileName}
              </span>
            </div>

            <div className="flex items-center gap-2 font-mono text-[10px] shrink-0">
              {connection.connected ? (
                <>
                  <span
                    className={`flex items-center gap-0.5 ${
                      telemetry?.bleConnected ? 'text-sky-400' : 'text-zinc-600'
                    }`}
                    title={
                      telemetry?.bleConnected
                        ? `BLE Connected · ${telemetry.bleDeviceName || `Studio Pad ${activeBleHost}`}`
                        : `BLE Disconnected · ${telemetry?.bleDeviceName || `Studio Pad ${activeBleHost}`}`
                    }
                  >
                    <Bluetooth className="w-3 h-3" />
                    <span>BLE</span>
                  </span>
                  <span
                    className={`flex items-center gap-0.5 ${
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
                    title="Refresh status & all 4 profiles"
                    className="text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    <span>{connection.transport === 'demo' ? 'DEMO' : 'LIVE'}</span>
                  </button>
                </>
              ) : (
                <span className="text-zinc-500">
                  {connection.connecting ? 'CONNECTING…' : 'OFFLINE'}
                </span>
              )}

              {/* Hardware SSD1306 Upper-Right Host Badge in BLE Host Mode ([H1], [H2], [H3]) */}
              {isBleHostProfile(activeProfileId) && (
                <button
                  type="button"
                  onClick={() => {
                    const nextSlot = (((oledBadgeHost % 3) + 1) as BleHostSlot);
                    if (connection.connected) {
                      onSwitchBleHost(nextSlot);
                    } else {
                      setOfflineBleHost(nextSlot);
                      onSelectProfile(bleSlotToProfileId(nextSlot));
                    }
                  }}
                  title={
                    connection.connected
                      ? `Host ${oledBadgeHost} (Studio Pad ${oledBadgeHost}) — click to cycle BLE host (/api/ble/switch) or hold Mode + turn Dial`
                      : `Viewing Host ${oledBadgeHost} (Studio Pad ${oledBadgeHost}) — click to cycle [H1]–[H3]`
                  }
                  className={`px-1.5 py-0.5 rounded bg-black border font-mono text-[10px] font-bold leading-none tracking-tight transition-colors cursor-pointer tabular-nums shrink-0 ${
                    connection.connected && oledBadgeHost !== activeBleHost
                      ? 'border-amber-400/75 text-amber-300 hover:border-amber-300'
                      : 'border-white/75 text-white hover:border-sky-400 hover:text-sky-200'
                  }`}
                >
                  [H{oledBadgeHost}]
                </button>
              )}
            </div>
          </div>

          {encoderPlacement === 'top' ? (
            <div className="flex flex-col items-center gap-4 sm:gap-5">
              {renderEncoderUnit('large')}
              <div className="grid grid-cols-3 gap-2.5 sm:gap-3 justify-items-center">
                {KEY_ORDER.map((kid, idx) => renderKeycap(kid, idx))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-5">
              <div className="order-2 sm:order-1 grid grid-cols-3 gap-2.5 sm:gap-3 justify-items-center">
                {KEY_ORDER.map((kid, idx) => renderKeycap(kid, idx))}
              </div>
              <div className="order-1 sm:order-2 flex flex-col items-center justify-center sm:pl-5 sm:border-l sm:border-white/10 sm:self-stretch">
                {renderEncoderUnit('large')}
              </div>
            </div>
          )}
        </div>

        {/* Direct 11-Control Selector Strip (Configure mode) */}
        {viewMode === 'edit' && (
          <div
            role="group"
            aria-label="Select one of the 11 programmable controls"
            className="w-full max-w-2xl flex items-center justify-center gap-1.5 flex-wrap"
          >
            {ELEVEN_CONTROLS.map(ctrl => {
              const active =
                selectedControl === ctrl.id ||
                (selectedControl === 'encoder' && ctrl.id === 'dial');
              return (
                <button
                  key={ctrl.id}
                  type="button"
                  onClick={() => onSelectControl(ctrl.id)}
                  style={
                    active
                      ? {
                          borderColor: 'var(--accent)',
                          backgroundColor: 'rgba(var(--accent-rgb), 0.16)',
                          color: 'var(--text-primary)'
                        }
                      : undefined
                  }
                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'font-semibold shadow-sm'
                      : 'bg-[var(--bg-panel)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {ctrl.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom: Conflict Alert or Test View Feed */}
      <div className="w-full max-w-2xl space-y-2">
        {conflicts.length > 0 && viewMode === 'edit' && (
          <div className="px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-2.5 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>{conflicts[0].summary}</span>
          </div>
        )}

        {viewMode === 'test' && (
          <div className="rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-semibold text-[var(--text-primary)]">
                Test View Feed (Live Presses & Knob Turns)
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

            <div className="flex items-center justify-between gap-2 flex-wrap pb-2 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-1.5 flex-wrap">
                {connection.transport === 'demo' && (
                  <>
                    <span className="text-[10px] font-mono uppercase text-[var(--text-muted)] mr-1">
                      Simulate pad:
                    </span>
                    {(
                      [
                        { slot: 'b1', label: 'Key 1' },
                        { slot: 'b2', label: 'Key 2' },
                        { slot: 'b3', label: 'Key 3' },
                        { slot: 'b4', label: 'Key 4' },
                        { slot: 'b5', label: 'Key 5' },
                        { slot: 'b6', label: 'Key 6' },
                        { slot: 'b7', label: 'Key 7' },
                        { slot: 'b8', label: 'Key 8' },
                        { slot: 'dial', label: 'Knob', icon: Disc },
                        { slot: 'enc_ccw', label: 'Turn Left' },
                        { slot: 'enc_cw', label: 'Turn Right' },
                        { slot: 'mode', label: 'Mode' }
                      ] as const
                    ).map(btn => (
                      <button
                        key={btn.slot}
                        type="button"
                        onClick={() => usbHardware.simulateDemoPadInput(btn.slot)}
                        className="px-2 py-1 rounded-md bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[10px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                      >
                        {btn.label}
                      </button>
                    ))}
                  </>
                )}

                <button
                  type="button"
                  onClick={() => triggerModePlusDialHostSwitch('cw')}
                  title="Simulate holding Mode + rotating Dial clockwise to switch BLE Host"
                  className="px-2 py-1 rounded-md bg-sky-500/12 hover:bg-sky-500/20 border border-sky-500/35 text-[10px] font-mono text-sky-300 cursor-pointer whitespace-nowrap flex items-center gap-1"
                >
                  <Bluetooth className="w-3 h-3 shrink-0" />
                  <span>Mode + Dial ↻ ([H{(((activeBleHost % 3) + 1))}])</span>
                </button>
              </div>
            </div>

            {testLog.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] py-1.5">
                Press keys or turn the knob on your MacroPad (or click controls above) to see
                each press and turn with its assigned action.
              </p>
            ) : (
              <div className="max-h-32 overflow-y-auto space-y-1 font-mono text-[11px] tabular-nums">
                {testLog.map(item => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 py-1 px-2 rounded bg-[var(--bg-input)]"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[var(--text-muted)] shrink-0">
                        {item.timestamp}
                      </span>
                      <span className="font-semibold text-[var(--text-primary)] shrink-0">
                        {item.controlLabel}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] text-[10px] text-[var(--accent)] shrink-0">
                        {item.triggerLabel}
                      </span>
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
