import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ActionBinding,
  BleHostSlot,
  CanvasViewMode,
  ConflictWarning,
  ControlId,
  CustomMacroItem,
  DeviceConnectionInfo,
  EncoderIndex,
  EncoderPlacement,
  GyroCalibrationProfile,
  HardwareEventPacket,
  HardwareFlashSlot,
  HardwareProfileId,
  KeyId,
  LayerConfig,
  LiveInputEvent,
  MotionSlotId,
  bleSlotToProfileId,
  defaultProfileAlias,
  isBleHostProfile,
  normalizeHardwareProfileId,
  profileIdToBleSlot
} from '../types/studio';
import { KeycapIcon, summarizeAction } from '../data/iconRegistry';
import {
  HOLD_SLOTS,
  MOTION_SLOTS,
  SLOT_LABELS,
  describeFirmwareAction,
  gestureTypeToMotionSlot,
  hasKeyHoldCapability,
  hasMotionCapability,
  isHoldSlot
} from '../data/firmwareCatalog';
import {
  ActionKeyId,
  HOLD_SLOT_TO_ACTION_KEY,
  KEY_TO_HOLD_SLOT
} from '../data/presetTemplates';
import { usbHardware } from '../services/usbHardwareService';
import { soundEngine } from '../services/soundEffects';
import { useMotionSensor } from '../hooks/useMotionSensor';
import { computeGyroCalibration } from '../utils/motionCalibration';
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
  BookOpen,
  Compass,
  ArrowDown,
  ArrowUp,
  Layers,
  Cpu,
  Sparkles
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
  tvEnabled?: boolean;
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
  tvEnabled,
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
  const [view3D, setView3D] = useState(false);
  const [knobAngle, setKnobAngle] = useState(0);
  const [knobPressed, setKnobPressed] = useState(false);
  const [knobAccel, setKnobAccel] = useState<1 | 2 | 3>(1);
  const [knob2Angle, setKnob2Angle] = useState(0);
  const [knob2Pressed, setKnob2Pressed] = useState(false);
  const [knob2Accel, setKnob2Accel] = useState<1 | 2 | 3>(1);
  const [oledToast, setOledToast] = useState<{
    title: string;
    subtitle?: string;
  } | null>(null);
  const [flashedSlots, setFlashedSlots] = useState<Set<HardwareFlashSlot>>(new Set());
  const [testLog, setTestLog] = useState<LiveInputEvent[]>([]);
  const [offlineBleHost, setOfflineBleHost] = useState<BleHostSlot>(1);
  const motionSensor = useMotionSensor({
    enabled: view3D && connection.connected,
    pollIntervalMs: 25,
    defaultPitchBaseline: 0,
    defaultRollBaseline: 0
  });

  const chassis3dRef = useRef<HTMLDivElement>(null);
  const current3dRotRef = useRef<{ pitch: number; roll: number; yaw: number; zOffset: number }>({
    pitch: 0,
    roll: 0,
    yaw: 0,
    zOffset: 0
  });

  const motionTargetRef = useRef(motionSensor);
  motionTargetRef.current = motionSensor;

  useEffect(() => {
    if (!view3D) {
      if (chassis3dRef.current) {
        chassis3dRef.current.style.transform = '';
      }
      return;
    }
    let rafId: number;

    const animate3D = () => {
      const target = motionTargetRef.current;
      const current = current3dRotRef.current;

      const factor = target.shakeActive ? 0.3 : 0.16;
      current.pitch += (target.pitch - current.pitch) * factor;
      current.roll += (target.roll - current.roll) * factor;
      current.zOffset += (target.shakeZOffset - current.zOffset) * factor;

      if (chassis3dRef.current) {
        const scale = target.shakeActive ? 0.93 : 0.96;
        // Strictly Tilt (X-axis) & Pan (Y-axis), zero Z-axis spin
        const nextTransform = `rotate3d(1, 0, 0, ${current.pitch.toFixed(2)}deg) rotate3d(0, 1, 0, ${current.roll.toFixed(2)}deg) translateZ(${current.zOffset.toFixed(2)}px) scale(${scale})`;
        if (chassis3dRef.current.style.transform !== nextTransform) {
          chassis3dRef.current.style.transform = nextTransform;
        }
      }

      rafId = requestAnimationFrame(animate3D);
    };

    rafId = requestAnimationFrame(animate3D);
    return () => {
      cancelAnimationFrame(rafId);
      if (chassis3dRef.current) {
        chassis3dRef.current.style.transform = '';
      }
    };
  }, [view3D]);

  const [calibrating3D, setCalibrating3D] = useState<boolean>(false);
  const [calibStep, setCalibStep] = useState<'flat' | 'left' | 'right' | 'backward' | 'forward' | null>(null);

  const flatPitchRef = useRef<number>(0);
  const flatRollRef = useRef<number>(0);
  const flatYawRef = useRef<number>(0);
  const leftTiltSampleRef = useRef<number | null>(null);
  const rightTiltSampleRef = useRef<number | null>(null);
  const backwardTiltSampleRef = useRef<number | null>(null);
  const forwardTiltSampleRef = useRef<number | null>(null);

  const hasKeyHold = hasKeyHoldCapability(connection.telemetry?.capabilities);
  const hasMotion = hasMotionCapability(connection.telemetry?.capabilities);

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
  const lastKnob2TurnMsRef = useRef<number>(0);
  const knob2AccelTimerRef = useRef<number | null>(null);
  const pendingAngle2DeltaRef = useRef<number>(0);
  const angle2RafRef = useRef<number | null>(null);
  const layerRef = useRef(layer);
  layerRef.current = layer;
  const customMacrosRef = useRef(customMacros);
  customMacrosRef.current = customMacros;
  const liveEventsEnabledRef = useRef(liveEventsEnabled);
  liveEventsEnabledRef.current = liveEventsEnabled;

  const lastPointerDownRef = useRef<{ id: string; time: number } | null>(null);
  const lastTriggerTimeRef = useRef<number>(0);

  const handlePointerDown = (id: string, _e: React.PointerEvent) => {
    lastPointerDownRef.current = { id, time: performance.now() };
  };

  const handlePointerUp = (id: string, _e: React.PointerEvent, onAction: () => void) => {
    const down = lastPointerDownRef.current;
    lastPointerDownRef.current = null;
    if (down && down.id === id) {
      const now = performance.now();
      if (now - lastTriggerTimeRef.current > 100) {
        lastTriggerTimeRef.current = now;
        onAction();
      }
    }
  };

  const triggerSlotFlash = useCallback((slot: HardwareFlashSlot) => {
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
  }, []);

  const handleClick = (onAction: () => void) => {
    const now = performance.now();
    if (now - lastTriggerTimeRef.current > 60) {
      lastTriggerTimeRef.current = now;
      onAction();
    }
  };

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

  const recordKnobVelocity = (
    encoderIndex: EncoderIndex = 1,
    explicitAccel?: number
  ): 1 | 2 | 3 => {
    const now = performance.now();
    const lastRef = encoderIndex === 2 ? lastKnob2TurnMsRef : lastKnobTurnMsRef;
    const timerRef = encoderIndex === 2 ? knob2AccelTimerRef : knobAccelTimerRef;
    const setAccel = encoderIndex === 2 ? setKnob2Accel : setKnobAccel;

    const delta = now - lastRef.current;
    lastRef.current = now;

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

    setAccel(mult);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    if (mult > 1) {
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setAccel(1);
      }, 650);
    }
    return mult;
  };

  const queueKnobAngleDelta = (encoderIndex: EncoderIndex, deltaDeg: number) => {
    if (encoderIndex === 2) {
      pendingAngle2DeltaRef.current += deltaDeg;
      if (angle2RafRef.current === null) {
        angle2RafRef.current = window.requestAnimationFrame(() => {
          const d = pendingAngle2DeltaRef.current;
          pendingAngle2DeltaRef.current = 0;
          angle2RafRef.current = null;
          if (d !== 0) {
            setKnob2Angle(a => a + d);
          }
        });
      }
      return;
    }

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
        triggerOledToast(`HOST ${hostNum}`, `BertoPad ${hostNum}`);
        pushLog(
          'Mode + Dial',
          `[H${hostNum}]`,
          `Switched BLE to BertoPad ${hostNum} (Device ${hostNum})`,
          'hardware'
        );
        return;
      }

      if (e.event === 'gesture') {
        const motionSlot = gestureTypeToMotionSlot(e.type);
        if (!motionSlot) return;
        const currLayer = layerRef.current;
        const macros = customMacrosRef.current;
        soundEngine.playKeyClick();
        triggerSlotFlash(motionSlot);

        const motionBinding = currLayer.motion?.[motionSlot] ?? {
          type: 'none' as const,
          value: ''
        };
        const actionDesc = motionBinding.repeatConfig
          ? summarizeAction(motionBinding, macros)
          : e.action
          ? describeFirmwareAction(e.action, undefined, macros).fullLabel
          : summarizeAction(motionBinding, macros);
        const gestureTitle =
          motionSlot === 'g_shake'
            ? 'SHAKE'
            : motionSlot === 'g_down'
            ? 'FACE DOWN'
            : 'FACE UP';
        const shortToast = e.action
          ? describeFirmwareAction(e.action, undefined, macros).shortLabel
          : motionBinding.value
          ? describeFirmwareAction(
              motionBinding.value,
              motionBinding.repeatConfig,
              macros
            ).shortLabel
          : gestureTitle;
        triggerOledToast('GESTURE', shortToast);
        pushLog(SLOT_LABELS[motionSlot].short, 'Gesture', actionDesc, 'hardware');
        return;
      }

      if (e.event !== 'press' && e.event !== 'turn' && e.event !== 'hold') return;

      const rawSlot = String(e.slot || '').toLowerCase();
      const rawDir = String(e.dir || '').toLowerCase();
      const currLayer = layerRef.current;
      const macros = customMacrosRef.current;

      if (rawSlot === 'push_cw' || rawSlot === 'push_ccw') {
        const isCcw = rawSlot === 'push_ccw' || rawDir === 'ccw';
        const flashId: HardwareFlashSlot = isCcw ? 'push_ccw' : 'push_cw';
        const mult = recordKnobVelocity(1, e.accel);

        queueKnobAngleDelta(1, (isCcw ? -24 : 24) * mult);
        soundEngine.playDialTick();
        triggerSlotFlash(flashId);

        const binding =
          (isCcw ? currLayer.encoder.pushCcw : currLayer.encoder.pushCw) ?? {
            type: 'none' as const,
            value: ''
          };
        const actionDesc = binding.repeatConfig
          ? summarizeAction(binding, macros)
          : e.action
          ? describeFirmwareAction(e.action, undefined, macros).fullLabel
          : summarizeAction(binding, macros);
        const shortToast = e.action
          ? describeFirmwareAction(e.action, undefined, macros).shortLabel
          : describeFirmwareAction(binding.value, binding.repeatConfig, macros).shortLabel;
        triggerOledToast(
          `${isCcw ? 'HOLD CCW' : 'HOLD CW'}${mult > 1 ? ` ${mult}x` : ''}`,
          shortToast
        );
        pushLog(
          `Knob 1 Hold+${isCcw ? 'Left' : 'Right'}`,
          mult > 1 ? `Hold+${isCcw ? 'CCW' : 'CW'} ${mult}×` : `Hold+${isCcw ? 'CCW' : 'CW'}`,
          actionDesc,
          'hardware'
        );
        return;
      }

      if (isHoldSlot(rawSlot)) {
        soundEngine.playKeyClick();
        triggerSlotFlash(rawSlot);
        const parentKey = HOLD_SLOT_TO_ACTION_KEY[rawSlot];
        const keyCfg = currLayer.keys[parentKey];
        const keyNum = parentKey.slice(1);
        const holdBinding = keyCfg?.triggers.hold ?? {
          type: 'none' as const,
          value: ''
        };
        const actionDesc = holdBinding.repeatConfig
          ? summarizeAction(holdBinding, macros)
          : e.action
          ? describeFirmwareAction(e.action, undefined, macros).fullLabel
          : summarizeAction(holdBinding, macros);
        const shortToast = e.action
          ? describeFirmwareAction(e.action, undefined, macros).shortLabel
          : describeFirmwareAction(holdBinding.value, holdBinding.repeatConfig, macros)
              .shortLabel;
        triggerOledToast(`HOLD K${keyNum}`, shortToast);
        pushLog(`Key ${keyNum} Hold`, 'Hold', actionDesc, 'hardware');
        return;
      }

      const isEnc2 =
        rawSlot === 'dial2' ||
        rawSlot === 'e2_cw' ||
        rawSlot === 'e2_ccw' ||
        rawSlot === 'enc2_cw' ||
        rawSlot === 'enc2_ccw' ||
        rawSlot === 'cw2' ||
        rawSlot === 'ccw2' ||
        e.encoder === 2;

      if (
        e.event === 'turn' ||
        rawSlot === 'enc_cw' ||
        rawSlot === 'enc_ccw' ||
        rawSlot === 'e2_cw' ||
        rawSlot === 'e2_ccw' ||
        rawSlot === 'enc2_cw' ||
        rawSlot === 'enc2_ccw' ||
        rawSlot === 'cw' ||
        rawSlot === 'ccw' ||
        rawSlot === 'cw2' ||
        rawSlot === 'ccw2'
      ) {
        const encIdx: EncoderIndex = isEnc2 ? 2 : 1;
        const isCcw =
          rawSlot === 'enc_ccw' ||
          rawSlot === 'e2_ccw' ||
          rawSlot === 'enc2_ccw' ||
          rawSlot === 'ccw' ||
          rawSlot === 'ccw2' ||
          rawDir === 'ccw';
        const flashId: HardwareFlashSlot =
          encIdx === 2
            ? isCcw
              ? 'e2_ccw'
              : 'e2_cw'
            : isCcw
            ? 'enc_ccw'
            : 'enc_cw';
        const mult = recordKnobVelocity(encIdx, e.accel);

        queueKnobAngleDelta(encIdx, (isCcw ? -24 : 24) * mult);
        soundEngine.playDialTick();
        triggerSlotFlash(flashId);

        const encCfg = encIdx === 2 ? currLayer.encoder2 : currLayer.encoder;
        const binding = isCcw ? encCfg.ccw : encCfg.cw;
        const actionDesc = binding.repeatConfig
          ? summarizeAction(binding, macros)
          : e.action
          ? describeFirmwareAction(e.action, undefined, macros).fullLabel
          : summarizeAction(binding, macros);
        const shortToast = e.action
          ? describeFirmwareAction(e.action, undefined, macros).shortLabel
          : describeFirmwareAction(binding.value, binding.repeatConfig, macros).shortLabel;
        triggerOledToast(
          `${isCcw ? 'CCW' : 'CW'}${encIdx}${mult > 1 ? ` ${mult}x` : ''}`,
          shortToast
        );
        pushLog(
          `Knob ${encIdx} ${isCcw ? 'Left' : 'Right'}`,
          mult > 1 ? `${isCcw ? 'CCW' : 'CW'} ${mult}×` : isCcw ? 'CCW' : 'CW',
          actionDesc,
          'hardware'
        );
        return;
      }

      if (rawSlot === 'dial' || rawSlot === 'dial2') {
        const encIdx: EncoderIndex = rawSlot === 'dial2' ? 2 : 1;
        const flashId: HardwareFlashSlot = encIdx === 2 ? 'dial2' : 'dial';
        soundEngine.playKeyClick();
        triggerSlotFlash(flashId);
        const dialBinding =
          encIdx === 2 ? currLayer.encoder2.dial : currLayer.encoder.dial;
        const actionDesc = dialBinding.repeatConfig
          ? summarizeAction(dialBinding, macros)
          : e.action
          ? describeFirmwareAction(e.action, undefined, macros).fullLabel
          : summarizeAction(dialBinding, macros);
        const shortToast = e.action
          ? describeFirmwareAction(e.action, undefined, macros).shortLabel
          : describeFirmwareAction(dialBinding.value, dialBinding.repeatConfig, macros)
              .shortLabel;
        triggerOledToast(`DIAL ${encIdx}`, shortToast);
        pushLog(`Knob ${encIdx} Press`, 'Press', actionDesc, 'hardware');
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
      if (angle2RafRef.current !== null) {
        window.cancelAnimationFrame(angle2RafRef.current);
      }
      if (oledToastTimerRef.current !== null) {
        window.clearTimeout(oledToastTimerRef.current);
      }
      if (knobAccelTimerRef.current !== null) {
        window.clearTimeout(knobAccelTimerRef.current);
      }
      if (knob2AccelTimerRef.current !== null) {
        window.clearTimeout(knob2AccelTimerRef.current);
      }
      Object.values(flashTimersRef.current).forEach(id => window.clearTimeout(id));
    };
  }, []);

  const hasConflict = (id: ControlId) =>
    conflicts.some(c => c.controlA === id || c.controlB === id);

  const activateKeyControl = async (kid: KeyId) => {
    soundEngine.playKeyClick();
    onSelectControl(kid);

    const cfg = layer.keys[kid];
    const slotKey: HardwareFlashSlot = cfg?.isModeSwitch
      ? 'mode'
      : cfg?.slot || (`b${KEY_ORDER.indexOf(kid) + 1}` as HardwareFlashSlot);
    triggerSlotFlash(slotKey);

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

    if (!cfg) return;

    if (cfg.isModeSwitch || kid === 'k9') {
      const isTvOn = tvEnabled ?? (connection.telemetry?.tvEnabled !== false);
      if (!isTvOn) {
        triggerOledToast(`HOST ${activeBleHost}`, activeProfileName.toUpperCase());
        pushLog(
          'Mode',
          'Press',
          `Flashed ${activeProfileName} (TV mode is off)`,
          connection.connected ? 'usb-test' : 'sim'
        );
        return;
      }
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

  const activateKeyHoldControl = async (kid: ActionKeyId) => {
    soundEngine.playKeyClick();
    const holdSlot = KEY_TO_HOLD_SLOT[kid];
    onSelectControl(holdSlot);
    triggerSlotFlash(holdSlot);

    if (connection.transport === 'demo') {
      usbHardware.simulateDemoPadInput(holdSlot);
      return;
    }

    const cfg = layer.keys[kid];
    if (!cfg) return;

    const keyNum = kid.slice(1);
    const keyLabel = `Key ${keyNum} Hold`;
    const holdBinding = cfg.triggers.hold ?? { type: 'none' as const, value: '' };
    const summary = summarizeAction(holdBinding, customMacros);
    const shortToast = describeFirmwareAction(
      holdBinding.value,
      holdBinding.repeatConfig,
      customMacros
    ).shortLabel;
    triggerOledToast(`HOLD K${keyNum}`, shortToast);

    if (connection.connected && holdBinding.value) {
      const sent = await onExecuteHardwareBinding(holdBinding);
      pushLog(keyLabel, 'Hold', summary, sent ? 'usb-test' : 'sim');
    } else {
      if (
        holdBinding.value === 'BLE:HOST1' ||
        holdBinding.value === 'BLE:HOST2' ||
        holdBinding.value === 'BLE:HOST3'
      ) {
        const targetSlot = Number(holdBinding.value.slice(-1)) as BleHostSlot;
        setOfflineBleHost(targetSlot);
        onSelectProfile(bleSlotToProfileId(targetSlot));
      } else if (holdBinding.value === 'BLE:NEXT_HOST') {
        const nextSlot = (((activeBleHost % 3) + 1) as BleHostSlot);
        setOfflineBleHost(nextSlot);
        onSelectProfile(bleSlotToProfileId(nextSlot));
      }
      pushLog(keyLabel, 'Hold', summary, 'sim');
    }
  };

  const viewedBleHost = profileIdToBleSlot(activeProfileId);
  const activeBleHost: BleHostSlot = connection.connected
    ? connection.telemetry?.bleActiveHost ?? 1
    : viewedBleHost ?? offlineBleHost;
  const oledBadgeHost: BleHostSlot = viewedBleHost ?? activeBleHost;

  const triggerModePlusDialHostSwitch = async (
    dir: 'cw' | 'ccw',
    encoderIndex: EncoderIndex = 1
  ) => {
    queueKnobAngleDelta(encoderIndex, dir === 'cw' ? 24 : -24);
    soundEngine.playDialTick();

    const delta = dir === 'cw' ? 1 : -1;
    if (connection.transport === 'demo') {
      usbHardware.simulateDemoHostCycle(delta);
      return;
    }

    const baseHost = viewedBleHost ?? activeBleHost;
    const nextIdx = (baseHost - 1 + (delta > 0 ? 1 : 2)) % 3;
    const nextSlot = (nextIdx + 1) as BleHostSlot;
    triggerOledToast(`HOST ${nextSlot}`, `BertoPad ${nextSlot}`);

    if (connection.connected) {
      await onSwitchBleHost(nextSlot);
      pushLog(
        'Mode + Dial',
        `[H${nextSlot}]`,
        `Switched BLE to BertoPad ${nextSlot} (Device ${nextSlot})`,
        'usb-test'
      );
    } else {
      setOfflineBleHost(nextSlot);
      onSelectProfile(bleSlotToProfileId(nextSlot));
      pushLog(
        'Mode + Dial',
        `[H${nextSlot}]`,
        `Switched workspace to Device ${nextSlot} (BertoPad ${nextSlot})`,
        'sim'
      );
    }
  };

  const triggerEncoderSpin = async (
    encoderIndex: EncoderIndex,
    dir: 'cw' | 'ccw',
    holdModeCombo = false
  ) => {
    if (viewMode === 'test' && encoderIndex === 1 && (holdModeCombo || pressedKey === 'k9')) {
      await triggerModePlusDialHostSwitch(dir, encoderIndex);
      return;
    }

    const subId: HardwareFlashSlot & ControlId =
      encoderIndex === 2
        ? dir === 'cw'
          ? 'e2_cw'
          : 'e2_ccw'
        : dir === 'cw'
        ? 'enc_cw'
        : 'enc_ccw';

    onSelectControl(subId);
    triggerSlotFlash(subId);

    if (connection.transport === 'demo') {
      queueKnobAngleDelta(encoderIndex, dir === 'cw' ? 24 : -24);
      soundEngine.playDialTick();
      usbHardware.simulateDemoPadInput(subId);
      return;
    }

    const mult = recordKnobVelocity(encoderIndex);
    queueKnobAngleDelta(encoderIndex, (dir === 'cw' ? 24 : -24) * mult);
    soundEngine.playDialTick();

    const encCfg = encoderIndex === 2 ? layer.encoder2 : layer.encoder;
    const binding = dir === 'cw' ? encCfg.cw : encCfg.ccw;
    const summary = summarizeAction(binding, customMacros);
    const shortToast = describeFirmwareAction(
      binding.value,
      binding.repeatConfig,
      customMacros
    ).shortLabel;
    const label = `Knob ${encoderIndex} ${dir === 'cw' ? 'Right' : 'Left'}`;
    triggerOledToast(
      `${dir.toUpperCase()}${encoderIndex}${mult > 1 ? ` ${mult}x` : ''}`,
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

  const triggerEncoderHoldSpin = async (dir: 'cw' | 'ccw') => {
    const subId: HardwareFlashSlot & ControlId = dir === 'cw' ? 'push_cw' : 'push_ccw';
    onSelectControl(subId);
    triggerSlotFlash(subId);

    if (connection.transport === 'demo') {
      queueKnobAngleDelta(1, dir === 'cw' ? 24 : -24);
      soundEngine.playDialTick();
      usbHardware.simulateDemoPadInput(subId);
      return;
    }

    const mult = recordKnobVelocity(1);
    queueKnobAngleDelta(1, (dir === 'cw' ? 24 : -24) * mult);
    soundEngine.playDialTick();

    const binding =
      (dir === 'cw' ? layer.encoder.pushCw : layer.encoder.pushCcw) ?? {
        type: 'none' as const,
        value: ''
      };
    const summary = summarizeAction(binding, customMacros);
    const shortToast = describeFirmwareAction(
      binding.value,
      binding.repeatConfig,
      customMacros
    ).shortLabel;
    const label = `Knob 1 Hold+${dir === 'cw' ? 'Right' : 'Left'}`;
    triggerOledToast(
      `HOLD ${dir.toUpperCase()}${mult > 1 ? ` ${mult}x` : ''}`,
      shortToast
    );

    if (connection.connected && binding.value) {
      const sent = await onExecuteHardwareBinding(binding);
      pushLog(
        label,
        mult > 1 ? `Hold+${dir.toUpperCase()} ${mult}×` : `Hold+${dir.toUpperCase()}`,
        summary,
        sent ? 'usb-test' : 'sim'
      );
    } else {
      pushLog(
        label,
        mult > 1 ? `Hold+${dir.toUpperCase()} ${mult}×` : `Hold+${dir.toUpperCase()}`,
        summary,
        'sim'
      );
    }
  };

  const handleEncoderWheel = (encoderIndex: EncoderIndex, e: React.WheelEvent) => {
    e.preventDefault();
    if (encoderIndex === 1 && e.altKey) {
      triggerEncoderHoldSpin(e.deltaY > 0 ? 'cw' : 'ccw');
      return;
    }
    triggerEncoderSpin(encoderIndex, e.deltaY > 0 ? 'cw' : 'ccw', e.shiftKey);
  };

  const activateDialPush = async (encoderIndex: EncoderIndex) => {
    soundEngine.playKeyClick();
    const dialSlot: HardwareFlashSlot & ControlId =
      encoderIndex === 2 ? 'dial2' : 'dial';
    triggerSlotFlash(dialSlot);
    onSelectControl(dialSlot);

    if (connection.transport === 'demo') {
      usbHardware.simulateDemoPadInput(dialSlot);
      return;
    }

    const encCfg = encoderIndex === 2 ? layer.encoder2 : layer.encoder;
    const binding = encCfg.dial;
    const summary = summarizeAction(binding, customMacros);
    const shortToast = describeFirmwareAction(
      binding.value,
      binding.repeatConfig,
      customMacros
    ).shortLabel;
    triggerOledToast(`DIAL ${encoderIndex}`, shortToast);
    if (connection.connected && binding.value) {
      const sent = await onExecuteHardwareBinding(binding);
      pushLog(`Knob ${encoderIndex} Press`, 'Press', summary, sent ? 'usb-test' : 'sim');
    } else {
      pushLog(`Knob ${encoderIndex} Press`, 'Press', summary, 'sim');
    }
  };

  const renderEncoderUnit = (encoderIndex: EncoderIndex) => {
    const encCfg = encoderIndex === 2 ? layer.encoder2 : layer.encoder;
    const dialId: HardwareFlashSlot & ControlId = encoderIndex === 2 ? 'dial2' : 'dial';
    const cwId: HardwareFlashSlot & ControlId =
      encoderIndex === 2 ? 'e2_cw' : 'enc_cw';
    const ccwId: HardwareFlashSlot & ControlId =
      encoderIndex === 2 ? 'e2_ccw' : 'enc_ccw';
    const rootControlId: ControlId = encoderIndex === 2 ? 'encoder2' : 'encoder';

    const angle = encoderIndex === 2 ? knob2Angle : knobAngle;
    const isPressed = encoderIndex === 2 ? knob2Pressed : knobPressed;
    const setPressed = encoderIndex === 2 ? setKnob2Pressed : setKnobPressed;
    const accel = encoderIndex === 2 ? knob2Accel : knobAccel;

    const isDialSelected =
      (selectedControl === dialId || selectedControl === rootControlId) &&
      viewMode === 'edit';
    const isCwSelected = selectedControl === cwId && viewMode === 'edit';
    const isCcwSelected = selectedControl === ccwId && viewMode === 'edit';

    const isDialFlashed = flashedSlots.has(dialId);
    const isCwFlashed = flashedSlots.has(cwId);
    const isCcwFlashed = flashedSlots.has(ccwId);

    const dialConflict = hasConflict(dialId);
    const cwConflict = hasConflict(cwId);
    const ccwConflict = hasConflict(ccwId);

    const dialInfo = describeFirmwareAction(
      encCfg.dial.value,
      encCfg.dial.repeatConfig,
      customMacros
    );
    const cwInfo = describeFirmwareAction(
      encCfg.cw.value,
      encCfg.cw.repeatConfig,
      customMacros
    );
    const ccwInfo = describeFirmwareAction(
      encCfg.ccw.value,
      encCfg.ccw.repeatConfig,
      customMacros
    );

    const isDialUnassigned = !encCfg.dial.value;
    const isCwUnassigned = !encCfg.cw.value;
    const isCcwUnassigned = !encCfg.ccw.value;

    const pushCwBind = encCfg.pushCw ?? { type: 'none' as const, value: '' };
    const pushCcwBind = encCfg.pushCcw ?? { type: 'none' as const, value: '' };
    const isPushCwSelected = selectedControl === 'push_cw' && viewMode === 'edit';
    const isPushCcwSelected = selectedControl === 'push_ccw' && viewMode === 'edit';
    const isPushCwFlashed = flashedSlots.has('push_cw');
    const isPushCcwFlashed = flashedSlots.has('push_ccw');
    const pushCwInfo = describeFirmwareAction(
      pushCwBind.value,
      pushCwBind.repeatConfig,
      customMacros
    );
    const pushCcwInfo = describeFirmwareAction(
      pushCcwBind.value,
      pushCcwBind.repeatConfig,
      customMacros
    );

    const ringAccent = encCfg.color || '#F2A33A';

    return (
      <div
        className="flex flex-col items-center justify-center gap-1.5"
        style={view3D ? { transformStyle: 'preserve-3d', pointerEvents: 'auto' } : undefined}
      >
        <div
          className="relative flex items-center justify-center gap-1.5"
          style={view3D ? { transformStyle: 'preserve-3d', pointerEvents: 'auto' } : undefined}
        >
          {accel > 1 && (
            <span
              title={`Knob ${encoderIndex} velocity acceleration (${accel}× step)`}
              className="absolute -top-2.5 right-6 z-10 px-1.5 py-0.5 rounded-md bg-[#1E2128] border border-[#F2A33A] font-mono text-[9px] font-bold text-[#F2A33A] tabular-nums pointer-events-none"
            >
              {accel}×
            </span>
          )}

          {/* Clickable Turn Left Arrow Button */}
          <button
            type="button"
            aria-label={`Knob ${encoderIndex} Turn Left: ${ccwInfo.fullLabel}`}
            onPointerDown={e => {
              e.stopPropagation();
              try {
                (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
              } catch {}
              handlePointerDown(`enc_${encoderIndex}_ccw`, e);
            }}
            onPointerUp={e => {
              e.stopPropagation();
              try {
                if ((e.currentTarget as HTMLButtonElement).hasPointerCapture(e.pointerId)) {
                  (e.currentTarget as HTMLButtonElement).releasePointerCapture(e.pointerId);
                }
              } catch {}
              handlePointerUp(`enc_${encoderIndex}_ccw`, e, () => triggerEncoderSpin(encoderIndex, 'ccw'));
            }}
            onClick={e => {
              e.stopPropagation();
              handleClick(() => triggerEncoderSpin(encoderIndex, 'ccw'));
            }}
            title={`Knob ${encoderIndex} Turn Left (${ccwInfo.fullLabel}) — click to ${
              viewMode === 'edit' ? 'configure' : 'trigger'
            }`}
            style={
              view3D
                ? {
                    transform: 'translateZ(20px)',
                    transformStyle: 'preserve-3d',
                    zIndex: 25,
                    touchAction: 'manipulation'
                  }
                : undefined
            }
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-150 cursor-pointer active:scale-95 ${
              isCcwFlashed
                ? 'bg-[#F2A33A]/25 ring-2 ring-[#F2A33A] text-[#ECEAE4] scale-110'
                : isCcwSelected
                ? 'bg-[rgba(var(--accent-rgb),0.28)] ring-2 ring-[var(--accent)] text-[#ECEAE4] shadow-[0_0_16px_rgba(var(--accent-rgb),0.45)]'
                : ccwConflict
                ? 'bg-[#F2A33A]/15 ring-1 ring-[#F2A33A]/70 text-[#F2A33A] hover:bg-[#F2A33A]/25'
                : `bg-[#ECEAE4]/[0.06] hover:bg-[#ECEAE4]/[0.14] text-[#A3A6AD] hover:text-[#ECEAE4] ${
                    isCcwUnassigned ? 'opacity-45 hover:opacity-85' : ''
                  }`
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5 pointer-events-none" />
          </button>

          {/* Physical Rotary Knob (`dial` / `dial2`) — BertoPad dial with Bone track + Amber level arc */}
          <button
            type="button"
            aria-label={`Knob ${encoderIndex} Press: ${dialInfo.fullLabel}`}
            onWheel={e => handleEncoderWheel(encoderIndex, e)}
            onMouseDown={() => setPressed(true)}
            onMouseUp={() => setPressed(false)}
            onMouseLeave={() => setPressed(false)}
            onPointerDown={e => {
              setPressed(true);
              try {
                (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
              } catch {}
              handlePointerDown(`dial_${encoderIndex}`, e);
            }}
            onPointerUp={e => {
              setPressed(false);
              try {
                if ((e.currentTarget as HTMLButtonElement).hasPointerCapture(e.pointerId)) {
                  (e.currentTarget as HTMLButtonElement).releasePointerCapture(e.pointerId);
                }
              } catch {}
              handlePointerUp(`dial_${encoderIndex}`, e, () => activateDialPush(encoderIndex));
            }}
            onPointerCancel={e => {
              setPressed(false);
              try {
                if ((e.currentTarget as HTMLButtonElement).hasPointerCapture(e.pointerId)) {
                  (e.currentTarget as HTMLButtonElement).releasePointerCapture(e.pointerId);
                }
              } catch {}
            }}
            onClick={() => handleClick(() => activateDialPush(encoderIndex))}
            onKeyDown={e => {
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                triggerEncoderSpin(encoderIndex, 'cw');
              } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                triggerEncoderSpin(encoderIndex, 'ccw');
              }
            }}
            style={{
              borderColor: isDialFlashed
                ? '#F2A33A'
                : isDialSelected
                ? 'var(--accent)'
                : dialConflict
                ? '#F2A33A'
                : 'rgba(236, 234, 228, 0.14)',
              boxShadow: isDialFlashed
                ? '0 0 0 4px rgba(242, 163, 58, 0.4), 0 0 26px rgba(242, 163, 58, 0.35)'
                : undefined,
              filter: isPressed ? 'brightness(1.2)' : undefined,
              ...(view3D
                ? {
                    transform: 'translateZ(24px)',
                    transformStyle: 'preserve-3d',
                    zIndex: 25,
                    touchAction: 'manipulation'
                  }
                : {})
            }}
            className={`relative w-20 h-20 sm:w-24 sm:h-24 xl:w-26 xl:h-26 rounded-full bg-gradient-to-b from-[#1E2128] to-[#14161B] border-2 flex items-center justify-center transition-all duration-150 cursor-pointer select-none ${
              isDialSelected && !isDialFlashed
                ? 'encoder-ring-selected'
                : !isDialFlashed
                ? 'shadow-[0_10px_22px_rgba(0,0,0,0.52),inset_0_1px_1px_rgba(236,234,228,0.09)]'
                : ''
            } ${isPressed || isDialFlashed ? 'scale-95' : 'hover:scale-[1.02]'} ${
              isDialUnassigned && !isDialSelected && !isDialFlashed
                ? 'opacity-55 hover:opacity-85'
                : ''
            }`}
          >
            {/* Dial Level Arc (Bone track + Amber level arc matching BertoPad mark) */}
            <svg
              viewBox="0 0 100 100"
              aria-hidden="true"
              style={{ transform: `rotate(${angle}deg)` }}
              className="absolute inset-1 w-[calc(100%-8px)] h-[calc(100%-8px)] pointer-events-none transition-transform duration-150 ease-out"
            >
              <circle
                cx="50"
                cy="50"
                r="43"
                fill="none"
                stroke="#ECEAE4"
                strokeOpacity="0.26"
                strokeWidth="3.5"
              />
              <circle
                cx="50"
                cy="50"
                r="43"
                fill="none"
                stroke={isDialFlashed ? '#F2A33A' : ringAccent}
                strokeWidth="5.5"
                strokeLinecap="round"
                strokeDasharray="135 271"
                strokeDashoffset="40"
              />
            </svg>

            <span
              style={{
                transform: `rotate(${angle}deg)`
              }}
              className="w-13 h-13 sm:w-16 sm:h-16 xl:w-17 xl:h-17 rounded-full bg-[#14161B] border border-[#ECEAE4]/15 flex items-center justify-center relative transition-transform duration-150 ease-out shadow-inner pointer-events-none"
            >
              <span
                className="w-1.5 h-2.5 rounded-full absolute top-1.5 pointer-events-none"
                style={{
                  backgroundColor: isDialFlashed ? '#F2A33A' : ringAccent
                }}
              />
              <span className="font-mono text-[8px] sm:text-[9px] font-semibold uppercase tracking-wider text-[#ECEAE4] tabular-nums pointer-events-none">
                KNOB {encoderIndex}
              </span>
            </span>
          </button>

          {/* Clickable Turn Right Arrow Button */}
          <button
            type="button"
            aria-label={`Knob ${encoderIndex} Turn Right: ${cwInfo.fullLabel}`}
            onPointerDown={e => {
              e.stopPropagation();
              try {
                (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
              } catch {}
              handlePointerDown(`enc_${encoderIndex}_cw`, e);
            }}
            onPointerUp={e => {
              e.stopPropagation();
              try {
                if ((e.currentTarget as HTMLButtonElement).hasPointerCapture(e.pointerId)) {
                  (e.currentTarget as HTMLButtonElement).releasePointerCapture(e.pointerId);
                }
              } catch {}
              handlePointerUp(`enc_${encoderIndex}_cw`, e, () => triggerEncoderSpin(encoderIndex, 'cw'));
            }}
            onClick={e => {
              e.stopPropagation();
              handleClick(() => triggerEncoderSpin(encoderIndex, 'cw'));
            }}
            title={`Knob ${encoderIndex} Turn Right (${cwInfo.fullLabel}) — click to ${
              viewMode === 'edit' ? 'configure' : 'trigger'
            }`}
            style={
              view3D
                ? {
                    transform: 'translateZ(20px)',
                    transformStyle: 'preserve-3d',
                    zIndex: 25,
                    touchAction: 'manipulation'
                  }
                : undefined
            }
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-150 cursor-pointer active:scale-95 ${
              isCwFlashed
                ? 'bg-[#F2A33A]/25 ring-2 ring-[#F2A33A] text-[#ECEAE4] scale-110'
                : isCwSelected
                ? 'bg-[rgba(var(--accent-rgb),0.28)] ring-2 ring-[var(--accent)] text-[#ECEAE4] shadow-[0_0_16px_rgba(var(--accent-rgb),0.45)]'
                : cwConflict
                ? 'bg-[#F2A33A]/15 ring-1 ring-[#F2A33A]/70 text-[#F2A33A] hover:bg-[#F2A33A]/25'
                : `bg-[#ECEAE4]/[0.06] hover:bg-[#ECEAE4]/[0.14] text-[#A3A6AD] hover:text-[#ECEAE4] ${
                    isCwUnassigned ? 'opacity-45 hover:opacity-85' : ''
                  }`
            }`}
          >
            <RotateCw className="w-3.5 h-3.5 pointer-events-none" />
          </button>
        </div>

        <div
          className="flex items-center gap-1 text-[10px] text-[#A3A6AD] text-center max-w-[164px] truncate"
          style={view3D ? { transform: 'translateZ(16px)', transformStyle: 'preserve-3d', zIndex: 20 } : undefined}
        >
          <button
            type="button"
            onPointerDown={e => handlePointerDown(`enc_sub_${encoderIndex}_ccw`, e)}
            onPointerUp={e =>
              handlePointerUp(`enc_sub_${encoderIndex}_ccw`, e, () => triggerEncoderSpin(encoderIndex, 'ccw'))
            }
            onClick={() => handleClick(() => triggerEncoderSpin(encoderIndex, 'ccw'))}
            title={`Knob ${encoderIndex} Turn Left: ${ccwInfo.fullLabel}`}
            className={`hover:text-[#ECEAE4] transition-colors cursor-pointer truncate ${
              isCcwSelected ? 'text-[#F2A33A] font-semibold' : ''
            }`}
          >
            ↺ {ccwInfo.shortLabel}
          </button>
          <span aria-hidden="true" className="text-[#A3A6AD]/50">
            ·
          </span>
          <button
            type="button"
            onPointerDown={e => handlePointerDown(`enc_sub_${encoderIndex}_press`, e)}
            onPointerUp={e =>
              handlePointerUp(`enc_sub_${encoderIndex}_press`, e, () => activateDialPush(encoderIndex))
            }
            onClick={() => handleClick(() => activateDialPush(encoderIndex))}
            title={`Knob ${encoderIndex} Press: ${dialInfo.fullLabel}`}
            className={`hover:text-[#ECEAE4] transition-colors cursor-pointer truncate ${
              isDialSelected ? 'text-[#F2A33A] font-semibold' : ''
            }`}
          >
            {dialInfo.shortLabel}
          </button>
          <span aria-hidden="true" className="text-[#A3A6AD]/50">
            ·
          </span>
          <button
            type="button"
            onPointerDown={e => handlePointerDown(`enc_sub_${encoderIndex}_cw`, e)}
            onPointerUp={e =>
              handlePointerUp(`enc_sub_${encoderIndex}_cw`, e, () => triggerEncoderSpin(encoderIndex, 'cw'))
            }
            onClick={() => handleClick(() => triggerEncoderSpin(encoderIndex, 'cw'))}
            title={`Knob ${encoderIndex} Turn Right: ${cwInfo.fullLabel}`}
            className={`hover:text-[#ECEAE4] transition-colors cursor-pointer truncate ${
              isCwSelected ? 'text-[#F2A33A] font-semibold' : ''
            }`}
          >
            {cwInfo.shortLabel} ↻
          </button>
        </div>

        {encoderIndex === 1 && (
          <div
            className="flex items-center gap-1 text-[10px] text-[#A3A6AD] text-center max-w-[178px] truncate"
            style={view3D ? { transform: 'translateZ(16px)', transformStyle: 'preserve-3d', zIndex: 20 } : undefined}
          >
            <span className="font-mono text-[9px] text-[#A3A6AD]/75 shrink-0">Push+turn:</span>
            <button
              type="button"
              onPointerDown={e => handlePointerDown('enc1_push_ccw', e)}
              onPointerUp={e =>
                handlePointerUp('enc1_push_ccw', e, () => triggerEncoderHoldSpin('ccw'))
              }
              onClick={() => handleClick(() => triggerEncoderHoldSpin('ccw'))}
              title={`Knob 1 Hold + Turn Left: ${pushCcwInfo.fullLabel}`}
              className={`hover:text-[#ECEAE4] transition-colors cursor-pointer truncate ${
                isPushCcwSelected || isPushCcwFlashed
                  ? 'text-[#F2A33A] font-semibold'
                  : !pushCcwBind.value
                  ? 'text-[#A3A6AD]/65'
                  : ''
              }`}
            >
              ↺ {pushCcwBind.value ? pushCcwInfo.shortLabel : '—'}
            </button>
            <span aria-hidden="true" className="text-[#A3A6AD]/50">
              ·
            </span>
            <button
              type="button"
              onPointerDown={e => handlePointerDown('enc1_push_cw', e)}
              onPointerUp={e =>
                handlePointerUp('enc1_push_cw', e, () => triggerEncoderHoldSpin('cw'))
              }
              onClick={() => handleClick(() => triggerEncoderHoldSpin('cw'))}
              title={`Knob 1 Hold + Turn Right: ${pushCwInfo.fullLabel}`}
              className={`hover:text-[#ECEAE4] transition-colors cursor-pointer truncate ${
                isPushCwSelected || isPushCwFlashed
                  ? 'text-[#F2A33A] font-semibold'
                  : !pushCwBind.value
                  ? 'text-[#A3A6AD]/65'
                  : ''
              }`}
            >
              {pushCwBind.value ? pushCwInfo.shortLabel : '—'} ↻
            </button>
          </div>
        )}
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
    const showHoldRow = !cfg.isModeSwitch && kid !== 'k9' && hasKeyHold;
    const actionKid = kid as ActionKeyId;
    const holdSlot = showHoldRow ? KEY_TO_HOLD_SLOT[actionKid] : null;
    const holdBinding = cfg.triggers.hold ?? { type: 'none' as const, value: '' };
    const holdInfo = describeFirmwareAction(
      holdBinding.value,
      holdBinding.repeatConfig,
      customMacros
    );
    const isHoldSelected =
      Boolean(holdSlot && selectedControl === holdSlot) && viewMode === 'edit';
    const isHoldFlashed = Boolean(holdSlot && flashedSlots.has(holdSlot));
    const holdConflict = Boolean(holdSlot && hasConflict(holdSlot));

    return (
      <div
        key={kid}
        className="flex flex-col items-center gap-1.5 group relative"
        style={view3D ? { transformStyle: 'preserve-3d', pointerEvents: 'auto' } : undefined}
      >
        <button
          type="button"
          aria-label={`${badgeText}: ${cfg.appearance.label}`}
          title={
            cfg.isModeSwitch
              ? (tvEnabled ?? (connection.telemetry?.tvEnabled !== false))
                ? 'Mode Switch (short press: Host/TV, hold+dial: Host 1–3)'
                : 'Mode Switch (short press: flash current host, hold+dial: Host 1–3)'
              : isUnassigned
              ? `Key ${index + 1} — Unassigned`
              : `Key ${index + 1}: ${summarizeAction(cfg.triggers.tap, customMacros)}`
          }
          onMouseDown={() => setPressedKey(kid)}
          onMouseUp={() => setPressedKey(null)}
          onMouseLeave={() => {
            if (pressedKey === kid) setPressedKey(null);
          }}
          onPointerDown={e => {
            setPressedKey(kid);
            try {
              (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
            } catch {}
            handlePointerDown(`key_${kid}`, e);
          }}
          onPointerUp={e => {
            setPressedKey(null);
            try {
              if ((e.currentTarget as HTMLButtonElement).hasPointerCapture(e.pointerId)) {
                (e.currentTarget as HTMLButtonElement).releasePointerCapture(e.pointerId);
              }
            } catch {}
            handlePointerUp(`key_${kid}`, e, () => activateKeyControl(kid));
          }}
          onPointerCancel={e => {
            if (pressedKey === kid) setPressedKey(null);
            try {
              if ((e.currentTarget as HTMLButtonElement).hasPointerCapture(e.pointerId)) {
                (e.currentTarget as HTMLButtonElement).releasePointerCapture(e.pointerId);
              }
            } catch {}
          }}
          onClick={() => handleClick(() => activateKeyControl(kid))}
          style={{
            borderColor: isFlashed
              ? '#F2A33A'
              : isSelected
              ? 'var(--accent)'
              : conflict
              ? '#F2A33A'
              : cfg.isModeSwitch
              ? 'rgba(242, 163, 58, 0.35)'
              : 'rgba(236, 234, 228, 0.08)',
            boxShadow: isFlashed
              ? '0 0 0 4px rgba(242, 163, 58, 0.4), 0 0 24px rgba(242, 163, 58, 0.32)'
              : isSelected
              ? undefined
              : isDown
              ? '0 2px 4px rgba(0,0,0,0.6), inset 0 3px 6px rgba(0,0,0,0.6)'
              : '0 6px 0 #14161B, 0 10px 18px rgba(0,0,0,0.46), inset 0 1px 0 rgba(236,234,228,0.08)',
            filter: isDown ? 'brightness(1.2)' : undefined,
            ...(view3D
              ? {
                  transform: isSelected
                    ? 'translateZ(26px)'
                    : 'translateZ(18px)',
                  transformStyle: 'preserve-3d',
                  zIndex: isSelected ? 30 : 20,
                  touchAction: 'manipulation'
                }
              : {})
          }}
          className={`relative shrink-0 w-[86px] h-[86px] sm:w-[96px] sm:h-[96px] xl:w-[106px] xl:h-[106px] 2xl:w-[112px] 2xl:h-[112px] rounded-2xl bg-[#1E2128] border-2 p-2.5 sm:p-3 flex flex-col items-center justify-between select-none ${
            view3D ? '' : 'transition-all duration-150 ease-out'
          } cursor-pointer ${
            !view3D && isSelected && !isFlashed ? 'keycap-selected-glow -translate-y-0.5' : ''
          } ${!view3D && isDown ? 'translate-y-1' : !view3D && !isSelected ? 'hover:-translate-y-0.5' : ''} ${
            isUnassigned && !isSelected && !isFlashed
              ? 'opacity-40 hover:opacity-75'
              : ''
          }`}
        >
          {holdBinding.value && (
            <span aria-label="Hold action assigned" title="Hold action assigned" className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-amber-400 pointer-events-none" />
          )}
          <div className="w-full flex items-center justify-between pointer-events-none">
            <span
              className={`font-mono text-[9px] sm:text-[10px] leading-none font-medium tabular-nums pointer-events-none ${
                isFlashed || cfg.isModeSwitch
                  ? 'text-[#F2A33A]'
                  : isSelected
                  ? 'text-[#ECEAE4]'
                  : 'text-[#A3A6AD]'
              }`}
            >
              {badgeText}
            </span>
            {conflict ? (
              <span title="Duplicate action warning" className="pointer-events-none">
                <AlertTriangle className="w-3 h-3 text-[#F2A33A] shrink-0" />
              </span>
            ) : null}
          </div>

          <div className="my-auto flex items-center justify-center pointer-events-none">
            <KeycapIcon
              icon={cfg.appearance.icon}
              className={`w-6 h-6 sm:w-7 sm:h-7 transition-transform duration-150 pointer-events-none ${
                isFlashed || isSelected ? 'scale-105' : ''
              }`}
              style={{
                color: isFlashed
                  ? '#F2A33A'
                  : isUnassigned
                  ? '#A3A6AD'
                  : cfg.appearance.labelColor || '#ECEAE4'
              }}
            />
          </div>

          <span
            className={`text-[11px] sm:text-xs font-medium line-clamp-2 text-center whitespace-normal break-words max-w-full tracking-tight leading-tight pointer-events-none ${
              isUnassigned ? 'text-[#A3A6AD]' : 'text-[#ECEAE4]'
            }`}
          >
            {cfg.appearance.label}
          </span>
        </button>

        {showHoldRow && holdSlot && (
          <button
            type="button"
            aria-label={`Key ${index + 1} Hold: ${holdInfo.fullLabel}`}
            title={
              holdBinding.value
                ? `Key ${index + 1} Hold (500 ms): ${summarizeAction(holdBinding, customMacros)}`
                : `Key ${index + 1} Hold (500 ms) — Unassigned`
            }
            onPointerDown={e => {
              try {
                (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
              } catch {}
              handlePointerDown(`hold_${actionKid}`, e);
            }}
            onPointerUp={e => {
              try {
                if ((e.currentTarget as HTMLButtonElement).hasPointerCapture(e.pointerId)) {
                  (e.currentTarget as HTMLButtonElement).releasePointerCapture(e.pointerId);
                }
              } catch {}
              handlePointerUp(`hold_${actionKid}`, e, () => activateKeyHoldControl(actionKid));
            }}
            onClick={() => handleClick(() => activateKeyHoldControl(actionKid))}
            style={
              view3D
                ? {
                    transform: 'translateZ(14px)',
                    transformStyle: 'preserve-3d',
                    zIndex: 25,
                    touchAction: 'manipulation'
                  }
                : undefined
            }
            className={`w-[86px] sm:w-[96px] xl:w-[106px] 2xl:w-[112px] px-2 py-1 rounded-lg bg-[#1E2128] border items-center justify-between gap-1 text-left select-none transition-all duration-150 cursor-pointer ${
              isHoldFlashed || isHoldSelected || isSelected || holdBinding.value
                ? 'flex'
                : 'hidden group-hover:flex'
            } ${
              isHoldFlashed
                ? 'border-[#F2A33A] bg-[#F2A33A]/15 text-[#ECEAE4]'
                : isHoldSelected
                ? 'border-[var(--accent)] bg-[rgba(var(--accent-rgb),0.16)] text-[#ECEAE4]'
                : holdConflict
                ? 'border-[#F2A33A]/75 text-[#F2A33A]'
                : holdBinding.value
                ? 'border-[#ECEAE4]/12 hover:border-[#ECEAE4]/30 text-[#ECEAE4]'
                : 'border-[#ECEAE4]/8 hover:border-[#ECEAE4]/22 text-[#A3A6AD]/75'
            }`}
          >
            <span
              className={`font-mono text-[9px] font-medium shrink-0 tabular-nums ${
                isHoldFlashed || isHoldSelected ? 'text-[#F2A33A]' : 'text-[#A3A6AD]'
              }`}
            >
              Hold
            </span>
            <span
              className={`text-[10px] font-medium truncate ${
                holdBinding.value ? 'text-[#ECEAE4]' : 'text-[#A3A6AD]/65 font-mono'
              }`}
            >
              {holdBinding.value ? holdInfo.shortLabel : '—'}
            </span>
          </button>
        )}
      </div>
    );
  };

  const telemetry = connection.telemetry;

  return (
    <div className="flex-1 @container flex flex-col items-center p-4 sm:p-6 lg:overflow-y-auto relative min-w-0">
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
            <span>Test controls</span>
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setView3D(v => !v)}
            title={
              motionSensor.isOnline
                ? `GY-521 Motion Active · Pitch: ${motionSensor.pitch.toFixed(0)}° · Roll: ${motionSensor.roll.toFixed(0)}° · Yaw: ${motionSensor.yaw.toFixed(0)}°`
                : 'Toggle high-fidelity 3D tactile view with real-time GY-521 motion tracking'
            }
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium shadow-2xs transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              view3D
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold'
                : 'bg-[var(--bg-panel)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>
              {view3D
                ? motionSensor.isOnline
                  ? '3D Live Gyro'
                  : '3D Tactile'
                : '3D View'}
            </span>
          </button>

          {view3D && (
            <button
              type="button"
              onClick={() => {
                setCalibrating3D(true);
                setCalibStep('flat');
              }}
              title="Calibrate Left/Right Tilt and Zero Point for 3D View"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--bg-panel)] hover:bg-[var(--bg-elevated)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] shadow-2xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Compass className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Calibrate Gyro</span>
            </button>
          )}

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
              Side Knobs
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
              Top Dials
            </button>
          </div>
        </div>
      </div>

      {/* Unsupported Browser Banner (Firefox / Safari) */}
      {!usbHardware.browserSupportsWebSerial && !connection.connected && (
        <div className="w-full max-w-2xl mt-3 px-4 py-3 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)] flex items-center justify-between gap-3 flex-wrap shrink-0">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <AlertCircle className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
            <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
              <strong className="text-[var(--text-primary)]">Unsupported browser:</strong>{' '}
              Web Serial requires Chrome or Edge on desktop. You can explore everything in Demo Mode.
            </div>
          </div>
          <button
            type="button"
            onClick={onStartDemoMode}
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <PlayCircle className="w-3.5 h-3.5" />
            <span>Start Demo</span>
          </button>
        </div>
      )}

      {/* Active Hardware Setup Mode Banner */}
      {connection.connected && connection.telemetry?.setupMode && onOpenSetupWizard && (
        <div className="w-full max-w-2xl mt-3 px-4 py-3 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)] flex items-center justify-between gap-3 flex-wrap shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <SlidersHorizontal className="w-4 h-4 text-[var(--accent)] shrink-0" />
            <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
              <strong className="text-[var(--text-primary)]">Board is in Setup Mode.</strong>{' '}
              Configure your starter layout, Bluetooth device names, and optional Wi-Fi or TV pairing.
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenSetupWizard}
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }}
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
            <span className="font-semibold text-[var(--text-primary)]">No USB BertoPad connected</span>
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
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-95 transition-opacity cursor-pointer whitespace-nowrap flex items-center gap-1.5"
              >
                <Usb className="w-3.5 h-3.5" />
                <span>Connect USB</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Interactive 3D Gyro Motion Calibration Banner */}
      {view3D && calibrating3D && (
        <div className="w-full max-w-2xl mt-3 p-3.5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--accent)] shadow-lg space-y-3 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-[var(--accent)] shrink-0" />
              <span className="text-xs font-bold text-[var(--text-primary)]">
                GY-521 3D Directional Calibration
              </span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-input)] text-[var(--accent)] uppercase font-semibold">
                Step: {calibStep}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setCalibrating3D(false);
                setCalibStep(null);
              }}
              className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              Cancel
            </button>
          </div>

          <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
            {calibStep === 'flat' && (
              <span>
                1. Place the BertoPad <strong>flat and resting still</strong> on your desk, then click <strong>&quot;Set Flat Zero&quot;</strong>.
              </span>
            )}
            {calibStep === 'left' && (
              <span>
                2. Tilt the BertoPad <strong>to the left (~30°)</strong> and hold it steady, then click <strong>&quot;Capture Left Tilt&quot;</strong>.
              </span>
            )}
            {calibStep === 'right' && (
              <span>
                3. Tilt the BertoPad <strong>to the right (~30°)</strong> and hold steady, then click <strong>&quot;Capture Right Tilt&quot;</strong>.
              </span>
            )}
            {calibStep === 'backward' && (
              <span>
                4. Tilt the BertoPad <strong>backward towards you (~25°)</strong>, then click <strong>&quot;Capture Backward Tilt&quot;</strong>.
              </span>
            )}
            {calibStep === 'forward' && (
              <span>
                5. Tilt the BertoPad <strong>forward away from you (~25°)</strong>, then click <strong>&quot;Finish &amp; Save Normalization&quot;</strong>.
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums">
              Live Pitch: {motionSensor.pitch.toFixed(1)}° · Roll: {motionSensor.roll.toFixed(1)}° · Yaw: {motionSensor.yaw.toFixed(1)}°
            </span>

            <div className="flex items-center gap-2 shrink-0">
              {calibStep === 'flat' && (
                <button
                  type="button"
                  onClick={async () => {
                    flatPitchRef.current = motionSensor.rawPitch;
                    flatRollRef.current = motionSensor.rawRoll;
                    flatYawRef.current = motionSensor.rawYaw;
                    if (connection.connected) {
                      await motionSensor.calibrateFlatZero().catch(() => {});
                    }
                    soundEngine.playKeyClick();
                    setCalibStep('left');
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold hover:opacity-90 cursor-pointer"
                >
                  Set Flat Zero →
                </button>
              )}

              {calibStep === 'left' && (
                <button
                  type="button"
                  onClick={() => {
                    leftTiltSampleRef.current = motionSensor.rawRoll;
                    soundEngine.playKeyClick();
                    setCalibStep('right');
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold hover:opacity-90 cursor-pointer"
                >
                  Capture Left Tilt →
                </button>
              )}

              {calibStep === 'right' && (
                <button
                  type="button"
                  onClick={() => {
                    rightTiltSampleRef.current = motionSensor.rawRoll;
                    soundEngine.playKeyClick();
                    setCalibStep('backward');
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold hover:opacity-90 cursor-pointer"
                >
                  Capture Right Tilt →
                </button>
              )}

              {calibStep === 'backward' && (
                <button
                  type="button"
                  onClick={() => {
                    backwardTiltSampleRef.current = motionSensor.rawPitch;
                    soundEngine.playKeyClick();
                    setCalibStep('forward');
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold hover:opacity-90 cursor-pointer"
                >
                  Capture Backward Tilt →
                </button>
              )}

              {calibStep === 'forward' && (
                <button
                  type="button"
                  onClick={() => {
                    forwardTiltSampleRef.current = motionSensor.rawPitch;
                    const newCalib = computeGyroCalibration(
                      flatPitchRef.current,
                      flatRollRef.current,
                      flatYawRef.current,
                      leftTiltSampleRef.current ?? motionSensor.rawRoll - 30,
                      rightTiltSampleRef.current ?? motionSensor.rawRoll + 30,
                      backwardTiltSampleRef.current ?? motionSensor.rawPitch - 25,
                      forwardTiltSampleRef.current ?? motionSensor.rawPitch + 25
                    );

                    localStorage.setItem('bertopad_gyro_calib', JSON.stringify(newCalib));
                    window.dispatchEvent(new CustomEvent('bertopad_gyro_calib_updated', { detail: newCalib }));

                    soundEngine.playSuccessChime();
                    setCalibrating3D(false);
                    setCalibStep(null);
                    triggerOledToast('GYRO CALIBRATED', 'NORMALIZATION SAVED');
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
                >
                  Finish &amp; Save Normalization ✓
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Vertically Centered Larger Physical BertoPad with optional 3D Isometric View */}
      <div
        className={`my-auto py-4 sm:py-6 flex flex-col items-center justify-center w-full ${
          view3D ? '' : 'transition-all duration-300'
        }`}
        style={view3D ? { perspective: '1100px', transformStyle: 'preserve-3d', pointerEvents: 'auto' } : undefined}
      >
        <div
          ref={chassis3dRef}
          className={`w-fit max-w-full min-w-[300px] chassis-shell rounded-[32px] sm:rounded-[38px] p-4 sm:p-6 xl:p-7 border border-[#ECEAE4]/10 ${
            view3D
              ? 'shadow-[0_45px_80px_-15px_rgba(0,0,0,0.85),0_20px_40px_-10px_rgba(var(--accent-rgb),0.2)] ring-1 ring-[#ECEAE4]/20'
              : 'transition-all duration-300'
          }`}
          style={
            view3D
              ? {
                  transformStyle: 'preserve-3d',
                  willChange: 'transform',
                  pointerEvents: 'auto'
                }
              : undefined
          }
        >
          {/* 128x64 SSD1306 1-Bit Monochrome Hardware OLED Strip (matches brand card OLED boot screen) */}
          <div
            className="mb-5 sm:mb-6 px-3.5 py-2.5 rounded-xl bg-black border border-[#ECEAE4]/15 shadow-inner flex items-center justify-between gap-2 min-h-[42px]"
            style={view3D ? { transform: 'translateZ(12px)', transformStyle: 'preserve-3d', zIndex: 15 } : undefined}
          >
            <div className="flex items-center gap-2 min-w-0">
              <img
                src="/logo-mark-mono.svg"
                alt="BertoPad OLED"
                referrerPolicy="no-referrer"
                className={`w-4 h-4 object-contain shrink-0 opacity-90 ${
                  connection.connecting ? 'animate-[spin_3s_linear_infinite]' : ''
                }`}
              />
              {oledToast ? (
                <div className="flex items-center gap-1.5 min-w-0 font-mono text-[10px] sm:text-[11px] tabular-nums">
                  <span className="px-1.5 py-0.5 rounded bg-[#ECEAE4] text-[#14161B] font-bold uppercase tracking-wider leading-none shrink-0">
                    {oledToast.title}
                  </span>
                  {oledToast.subtitle && (
                    <span className="text-[#ECEAE4] font-semibold truncate">
                      {oledToast.subtitle}
                    </span>
                  )}
                </div>
              ) : (
                <span className="font-mono text-[11px] sm:text-xs font-bold uppercase tracking-wider truncate tabular-nums text-[#ECEAE4]">
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
                      telemetry?.bleConnected ? 'text-[#ECEAE4]' : 'text-[#A3A6AD]/60'
                    }`}
                    title={
                      telemetry?.bleConnected
                        ? `BLE Connected · ${telemetry.bleDeviceName || `BertoPad ${activeBleHost}`}`
                        : `BLE Disconnected · ${telemetry?.bleDeviceName || `BertoPad ${activeBleHost}`}`
                    }
                  >
                    <Bluetooth className="w-3 h-3" />
                    <span>BLE</span>
                  </span>
                  <span
                    className={`flex items-center gap-0.5 ${
                      telemetry?.wifiConnected ? 'text-[#ECEAE4]' : 'text-[#A3A6AD]/60'
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
                    onPointerDown={e => handlePointerDown('oled_pull', e)}
                    onPointerUp={e => handlePointerUp('oled_pull', e, onPullFromUsb)}
                    onClick={() => handleClick(onPullFromUsb)}
                    title="Refresh status & all 4 profiles"
                    style={view3D ? { transform: 'translateZ(4px)', transformStyle: 'preserve-3d', zIndex: 20 } : undefined}
                    className="text-[#ECEAE4] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    <span>{connection.transport === 'demo' ? 'DEMO' : 'LIVE'}</span>
                  </button>
                </>
              ) : (
                <span className="text-[#A3A6AD]/75">
                  {connection.connecting ? 'CONNECTING…' : 'OFFLINE'}
                </span>
              )}

              {isBleHostProfile(activeProfileId) && (
                <button
                  type="button"
                  onPointerDown={e => handlePointerDown('oled_host', e)}
                  onPointerUp={e =>
                    handlePointerUp('oled_host', e, () => {
                      const nextSlot = (((oledBadgeHost % 3) + 1) as BleHostSlot);
                      if (connection.connected) {
                        onSwitchBleHost(nextSlot);
                      } else {
                        setOfflineBleHost(nextSlot);
                        onSelectProfile(bleSlotToProfileId(nextSlot));
                      }
                    })
                  }
                  onClick={() =>
                    handleClick(() => {
                      const nextSlot = (((oledBadgeHost % 3) + 1) as BleHostSlot);
                      if (connection.connected) {
                        onSwitchBleHost(nextSlot);
                      } else {
                        setOfflineBleHost(nextSlot);
                        onSelectProfile(bleSlotToProfileId(nextSlot));
                      }
                    })
                  }
                  title={
                    connection.connected
                      ? `Device ${oledBadgeHost} (BertoPad ${oledBadgeHost}) — click to switch host`
                      : `Viewing Device ${oledBadgeHost} — click to cycle H1–H3`
                  }
                  style={view3D ? { transform: 'translateZ(4px)', transformStyle: 'preserve-3d', zIndex: 20 } : undefined}
                  className={`px-1.5 py-0.5 rounded bg-black border font-mono text-[10px] font-bold leading-none tracking-tight transition-colors cursor-pointer tabular-nums shrink-0 ${
                    connection.connected && oledBadgeHost !== activeBleHost
                      ? 'border-[#ECEAE4]/50 text-[#A3A6AD] hover:border-[#ECEAE4]'
                      : 'border-[#ECEAE4]/80 text-[#ECEAE4] hover:bg-[#ECEAE4] hover:text-[#14161B]'
                  }`}
                >
                  [H{oledBadgeHost}]
                </button>
              )}
            </div>
          </div>

          {encoderPlacement === 'top' ? (
            <div
              className="flex flex-col items-center gap-5 sm:gap-6"
              style={view3D ? { transformStyle: 'preserve-3d', pointerEvents: 'auto' } : undefined}
            >
              <div
                className="flex flex-wrap items-start justify-center gap-4 sm:gap-6"
                style={view3D ? { transformStyle: 'preserve-3d', pointerEvents: 'auto' } : undefined}
              >
                {renderEncoderUnit(1)}
                {renderEncoderUnit(2)}
              </div>
              <div
                className="grid grid-cols-[repeat(3,max-content)] gap-3.5 sm:gap-4 justify-items-center items-start shrink-0"
                style={view3D ? { transformStyle: 'preserve-3d', pointerEvents: 'auto' } : undefined}
              >
                {KEY_ORDER.map((kid, idx) => renderKeycap(kid, idx))}
              </div>
            </div>
          ) : (
            <div
              className="flex flex-col @[580px]:flex-row items-center justify-center gap-5 @[580px]:gap-6"
              style={view3D ? { transformStyle: 'preserve-3d', pointerEvents: 'auto' } : undefined}
            >
              <div
                className="order-2 @[580px]:order-1 grid grid-cols-[repeat(3,max-content)] gap-3.5 sm:gap-4 justify-items-center items-start shrink-0"
                style={view3D ? { transformStyle: 'preserve-3d', pointerEvents: 'auto' } : undefined}
              >
                {KEY_ORDER.map((kid, idx) => renderKeycap(kid, idx))}
              </div>
              <div
                className="order-1 @[580px]:order-2 shrink-0 flex flex-row flex-wrap @[580px]:flex-col items-center justify-center gap-4 sm:gap-5 @[580px]:pl-6 @[580px]:border-l @[580px]:border-[#ECEAE4]/10 @[580px]:self-stretch"
                style={view3D ? { transformStyle: 'preserve-3d', pointerEvents: 'auto' } : undefined}
              >
                {renderEncoderUnit(1)}
                {renderEncoderUnit(2)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Motion Gestures Strip (shown strictly when capabilities includes "motion") */}
      {hasMotion && (
        <div className="w-full max-w-2xl rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-3 space-y-2 shrink-0">
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
              <Compass className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              <span>Motion Gestures</span>
              {connection.telemetry?.motion && !connection.telemetry.motion.enabled && (
                <span className="font-mono text-[11px] font-normal text-[var(--text-muted)]">
                  · Off in Settings
                </span>
              )}
            </div>
            <span className="text-[11px] text-[var(--text-muted)]">
              {viewMode === 'edit' ? 'Select a gesture to bind' : 'Click or move pad to test'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(
              [
                { slot: 'g_shake' as MotionSlotId, label: 'Shake', Icon: Compass },
                { slot: 'g_down' as MotionSlotId, label: 'Face Down', Icon: ArrowDown },
                { slot: 'g_up' as MotionSlotId, label: 'Face Up', Icon: ArrowUp }
              ]
            ).map(({ slot, label, Icon }) => {
              const binding = layer.motion?.[slot] ?? { type: 'none' as const, value: '' };
              const isFlashed = flashedSlots.has(slot);
              const isSelected = viewMode === 'edit' && selectedControl === slot;
              const summary = binding.value
                ? describeFirmwareAction(binding.value, binding.repeatConfig, customMacros)
                    .shortLabel
                : 'Unassigned';

              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => {
                    onSelectControl(slot);
                    if (connection.transport === 'demo') {
                      usbHardware.simulateDemoPadInput(slot);
                      return;
                    }
                    soundEngine.playKeyClick();
                    triggerSlotFlash(slot);
                    if (connection.connected && binding.value) {
                      onExecuteHardwareBinding(binding);
                      pushLog(
                        SLOT_LABELS[slot].short,
                        'Gesture',
                        summarizeAction(binding, customMacros),
                        'usb-test'
                      );
                    } else {
                      pushLog(
                        SLOT_LABELS[slot].short,
                        'Gesture',
                        summarizeAction(binding, customMacros),
                        'sim'
                      );
                    }
                  }}
                  className={`px-3 py-2 rounded-lg border text-left transition-all cursor-pointer flex items-center justify-between gap-2 min-w-0 ${
                    isFlashed
                      ? 'bg-[var(--accent-soft)] border-[var(--accent)] ring-1 ring-[var(--accent)]'
                      : isSelected
                      ? 'bg-[var(--accent-soft)] border-[var(--accent)]'
                      : 'bg-[var(--bg-input)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isFlashed || isSelected
                          ? 'text-[var(--accent)]'
                          : 'text-[var(--text-muted)]'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                        {label}
                      </div>
                      <div
                        className={`text-[11px] truncate ${
                          binding.value
                            ? 'text-[var(--text-secondary)]'
                            : 'text-[var(--text-muted)]'
                        }`}
                      >
                        {summary}
                      </div>
                    </div>
                  </div>
                  <span className="font-mono text-[10px] text-[var(--text-muted)] shrink-0">
                    {slot}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {/* Bottom: Conflict Alert or Test View Feed */}
      {(conflicts.length > 0 && viewMode === 'edit') || viewMode === 'test' ? (
        <div className="w-full max-w-2xl space-y-2 shrink-0">
          {conflicts.length > 0 && viewMode === 'edit' && (
            <div className="px-3.5 py-2.5 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)] flex items-center gap-2.5 text-xs text-[var(--text-primary)]">
              <AlertTriangle className="w-4 h-4 shrink-0 text-[var(--accent)]" />
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
                          ...(hasKeyHold
                            ? HOLD_SLOTS.map((hs, i) => ({
                                slot: hs,
                                label: `K${i + 1} Hold`
                              }))
                            : []),
                          { slot: 'dial', label: 'Knob 1' },
                          { slot: 'enc_ccw', label: 'K1 Left' },
                          { slot: 'enc_cw', label: 'K1 Right' },
                          { slot: 'push_ccw', label: 'K1 Hold+L' },
                          { slot: 'push_cw', label: 'K1 Hold+R' },
                          { slot: 'dial2', label: 'Knob 2' },
                          { slot: 'e2_ccw', label: 'K2 Left' },
                          { slot: 'e2_cw', label: 'K2 Right' },
                          ...(hasMotion
                            ? MOTION_SLOTS.map(ms => ({
                                slot: ms,
                                label:
                                  ms === 'g_shake'
                                    ? 'Shake'
                                    : ms === 'g_down'
                                    ? 'Face Down'
                                    : 'Face Up'
                              }))
                            : []),
                          { slot: 'mode', label: 'Mode' }
                        ] as { slot: HardwareFlashSlot; label: string }[]
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
                  Press keys or click the knobs and their left/right arrows above to see live events.
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
