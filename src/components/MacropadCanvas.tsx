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
  HardwareSlotId,
  KeyAppearance,
  KeyId,
  LayerConfig,
  LiveInputEvent,
  MotionSlotId,
  OledComposerConfig,
  bleSlotToProfileId,
  defaultProfileAlias,
  isBleHostProfile,
  normalizeHardwareProfileId,
  profileIdToBleSlot
} from '../types/studio';
import { KeycapIcon, summarizeAction } from '../data/iconRegistry';
import {
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
  KEY_TO_HOLD_SLOT,
  KEY_TO_SLOT
} from '../data/presetTemplates';
import {
  PROGRAMMABLE_KEY_IDS,
  addKeyToMultiSelection,
  buildCombinedMacroBindingFromKeys,
  formatMultiKeySummary,
  isProgrammableKeyId,
  resolveAnchorActionKey,
  toggleMultiSelectKey
} from '../utils/keyMultiSelect';
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
  Command,
  Copy,
  ClipboardPaste,
  Zap,
  XCircle,
  Pencil,
  Check,
  CheckSquare,
  ArrowLeftRight,
  PlusSquare,
  X
} from 'lucide-react';

const MULTI_SELECT_LEGEND_SWATCHES = [
  { hex: '#ECEAE4', label: 'Bone' },
  { hex: '#F2A33A', label: 'Amber' },
  { hex: '#38BDF8', label: 'Sky' },
  { hex: '#34D399', label: 'Emerald' },
  { hex: '#FB7185', label: 'Rose' },
  { hex: '#A78BFA', label: 'Violet' }
] as const;

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
  oledComposer?: OledComposerConfig;
  onAddTestEvent?: (evt: LiveInputEvent) => void;
  onClearTestLog?: () => void;
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
  onOpenShortcuts?: () => void;
  onOpenOledComposer?: () => void;
  onSwapKeys?: (sourceKey: KeyId, targetKey: KeyId) => void;
  onCopyKey?: (sourceKey: KeyId, targetKey: KeyId) => void;
  onOpenMacroBuilderForSlot?: (slot: HardwareSlotId, binding: ActionBinding) => void;
  onResetSlotToDefault?: (slot: HardwareSlotId) => void;
  onClearSlot?: (slot: HardwareSlotId) => void;
  onPasteSlotBinding?: (slot: HardwareSlotId, binding: ActionBinding) => void;
  onBatchPasteSlotBinding?: (slots: HardwareSlotId[], binding: ActionBinding) => void;
  onBatchResetSlotsToDefault?: (slots: HardwareSlotId[]) => void;
  onBatchClearSlots?: (slots: HardwareSlotId[]) => void;
  onBatchUpdateKeyAppearance?: (kids: KeyId[], patch: Partial<KeyAppearance>) => void;
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
  oledComposer,
  onAddTestEvent,
  onClearTestLog,
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
  onOpenCheatSheet,
  onOpenShortcuts,
  onOpenOledComposer,
  onSwapKeys,
  onCopyKey,
  onOpenMacroBuilderForSlot,
  onResetSlotToDefault,
  onClearSlot,
  onPasteSlotBinding,
  onBatchPasteSlotBinding,
  onBatchResetSlotsToDefault,
  onBatchClearSlots,
  onBatchUpdateKeyAppearance
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

  // Flagship direct manipulation: Shift+Click multi-select, drag-and-drop key reordering & right-click quick context menu
  const [multiSelectedKeys, setMultiSelectedKeys] = useState<ActionKeyId[]>([]);
  const [isShiftHeld, setIsShiftHeld] = useState(false);
  const shiftHeldRef = useRef(false);
  const [draggedKey, setDraggedKey] = useState<KeyId | null>(null);
  const [dragOverKey, setDragOverKey] = useState<KeyId | null>(null);
  const [dragCopyMode, setDragCopyMode] = useState(false);
  const [copiedClipboard, setCopiedClipboard] = useState<{
    label: string;
    binding: ActionBinding;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    title: string;
    subtitle: string;
    slot: HardwareSlotId;
    controlId: ControlId;
    binding: ActionBinding;
    keyId?: KeyId;
    encoderIndex?: EncoderIndex;
    multiKeys?: ActionKeyId[];
  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const knobScrubRef = useRef<{
    encoderIndex: EncoderIndex;
    lastX: number;
    lastY: number;
    accum: number;
    moved: boolean;
  } | null>(null);

  const syncShiftHeld = useCallback((held: boolean) => {
    if (shiftHeldRef.current !== held) {
      shiftHeldRef.current = held;
      setIsShiftHeld(held);
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift' || e.shiftKey) syncShiftHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift' || !e.shiftKey) syncShiftHeld(Boolean(e.shiftKey));
    };
    const onBlur = () => syncShiftHeld(false);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [syncShiftHeld]);

  // Clear multi-select when leaving edit mode or switching active profile
  useEffect(() => {
    if (viewMode !== 'edit') {
      setMultiSelectedKeys([]);
    }
  }, [viewMode]);

  useEffect(() => {
    setMultiSelectedKeys([]);
  }, [activeProfileId]);

  useEffect(() => {
    if (!contextMenu) return;
    const handleOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    const handleScroll = () => setContextMenu(null);
    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (multiSelectedKeys.length === 0 || contextMenu) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMultiSelectedKeys([]);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [multiSelectedKeys.length, contextMenu]);
  const motionSensor = useMotionSensor({
    enabled: view3D && connection.connected,
    pollIntervalMs: 25,
    defaultPitchBaseline: 0,
    defaultRollBaseline: 0
  });

  const chassis3dRef = useRef<HTMLDivElement>(null);
  const specular3dRef = useRef<HTMLDivElement>(null);
  const telemetryReadoutRef = useRef<HTMLSpanElement>(null);
  const pointerTiltRef = useRef<{ pitch: number; roll: number; active: boolean }>({
    pitch: 15,
    roll: -9,
    active: false
  });
  const current3dRotRef = useRef<{ pitch: number; roll: number; yaw: number; zOffset: number }>({
    pitch: 15,
    roll: -9,
    yaw: 0,
    zOffset: 0
  });

  const motionTargetRef = useRef(motionSensor);
  motionTargetRef.current = motionSensor;

  useEffect(() => {
    if (!view3D) {
      if (chassis3dRef.current) {
        chassis3dRef.current.style.transform = '';
        chassis3dRef.current.style.backgroundImage = '';
        chassis3dRef.current.style.boxShadow = '';
      }
      if (specular3dRef.current) {
        specular3dRef.current.style.backgroundImage = '';
      }
      return;
    }

    current3dRotRef.current = { pitch: 15, roll: -9, yaw: 0, zOffset: 0 };

    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let rafId: number;

    const animate3D = () => {
      const target = motionTargetRef.current;
      const current = current3dRotRef.current;
      const pointer = pointerTiltRef.current;
      const liveGyroActive =
        target.isOnline &&
        (Math.abs(target.pitch) >= 0.4 || Math.abs(target.roll) >= 0.4 || target.shakeActive);

      const desiredPitch = liveGyroActive
        ? target.pitch + 12
        : pointer.active
        ? pointer.pitch
        : 15;
      const desiredRoll = liveGyroActive
        ? target.roll - 4
        : pointer.active
        ? pointer.roll
        : -9;
      const desiredZ = liveGyroActive ? target.shakeZOffset : 0;

      const factor = reducedMotion ? 1 : target.shakeActive ? 0.32 : 0.14;
      current.pitch += (desiredPitch - current.pitch) * factor;
      current.roll += (desiredRoll - current.roll) * factor;
      current.zOffset += (desiredZ - current.zOffset) * factor;

      if (chassis3dRef.current) {
        const scale = target.shakeActive ? 0.91 : 0.94;
        const nextTransform = `translateZ(${(24 + current.zOffset).toFixed(2)}px) rotateX(${current.pitch.toFixed(2)}deg) rotateY(${current.roll.toFixed(2)}deg) scale(${scale})`;
        if (chassis3dRef.current.style.transform !== nextTransform) {
          chassis3dRef.current.style.transform = nextTransform;
        }
        const shadowX = -current.roll * 1.1;
        const shadowY = 38 + current.pitch * 1.1;
        chassis3dRef.current.style.boxShadow = `${shadowX.toFixed(1)}px ${shadowY.toFixed(1)}px 64px -16px rgba(0, 0, 0, 0.78), 0 14px 28px -10px rgba(0, 0, 0, 0.55), 0 0 0 1px color-mix(in srgb, var(--bp-bone) 14%, transparent), inset 0 1.5px 2px color-mix(in srgb, var(--bp-bone) 20%, transparent), inset 0 -4px 12px rgba(0, 0, 0, 0.8)`;
      }

      if (specular3dRef.current) {
        const lightX = Math.max(12, Math.min(88, 36 - current.roll * 1.8));
        const lightY = Math.max(10, Math.min(85, 22 + current.pitch * 1.1));
        specular3dRef.current.style.backgroundImage = `radial-gradient(circle at ${lightX.toFixed(1)}% ${lightY.toFixed(1)}%, rgba(236, 234, 228, 0.11) 0%, rgba(236, 234, 228, 0.03) 38%, transparent 72%)`;
      }

      if (telemetryReadoutRef.current) {
        const nextReadout = `LIVE GYRO · Pitch ${target.pitch.toFixed(1)}° · Roll ${target.roll.toFixed(1)}°`;
        if (telemetryReadoutRef.current.textContent !== nextReadout) {
          telemetryReadoutRef.current.textContent = nextReadout;
        }
      }

      if (!reducedMotion) {
        rafId = requestAnimationFrame(animate3D);
      }
    };

    rafId = requestAnimationFrame(animate3D);
    return () => {
      cancelAnimationFrame(rafId);
      if (chassis3dRef.current) {
        chassis3dRef.current.style.transform = '';
        chassis3dRef.current.style.backgroundImage = '';
        chassis3dRef.current.style.boxShadow = '';
      }
      if (specular3dRef.current) {
        specular3dRef.current.style.backgroundImage = '';
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

  const wasConnectedRef = useRef(connection.connected);

  useEffect(() => {
    const wasConnected = wasConnectedRef.current;
    wasConnectedRef.current = connection.connected;
    if (wasConnected && !connection.connected) {
      setTestLog([]);
      onClearTestLog?.();
      setFlashedSlots(new Set());
      setOledToast(null);
    }
  }, [connection.connected, onClearTestLog]);

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
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;
  const onAddTestEventRef = useRef(onAddTestEvent);
  onAddTestEventRef.current = onAddTestEvent;

  const lastPointerDownRef = useRef<{ id: string; time: number; shiftKey: boolean } | null>(null);
  const lastShiftPointerDownRef = useRef<{ id: string; expiresAt: number } | null>(null);
  const suppressNextClickRef = useRef<{ id: string; expiresAt: number } | null>(null);

  const handlePointerDown = (id: string, e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    syncShiftHeld(e.shiftKey);
    const isShift = Boolean(e.shiftKey);
    lastPointerDownRef.current = { id, time: performance.now(), shiftKey: isShift };
    if (isShift) {
      lastShiftPointerDownRef.current = { id, expiresAt: performance.now() + 1500 };
    } else if (lastShiftPointerDownRef.current?.id === id) {
      lastShiftPointerDownRef.current = null;
    }
  };

  const handlePointerUp = (
    id: string,
    e: React.PointerEvent,
    onAction: (meta: { shiftKey: boolean }) => void
  ) => {
    const down = lastPointerDownRef.current;
    lastPointerDownRef.current = null;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    syncShiftHeld(e.shiftKey);
    if (down && down.id === id) {
      suppressNextClickRef.current = {
        id,
        expiresAt: performance.now() + 800
      };
      const shiftKey = Boolean(e.shiftKey || down.shiftKey);
      if (lastShiftPointerDownRef.current?.id === id) {
        lastShiftPointerDownRef.current = null;
      }
      onAction({ shiftKey });
    }
  };

  const handlePointerCancel = () => {
    lastPointerDownRef.current = null;
    suppressNextClickRef.current = null;
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

  const handleClick = (
    id: string,
    e: React.MouseEvent,
    onAction: (meta: { shiftKey: boolean }) => void
  ) => {
    const suppressed = suppressNextClickRef.current;
    if (suppressed && performance.now() > suppressed.expiresAt) {
      suppressNextClickRef.current = null;
    } else if (suppressed && suppressed.id === id && e.detail !== 0) {
      suppressNextClickRef.current = null;
      return;
    }
    const recentShift = lastShiftPointerDownRef.current;
    const hadRecentShiftDown = Boolean(
      recentShift && recentShift.id === id && performance.now() <= recentShift.expiresAt
    );
    if (recentShift && recentShift.id === id) {
      lastShiftPointerDownRef.current = null;
    }
    onAction({ shiftKey: Boolean(e.shiftKey || hadRecentShiftDown) });
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
    const entry: LiveInputEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp,
      controlLabel,
      triggerLabel,
      actionSummary,
      source
    };
    setTestLog(prev => [entry, ...prev.slice(0, 29)]);
    onAddTestEventRef.current?.(entry);
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
          `Host ${hostNum}`,
          `Switched wireless host to Device ${hostNum}`,
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

      if (
        rawSlot === 'push_cw' ||
        rawSlot === 'push_ccw' ||
        rawSlot === 'push_cw2' ||
        rawSlot === 'push_ccw2'
      ) {
        const isEnc2Hold = rawSlot === 'push_cw2' || rawSlot === 'push_ccw2' || e.encoder === 2;
        const encIdx: EncoderIndex = isEnc2Hold ? 2 : 1;
        const isCcw =
          rawSlot === 'push_ccw' || rawSlot === 'push_ccw2' || rawDir === 'ccw';
        const flashId: HardwareFlashSlot = isEnc2Hold
          ? isCcw
            ? 'push_ccw2'
            : 'push_cw2'
          : isCcw
          ? 'push_ccw'
          : 'push_cw';
        const mult = recordKnobVelocity(encIdx, e.accel);

        queueKnobAngleDelta(encIdx, (isCcw ? -24 : 24) * mult);
        soundEngine.playDialTick();
        triggerSlotFlash(flashId);

        const encCfg = isEnc2Hold ? currLayer.encoder2 : currLayer.encoder;
        const binding =
          (isCcw ? encCfg.pushCcw : encCfg.pushCw) ?? {
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
          `${isEnc2Hold ? 'K2 ' : ''}HOLD ${isCcw ? 'CCW' : 'CW'}${mult > 1 ? ` ${mult}x` : ''}`,
          shortToast
        );
        pushLog(
          `Knob ${encIdx} Hold+${isCcw ? 'Left' : 'Right'}`,
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

  const activateKeyControl = async (
    kid: KeyId,
    opts?: { shiftKey?: boolean }
  ) => {
    if (opts?.shiftKey) {
      if (viewModeRef.current === 'edit' && isProgrammableKeyId(kid)) {
        const result = toggleMultiSelectKey(multiSelectedKeys, selectedControl, kid);
        setMultiSelectedKeys(result.nextMultiKeys);
        onSelectControl(result.nextPrimaryControl);
      }
      return;
    }

    soundEngine.playKeyClick();
    if (viewModeRef.current === 'edit') {
      if (multiSelectedKeys.length > 0) {
        setMultiSelectedKeys([]);
      }
      onSelectControl(kid);
    }

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

  const activateKeyHoldControl = async (
    kid: ActionKeyId,
    opts?: { shiftKey?: boolean }
  ) => {
    if (opts?.shiftKey) {
      if (viewModeRef.current === 'edit') {
        const result = toggleMultiSelectKey(multiSelectedKeys, selectedControl, kid);
        setMultiSelectedKeys(result.nextMultiKeys);
        onSelectControl(result.nextPrimaryControl);
      }
      return;
    }

    soundEngine.playKeyClick();
    const holdSlot = KEY_TO_HOLD_SLOT[kid];
    if (viewModeRef.current === 'edit') {
      if (multiSelectedKeys.length > 0) setMultiSelectedKeys([]);
      onSelectControl(holdSlot);
    }
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
        `Host ${nextSlot}`,
        `Switched wireless host to Device ${nextSlot}`,
        'usb-test'
      );
    } else {
      setOfflineBleHost(nextSlot);
      onSelectProfile(bleSlotToProfileId(nextSlot));
      pushLog(
        'Mode + Dial',
        `Host ${nextSlot}`,
        `Switched workspace to Device ${nextSlot}`,
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

    if (viewModeRef.current === 'edit') {
      if (multiSelectedKeys.length > 0) setMultiSelectedKeys([]);
      onSelectControl(subId);
    }
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

  const triggerEncoderHoldSpin = async (
    encoderIndex: EncoderIndex,
    dir: 'cw' | 'ccw'
  ) => {
    const subId: HardwareFlashSlot & ControlId =
      encoderIndex === 2
        ? dir === 'cw'
          ? 'push_cw2'
          : 'push_ccw2'
        : dir === 'cw'
        ? 'push_cw'
        : 'push_ccw';
    if (viewModeRef.current === 'edit') {
      onSelectControl(subId);
    }
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
    const binding =
      (dir === 'cw' ? encCfg.pushCw : encCfg.pushCcw) ?? {
        type: 'none' as const,
        value: ''
      };
    const summary = summarizeAction(binding, customMacros);
    const shortToast = describeFirmwareAction(
      binding.value,
      binding.repeatConfig,
      customMacros
    ).shortLabel;
    const label = `Knob ${encoderIndex} Hold+${dir === 'cw' ? 'Right' : 'Left'}`;
    triggerOledToast(
      `K${encoderIndex} HOLD ${dir.toUpperCase()}${mult > 1 ? ` ${mult}x` : ''}`,
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
    if (e.altKey) {
      triggerEncoderHoldSpin(encoderIndex, e.deltaY > 0 ? 'cw' : 'ccw');
      return;
    }
    triggerEncoderSpin(encoderIndex, e.deltaY > 0 ? 'cw' : 'ccw', e.shiftKey);
  };

  const activateDialPush = async (encoderIndex: EncoderIndex) => {
    soundEngine.playKeyClick();
    const dialSlot: HardwareFlashSlot & ControlId =
      encoderIndex === 2 ? 'dial2' : 'dial';
    triggerSlotFlash(dialSlot);
    if (viewModeRef.current === 'edit') {
      if (multiSelectedKeys.length > 0) setMultiSelectedKeys([]);
      onSelectControl(dialSlot);
    }

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

  const latestKeyboardHandlersRef = useRef({
    activateKeyControl,
    triggerEncoderSpin,
    activateDialPush
  });
  latestKeyboardHandlersRef.current = {
    activateKeyControl,
    triggerEncoderSpin,
    activateDialPush
  };

  // Global Keyboard Interaction: 1-9 for keys, [/] for knob, 3 for 3D view, etc.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) {
        return;
      }
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT' ||
          (activeEl as HTMLElement).isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key >= '1' && e.key <= '9') {
        const kid = `k${e.key}` as KeyId;
        e.preventDefault();
        latestKeyboardHandlersRef.current.activateKeyControl(kid);
        return;
      }

      if (e.key === '[' || e.key === '-') {
        e.preventDefault();
        latestKeyboardHandlersRef.current.triggerEncoderSpin(1, 'ccw');
        return;
      }

      if (e.key === ']' || e.key === '=') {
        e.preventDefault();
        latestKeyboardHandlersRef.current.triggerEncoderSpin(1, 'cw');
        return;
      }

      if (e.key === '{') {
        e.preventDefault();
        latestKeyboardHandlersRef.current.triggerEncoderSpin(2, 'ccw');
        return;
      }

      if (e.key === '}') {
        e.preventDefault();
        latestKeyboardHandlersRef.current.triggerEncoderSpin(2, 'cw');
        return;
      }

      if (e.key === ' ' || e.key === 'Enter') {
        if (activeEl?.tagName !== 'BUTTON') {
          e.preventDefault();
          latestKeyboardHandlersRef.current.activateDialPush(e.shiftKey ? 2 : 1);
          return;
        }
      }

      if (e.key === '3') {
        e.preventDefault();
        setView3D(v => !v);
        return;
      }

      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        onChangeViewMode('test');
        return;
      }

      if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        onChangeViewMode('edit');
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        (onOpenShortcuts || onOpenCheatSheet)?.();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onChangeViewMode, onOpenCheatSheet, onOpenShortcuts]);

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

    const pushCwId: HardwareFlashSlot & ControlId =
      encoderIndex === 2 ? 'push_cw2' : 'push_cw';
    const pushCcwId: HardwareFlashSlot & ControlId =
      encoderIndex === 2 ? 'push_ccw2' : 'push_ccw';
    const pushCwBind = encCfg.pushCw ?? { type: 'none' as const, value: '' };
    const pushCcwBind = encCfg.pushCcw ?? { type: 'none' as const, value: '' };
    const isPushCwSelected = selectedControl === pushCwId && viewMode === 'edit';
    const isPushCcwSelected = selectedControl === pushCcwId && viewMode === 'edit';
    const isPushCwFlashed = flashedSlots.has(pushCwId);
    const isPushCcwFlashed = flashedSlots.has(pushCcwId);
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
            onPointerCancel={handlePointerCancel}
            onClick={e => {
              e.stopPropagation();
              handleClick(`enc_${encoderIndex}_ccw`, e, () =>
                triggerEncoderSpin(encoderIndex, 'ccw')
              );
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

          {/* Physical Rotary Knob (`dial` / `dial2`) — BertoPad dial with Bone track + Amber level arc + direct drag-to-turn scrubbing */}
          <button
            type="button"
            aria-label={`Knob ${encoderIndex} Press: ${dialInfo.fullLabel}`}
            title={`Knob ${encoderIndex} (${dialInfo.fullLabel}) — click to press, drag or scroll to turn, right-click for actions`}
            onWheel={e => handleEncoderWheel(encoderIndex, e)}
            onContextMenu={e => {
              e.preventDefault();
              setContextMenu({
                x: Math.min(e.clientX, window.innerWidth - 236),
                y: Math.min(e.clientY, window.innerHeight - 280),
                title: `Knob ${encoderIndex} Press`,
                subtitle: dialInfo.shortLabel || 'Unassigned',
                slot: dialId,
                controlId: dialId,
                binding: encCfg.dial,
                encoderIndex
              });
            }}
            onMouseDown={() => setPressed(true)}
            onMouseUp={() => setPressed(false)}
            onMouseLeave={() => {
              if (!knobScrubRef.current) setPressed(false);
            }}
            onPointerDown={e => {
              if (e.pointerType === 'mouse' && e.button !== 0) return;
              setPressed(true);
              knobScrubRef.current = {
                encoderIndex,
                lastX: e.clientX,
                lastY: e.clientY,
                accum: 0,
                moved: false
              };
              try {
                (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
              } catch {}
              handlePointerDown(`dial_${encoderIndex}`, e);
            }}
            onPointerMove={e => {
              const scrub = knobScrubRef.current;
              if (!scrub || scrub.encoderIndex !== encoderIndex) return;
              const dx = e.clientX - scrub.lastX;
              const dy = scrub.lastY - e.clientY;
              scrub.lastX = e.clientX;
              scrub.lastY = e.clientY;
              const primaryDelta = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
              scrub.accum += primaryDelta;
              const STEP_PX = 16;
              if (Math.abs(scrub.accum) >= STEP_PX) {
                scrub.moved = true;
                setPressed(false);
                const dir: 'cw' | 'ccw' = scrub.accum > 0 ? 'cw' : 'ccw';
                scrub.accum = scrub.accum % STEP_PX;
                if (e.altKey) {
                  triggerEncoderHoldSpin(encoderIndex, dir);
                } else {
                  triggerEncoderSpin(encoderIndex, dir, e.shiftKey);
                }
              }
            }}
            onPointerUp={e => {
              setPressed(false);
              const scrub = knobScrubRef.current;
              knobScrubRef.current = null;
              try {
                if ((e.currentTarget as HTMLButtonElement).hasPointerCapture(e.pointerId)) {
                  (e.currentTarget as HTMLButtonElement).releasePointerCapture(e.pointerId);
                }
              } catch {}
              if (scrub?.moved) {
                lastPointerDownRef.current = null;
                suppressNextClickRef.current = {
                  id: `dial_${encoderIndex}`,
                  expiresAt: performance.now() + 800
                };
                return;
              }
              handlePointerUp(`dial_${encoderIndex}`, e, () => activateDialPush(encoderIndex));
            }}
            onPointerCancel={e => {
              setPressed(false);
              knobScrubRef.current = null;
              handlePointerCancel();
              try {
                if ((e.currentTarget as HTMLButtonElement).hasPointerCapture(e.pointerId)) {
                  (e.currentTarget as HTMLButtonElement).releasePointerCapture(e.pointerId);
                }
              } catch {}
            }}
            onClick={e => handleClick(`dial_${encoderIndex}`, e, () => activateDialPush(encoderIndex))}
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
                : view3D
                ? '0 10px 0 #0B0D11, 0 18px 28px rgba(0,0,0,0.68), inset 0 1.5px 2px rgba(236,234,228,0.16)'
                : undefined,
              filter: isPressed ? 'brightness(1.2)' : undefined,
              ...(view3D
                ? {
                    transform: isPressed ? 'translateZ(22px)' : 'translateZ(28px)',
                    transformStyle: 'preserve-3d',
                    zIndex: 25,
                    touchAction: 'manipulation'
                  }
                : {})
            }}
            className={`relative w-20 h-20 sm:w-24 sm:h-24 xl:w-26 xl:h-26 rounded-full encoder-ring border-2 flex items-center justify-center transition-all duration-150 cursor-pointer select-none ${
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
              className="w-13 h-13 sm:w-16 sm:h-16 xl:w-17 xl:h-17 rounded-full encoder-cap border border-[#ECEAE4]/15 flex items-center justify-center relative transition-transform duration-150 ease-out shadow-inner pointer-events-none"
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
            onPointerCancel={handlePointerCancel}
            onClick={e => {
              e.stopPropagation();
              handleClick(`enc_${encoderIndex}_cw`, e, () =>
                triggerEncoderSpin(encoderIndex, 'cw')
              );
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
          className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-[10px] text-[#A3A6AD] text-center max-w-[236px]"
          style={view3D ? { transform: 'translateZ(16px)', transformStyle: 'preserve-3d', zIndex: 20 } : undefined}
        >
          <button
            type="button"
            onPointerDown={e => handlePointerDown(`enc_sub_${encoderIndex}_ccw`, e)}
            onPointerUp={e =>
              handlePointerUp(`enc_sub_${encoderIndex}_ccw`, e, () => triggerEncoderSpin(encoderIndex, 'ccw'))
            }
            onPointerCancel={handlePointerCancel}
            onClick={e => handleClick(`enc_sub_${encoderIndex}_ccw`, e, () => triggerEncoderSpin(encoderIndex, 'ccw'))}
            title={`Knob ${encoderIndex} Turn Left: ${ccwInfo.fullLabel}`}
            className={`inline-flex items-center gap-0.5 hover:text-[#ECEAE4] transition-colors cursor-pointer whitespace-nowrap ${
              isCcwSelected ? 'text-[#F2A33A] font-semibold' : ''
            }`}
          >
            <RotateCcw className="w-2.5 h-2.5 shrink-0" />
            <span>{ccwInfo.shortLabel}</span>
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
            onPointerCancel={handlePointerCancel}
            onClick={e => handleClick(`enc_sub_${encoderIndex}_press`, e, () => activateDialPush(encoderIndex))}
            title={`Knob ${encoderIndex} Press: ${dialInfo.fullLabel}`}
            className={`hover:text-[#ECEAE4] transition-colors cursor-pointer whitespace-nowrap ${
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
            onPointerCancel={handlePointerCancel}
            onClick={e => handleClick(`enc_sub_${encoderIndex}_cw`, e, () => triggerEncoderSpin(encoderIndex, 'cw'))}
            title={`Knob ${encoderIndex} Turn Right: ${cwInfo.fullLabel}`}
            className={`inline-flex items-center gap-0.5 hover:text-[#ECEAE4] transition-colors cursor-pointer whitespace-nowrap ${
              isCwSelected ? 'text-[#F2A33A] font-semibold' : ''
            }`}
          >
            <span>{cwInfo.shortLabel}</span>
            <RotateCw className="w-2.5 h-2.5 shrink-0" />
          </button>
        </div>

        {(Boolean(pushCcwBind.value) || Boolean(pushCwBind.value)) && (
          <div
            className="flex flex-wrap items-center justify-center gap-1 text-[10px] text-[#A3A6AD] text-center max-w-[236px]"
            style={view3D ? { transform: 'translateZ(16px)', transformStyle: 'preserve-3d', zIndex: 20 } : undefined}
          >
            <span className="font-mono text-[9px] text-[#A3A6AD]/75 shrink-0">Push+turn:</span>
            <button
              type="button"
              onPointerDown={e => handlePointerDown(`enc${encoderIndex}_push_ccw`, e)}
              onPointerUp={e =>
                handlePointerUp(`enc${encoderIndex}_push_ccw`, e, () =>
                  triggerEncoderHoldSpin(encoderIndex, 'ccw')
                )
              }
              onPointerCancel={handlePointerCancel}
              onClick={e =>
                handleClick(`enc${encoderIndex}_push_ccw`, e, () =>
                  triggerEncoderHoldSpin(encoderIndex, 'ccw')
                )
              }
              title={`Knob ${encoderIndex} Hold + Turn Left: ${pushCcwInfo.fullLabel}`}
              className={`inline-flex items-center gap-0.5 hover:text-[#ECEAE4] transition-colors cursor-pointer whitespace-nowrap ${
                isPushCcwSelected || isPushCcwFlashed
                  ? 'text-[#F2A33A] font-semibold'
                  : !pushCcwBind.value
                  ? 'text-[#A3A6AD]/65'
                  : ''
              }`}
            >
              <RotateCcw className="w-2.5 h-2.5 shrink-0" />
              <span>{pushCcwBind.value ? pushCcwInfo.shortLabel : '—'}</span>
            </button>
            <span aria-hidden="true" className="text-[#A3A6AD]/50">
              ·
            </span>
            <button
              type="button"
              onPointerDown={e => handlePointerDown(`enc${encoderIndex}_push_cw`, e)}
              onPointerUp={e =>
                handlePointerUp(`enc${encoderIndex}_push_cw`, e, () =>
                  triggerEncoderHoldSpin(encoderIndex, 'cw')
                )
              }
              onPointerCancel={handlePointerCancel}
              onClick={e =>
                handleClick(`enc${encoderIndex}_push_cw`, e, () =>
                  triggerEncoderHoldSpin(encoderIndex, 'cw')
                )
              }
              title={`Knob ${encoderIndex} Hold + Turn Right: ${pushCwInfo.fullLabel}`}
              className={`inline-flex items-center gap-0.5 hover:text-[#ECEAE4] transition-colors cursor-pointer whitespace-nowrap ${
                isPushCwSelected || isPushCwFlashed
                  ? 'text-[#F2A33A] font-semibold'
                  : !pushCwBind.value
                  ? 'text-[#A3A6AD]/65'
                  : ''
              }`}
            >
              <span>{pushCwBind.value ? pushCwInfo.shortLabel : '—'}</span>
              <RotateCw className="w-2.5 h-2.5 shrink-0" />
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
    const isMultiSelected =
      viewMode === 'edit' &&
      !cfg.isModeSwitch &&
      isProgrammableKeyId(kid) &&
      multiSelectedKeys.includes(kid);
    const multiSelectOrder = isMultiSelected
      ? multiSelectedKeys.indexOf(kid as ActionKeyId) + 1
      : 0;
    const isSelected =
      (selectedControl === kid || isMultiSelected) && viewMode === 'edit';
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
          draggable={!isShiftHeld && viewMode === 'edit' && !cfg.isModeSwitch && Boolean(onSwapKeys)}
          aria-label={`${badgeText}: ${cfg.appearance.label}`}
          title={
            cfg.isModeSwitch
              ? (tvEnabled ?? (connection.telemetry?.tvEnabled !== false))
                ? 'Mode Switch (short press: Host/TV, hold+dial: Host 1–3)'
                : 'Mode Switch (short press: flash current host, hold+dial: Host 1–3)'
              : isUnassigned
              ? `Key ${index + 1} — Unassigned (Shift+click to multi-select, drag to swap, right-click for menu)`
              : `Key ${index + 1}: ${summarizeAction(cfg.triggers.tap, customMacros)} (Shift+click to multi-select, drag to swap, Alt+drag to copy, right-click for menu)`
          }
          onDragStart={e => {
            if (e.shiftKey || shiftHeldRef.current) {
              e.preventDefault();
              return;
            }
            if (viewMode !== 'edit' || cfg.isModeSwitch || !onSwapKeys) return;
            setPressedKey(null);
            lastPointerDownRef.current = null;
            setDraggedKey(kid);
            setDragCopyMode(e.altKey);
            e.dataTransfer.effectAllowed = 'copyMove';
            e.dataTransfer.setData('text/plain', kid);
          }}
          onDragOver={e => {
            if (!draggedKey || cfg.isModeSwitch || draggedKey === kid) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move';
            if (dragOverKey !== kid) setDragOverKey(kid);
            if (dragCopyMode !== e.altKey) setDragCopyMode(e.altKey);
          }}
          onDragLeave={() => {
            if (dragOverKey === kid) setDragOverKey(null);
          }}
          onDrop={e => {
            if (!draggedKey || cfg.isModeSwitch || draggedKey === kid) return;
            e.preventDefault();
            soundEngine.playKeyClick();
            const src = draggedKey;
            const copyIntent = e.altKey;
            setDraggedKey(null);
            setDragOverKey(null);
            setDragCopyMode(false);
            if (copyIntent && onCopyKey) {
              onCopyKey(src, kid);
            } else {
              onSwapKeys?.(src, kid);
            }
            onSelectControl(kid);
          }}
          onDragEnd={() => {
            setDraggedKey(null);
            setDragOverKey(null);
            setDragCopyMode(false);
          }}
          onContextMenu={e => {
            if (cfg.isModeSwitch || kid === 'k9' || !isProgrammableKeyId(kid)) return;
            e.preventDefault();
            const tapSlot = KEY_TO_SLOT[kid];
            let activeMultiKeys = multiSelectedKeys;
            if (viewMode === 'edit' && e.shiftKey) {
              activeMultiKeys = addKeyToMultiSelection(multiSelectedKeys, selectedControl, kid);
              setMultiSelectedKeys(activeMultiKeys);
              onSelectControl(kid);
            }
            const useMulti =
              viewMode === 'edit' &&
              activeMultiKeys.length > 1 &&
              activeMultiKeys.includes(kid);
            setContextMenu({
              x: Math.min(Math.max(12, e.clientX), window.innerWidth - 268),
              y: Math.min(Math.max(12, e.clientY), window.innerHeight - (useMulti ? 410 : 320)),
              title: useMulti ? `${activeMultiKeys.length} Keys Selected` : `Key ${index + 1}`,
              subtitle: useMulti
                ? formatMultiKeySummary(activeMultiKeys)
                : cfg.appearance.label || 'Unassigned',
              slot: tapSlot,
              controlId: kid,
              binding: cfg.triggers.tap,
              keyId: kid,
              multiKeys: useMulti ? activeMultiKeys : undefined
            });
          }}
          onMouseDown={e => {
            if (e.button !== 0) return;
            syncShiftHeld(e.shiftKey);
            if (e.shiftKey) {
              e.preventDefault();
              return;
            }
            setPressedKey(kid);
          }}
          onMouseUp={() => setPressedKey(null)}
          onMouseLeave={() => {
            if (pressedKey === kid) setPressedKey(null);
          }}
          onPointerDown={e => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            syncShiftHeld(e.shiftKey);
            if (e.shiftKey) {
              e.preventDefault();
            } else {
              setPressedKey(kid);
            }
            if (e.shiftKey || viewMode !== 'edit' || cfg.isModeSwitch || !onSwapKeys) {
              try {
                (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
              } catch {}
            }
            handlePointerDown(`key_${kid}`, e);
          }}
          onPointerUp={e => {
            setPressedKey(null);
            try {
              if ((e.currentTarget as HTMLButtonElement).hasPointerCapture(e.pointerId)) {
                (e.currentTarget as HTMLButtonElement).releasePointerCapture(e.pointerId);
              }
            } catch {}
            handlePointerUp(`key_${kid}`, e, ({ shiftKey }) =>
              activateKeyControl(kid, { shiftKey })
            );
          }}
          onPointerCancel={e => {
            if (pressedKey === kid) setPressedKey(null);
            handlePointerCancel();
            try {
              if ((e.currentTarget as HTMLButtonElement).hasPointerCapture(e.pointerId)) {
                (e.currentTarget as HTMLButtonElement).releasePointerCapture(e.pointerId);
              }
            } catch {}
          }}
          onClick={e => {
            handleClick(`key_${kid}`, e, ({ shiftKey }) =>
              activateKeyControl(kid, { shiftKey })
            );
          }}
          style={{
            borderColor:
              dragOverKey === kid
                ? '#F2A33A'
                : isFlashed
                ? '#F2A33A'
                : isSelected
                ? 'var(--accent)'
                : conflict
                ? '#F2A33A'
                : cfg.isModeSwitch
                ? 'rgba(242, 163, 58, 0.35)'
                : 'rgba(236, 234, 228, 0.08)',
            boxShadow:
              dragOverKey === kid
                ? '0 0 0 3px rgba(242, 163, 58, 0.45), 0 0 22px rgba(242, 163, 58, 0.28)'
                : isFlashed
                ? '0 0 0 4px rgba(242, 163, 58, 0.4), 0 0 24px rgba(242, 163, 58, 0.32)'
                : isSelected
                ? undefined
                : isDown
                ? '0 2px 4px rgba(0,0,0,0.6), inset 0 3px 6px rgba(0,0,0,0.6)'
                : view3D
                ? '0 8px 0 #0D0F13, 0 14px 22px rgba(0,0,0,0.58), inset 0 1px 0 rgba(236,234,228,0.12)'
                : undefined,
            filter: isDown ? 'brightness(1.2)' : undefined,
            ...(view3D
              ? {
                  transform: isDown
                    ? 'translateZ(10px)'
                    : isSelected
                    ? 'translateZ(24px)'
                    : 'translateZ(18px)',
                  transformStyle: 'preserve-3d',
                  zIndex: isSelected ? 30 : 20,
                  touchAction: 'manipulation'
                }
              : {})
          }}
          className={`relative shrink-0 w-[86px] h-[86px] sm:w-[96px] sm:h-[96px] xl:w-[106px] xl:h-[106px] 2xl:w-[112px] 2xl:h-[112px] rounded-2xl keycap-surface border-2 p-2.5 sm:p-3 flex flex-col items-center justify-between select-none ${
            view3D ? '' : 'transition-all duration-150 ease-out'
          } cursor-pointer ${
            !view3D && isSelected && !isFlashed ? 'keycap-selected-glow -translate-y-0.5' : ''
          } ${!view3D && isDown ? 'translate-y-1' : !view3D && !isSelected ? 'hover:-translate-y-0.5' : ''} ${
            draggedKey === kid ? 'opacity-45 scale-95' : ''
          } ${dragOverKey === kid ? 'scale-[1.03]' : ''} ${
            isUnassigned && !isSelected && !isFlashed && dragOverKey !== kid
              ? 'opacity-45 hover:opacity-80'
              : ''
          }`}
        >
          {dragOverKey === kid && (
            <span className="pointer-events-none absolute -top-2.5 left-1/2 -translate-x-1/2 z-30 px-1.5 py-0.5 rounded bg-[var(--accent)] text-[var(--accent-contrast)] font-mono text-[9px] font-bold uppercase tracking-wider shadow-md whitespace-nowrap">
              {dragCopyMode ? 'Copy' : 'Swap'}
            </span>
          )}
          {isMultiSelected && multiSelectedKeys.length > 1 && dragOverKey !== kid && (
            <span
              aria-label={`Selected #${multiSelectOrder}`}
              className="pointer-events-none absolute -top-2 -right-2 z-30 min-w-[20px] h-5 px-1 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] font-mono text-[10px] font-bold flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.5)] ring-2 ring-[#161920] tabular-nums"
            >
              {multiSelectOrder}
            </span>
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
            <div className="flex items-center gap-1 pointer-events-none">
              {holdBinding.value && (
                <span
                  aria-label="Hold action assigned"
                  title={`Hold: ${holdInfo.shortLabel}`}
                  className="font-mono text-[8px] font-bold leading-none text-[#F2A33A]"
                >
                  +H
                </span>
              )}
              {conflict && (
                <span title="Duplicate action warning" className="pointer-events-none">
                  <AlertTriangle className="w-3 h-3 text-[#F2A33A] shrink-0" />
                </span>
              )}
            </div>
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
              if (e.pointerType === 'mouse' && e.button !== 0) return;
              syncShiftHeld(e.shiftKey);
              if (e.shiftKey) {
                e.preventDefault();
              }
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
              handlePointerUp(`hold_${actionKid}`, e, ({ shiftKey }) =>
                activateKeyHoldControl(actionKid, { shiftKey })
              );
            }}
            onPointerCancel={handlePointerCancel}
            onClick={e =>
              handleClick(`hold_${actionKid}`, e, ({ shiftKey }) =>
                activateKeyHoldControl(actionKid, { shiftKey })
              )
            }
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
    <div className="flex-1 @container flex flex-col items-center p-4 sm:p-6 lg:overflow-y-auto relative min-w-0 studio-stage-backdrop">
      {/* Top Canvas Toolbar — Single Slim Floating Row */}
      <div className="w-full max-w-2xl flex items-center justify-between gap-2 flex-nowrap overflow-x-auto pb-0.5 shrink-0">
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[var(--bg-panel)]/90 border border-[var(--border-subtle)] shrink-0">
          <button
            type="button"
            onClick={() => onChangeViewMode('edit')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer whitespace-nowrap ${
              viewMode === 'edit'
                ? 'bg-[var(--bg-selected)] text-[var(--text-primary)] font-medium'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
            <span>Configure</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeViewMode('test')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer whitespace-nowrap ${
              viewMode === 'test'
                ? 'bg-[var(--bg-selected)] text-[var(--text-primary)] font-medium'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Play className="w-3.5 h-3.5 shrink-0" />
            <span>Test</span>
          </button>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setView3D(v => !v)}
            title={
              motionSensor.isOnline
                ? `GY-521 Motion Active · Pitch: ${motionSensor.pitch.toFixed(0)}° · Roll: ${motionSensor.roll.toFixed(0)}° · Yaw: ${motionSensor.yaw.toFixed(0)}°`
                : 'Toggle 3D tactile view with live GY-521 gyro'
            }
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              view3D
                ? 'bg-[var(--bg-selected)] text-[var(--text-primary)] border border-[var(--border-strong)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span>{view3D ? (motionSensor.isOnline ? '3D Gyro' : '3D') : '3D'}</span>
            {view3D && motionSensor.isOnline && (
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0" aria-hidden="true" />
            )}
          </button>

          {view3D && (
            <button
              type="button"
              onClick={() => {
                setCalibrating3D(true);
                setCalibStep('flat');
              }}
              title="Calibrate Left/Right Tilt and Zero Point for 3D View"
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Compass className="w-3.5 h-3.5 shrink-0" />
              <span>Calibrate</span>
            </button>
          )}

          <span className="h-3.5 w-px bg-[var(--border-subtle)] mx-0.5 shrink-0" aria-hidden="true" />

          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[var(--bg-panel)]/90 border border-[var(--border-subtle)] shrink-0">
            <button
              type="button"
              onClick={() => onChangeEncoderPlacement('grid')}
              title="Side Knobs layout"
              className={`px-2 py-1 rounded-md text-xs transition-colors cursor-pointer whitespace-nowrap ${
                encoderPlacement === 'grid'
                  ? 'bg-[var(--bg-selected)] text-[var(--text-primary)] font-medium'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Side
            </button>
            <button
              type="button"
              onClick={() => onChangeEncoderPlacement('top')}
              title="Top Dials layout"
              className={`px-2 py-1 rounded-md text-xs transition-colors cursor-pointer whitespace-nowrap ${
                encoderPlacement === 'top'
                  ? 'bg-[var(--bg-selected)] text-[var(--text-primary)] font-medium'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Top
            </button>
          </div>

          {onOpenCheatSheet && (
            <button
              type="button"
              onClick={onOpenCheatSheet}
              title="Desk Reference Cheat Sheet"
              aria-label="Cheat Sheet"
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <BookOpen className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Sheet</span>
            </button>
          )}

          {(onOpenShortcuts || onOpenCheatSheet) && (
            <button
              type="button"
              onClick={onOpenShortcuts || onOpenCheatSheet}
              title="Keyboard Shortcuts (?)"
              aria-label="Keyboard Shortcuts"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer shrink-0"
            >
              ?
            </button>
          )}
        </div>
      </div>

      {/* Multi-Select Action Bar (appears when 2+ macro keys are Shift-selected) */}
      {viewMode === 'edit' && multiSelectedKeys.length > 1 && (
        <div
          role="region"
          aria-label="Multi-selected keys toolbar"
          className="studio-chrome w-full max-w-2xl mt-2.5 px-3.5 py-2 rounded-2xl border border-[rgba(var(--accent-rgb),0.45)] flex items-center justify-between gap-2.5 flex-wrap animate-popover-in shrink-0"
        >
          <div className="flex items-center gap-2 min-w-0">
            <CheckSquare className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            <span className="text-xs font-semibold text-[var(--text-primary)] whitespace-nowrap tabular-nums">
              {multiSelectedKeys.length} keys selected
            </span>
            <span className="font-mono text-[11px] text-[var(--accent)] truncate">
              {formatMultiKeySummary(multiSelectedKeys)}
            </span>
            <span className="hidden sm:inline text-[11px] text-[var(--text-muted)] whitespace-nowrap">
              · Right-click any selected key for bulk actions
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={e => {
                const firstKey = multiSelectedKeys[0];
                const rect = e.currentTarget.getBoundingClientRect();
                setContextMenu({
                  x: Math.min(Math.max(12, rect.left), window.innerWidth - 268),
                  y: Math.min(Math.max(12, rect.bottom + 6), window.innerHeight - 410),
                  title: `${multiSelectedKeys.length} Keys Selected`,
                  subtitle: formatMultiKeySummary(multiSelectedKeys),
                  slot: KEY_TO_SLOT[firstKey],
                  controlId: firstKey,
                  binding: layer.keys[firstKey].triggers.tap,
                  keyId: firstKey,
                  multiKeys: multiSelectedKeys
                });
              }}
              className="studio-cta px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer whitespace-nowrap"
            >
              Actions
            </button>
            {multiSelectedKeys.length < PROGRAMMABLE_KEY_IDS.length && (
              <button
                type="button"
                onClick={() => setMultiSelectedKeys([...PROGRAMMABLE_KEY_IDS])}
                className="studio-btn px-2 py-1 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
              >
                Select all 8
              </button>
            )}
            <button
              type="button"
              onClick={() => setMultiSelectedKeys([])}
              title="Clear multi-selection (Esc)"
              className="studio-btn p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              aria-label="Clear multi-selection"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

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
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {onOpenSetupWizard && (
              <button
                type="button"
                onClick={onOpenSetupWizard}
                className="px-3 py-1.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-xs font-semibold text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>Run Guided Setup</span>
              </button>
            )}
            <button
              type="button"
              onClick={onStartDemoMode}
              className="px-3 py-1.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-xs font-semibold text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5"
            >
              <PlayCircle className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Demo Mode</span>
            </button>
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
                3D Motion Calibration
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
        onPointerMove={e => {
          if (!view3D) return;
          const rect = e.currentTarget.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;
          const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
          const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
          pointerTiltRef.current = {
            pitch: Number((15 - ny * 3).toFixed(2)),
            roll: Number((-9 + nx * 3.5).toFixed(2)),
            active: true
          };
        }}
        onPointerLeave={() => {
          pointerTiltRef.current = { pitch: 15, roll: -9, active: false };
        }}
        className={`my-auto flex flex-col items-center justify-center w-full ${
          view3D ? 'px-6 sm:px-10 py-6 sm:py-8 overflow-visible' : 'py-4 sm:py-6 transition-all duration-300'
        }`}
        style={view3D ? { perspective: '1400px', pointerEvents: 'auto' } : undefined}
      >
        <div
          ref={chassis3dRef}
          className={`relative w-fit max-w-full min-w-[300px] chassis-shell rounded-[32px] sm:rounded-[38px] p-4 sm:p-6 xl:p-7 border border-[#ECEAE4]/12 ${
            view3D
              ? ''
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
          {/* 3D Extruded Aluminum Chassis Body & Clipped Directional Specular Highlight */}
          {view3D && (
            <>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-[inherit] border border-[#ECEAE4]/8 bg-gradient-to-b from-[#171A20] to-[#0B0C10]"
                style={{ transform: 'translateZ(-8px)', backfaceVisibility: 'hidden' }}
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-[inherit] border border-[#050608] bg-gradient-to-b from-[#111318] to-[#07080B] shadow-[0_26px_42px_rgba(0,0,0,0.85)]"
                style={{ transform: 'translateZ(-16px)', backfaceVisibility: 'hidden' }}
              />
              <div
                ref={specular3dRef}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-[inherit]"
                style={{ transform: 'translateZ(1px)', backfaceVisibility: 'hidden' }}
              />
            </>
          )}

          {/* Precision Aerospace Corner Screw Insets */}
          <div className="absolute top-3 left-3 sm:top-3.5 sm:left-3.5 chassis-screw-pin opacity-70" aria-hidden="true" style={view3D ? { transform: 'translateZ(2px)' } : undefined} />
          <div className="absolute top-3 right-3 sm:top-3.5 sm:right-3.5 chassis-screw-pin opacity-70" aria-hidden="true" style={view3D ? { transform: 'translateZ(2px)' } : undefined} />
          <div className="absolute bottom-3 left-3 sm:bottom-3.5 sm:left-3.5 chassis-screw-pin opacity-70" aria-hidden="true" style={view3D ? { transform: 'translateZ(2px)' } : undefined} />
          <div className="absolute bottom-3 right-3 sm:bottom-3.5 sm:right-3.5 chassis-screw-pin opacity-70" aria-hidden="true" style={view3D ? { transform: 'translateZ(2px)' } : undefined} />

          {/* 128x64 SSD1306 1-Bit Monochrome Hardware OLED Strip */}
          {(() => {
            const composerOn = Boolean(oledComposer?.enabled);
            const inverted = Boolean(composerOn && oledComposer?.invertDisplay);
            const displayTitle =
              composerOn && oledComposer?.customName?.trim()
                ? oledComposer.customName.trim()
                : activeProfileName;
            const showBle = !composerOn || oledComposer?.showBleStatus !== false;
            const showWifi = !composerOn || oledComposer?.showWifiStatus !== false;
            const showHost = !composerOn || oledComposer?.showHostBadge !== false;
            const textPrimary = inverted ? 'text-[#040507]' : 'text-[#ECEAE4]';
            const textMuted = inverted ? 'text-[#040507]/65' : 'text-[#A3A6AD]/75';
            return (
          <div
            onDoubleClick={() => onOpenOledComposer?.()}
            title={onOpenOledComposer ? 'Double-click to customize 128×64 OLED screen' : undefined}
            className={`mb-5 sm:mb-6 px-3.5 py-2.5 rounded-xl oled-glass border flex items-center justify-between gap-2 min-h-[42px] overflow-hidden ${
              inverted
                ? '!bg-[#ECEAE4] border-[#14161B]/30 shadow-inner'
                : 'border-[#ECEAE4]/15 shadow-inner'
            }`}
            style={view3D ? { transform: 'translateZ(12px)', transformStyle: 'preserve-3d', zIndex: 15 } : undefined}
          >
            <div className="flex items-center gap-2 min-w-0">
              <img
                src="/logo-mark-mono.svg"
                alt="BertoPad OLED"
                referrerPolicy="no-referrer"
                className={`w-4 h-4 object-contain shrink-0 opacity-90 ${
                  inverted ? 'invert' : ''
                } ${connection.connecting ? 'animate-[spin_3s_linear_infinite]' : ''}`}
              />
              {oledToast ? (
                <div className="flex items-center gap-1.5 min-w-0 font-mono text-[10px] sm:text-[11px] tabular-nums">
                  <span
                    className={`px-1.5 py-0.5 rounded font-bold uppercase tracking-wider leading-none shrink-0 ${
                      inverted ? 'bg-[#040507] text-[#ECEAE4]' : 'bg-[#ECEAE4] text-[#14161B]'
                    }`}
                  >
                    {oledToast.title}
                  </span>
                  {oledToast.subtitle && (
                    <span className={`${textPrimary} font-semibold truncate`}>
                      {oledToast.subtitle}
                    </span>
                  )}
                </div>
              ) : (
                <span className={`font-mono text-[11px] sm:text-xs font-bold uppercase tracking-wider truncate tabular-nums ${textPrimary}`}>
                  {connection.connected && connection.telemetry?.setupMode
                    ? `SETUP · ${displayTitle}`
                    : displayTitle}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 font-mono text-[10px] shrink-0">
              {connection.connected ? (
                <>
                  {showBle && (
                    <span
                      className={`flex items-center gap-0.5 ${
                        telemetry?.bleConnected ? textPrimary : textMuted
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
                  )}
                  {showWifi && (
                    <span
                      className={`flex items-center gap-0.5 ${
                        telemetry?.wifiConnected ? textPrimary : textMuted
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
                  )}
                  <button
                    type="button"
                    onPointerDown={e => handlePointerDown('oled_pull', e)}
                    onPointerUp={e => handlePointerUp('oled_pull', e, onPullFromUsb)}
                    onPointerCancel={handlePointerCancel}
                    onClick={e => handleClick('oled_pull', e, onPullFromUsb)}
                    title="Refresh status & all 4 profiles"
                    style={view3D ? { transform: 'translateZ(4px)', transformStyle: 'preserve-3d', zIndex: 20 } : undefined}
                    className={`${textPrimary} hover:underline flex items-center gap-1 cursor-pointer`}
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    <span>{connection.transport === 'demo' ? 'DEMO' : 'LIVE'}</span>
                  </button>
                </>
              ) : (
                <span className={textMuted}>
                  {connection.connecting ? 'CONNECTING…' : 'OFFLINE'}
                </span>
              )}

              {showHost && isBleHostProfile(activeProfileId) && (
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
                  onPointerCancel={handlePointerCancel}
                  onClick={e =>
                    handleClick('oled_host', e, () => {
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
                      ? `Host ${oledBadgeHost} — click to switch host`
                      : `Viewing Host ${oledBadgeHost} — click to cycle hosts`
                  }
                  style={view3D ? { transform: 'translateZ(4px)', transformStyle: 'preserve-3d', zIndex: 20 } : undefined}
                  className={`px-1.5 py-0.5 rounded border font-mono text-[10px] font-bold leading-none tracking-tight transition-colors cursor-pointer tabular-nums shrink-0 ${
                    inverted
                      ? 'bg-[#040507] border-[#040507] text-[#ECEAE4]'
                      : connection.connected && oledBadgeHost !== activeBleHost
                      ? 'bg-black border-[#ECEAE4]/50 text-[#A3A6AD] hover:border-[#ECEAE4]'
                      : 'bg-black border-[#ECEAE4]/80 text-[#ECEAE4] hover:bg-[#ECEAE4] hover:text-[#14161B]'
                  }`}
                >
                  Host {oledBadgeHost}
                </button>
              )}
              {onOpenOledComposer && (
                <button
                  type="button"
                  onPointerDown={e => handlePointerDown('oled_edit', e)}
                  onPointerUp={e => handlePointerUp('oled_edit', e, onOpenOledComposer)}
                  onPointerCancel={handlePointerCancel}
                  onClick={e => handleClick('oled_edit', e, onOpenOledComposer)}
                  title="Customize 128×64 OLED screen"
                  aria-label="Customize OLED screen"
                  style={view3D ? { transform: 'translateZ(4px)', transformStyle: 'preserve-3d', zIndex: 20 } : undefined}
                  className={`p-1 rounded transition-colors cursor-pointer shrink-0 ${
                    inverted
                      ? 'text-[#040507]/70 hover:text-[#040507] hover:bg-[#040507]/10'
                      : 'text-[#A3A6AD] hover:text-[#ECEAE4] hover:bg-[#ECEAE4]/10'
                  }`}
                >
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
            );
          })()}

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

        {view3D && motionSensor.isOnline && (
          <div className="mt-4 flex items-center gap-2 font-mono text-[10px] text-[var(--text-muted)] tabular-nums select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" aria-hidden="true" />
            <span ref={telemetryReadoutRef}>LIVE GYRO · Pitch 0.0° · Roll 0.0°</span>
          </div>
        )}
      </div>

      {/* Subtle Borderless 3-Chip Motion Gestures Strip */}
      {hasMotion && (
        <div
          aria-label="Motion gestures"
          className="w-full max-w-2xl flex items-center justify-center flex-wrap gap-x-1 gap-y-1 pt-1 shrink-0"
        >
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)] mr-1.5 select-none">
            Motion{connection.telemetry?.motion && !connection.telemetry.motion.enabled ? ' · Off' : ''}
          </span>
          {(
            [
              { slot: 'g_shake' as MotionSlotId, label: 'Shake', Icon: Compass },
              { slot: 'g_down' as MotionSlotId, label: 'Face Down', Icon: ArrowDown },
              { slot: 'g_up' as MotionSlotId, label: 'Face Up', Icon: ArrowUp }
            ]
          ).map(({ slot, label, Icon }, idx) => {
            const binding = layer.motion?.[slot] ?? { type: 'none' as const, value: '' };
            const isFlashed = flashedSlots.has(slot);
            const isSelected = viewMode === 'edit' && selectedControl === slot;
            const summary = binding.value
              ? describeFirmwareAction(binding.value, binding.repeatConfig, customMacros)
                  .shortLabel
              : 'Unassigned';

            return (
              <React.Fragment key={slot}>
                {idx > 0 && (
                  <span className="text-[var(--text-muted)]/40 text-xs select-none" aria-hidden="true">
                    ·
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (viewMode === 'edit') {
                      onSelectControl(slot);
                    }
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
                  title={`${label}: ${summary}`}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer max-w-[200px] ${
                    isFlashed
                      ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-medium'
                      : isSelected
                      ? 'bg-[var(--bg-selected)] text-[var(--text-primary)] font-medium'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <Icon className="w-3 h-3 shrink-0 opacity-75" />
                  <span className="shrink-0">{label}</span>
                  {binding.value && (
                    <span className="font-mono text-[10px] text-[var(--text-muted)] truncate">
                      {summary}
                    </span>
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      )}
      {/* Bottom: Conflict Alert (Edit Mode) or Fallback Feed when embedded standalone */}
      {(conflicts.length > 0 && viewMode === 'edit') ||
      (viewMode === 'test' && !onAddTestEvent) ? (
        <div className="w-full max-w-2xl space-y-2 shrink-0">
          {conflicts.length > 0 && viewMode === 'edit' && (
            <div className="px-3.5 py-2.5 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)] flex items-center gap-2.5 text-xs text-[var(--text-primary)]">
              <AlertTriangle className="w-4 h-4 shrink-0 text-[var(--accent)]" />
              <span>{conflicts[0].summary}</span>
            </div>
          )}

          {viewMode === 'test' && !onAddTestEvent && (
            <div className="rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  Live Input Feed
                </span>
                <div className="flex items-center gap-2">
                  {connection.transport === 'demo' && (
                    <button
                      type="button"
                      onClick={() => triggerModePlusDialHostSwitch('cw')}
                      title="Simulate holding Mode + rotating Dial clockwise to switch wireless host"
                      className="px-2 py-1 rounded-md bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[11px] font-medium text-[var(--accent)] cursor-pointer whitespace-nowrap inline-flex items-center gap-1"
                    >
                      <Bluetooth className="w-3 h-3 shrink-0" />
                      <span>Switch to Host {((activeBleHost % 3) + 1)}</span>
                    </button>
                  )}
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
      {/* Right-Click Tactile Studio Context Menu for Single & Multi-Selected Keys & Knobs */}
      {contextMenu && (() => {
        const multiKeys = contextMenu.multiKeys;
        const isMultiMode = Boolean(multiKeys && multiKeys.length > 1);
        const multiSlots: HardwareSlotId[] = isMultiMode
          ? multiKeys!.map(k => KEY_TO_SLOT[k])
          : [];
        const combinedMacroBinding = isMultiMode
          ? buildCombinedMacroBindingFromKeys(multiKeys!, layer.keys)
          : null;
        const clickedKeyActionLabel =
          contextMenu.keyId && isProgrammableKeyId(contextMenu.keyId)
            ? layer.keys[contextMenu.keyId].appearance.label || 'Unassigned'
            : contextMenu.subtitle;
        const clickedKeyHasAction = Boolean(contextMenu.binding.value);
        const singleAnchorKey =
          !isMultiMode &&
          viewMode === 'edit' &&
          contextMenu.keyId &&
          isProgrammableKeyId(contextMenu.keyId)
            ? resolveAnchorActionKey(selectedControl)
            : null;

        return (
          <div
            ref={contextMenuRef}
            role="menu"
            aria-label={`Quick actions for ${contextMenu.title}`}
            style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
            className="studio-popover fixed z-[80] w-64 rounded-2xl p-1.5 text-xs animate-popover-in"
          >
            <div className="px-2.5 py-1.5 border-b border-[var(--border-subtle)] mb-1">
              <div className="font-semibold text-[var(--text-primary)] truncate flex items-center gap-1.5">
                {isMultiMode && (
                  <CheckSquare className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                )}
                <span className="truncate">{contextMenu.title}</span>
              </div>
              <div className="text-[11px] text-[var(--text-muted)] truncate font-mono">
                {contextMenu.subtitle}
              </div>
            </div>

            {isMultiMode && multiKeys ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const keysToRun = [...multiKeys];
                    setContextMenu(null);
                    keysToRun.forEach((k, i) => {
                      window.setTimeout(() => {
                        soundEngine.playKeyClick();
                        triggerSlotFlash(KEY_TO_SLOT[k]);
                        const cfg = layer.keys[k];
                        if (cfg) {
                          triggerOledToast(
                            `KEY ${k.slice(1)}`,
                            cfg.appearance.label || 'Unassigned'
                          );
                          pushLog(
                            `Key ${k.slice(1)}`,
                            'Batch Test',
                            summarizeAction(cfg.triggers.tap, customMacros),
                            'sim'
                          );
                        }
                      }, i * 110);
                    });
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer text-left"
                >
                  <Play className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  <span>Test all {multiKeys.length} keys</span>
                </button>

                {onOpenMacroBuilderForSlot && combinedMacroBinding && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      const firstSlot = KEY_TO_SLOT[multiKeys[0]];
                      setContextMenu(null);
                      setMultiSelectedKeys([]);
                      onOpenMacroBuilderForSlot(firstSlot, combinedMacroBinding);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer text-left"
                  >
                    <Zap className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                    <span>Combine into Macro Studio</span>
                  </button>
                )}

                {multiKeys.length === 2 && onSwapKeys && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      const [a, b] = multiKeys;
                      setContextMenu(null);
                      soundEngine.playKeyClick();
                      onSwapKeys(a, b);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer text-left"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                    <span>
                      Swap K{multiKeys[0].slice(1)} ↔ K{multiKeys[1].slice(1)}
                    </span>
                  </button>
                )}

                {contextMenu.keyId && clickedKeyHasAction && (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setCopiedClipboard({
                          label: clickedKeyActionLabel,
                          binding: { ...contextMenu.binding }
                        });
                        setContextMenu(null);
                        soundEngine.playKeyClick();
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer text-left"
                    >
                      <Copy className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                      <span className="truncate">
                        Copy Key {contextMenu.keyId.slice(1)} action
                      </span>
                    </button>

                    {(onBatchPasteSlotBinding || onPasteSlotBinding) && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          const bindingCopy = { ...contextMenu.binding };
                          setContextMenu(null);
                          soundEngine.playKeyClick();
                          if (onBatchPasteSlotBinding) {
                            onBatchPasteSlotBinding(multiSlots, bindingCopy);
                          } else if (onPasteSlotBinding) {
                            multiSlots.forEach(s => onPasteSlotBinding(s, bindingCopy));
                          }
                        }}
                        className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer text-left"
                      >
                        <ClipboardPaste className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                        <span className="truncate">
                          Apply &ldquo;{clickedKeyActionLabel}&rdquo; to all {multiKeys.length}
                        </span>
                      </button>
                    )}
                  </>
                )}

                {copiedClipboard && (onBatchPasteSlotBinding || onPasteSlotBinding) && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      const clip = copiedClipboard;
                      setContextMenu(null);
                      soundEngine.playKeyClick();
                      if (onBatchPasteSlotBinding) {
                        onBatchPasteSlotBinding(multiSlots, { ...clip.binding });
                      } else if (onPasteSlotBinding) {
                        multiSlots.forEach(s => onPasteSlotBinding(s, { ...clip.binding }));
                      }
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer text-left"
                  >
                    <ClipboardPaste className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                    <span className="truncate">
                      Paste &ldquo;{copiedClipboard.label}&rdquo; to all {multiKeys.length}
                    </span>
                  </button>
                )}

                {onBatchUpdateKeyAppearance && (
                  <div className="px-2.5 py-1.5 mt-0.5 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)]">
                    <span className="text-[11px] text-[var(--text-muted)] whitespace-nowrap">
                      Legend color
                    </span>
                    <div className="flex items-center gap-1.5">
                      {MULTI_SELECT_LEGEND_SWATCHES.map(swatch => (
                        <button
                          key={swatch.hex}
                          type="button"
                          title={`Set legend color to ${swatch.label} on ${multiKeys.length} keys`}
                          aria-label={`Set legend color to ${swatch.label}`}
                          onClick={() => {
                            setContextMenu(null);
                            soundEngine.playKeyClick();
                            onBatchUpdateKeyAppearance(multiKeys, {
                              labelColor: swatch.hex
                            });
                          }}
                          style={{ backgroundColor: swatch.hex }}
                          className="w-4 h-4 rounded-full border border-black/30 hover:scale-110 transition-transform cursor-pointer"
                        />
                      ))}
                    </div>
                  </div>
                )}

                {(onBatchResetSlotsToDefault ||
                  onResetSlotToDefault ||
                  onBatchClearSlots ||
                  onClearSlot) && (
                  <div className="my-1 border-t border-[var(--border-subtle)]" />
                )}

                {(onBatchResetSlotsToDefault || onResetSlotToDefault) && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setContextMenu(null);
                      soundEngine.playKeyClick();
                      if (onBatchResetSlotsToDefault) {
                        onBatchResetSlotsToDefault(multiSlots);
                      } else if (onResetSlotToDefault) {
                        multiSlots.forEach(s => onResetSlotToDefault(s));
                      }
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer text-left"
                  >
                    <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                    <span>Reset {multiKeys.length} keys to default</span>
                  </button>
                )}

                {(onBatchClearSlots || onClearSlot) && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setContextMenu(null);
                      soundEngine.playKeyClick();
                      if (onBatchClearSlots) {
                        onBatchClearSlots(multiSlots);
                      } else if (onClearSlot) {
                        multiSlots.forEach(s => onClearSlot(s));
                      }
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer text-left"
                  >
                    <XCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Clear {multiKeys.length} keys</span>
                  </button>
                )}

                <div className="my-1 border-t border-[var(--border-subtle)]" />

                {multiKeys.length < PROGRAMMABLE_KEY_IDS.length && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMultiSelectedKeys([...PROGRAMMABLE_KEY_IDS]);
                      setContextMenu(prev =>
                        prev
                          ? {
                              ...prev,
                              title: `${PROGRAMMABLE_KEY_IDS.length} Keys Selected`,
                              subtitle: formatMultiKeySummary(PROGRAMMABLE_KEY_IDS),
                              multiKeys: [...PROGRAMMABLE_KEY_IDS]
                            }
                          : null
                      );
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer text-left"
                  >
                    <CheckSquare className="w-3.5 h-3.5 shrink-0" />
                    <span>Select all 8 keys</span>
                  </button>
                )}

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setContextMenu(null);
                    setMultiSelectedKeys([]);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer text-left"
                >
                  <X className="w-3.5 h-3.5 shrink-0" />
                  <span>Deselect all</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const target = contextMenu;
                    setContextMenu(null);
                    if (target.keyId) {
                      activateKeyControl(target.keyId);
                    } else if (target.encoderIndex) {
                      activateDialPush(target.encoderIndex);
                    }
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer text-left"
                >
                  <Play className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  <span>Test action</span>
                </button>

                {onOpenMacroBuilderForSlot && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      const target = contextMenu;
                      setContextMenu(null);
                      onOpenMacroBuilderForSlot(target.slot, target.binding);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer text-left"
                  >
                    <Zap className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                    <span>Open in Macro Studio</span>
                  </button>
                )}

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const target = contextMenu;
                    setCopiedClipboard({
                      label: target.subtitle,
                      binding: { ...target.binding }
                    });
                    setContextMenu(null);
                    soundEngine.playKeyClick();
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer text-left"
                >
                  <Copy className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                  <span>Copy action</span>
                </button>

                {copiedClipboard && onPasteSlotBinding && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      const target = contextMenu;
                      const clip = copiedClipboard;
                      setContextMenu(null);
                      soundEngine.playKeyClick();
                      onPasteSlotBinding(target.slot, { ...clip.binding });
                      onSelectControl(target.controlId);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer text-left"
                  >
                    <ClipboardPaste className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                    <span className="truncate">Paste &ldquo;{copiedClipboard.label}&rdquo;</span>
                  </button>
                )}

                {viewMode === 'edit' &&
                  contextMenu.keyId &&
                  isProgrammableKeyId(contextMenu.keyId) && (
                    <>
                      <div className="my-1 border-t border-[var(--border-subtle)]" />
                      {multiSelectedKeys.length > 0 &&
                      !multiSelectedKeys.includes(contextMenu.keyId) ? (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            const kid = contextMenu.keyId as ActionKeyId;
                            const next = addKeyToMultiSelection(
                              multiSelectedKeys,
                              selectedControl,
                              kid
                            );
                            setMultiSelectedKeys(next);
                            onSelectControl(kid);
                            setContextMenu(prev =>
                              prev
                                ? {
                                    ...prev,
                                    title: `${next.length} Keys Selected`,
                                    subtitle: formatMultiKeySummary(next),
                                    multiKeys: next
                                  }
                                : null
                            );
                          }}
                          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer text-left"
                        >
                          <PlusSquare className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                          <span>
                            Add Key {contextMenu.keyId.slice(1)} to selection ({multiSelectedKeys.length + 1})
                          </span>
                        </button>
                      ) : singleAnchorKey && singleAnchorKey !== contextMenu.keyId ? (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            const kid = contextMenu.keyId as ActionKeyId;
                            const next: ActionKeyId[] = [singleAnchorKey, kid];
                            setMultiSelectedKeys(next);
                            onSelectControl(kid);
                            setContextMenu(prev =>
                              prev
                                ? {
                                    ...prev,
                                    title: `${next.length} Keys Selected`,
                                    subtitle: formatMultiKeySummary(next),
                                    multiKeys: next
                                  }
                                : null
                            );
                          }}
                          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer text-left"
                        >
                          <Check className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                          <span>
                            Multi-select with Key {singleAnchorKey.slice(1)}
                          </span>
                        </button>
                      ) : null}

                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMultiSelectedKeys([...PROGRAMMABLE_KEY_IDS]);
                          setContextMenu(prev =>
                            prev
                              ? {
                                  ...prev,
                                  title: `${PROGRAMMABLE_KEY_IDS.length} Keys Selected`,
                                  subtitle: formatMultiKeySummary(PROGRAMMABLE_KEY_IDS),
                                  multiKeys: [...PROGRAMMABLE_KEY_IDS]
                                }
                              : null
                          );
                        }}
                        className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer text-left"
                      >
                        <CheckSquare className="w-3.5 h-3.5 shrink-0" />
                        <span>Select all 8 keys</span>
                      </button>
                    </>
                  )}

                {(onResetSlotToDefault || onClearSlot) && (
                  <div className="my-1 border-t border-[var(--border-subtle)]" />
                )}

                {onResetSlotToDefault && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      const target = contextMenu;
                      setContextMenu(null);
                      onResetSlotToDefault(target.slot);
                      onSelectControl(target.controlId);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer text-left"
                  >
                    <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                    <span>Reset to default</span>
                  </button>
                )}

                {onClearSlot && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      const target = contextMenu;
                      setContextMenu(null);
                      onClearSlot(target.slot);
                      onSelectControl(target.controlId);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer text-left"
                  >
                    <XCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Clear control</span>
                  </button>
                )}
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
};
