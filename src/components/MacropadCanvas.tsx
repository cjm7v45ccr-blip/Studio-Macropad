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
  Disc,
  BookOpen
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
  onOpenCheatSheet?: () => void;
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
  onOpenSetupWizard,
  onOpenCheatSheet
}) => {
  const [pressedKey, setPressedKey] = useState<KeyId | null>(null);
  const [knobAngle, setKnobAngle] = useState(0);
  const [knobPressed, setKnobPressed] = useState(false);
  const [knobAccel, setKnobAccel] = useState<1 | 2 | 3>(1);
  const [oledToast, setOledToast] = useState<{
    title: string;
    subtitle?: string;
  } | null>(null);
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
  const oledToastTimerRef = useRef<number | null>(null);
  const lastKnobTurnMsRef = useRef<number>(0);
  const knobAccelTimerRef = useRef<number | null>(null);
  const pendingAngleDeltaRef = useRef<number>(0);
  const angleRafRef = useRef<number | null>(null);
  const layerRef = useRef(layer);
  layerRef.current = layer;
  const customMacrosRef = useRef(customMacros);
  customMacrosRef.current = customMacros;
  const liveEventsEnabledRef = useRef(liveEventsEnabled);
  liveEventsEnabledRef.current = liveEventsEnabled;

  const triggerOledToast = (title: string, subtitle?: string, durationMs = 950) => {
    setOledToast({ title, subtitle });
    if (oledToastTimerRef.current !== null) {
      window.clearTimeout(oledToastTimerRef.current);
    }
    oledToastTimerRef.current = window.setTimeout(() => {
      oledToastTimerRef.current = null;
      setOledToast(null);
    }, durationMs);
  };

  const recordKnobVelocity = (explicitAccel?: number): 1 | 2 | 3 => {
    const now = performance.now();
    const delta = now - lastKnobTurnMsRef.current;
    lastKnobTurnMsRef.current = now;

    let mult: 1 | 2 | 3 = 1;
    if (explicitAccel && explicitAccel >= 3) {
      mult = 3;
    } else if (explicitAccel === 2) {
      mult = 2;
    } else if (delta > 0 && delta < 32) {
      mult = 3;
    } else if (delta > 0 && delta < 68) {
      mult = 2;
    }

    setKnobAccel(mult);
    if (knobAccelTimerRef.current !== null) {
      window.clearTimeout(knobAccelTimerRef.current);
    }
    if (mult > 1) {
      knobAccelTimerRef.current = window.setTimeout(() => {
        knobAccelTimerRef.current = null;
        setKnobAccel(1);
      }, 650);
    }
    return mult;
  };

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

      if (e.event === 'macro_cancel') {
        triggerOledToast('CANCELLED', 'Macro stopped');
        pushLog('Macro', 'Cancel', 'Cancelled running macro sequence', 'hardware');
        return;
      }

      if (e.event === 'profile') {
        triggerSlotFlash('mode');
        soundEngine.playKeyClick();
        const currHost = usbHardware.info.telemetry?.bleActiveHost ?? 1;
        const nextProf = defaultProfileAlias(
          normalizeHardwareProfileId(e.active || e.profile, currHost)
        );
        triggerOledToast('PROFILE', nextProf.toUpperCase());
        pushLog('Mode', 'Press', `Switched profile to ${nextProf}`, 'hardware');
        return;
      }

      if (e.event === 'ble_host') {
        const hostNum = e.ble_slot === 2 ? 2 : e.ble_slot === 3 ? 3 : 1;
        triggerSlotFlash('mode');
        soundEngine.playDialTick();
        triggerOledToast(`HOST ${hostNum}`, `Studio Pad ${hostNum}`);
        pushLog(
          'Mode + Dial',
          `[H${hostNum}]`,
          `Switched BLE to Studio Pad ${hostNum} (Device ${hostNum})`,
          'hardware'
        );
        return;
      }

      if (e.event !== 'press' && e.event !== 'turn') return;

      const rawSlot = String(e.slot || '').toLowerCase();
      const rawDir = String(e.dir || '').toLowerCase();
      const currLayer = layerRef.current;
      const macros = customMacrosRef.current;

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
        const mult = recordKnobVelocity(e.accel);

        queueKnobAngleDelta((isCcw ? -24 : 24) * mult);
        soundEngine.playDialTick();
        triggerSlotFlash(flashId);

        const binding = isCcw ? currLayer.encoder.ccw : currLayer.encoder.cw;
        const actionDesc = binding.repeatConfig
          ? summarizeAction(binding, macros)
          : e.action
          ? describeFirmwareAction(e.action, undefined, macros).fullLabel
          : summarizeAction(binding, macros);
        const shortToast = e.action
          ? describeFirmwareAction(e.action, undefined, macros).shortLabel
          : describeFirmwareAction(binding.value, binding.repeatConfig, macros).shortLabel;
        triggerOledToast(
          `${isCcw ? 'CCW' : 'CW'}${mult > 1 ? ` ${mult}x` : ''}`,
          shortToast
        );
        pushLog(
          isCcw ? 'Turn Left' : 'Turn Right',
          mult > 1 ? `${isCcw ? 'CCW' : 'CW'} ${mult}×` : isCcw ? 'CCW' : 'CW',
          actionDesc,
          'hardware'
        );
        return;
      }

      if (rawSlot === 'dial') {
        soundEngine.playKeyClick();
        triggerSlotFlash('dial');
        const dialBinding = currLayer.encoder.dial;
        const actionDesc = dialBinding.repeatConfig
          ? summarizeAction(dialBinding, macros)
          : e.action
          ? describeFirmwareAction(e.action, undefined, macros).fullLabel
          : summarizeAction(dialBinding, macros);
        const shortToast = e.action
          ? describeFirmwareAction(e.action, undefined, macros).shortLabel
          : describeFirmwareAction(dialBinding.value, dialBinding.repeatConfig, macros)
              .shortLabel;
        triggerOledToast('DIAL', shortToast);
        pushLog('Knob Press', 'Press', actionDesc, 'hardware');
        return;
      }

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
          ? describeFirmwareAction(e.action, undefined, macros).fullLabel
          : summarizeAction(keyCfg.triggers.tap, macros);
        triggerOledToast(`KEY ${keyNum}`, keyCfg.appearance.label);
        pushLog(`Key ${keyNum}`, 'Press', actionDesc, 'hardware');
      }
    });

    return () => {
      unsub();
      if (angleRafRef.current !== null) {
        window.cancelAnimationFrame(angleRafRef.current);
      }
      if (oledToastTimerRef.current !== null) {
        window.clearTimeout(oledToastTimerRef.current);
      }
      if (knobAccelTimerRef.current !== null) {
        window.clearTimeout(knobAccelTimerRef.current);
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
        activeProfileId === 'TV' ? `Device ${activeBleHost}` : 'TV';
      onToggleHardwareMode();
      triggerOledToast('PROFILE', targetLabel.toUpperCase());
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
    triggerOledToast(keyLabel.toUpperCase(), cfg.appearance.label);

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
    triggerOledToast(`HOST ${nextSlot}`, `Studio Pad ${nextSlot}`);

    if (connection.connected) {
      await onSwitchBleHost(nextSlot);
      pushLog(
        'Mode + Dial',
        `[H${nextSlot}]`,
        `Switched BLE to Studio Pad ${nextSlot} (Device ${nextSlot})`,
        'usb-test'
      );
    } else {
      setOfflineBleHost(nextSlot);
      onSelectProfile(bleSlotToProfileId(nextSlot));
      pushLog(
        'Mode + Dial',
        `[H${nextSlot}]`,
        `Switched workspace to Device ${nextSlot} (Studio Pad ${nextSlot})`,
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

    if (viewMode === 'edit') {
      queueKnobAngleDelta(dir === 'cw' ? 24 : -24);
      soundEngine.playDialTick();
      onSelectControl(subId);
      return;
    }

    if (connection.transport === 'demo') {
      usbHardware.simulateDemoPadInput(subId);
      return;
    }

    const mult = recordKnobVelocity();
    queueKnobAngleDelta((dir === 'cw' ? 24 : -24) * mult);
    soundEngine.playDialTick();

    const binding = dir === 'cw' ? layer.encoder.cw : layer.encoder.ccw;
    const summary = summarizeAction(binding, customMacros);
    const shortToast = describeFirmwareAction(
      binding.value,
      binding.repeatConfig,
      customMacros
    ).shortLabel;
    const label = dir === 'cw' ? 'Turn Right' : 'Turn Left';
    triggerOledToast(
      `${dir.toUpperCase()}${mult > 1 ? ` ${mult}x` : ''}`,
      shortToast
    );

    if (connection.connected && binding.value) {
      const sent = await onExecuteHardwareBinding(binding);
      pushLog(
        label,
        mult > 1 ? `${dir.toUpperCase()} ${mult}×` : dir.toUpperCase(),
        summary,
        sent ? 'usb-test' : 'sim'
      );
    } else {
      pushLog(
        label,
        mult > 1 ? `${dir.toUpperCase()} ${mult}×` : dir.toUpperCase(),
        summary,
        'sim'
      );
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
    const shortToast = describeFirmwareAction(
      binding.value,
      binding.repeatConfig,
      customMacros
    ).shortLabel;
    triggerOledToast('DIAL', shortToast);
    if (connection.connected && binding.value) {
      const sent = await onExecuteHardwareBinding(binding);
      pushLog('Knob Press', 'Press', summary, sent ? 'usb-test' : 'sim');
    } else {
      pushLog('Knob Press', 'Press', summary, 'sim');
    }
  };

  const renderEncoderUnit = () => {
    const isDialSelected =
      (selectedControl === 'dial' || selectedControl === 'encoder') && viewMode === 'edit';
    const isCwSelected = selectedControl === 'enc_cw' && viewMode === 'edit';
    const isCcwSelected = selectedControl === 'enc_ccw' && viewMode === 'edit';

    const isDialFlashed = flashedSlots.has('dial');
    const isCwFlashed = flashedSlots.has('enc_cw');
    const isCcwFlashed = flashedSlots.has('enc_ccw');

    const dialInfo = describeFirmwareAction(
      layer.encoder.dial.value,
      layer.encoder.dial.repeatConfig,
      customMacros
    );
    const cwInfo = describeFirmwareAction(
      layer.encoder.cw.value,
      layer.encoder.cw.repeatConfig,
      customMacros
    );
    const ccwInfo = describeFirmwareAction(
      layer.encoder.ccw.value,
      layer.encoder.ccw.repeatConfig,
      customMacros
    );

    const isDialUnassigned = !layer.encoder.dial.value;
    const isCwUnassigned = !layer.encoder.cw.value;
    const isCcwUnassigned = !layer.encoder.ccw.value;

    return (
      <div className="flex flex-col items-center justify-center gap-2">
        <div className="relative flex items-center justify-center gap-1.5 sm:gap-2">
          {knobAccel > 1 && (
            <span
              title={`Smart Knob velocity acceleration (${knobAccel}× step)`}
              className="absolute -top-2.5 right-6 z-10 px-1.5 py-0.5 rounded-md bg-sky-500/20 border border-sky-400/60 font-mono text-[9px] font-bold text-sky-300 tabular-nums pointer-events-none"
            >
              {knobAccel}×
            </span>
          )}

          {/* Prominent Clickable Turn Left (`enc_ccw`) Arrow Button */}
          <button
            type="button"
            aria-label={`Turn Left: ${ccwInfo.fullLabel}`}
            onClick={e => {
              e.stopPropagation();
              triggerEncoderSpin('ccw');
            }}
            title={`Turn Left (${ccwInfo.fullLabel}) — click to ${
              viewMode === 'edit' ? 'configure' : 'trigger'
            }`}
            className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-all duration-150 cursor-pointer active:scale-95 ${
              isCcwFlashed
                ? 'bg-sky-500/35 ring-2 ring-sky-400 text-sky-200 scale-110'
                : isCcwSelected
                ? 'bg-[rgba(var(--accent-rgb),0.28)] ring-2 ring-[var(--accent)] text-white shadow-[0_0_16px_rgba(var(--accent-rgb),0.45)]'
                : `bg-white/[0.06] hover:bg-white/[0.15] text-zinc-300 hover:text-white ${
                    isCcwUnassigned ? 'opacity-45 hover:opacity-85' : ''
                  }`
            }`}
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Larger Physical Rotary Knob (`dial`) */}
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
                ? '0 0 0 4px rgba(56, 189, 248, 0.45), 0 0 26px rgba(56, 189, 248, 0.35)'
                : undefined
            }}
            className={`w-22 h-22 sm:w-28 sm:h-28 xl:w-30 xl:h-30 rounded-full bg-gradient-to-b from-[#282C37] to-[#171A21] border-2 flex items-center justify-center transition-all duration-150 cursor-pointer select-none ${
              isDialSelected && !isDialFlashed
                ? 'encoder-ring-selected'
                : !isDialFlashed
                ? 'shadow-[0_10px_22px_rgba(0,0,0,0.48),inset_0_1px_1px_rgba(255,255,255,0.09)]'
                : ''
            } ${knobPressed || isDialFlashed ? 'scale-95' : 'hover:scale-[1.02]'} ${
              isDialUnassigned && !isDialSelected && !isDialFlashed
                ? 'opacity-55 hover:opacity-85'
                : ''
            }`}
          >
            <span
              style={{
                borderColor: isDialFlashed ? '#38BDF8' : layer.encoder.color,
                transform: `rotate(${knobAngle}deg)`
              }}
              className="w-15 h-15 sm:w-20 sm:h-20 xl:w-21 xl:h-21 rounded-full bg-[#12141A] border-2 flex items-center justify-center relative transition-transform duration-150 ease-out shadow-inner"
            >
              <span
                className="w-1.5 h-3 rounded-full absolute top-1.5"
                style={{
                  backgroundColor: isDialFlashed ? '#38BDF8' : layer.encoder.color
                }}
              />
              <span className="font-mono text-[9px] sm:text-[10px] uppercase tracking-wider text-zinc-300">
                KNOB
              </span>
            </span>
          </button>

          {/* Prominent Clickable Turn Right (`enc_cw`) Arrow Button */}
          <button
            type="button"
            aria-label={`Turn Right: ${cwInfo.fullLabel}`}
            onClick={e => {
              e.stopPropagation();
              triggerEncoderSpin('cw');
            }}
            title={`Turn Right (${cwInfo.fullLabel}) — click to ${
              viewMode === 'edit' ? 'configure' : 'trigger'
            }`}
            className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-all duration-150 cursor-pointer active:scale-95 ${
              isCwFlashed
                ? 'bg-sky-500/35 ring-2 ring-sky-400 text-sky-200 scale-110'
                : isCwSelected
                ? 'bg-[rgba(var(--accent-rgb),0.28)] ring-2 ring-[var(--accent)] text-white shadow-[0_0_16px_rgba(var(--accent-rgb),0.45)]'
                : `bg-white/[0.06] hover:bg-white/[0.15] text-zinc-300 hover:text-white ${
                    isCwUnassigned ? 'opacity-45 hover:opacity-85' : ''
                  }`
            }`}
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-zinc-400 text-center max-w-[165px] truncate">
          <button
            type="button"
            onClick={() => triggerEncoderSpin('ccw')}
            title={`Turn Left: ${ccwInfo.fullLabel}`}
            className={`hover:text-white transition-colors cursor-pointer truncate ${
              isCcwSelected ? 'text-sky-300 font-semibold' : ''
            }`}
          >
            ↺ {ccwInfo.shortLabel}
          </button>
          <span aria-hidden="true" className="text-zinc-600">
            ·
          </span>
          <button
            type="button"
            onClick={activateDialPush}
            title={`Knob Press: ${dialInfo.fullLabel}`}
            className={`hover:text-white transition-colors cursor-pointer truncate ${
              isDialSelected ? 'text-sky-300 font-semibold' : ''
            }`}
          >
            {dialInfo.shortLabel}
          </button>
          <span aria-hidden="true" className="text-zinc-600">
            ·
          </span>
          <button
            type="button"
            onClick={() => triggerEncoderSpin('cw')}
            title={`Turn Right: ${cwInfo.fullLabel}`}
            className={`hover:text-white transition-colors cursor-pointer truncate ${
              isCwSelected ? 'text-sky-300 font-semibold' : ''
            }`}
          >
            {cwInfo.shortLabel} ↻
          </button>
        </div>
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

    const badgeText = cfg.isModeSwitch ? 'MODE' : `K${index + 1}`;

    return (
      <button
        key={kid}
        type="button"
        aria-label={`${badgeText}: ${cfg.appearance.label}`}
        title={
          cfg.isModeSwitch
            ? 'Mode Switch (short press: Host/TV, hold+dial: Host 1–3)'
            : isUnassigned
            ? `Key ${index + 1} — Unassigned`
            : `Key ${index + 1}: ${summarizeAction(cfg.triggers.tap, customMacros)}`
        }
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
            ? 'rgba(56,189,248,0.28)'
            : 'rgba(255,255,255,0.08)',
          boxShadow: isFlashed
            ? '0 0 0 4px rgba(56, 189, 248, 0.45), 0 0 24px rgba(56, 189, 248, 0.35)'
            : isSelected
            ? undefined
            : isDown
            ? '0 2px 4px rgba(0,0,0,0.5), inset 0 2px 4px rgba(0,0,0,0.4)'
            : '0 6px 0 #101217, 0 10px 18px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.09)'
        }}
        className={`relative w-[88px] h-[88px] sm:w-[104px] sm:h-[104px] xl:w-[114px] xl:h-[114px] rounded-2xl bg-gradient-to-b from-[#252933] to-[#1B1E26] border-2 p-2.5 sm:p-3 flex flex-col items-center justify-between select-none transition-all duration-150 ease-out cursor-pointer ${
          isSelected && !isFlashed ? 'keycap-selected-glow -translate-y-0.5' : ''
        } ${isDown ? 'translate-y-1' : !isSelected ? 'hover:-translate-y-0.5' : ''} ${
          isUnassigned && !isSelected && !isFlashed
            ? 'opacity-40 hover:opacity-75'
            : ''
        }`}
      >
        <div className="w-full flex items-center justify-between">
          <span
            className={`font-mono text-[9px] sm:text-[10px] leading-none font-medium tabular-nums ${
              isFlashed || cfg.isModeSwitch
                ? 'text-sky-400'
                : isSelected
                ? 'text-zinc-200'
                : 'text-zinc-500'
            }`}
          >
            {badgeText}
          </span>
          {conflict ? (
            <span title="Duplicate action warning">
              <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
            </span>
          ) : null}
        </div>

        <div className="my-auto flex items-center justify-center">
          <KeycapIcon
            icon={cfg.appearance.icon}
            className={`w-6 h-6 sm:w-7 sm:h-7 transition-transform duration-150 ${
              isFlashed || isSelected ? 'scale-105' : ''
            }`}
            style={{
              color: isFlashed
                ? '#38BDF8'
                : isUnassigned
                ? '#71717A'
                : cfg.appearance.labelColor
            }}
          />
        </div>

        <span
          className={`text-[11px] sm:text-xs font-medium truncate max-w-full tracking-tight ${
            isUnassigned ? 'text-zinc-500' : 'text-zinc-100'
          }`}
        >
          {cfg.appearance.label}
        </span>
      </button>
    );
  };

  const telemetry = connection.telemetry;

  return (
    <div className="flex-1 flex flex-col items-center p-4 sm:p-6 lg:overflow-y-auto relative min-w-0">
      {/* Top Canvas Toolbar (Clean Filled Controls, Minimal Outlines) */}
      <div className="w-full max-w-2xl flex items-center justify-between gap-2 flex-wrap shrink-0">
        <div className="flex items-center p-1 rounded-xl bg-[var(--bg-panel)] shadow-2xs">
          <button
            type="button"
            onClick={() => onChangeViewMode('edit')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              viewMode === 'edit'
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-semibold shadow-2xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>Configure</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeViewMode('test')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              viewMode === 'test'
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-semibold shadow-2xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span>Test</span>
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onOpenCheatSheet && (
            <button
              type="button"
              onClick={onOpenCheatSheet}
              title="Open printable 4-profile Desk Reference Cheat Sheet"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--bg-panel)] hover:bg-[var(--bg-elevated)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] shadow-2xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <BookOpen className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Cheat Sheet</span>
            </button>
          )}

          <div className="flex items-center gap-0.5 p-1 rounded-xl bg-[var(--bg-panel)] shadow-2xs">
            <button
              type="button"
              onClick={() => onChangeEncoderPlacement('grid')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                encoderPlacement === 'grid'
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-semibold shadow-2xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              Side Knob
            </button>
            <button
              type="button"
              onClick={() => onChangeEncoderPlacement('top')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                encoderPlacement === 'top'
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-semibold shadow-2xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              Top Crown
            </button>
          </div>
        </div>
      </div>

      {/* Unsupported Browser Banner (Firefox / Safari) */}
      {!usbHardware.browserSupportsWebSerial && !connection.connected && (
        <div className="w-full max-w-2xl mt-3 px-4 py-3 rounded-xl bg-amber-500/12 border border-amber-500/35 flex items-center justify-between gap-3 flex-wrap shrink-0">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
              <strong className="text-[var(--text-primary)]">Unsupported browser:</strong>{' '}
              Web Serial requires Chrome or Edge on desktop. You can explore everything in Demo Mode.
            </div>
          </div>
          <button
            type="button"
            onClick={onStartDemoMode}
            style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <PlayCircle className="w-3.5 h-3.5" />
            <span>Start Demo</span>
          </button>
        </div>
      )}

      {/* Active Hardware Setup Mode Banner */}
      {connection.connected && connection.telemetry?.setupMode && onOpenSetupWizard && (
        <div className="w-full max-w-2xl mt-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/35 flex items-center justify-between gap-3 flex-wrap shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <SlidersHorizontal className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
              <strong className="text-[var(--text-primary)]">Board is in Setup Mode.</strong>{' '}
              Configure your starter layout, Bluetooth device names, and optional Wi-Fi or TV pairing.
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenSetupWizard}
            style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap flex items-center gap-1.5 shrink-0"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Open Setup Wizard</span>
          </button>
        </div>
      )}

      {/* Compact Offline Demo / USB Prompt */}
      {!connection.connected && !isSyncedWithHardware && (
        <div className="w-full max-w-2xl mt-3 px-4 py-2.5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex items-center justify-between gap-3 flex-wrap shrink-0">
          <div className="text-xs text-[var(--text-secondary)] min-w-0">
            <span className="font-semibold text-[var(--text-primary)]">No USB MacroPad connected</span>
            <span className="hidden sm:inline"> — customize offline or launch the interactive simulator.</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onStartDemoMode}
              className="px-3 py-1.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-xs font-semibold text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5"
            >
              <PlayCircle className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Demo Mode</span>
            </button>
            {usbHardware.browserSupportsWebSerial && (
              <button
                type="button"
                onClick={onConnectUsbPad}
                style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-95 transition-opacity cursor-pointer whitespace-nowrap flex items-center gap-1.5"
              >
                <Usb className="w-3.5 h-3.5" />
                <span>Connect USB</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Vertically Centered Larger Physical MacroPad */}
      <div className="my-auto py-4 sm:py-6 flex flex-col items-center justify-center w-full">
        <div
          className={`w-full ${
            encoderPlacement === 'top'
              ? 'max-w-[356px] sm:max-w-[440px] xl:max-w-[468px]'
              : 'max-w-[356px] sm:max-w-[604px] xl:max-w-[644px]'
          } chassis-shell rounded-[32px] sm:rounded-[38px] p-5 sm:p-7 bg-gradient-to-b from-[#232731] to-[#151820] border border-white/10`}
        >
          {/* 128x64 SSD1306 Hardware OLED Strip */}
          <div className="mb-5 sm:mb-6 px-3.5 py-2.5 rounded-xl bg-[#090B0E] border border-white/10 shadow-inner flex items-center justify-between gap-2 min-h-[40px]">
            <div className="flex items-center gap-2 min-w-0">
              {oledToast ? (
                <div className="flex items-center gap-1.5 min-w-0 font-mono text-[10px] sm:text-[11px] tabular-nums">
                  <span className="px-1.5 py-0.5 rounded bg-sky-400 text-black font-bold uppercase tracking-wider leading-none shrink-0">
                    {oledToast.title}
                  </span>
                  {oledToast.subtitle && (
                    <span className="text-sky-200 font-semibold truncate">
                      {oledToast.subtitle}
                    </span>
                  )}
                </div>
              ) : (
                <span
                  className={`font-mono text-[11px] sm:text-xs font-bold uppercase tracking-wider truncate tabular-nums ${
                    connection.connected && connection.telemetry?.setupMode
                      ? 'text-amber-300'
                      : 'text-sky-300'
                  }`}
                >
                  {connection.connected && connection.telemetry?.setupMode
                    ? `SETUP · ${activeProfileName}`
                    : activeProfileName}
                </span>
              )}
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
                      ? `Device ${oledBadgeHost} (Studio Pad ${oledBadgeHost}) — click to switch host`
                      : `Viewing Device ${oledBadgeHost} — click to cycle H1–H3`
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
            <div className="flex flex-col items-center gap-5 sm:gap-6">
              {renderEncoderUnit()}
              <div className="grid grid-cols-3 gap-3 sm:gap-3.5 justify-items-center">
                {KEY_ORDER.map((kid, idx) => renderKeycap(kid, idx))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-5 sm:gap-6">
              <div className="order-2 sm:order-1 grid grid-cols-3 gap-3 sm:gap-3.5 justify-items-center">
                {KEY_ORDER.map((kid, idx) => renderKeycap(kid, idx))}
              </div>
              <div className="order-1 sm:order-2 flex flex-col items-center justify-center sm:pl-6 sm:border-l sm:border-white/10 sm:self-stretch">
                {renderEncoderUnit()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom: Conflict Alert or Test View Feed */}
      {(conflicts.length > 0 && viewMode === 'edit') || viewMode === 'test' ? (
        <div className="w-full max-w-2xl space-y-2 shrink-0">
          {conflicts.length > 0 && viewMode === 'edit' && (
            <div className="px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-2.5 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
              <span>{conflicts[0].summary}</span>
            </div>
          )}

          {viewMode === 'test' && (
            <div className="rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  Live Input Feed
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
                        Simulate:
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
                          className="px-2 py-1 rounded-md bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[10px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
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
                    className="px-2 py-1 rounded-md bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[10px] font-mono text-[var(--accent)] cursor-pointer whitespace-nowrap flex items-center gap-1"
                  >
                    <Bluetooth className="w-3 h-3 shrink-0" />
                    <span>Mode + Dial ↻ ([H{(((activeBleHost % 3) + 1))}])</span>
                  </button>
                </div>
              </div>

              {testLog.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] py-1.5">
                  Press keys or click the knob and its left/right arrows above to see live events.
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
                        <span className="text-[10px] text-[var(--accent)] shrink-0">
                          · {item.triggerLabel}
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
      ) : null}
    </div>
  );
};
