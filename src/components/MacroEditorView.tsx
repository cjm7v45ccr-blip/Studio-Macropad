import React, { useState, useEffect, useMemo } from 'react';
import {
  ActionBinding,
  ActiveRepeatJob,
  CustomMacroItem,
  DeviceConnectionInfo,
  HardwareProfileId,
  HardwareSlotId,
  KeyboardLayoutId,
  MacroStepActionType,
  MacroStepConfig,
  StudioProfile,
  TextMacroRepeatConfig
} from '../types/studio';
import {
  FIRMWARE_STATIC_CATALOG,
  FIRMWARE_SUPPORTED_KEYS,
  HARDWARE_SLOTS,
  SLOT_LABELS,
  actionToMacroSteps,
  buildFirmwareActionFromTextConfig,
  buildFirmwareShortcut,
  calculateStepsTiming,
  describeFirmwareAction,
  describeMacroStep,
  firmwareActionToBinding,
  formatShortcutPretty,
  getActionTestAvailability,
  isSupportedFirmwareKey,
  isValidFirmwareAction,
  normalizeBrowserKeyToFirmware,
  parseFirmwareShortcut,
  requiresUsbSequenceExecution,
  sanitizeSerialString,
  stepToFirmwareAction,
  validateTextMacroInput
} from '../data/firmwareCatalog';
import {
  extractProfileSlots,
  getBindingForProfileSlot
} from '../hooks/useStudioState';
import { repeatMacroRunner } from '../services/repeatMacroRunner';
import {
  Plus,
  Trash2,
  Play,
  Square,
  Radio,
  Check,
  Command,
  FileText,
  Tv,
  Laptop,
  Save,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  GripVertical,
  Clock,
  Copy,
  Volume2,
  CornerDownLeft,
  Eye,
  Search,
  X,
  ArrowLeft,
  ArrowUpRight,
  Disc,
  RotateCcw,
  RotateCw,
  Bluetooth
} from 'lucide-react';

export interface MacroEditorExternalTarget {
  requestId: number;
  macroId?: string | null;
  name: string;
  action: string;
  repeatConfig?: TextMacroRepeatConfig;
  stepsOverride?: Omit<MacroStepConfig, 'id'>[];
  targetProfile?: HardwareProfileId;
  targetSlot?: HardwareSlotId;
}

interface MacroEditorViewProps {
  profiles: [StudioProfile, StudioProfile];
  activeProfileId: HardwareProfileId;
  customMacros: CustomMacroItem[];
  keyboardLayout: KeyboardLayoutId;
  connection: DeviceConnectionInfo;
  activeRepeatJob?: ActiveRepeatJob | null;
  externalTarget?: MacroEditorExternalTarget | null;
  initialTargetSlot?: HardwareSlotId;
  onSaveMacro: (macro: CustomMacroItem) => void;
  onDeleteMacro: (id: string) => void;
  onAssignSlot: (
    profileId: HardwareProfileId,
    slot: HardwareSlotId,
    binding: ActionBinding
  ) => void;
  onTestBinding: (binding: ActionBinding) => void;
  onStopRepeat: () => void;
  onPullFromUsb: () => void;
  onJumpToControl?: (profileId: HardwareProfileId, slot: HardwareSlotId) => void;
}

const MOD_LIST = [
  { id: 'cmd', label: '⌘ Cmd' },
  { id: 'ctrl', label: '⌃ Ctrl' },
  { id: 'alt', label: '⌥ Opt' },
  { id: 'shift', label: '⇧ Shift' },
  { id: 'win', label: '⊞ Win' }
];

const QUICK_DELAY_PRESETS = [0, 100, 250, 500];
const PAUSE_STEP_PRESETS = [100, 250, 500, 1000, 2000];

const BUTTON_GRID_SLOTS: HardwareSlotId[] = [
  'b1',
  'b2',
  'b3',
  'b4',
  'b5',
  'b6',
  'b7',
  'b8'
];

const ENCODER_SLOTS: {
  slot: HardwareSlotId;
  shortTitle: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { slot: 'dial', shortTitle: 'Press', icon: Disc },
  { slot: 'enc_ccw', shortTitle: 'Turn L', icon: RotateCcw },
  { slot: 'enc_cw', shortTitle: 'Turn R', icon: RotateCw }
];

const STEP_TYPE_ORDER: MacroStepActionType[] = [
  'shortcut',
  'text',
  'key',
  'delay',
  'media',
  'os_action',
  'ble',
  'tv'
];

const STEP_TYPE_META: Record<
  MacroStepActionType,
  {
    label: string;
    shortLabel: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  shortcut: { label: 'Keyboard Shortcut', shortLabel: 'Shortcut', icon: Command },
  text: { label: 'Type Text', shortLabel: 'Type Text', icon: FileText },
  key: { label: 'Key Press', shortLabel: 'Key Press', icon: CornerDownLeft },
  delay: { label: 'Timed Wait', shortLabel: 'Wait', icon: Clock },
  media: { label: 'Media & Function', shortLabel: 'Media', icon: Volume2 },
  os_action: { label: 'System Action', shortLabel: 'System', icon: Laptop },
  ble: { label: 'BLE Host Switch', shortLabel: 'BLE Host', icon: Bluetooth },
  tv: { label: 'Smart TV', shortLabel: 'Smart TV', icon: Tv }
};

export interface StarterTemplate {
  id: string;
  name: string;
  summary: string;
  steps: Omit<MacroStepConfig, 'id'>[];
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: 'tpl-spotlight-app',
    name: 'Open App via Search',
    summary: '3 steps · 350 ms',
    steps: [
      {
        label: 'Spotlight Search',
        actionType: 'shortcut',
        value: 'SHORTCUT:cmd:space',
        delayMs: 200,
        repeatCount: 1
      },
      {
        label: 'Type Application Name',
        actionType: 'text',
        value: 'Terminal',
        delayMs: 150,
        repeatCount: 1
      },
      {
        label: 'Confirm Launch',
        actionType: 'key',
        value: 'enter',
        delayMs: 0,
        repeatCount: 1
      }
    ]
  },
  {
    id: 'tpl-paste-submit',
    name: 'Paste & Submit Line',
    summary: '2 steps · 120 ms',
    steps: [
      {
        label: 'Paste Clipboard',
        actionType: 'os_action',
        value: 'MACRO:PASTE',
        delayMs: 120,
        repeatCount: 1
      },
      {
        label: 'Send Enter',
        actionType: 'key',
        value: 'enter',
        delayMs: 0,
        repeatCount: 1
      }
    ]
  },
  {
    id: 'tpl-stream-ready',
    name: 'Stream Scene & Mute',
    summary: '3 steps · 450 ms',
    steps: [
      {
        label: 'Trigger Scene Key',
        actionType: 'media',
        value: 'KEY:F13',
        delayMs: 250,
        repeatCount: 1
      },
      {
        label: 'Pause Media Playback',
        actionType: 'media',
        value: 'MEDIA:PLAY_PAUSE',
        delayMs: 200,
        repeatCount: 1
      },
      {
        label: 'Toggle Aux Key',
        actionType: 'media',
        value: 'KEY:F14',
        delayMs: 0,
        repeatCount: 1
      }
    ]
  },
  {
    id: 'tpl-tv-cinema',
    name: 'TV App Launch & Mute',
    summary: '3 steps · 1500 ms',
    steps: [
      {
        label: 'Launch YouTube',
        actionType: 'tv',
        value: 'APP:YOUTUBE',
        delayMs: 1200,
        repeatCount: 1
      },
      {
        label: 'Confirm Selection',
        actionType: 'tv',
        value: 'TV:OK',
        delayMs: 300,
        repeatCount: 1
      },
      {
        label: 'Volume Up',
        actionType: 'tv',
        value: 'TV:VOL_UP',
        delayMs: 0,
        repeatCount: 1
      }
    ]
  }
];

function createDefaultStep(actionType: MacroStepActionType, indexSeed = 0): MacroStepConfig {
  const id = `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${indexSeed}`;
  switch (actionType) {
    case 'shortcut':
      return {
        id,
        label: 'Keyboard Shortcut',
        actionType: 'shortcut',
        value: 'SHORTCUT:cmd,shift:4',
        delayMs: 150,
        repeatCount: 1
      };
    case 'text':
      return {
        id,
        label: 'Type Text',
        actionType: 'text',
        value: 'npm run dev',
        delayMs: 150,
        repeatCount: 1
      };
    case 'key':
      return {
        id,
        label: 'Key Press',
        actionType: 'key',
        value: 'enter',
        delayMs: 100,
        repeatCount: 1
      };
    case 'media':
      return {
        id,
        label: 'Media & Function',
        actionType: 'media',
        value: 'MEDIA:PLAY_PAUSE',
        delayMs: 150,
        repeatCount: 1
      };
    case 'os_action':
      return {
        id,
        label: 'System Action',
        actionType: 'os_action',
        value: 'MACRO:COPY',
        delayMs: 150,
        repeatCount: 1
      };
    case 'ble':
      return {
        id,
        label: 'BLE Host Switch',
        actionType: 'ble',
        value: 'BLE:NEXT_HOST',
        delayMs: 0,
        repeatCount: 1
      };
    case 'tv':
      return {
        id,
        label: 'Smart TV',
        actionType: 'tv',
        value: 'TV:MUTE',
        delayMs: 300,
        repeatCount: 1
      };
    case 'delay':
      return {
        id,
        label: 'Timed Wait',
        actionType: 'delay',
        value: '',
        delayMs: 500,
        repeatCount: 1
      };
  }
}

function formatDurationCompact(ms: number): string {
  if (ms <= 0) return '0 ms';
  if (ms < 1000) return `${ms} ms`;
  const seconds = (ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1);
  return `${seconds} s`;
}

function formatHumanStepSummary(step: MacroStepConfig): {
  title: string;
  detail: string;
} {
  switch (step.actionType) {
    case 'shortcut':
      return {
        title: formatShortcutPretty(step.value) || 'Shortcut',
        detail: 'Keyboard Shortcut'
      };
    case 'text':
      return {
        title: step.value ? `"${step.value}"` : 'Enter text…',
        detail: 'Type Text'
      };
    case 'key':
      return {
        title: step.value ? step.value.toUpperCase() : 'Choose key',
        detail: 'Key Press'
      };
    case 'delay':
      return {
        title: `Wait ${step.delayMs * Math.max(1, step.repeatCount || 1)} ms`,
        detail: 'Timed Wait'
      };
    default: {
      const desc = describeMacroStep(step);
      return {
        title: desc.shortLabel,
        detail: STEP_TYPE_META[step.actionType].label
      };
    }
  }
}

export const MacroEditorView: React.FC<MacroEditorViewProps> = ({
  profiles,
  activeProfileId,
  customMacros,
  keyboardLayout,
  connection,
  activeRepeatJob,
  externalTarget,
  initialTargetSlot = 'b1',
  onSaveMacro,
  onDeleteMacro,
  onAssignSlot,
  onTestBinding,
  onStopRepeat,
  onPullFromUsb,
  onJumpToControl
}) => {
  const [libraryQuery, setLibraryQuery] = useState('');
  const [importDrawerOpen, setImportDrawerOpen] = useState(false);
  const [importProfileId, setImportProfileId] =
    useState<HardwareProfileId>(activeProfileId);

  const [selectedMacroId, setSelectedMacroId] = useState<string | null>(null);
  const [macroName, setMacroName] = useState('Open App via Search');
  const [justSavedFeedback, setJustSavedFeedback] = useState(false);
  const [justAssignedSlot, setJustAssignedSlot] = useState<{
    profile: HardwareProfileId;
    slot: HardwareSlotId;
  } | null>(null);

  // Visual step sequence state
  const [macroSteps, setMacroSteps] = useState<MacroStepConfig[]>(() =>
    STARTER_TEMPLATES[0].steps.map((s, idx) => ({
      ...s,
      id: `init-step-${idx + 1}`
    }))
  );

  // Progressive disclosure: only one step expanded at a time (null = all collapsed)
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);

  // Sequence-level repeat / loop controls
  const [repeatCountInput, setRepeatCountInput] = useState<string>('1');
  const [loopUntilStopped, setLoopUntilStopped] = useState<boolean>(false);
  const [repeatDelayInput, setRepeatDelayInput] = useState<string>('500');

  // Drag-and-drop state
  const [dragArmedStepId, setDragArmedStepId] = useState<string | null>(null);
  const [draggedStepIndex, setDraggedStepIndex] = useState<number | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{
    index: number;
    position: 'before' | 'after';
  } | null>(null);

  // Per-step keyboard shortcut / key recorder
  const [recordingStepId, setRecordingStepId] = useState<string | null>(null);
  const [stepRecorderError, setStepRecorderError] = useState<{
    stepId: string;
    message: string;
  } | null>(null);

  // Target control assignment
  const [targetProfile, setTargetProfile] = useState<HardwareProfileId>(activeProfileId);
  const [targetSlot, setTargetSlot] = useState<HardwareSlotId>(initialTargetSlot);

  useEffect(() => {
    setTargetProfile(activeProfileId);
    setImportProfileId(activeProfileId);
  }, [activeProfileId]);

  useEffect(() => {
    setTargetSlot(initialTargetSlot);
  }, [initialTargetSlot]);

  useEffect(() => {
    if (!justSavedFeedback) return;
    const t = setTimeout(() => setJustSavedFeedback(false), 1800);
    return () => clearTimeout(t);
  }, [justSavedFeedback]);

  useEffect(() => {
    if (!justAssignedSlot) return;
    const t = setTimeout(() => setJustAssignedSlot(null), 3500);
    return () => clearTimeout(t);
  }, [justAssignedSlot]);

  useEffect(() => {
    if (!externalTarget) return;
    setSelectedMacroId(externalTarget.macroId ?? null);
    setRecordingStepId(null);
    setStepRecorderError(null);
    setMacroName(externalTarget.name);

    if (externalTarget.targetProfile) {
      setTargetProfile(externalTarget.targetProfile);
    }
    if (externalTarget.targetSlot) {
      setTargetSlot(externalTarget.targetSlot);
    }

    if (externalTarget.stepsOverride && externalTarget.stepsOverride.length > 0) {
      const hydrated = externalTarget.stepsOverride.map((s, idx) => ({
        ...s,
        id: `ext-${externalTarget.requestId}-${idx}`
      }));
      setMacroSteps(hydrated);
      setExpandedStepId(hydrated.length === 1 ? hydrated[0].id : null);
      setRepeatCountInput('1');
      setLoopUntilStopped(false);
      setRepeatDelayInput('500');
    } else if (externalTarget.action) {
      const convertedSteps = actionToMacroSteps(
        externalTarget.action,
        externalTarget.repeatConfig
      );
      const nextSteps =
        convertedSteps.length > 0 ? convertedSteps : [createDefaultStep('shortcut', 1)];
      setMacroSteps(nextSteps);
      setExpandedStepId(nextSteps.length === 1 ? nextSteps[0].id : null);
      setRepeatCountInput(String(externalTarget.repeatConfig?.repeatCount || 1));
      setLoopUntilStopped(Boolean(externalTarget.repeatConfig?.loopUntilStopped));
      setRepeatDelayInput(String(externalTarget.repeatConfig?.repeatDelayMs || 500));
    } else {
      const first = createDefaultStep('shortcut', 1);
      setMacroSteps([first]);
      setExpandedStepId(first.id);
      setRepeatCountInput('1');
      setLoopUntilStopped(false);
      setRepeatDelayInput('500');
    }
  }, [externalTarget]);

  // Reset drag arming on global mouseup
  useEffect(() => {
    if (!dragArmedStepId) return;
    const handleUp = () => setDragArmedStepId(null);
    window.addEventListener('mouseup', handleUp);
    return () => window.removeEventListener('mouseup', handleUp);
  }, [dragArmedStepId]);

  // Live Keyboard Recorder scoped to the active step being recorded
  useEffect(() => {
    if (!recordingStepId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        setRecordingStepId(null);
        return;
      }

      if (['Meta', 'Control', 'Shift', 'Alt'].includes(e.key)) return;

      const capturedMods: string[] = [];
      if (e.metaKey) capturedMods.push('cmd');
      if (e.ctrlKey) capturedMods.push('ctrl');
      if (e.altKey) capturedMods.push('alt');
      if (e.shiftKey) capturedMods.push('shift');

      const fwKey = normalizeBrowserKeyToFirmware(e.code, e.key, keyboardLayout);
      if (!isSupportedFirmwareKey(fwKey)) {
        setStepRecorderError({
          stepId: recordingStepId,
          message: `Unsupported key "${e.key || e.code}" — use A–Z, 0–9, F1–F24, arrows, or standard punctuation.`
        });
        setRecordingStepId(null);
        return;
      }

      setStepRecorderError(null);
      setMacroSteps(prev =>
        prev.map(s => {
          if (s.id !== recordingStepId) return s;
          if (s.actionType === 'key' && capturedMods.length === 0) {
            return { ...s, value: fwKey };
          }
          return {
            ...s,
            actionType: 'shortcut',
            value: buildFirmwareShortcut(capturedMods, fwKey)
          };
        })
      );
      setRecordingStepId(null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [recordingStepId, keyboardLayout]);

  const loadIntoBuilder = (
    action: string,
    nameLabel: string,
    repeatConfig?: TextMacroRepeatConfig
  ) => {
    setRecordingStepId(null);
    setStepRecorderError(null);
    setMacroName(nameLabel);
    const convertedSteps = actionToMacroSteps(action, repeatConfig);
    const nextSteps =
      convertedSteps.length > 0 ? convertedSteps : [createDefaultStep('shortcut', 1)];
    setMacroSteps(nextSteps);
    setExpandedStepId(nextSteps.length === 1 ? nextSteps[0].id : null);
    setRepeatCountInput(String(repeatConfig?.repeatCount || 1));
    setLoopUntilStopped(Boolean(repeatConfig?.loopUntilStopped));
    setRepeatDelayInput(String(repeatConfig?.repeatDelayMs || 500));
  };

  const applyStarterTemplate = (tpl: StarterTemplate) => {
    setSelectedMacroId(null);
    setRecordingStepId(null);
    setStepRecorderError(null);
    setMacroName(tpl.name);
    const nextSteps = tpl.steps.map((s, idx) => ({
      ...s,
      id: `tpl-${Date.now()}-${idx}`
    }));
    setMacroSteps(nextSteps);
    setExpandedStepId(null);
    setRepeatCountInput('1');
    setLoopUntilStopped(false);
    setRepeatDelayInput('500');
  };

  const handleStartBlankMacro = () => {
    setSelectedMacroId(null);
    setRecordingStepId(null);
    setStepRecorderError(null);
    setMacroName('Untitled Macro');
    const first = { ...createDefaultStep('shortcut', 1), delayMs: 0 };
    setMacroSteps([first]);
    setExpandedStepId(first.id);
    setRepeatCountInput('1');
    setLoopUntilStopped(false);
    setRepeatDelayInput('500');
  };

  const updateStep = (stepId: string, patch: Partial<MacroStepConfig>) => {
    setMacroSteps(prev =>
      prev.map(step => (step.id === stepId ? { ...step, ...patch } : step))
    );
  };

  const changeStepType = (stepId: string, nextType: MacroStepActionType) => {
    const template = createDefaultStep(nextType);
    setRecordingStepId(null);
    setStepRecorderError(null);
    setMacroSteps(prev =>
      prev.map(step =>
        step.id === stepId
          ? {
              ...step,
              actionType: nextType,
              label: template.label,
              value: template.value,
              delayMs: nextType === 'delay' && step.delayMs <= 0 ? 500 : step.delayMs
            }
          : step
      )
    );
  };

  const appendStep = (type: MacroStepActionType) => {
    const nextStep = createDefaultStep(type, macroSteps.length + 1);
    if (type !== 'delay') {
      nextStep.delayMs = 0;
    }
    setMacroSteps(prev => {
      const adjusted = prev.map((s, idx) =>
        idx === prev.length - 1 && s.actionType !== 'delay' && s.delayMs === 0
          ? { ...s, delayMs: 150 }
          : s
      );
      return [...adjusted, nextStep];
    });
    setExpandedStepId(nextStep.id);
  };

  const insertStepAfter = (
    index: number,
    type: MacroStepActionType = 'key',
    valueOverride?: string
  ) => {
    const inserted = createDefaultStep(type, macroSteps.length + 1);
    if (valueOverride !== undefined) {
      inserted.value = valueOverride;
    }
    setMacroSteps(prev => {
      const copy = [...prev];
      if (copy[index] && copy[index].actionType !== 'delay' && copy[index].delayMs === 0) {
        copy[index] = { ...copy[index], delayMs: 120 };
      }
      if (index === copy.length - 1 && type !== 'delay') {
        inserted.delayMs = 0;
      }
      copy.splice(index + 1, 0, inserted);
      return copy;
    });
    if (valueOverride === undefined) {
      setExpandedStepId(inserted.id);
    }
  };

  const duplicateStep = (index: number) => {
    const target = macroSteps[index];
    if (!target) return;
    const clone: MacroStepConfig = {
      ...target,
      id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    };
    setMacroSteps(prev => {
      const copy = [...prev];
      copy.splice(index + 1, 0, clone);
      return copy;
    });
    setExpandedStepId(clone.id);
  };

  const removeStep = (stepId: string) => {
    if (recordingStepId === stepId) setRecordingStepId(null);
    if (expandedStepId === stepId) setExpandedStepId(null);
    setMacroSteps(prev => prev.filter(s => s.id !== stepId));
  };

  const moveStepByOffset = (index: number, delta: -1 | 1) => {
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= macroSteps.length) return;
    setMacroSteps(prev => {
      const copy = [...prev];
      const [moved] = copy.splice(index, 1);
      copy.splice(targetIndex, 0, moved);
      return copy;
    });
  };

  const reorderStepsOnDrop = (
    fromIndex: number,
    targetIndex: number,
    position: 'before' | 'after'
  ) => {
    setMacroSteps(prev => {
      if (fromIndex < 0 || fromIndex >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(fromIndex, 1);
      let insertAt = position === 'after' ? targetIndex + 1 : targetIndex;
      if (fromIndex < insertAt) {
        insertAt -= 1;
      }
      insertAt = Math.max(0, Math.min(copy.length, insertAt));
      copy.splice(insertAt, 0, moved);
      return copy;
    });
  };

  // Sequence validation & timing calculations
  const timingSummary = useMemo(() => calculateStepsTiming(macroSteps), [macroSteps]);

  const stepValidation = useMemo((): {
    message: string;
    stepId: string | null;
  } | null => {
    if (macroSteps.length === 0) {
      return {
        message: 'Add at least one step to build this macro.',
        stepId: null
      };
    }
    const actionable = macroSteps.filter(s => s.actionType !== 'delay');
    if (actionable.length === 0) {
      return {
        message: 'Add at least one action step (a macro cannot only wait).',
        stepId: macroSteps[0]?.id ?? null
      };
    }
    for (let i = 0; i < macroSteps.length; i++) {
      const s = macroSteps[i];
      if (s.actionType === 'delay') continue;
      if (s.actionType === 'text') {
        if (!s.value) {
          return {
            message: `Step ${String(i + 1).padStart(2, '0')}: Enter the text to type.`,
            stepId: s.id
          };
        }
        const check = validateTextMacroInput(s.value, 123);
        if (!check.valid) {
          return {
            message: `Step ${String(i + 1).padStart(2, '0')}: ${check.error}`,
            stepId: s.id
          };
        }
      } else if (!stepToFirmwareAction(s)) {
        return {
          message: `Step ${String(i + 1).padStart(2, '0')}: Finish configuring this step.`,
          stepId: s.id
        };
      }
    }
    return null;
  }, [macroSteps]);

  const parsedRepeatCount = Math.max(
    1,
    Math.min(999, parseInt(repeatCountInput, 10) || 1)
  );
  const parsedRepeatDelay = Math.max(
    10,
    Math.min(300000, parseInt(repeatDelayInput, 10) || 500)
  );

  const builtRepeatConfig: TextMacroRepeatConfig = useMemo(() => {
    let legacyText = '';
    let legacyFollowUp = '';
    let legacyKeyDelay = 0;
    if (macroSteps.length === 1 && macroSteps[0].actionType === 'text') {
      legacyText = macroSteps[0].value;
    } else if (
      macroSteps.length === 2 &&
      macroSteps[0].actionType === 'text' &&
      macroSteps[1].actionType === 'key'
    ) {
      legacyText = macroSteps[0].value;
      legacyFollowUp = macroSteps[1].value;
      legacyKeyDelay = macroSteps[0].delayMs;
    }

    return {
      text: legacyText,
      followUpKey: legacyFollowUp,
      keyDelayMs: legacyKeyDelay,
      repeatCount: parsedRepeatCount,
      loopUntilStopped,
      repeatDelayMs: parsedRepeatDelay,
      steps: macroSteps
    };
  }, [macroSteps, parsedRepeatCount, loopUntilStopped, parsedRepeatDelay]);

  const isSingleNativeStep =
    macroSteps.length === 1 &&
    macroSteps[0].actionType !== 'delay' &&
    (macroSteps[0].repeatCount || 1) <= 1 &&
    !loopUntilStopped &&
    parsedRepeatCount <= 1;

  const effectiveRepeatConfig: TextMacroRepeatConfig | undefined = isSingleNativeStep
    ? undefined
    : builtRepeatConfig;

  const builtAction = useMemo(() => {
    if (stepValidation) return '';
    if (isSingleNativeStep) {
      return stepToFirmwareAction(macroSteps[0]);
    }
    return buildFirmwareActionFromTextConfig(builtRepeatConfig);
  }, [stepValidation, isSingleNativeStep, macroSteps, builtRepeatConfig]);

  const isSequenceValid = !stepValidation && isValidFirmwareAction(builtAction);
  const builtBinding = useMemo(
    () => firmwareActionToBinding(builtAction, effectiveRepeatConfig),
    [builtAction, effectiveRepeatConfig]
  );

  const needsLiveRunner = requiresUsbSequenceExecution(effectiveRepeatConfig);
  const testAvail = getActionTestAvailability(builtAction, connection);
  const isSimulating = Boolean(activeRepeatJob?.id.startsWith('sim-'));
  const isJobRunning = Boolean(activeRepeatJob);

  const handlePreviewSimulation = () => {
    if (!isSequenceValid) return;
    repeatMacroRunner.simulateInUi(builtRepeatConfig).catch(() => {});
  };

  const handleSaveMacroItem = () => {
    if (!isSequenceValid) return;
    const desc = describeFirmwareAction(builtAction, effectiveRepeatConfig);
    const item: CustomMacroItem = {
      id: selectedMacroId || `macro-${Date.now()}`,
      name: macroName.trim() || desc.shortLabel,
      action: builtAction,
      repeatConfig: effectiveRepeatConfig,
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      source: 'user'
    };
    onSaveMacro(item);
    setSelectedMacroId(item.id);
    setJustSavedFeedback(true);
  };

  const handleAssignToControl = () => {
    if (!isSequenceValid) return;
    handleSaveMacroItem();
    onAssignSlot(targetProfile, targetSlot, builtBinding);
    setJustAssignedSlot({ profile: targetProfile, slot: targetSlot });
  };

  // Categorized static catalog options
  const mediaCatalog = useMemo(
    () => FIRMWARE_STATIC_CATALOG.filter(item => item.category === 'media'),
    []
  );
  const osCatalog = useMemo(
    () =>
      FIRMWARE_STATIC_CATALOG.filter(
        item => item.category === 'mac_macro' || item.category === 'win_macro'
      ),
    []
  );
  const bleCatalog = useMemo(
    () => FIRMWARE_STATIC_CATALOG.filter(item => item.category === 'ble'),
    []
  );
  const tvCatalog = useMemo(
    () =>
      FIRMWARE_STATIC_CATALOG.filter(
        item => item.category === 'tv' || item.category === 'tv_app'
      ),
    []
  );

  // Filtered library items
  const normalizedQuery = libraryQuery.trim().toLowerCase();
  const filteredSavedMacros = useMemo(() => {
    if (!normalizedQuery) return customMacros;
    return customMacros.filter(m => m.name.toLowerCase().includes(normalizedQuery));
  }, [customMacros, normalizedQuery]);

  const filteredTemplates = useMemo(() => {
    if (!normalizedQuery) return STARTER_TEMPLATES;
    return STARTER_TEMPLATES.filter(
      tpl =>
        tpl.name.toLowerCase().includes(normalizedQuery) ||
        tpl.steps.some(s => s.label.toLowerCase().includes(normalizedQuery))
    );
  }, [normalizedQuery]);

  const activeTargetProfileObj =
    profiles.find(p => p.id === targetProfile) || profiles[0];
  const targetProfileSlots = useMemo(
    () => extractProfileSlots(activeTargetProfileObj),
    [activeTargetProfileObj]
  );

  const importProfileObj =
    profiles.find(p => p.id === importProfileId) || profiles[0];
  const importProfileSlots = useMemo(
    () => extractProfileSlots(importProfileObj),
    [importProfileObj]
  );

  const currentSlotAction = targetProfileSlots[targetSlot];
  const currentSlotBinding = getBindingForProfileSlot(
    profiles,
    targetProfile,
    targetSlot
  );
  const currentSlotDesc = currentSlotAction
    ? describeFirmwareAction(currentSlotAction, currentSlotBinding?.repeatConfig)
        .shortLabel
    : 'Unassigned';

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden min-w-0 bg-[var(--bg-canvas)]">
      {/* Left Library Rail: Clean Browse, Search & Load */}
      <aside className="w-full lg:w-72 xl:w-80 shrink-0 bg-[var(--bg-panel)] border-b lg:border-b-0 lg:border-r border-[var(--border-subtle)] flex flex-col lg:overflow-hidden">
        <div className="p-4 border-b border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Macro Library
            </h2>
            <button
              type="button"
              onClick={handleStartBlankMacro}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-xs font-medium text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>New</span>
            </button>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={libraryQuery}
              onChange={e => setLibraryQuery(e.target.value)}
              placeholder="Filter saved or templates…"
              className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
            />
            {libraryQuery && (
              <button
                type="button"
                onClick={() => setLibraryQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 lg:overflow-y-auto p-4 space-y-6">
          {/* Saved Macros */}
          <section className="space-y-2">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span className="font-medium text-[var(--text-secondary)]">Saved</span>
              <span className="font-mono tabular-nums">{filteredSavedMacros.length}</span>
            </div>

            {customMacros.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] leading-relaxed py-1">
                Macros you save or assign appear here for reuse across profiles.
              </p>
            ) : filteredSavedMacros.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] py-1">
                No saved macros match "{libraryQuery}".
              </p>
            ) : (
              <div className="space-y-1">
                {filteredSavedMacros.map(m => {
                  const stepsForMacro = actionToMacroSteps(m.action, m.repeatConfig);
                  const { totalDelayMs } = calculateStepsTiming(stepsForMacro);
                  const isSelected = selectedMacroId === m.id;
                  return (
                    <div
                      key={m.id}
                      className={`group px-2.5 py-2 rounded-lg border flex items-center justify-between gap-2 transition-colors ${
                        isSelected
                          ? 'border-[var(--accent)] bg-[rgba(var(--accent-rgb),0.10)]'
                          : 'bg-transparent border-transparent hover:bg-[var(--bg-input)] hover:border-[var(--border-subtle)]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedMacroId(m.id);
                          loadIntoBuilder(m.action, m.name, m.repeatConfig);
                        }}
                        className="min-w-0 flex-1 text-left cursor-pointer"
                      >
                        <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                          {m.name}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] font-mono tabular-nums mt-0.5 truncate">
                          <span>
                            {stepsForMacro.length}{' '}
                            {stepsForMacro.length === 1 ? 'step' : 'steps'}
                          </span>
                          {totalDelayMs > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{formatDurationCompact(totalDelayMs)}</span>
                            </>
                          )}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteMacro(m.id);
                          if (selectedMacroId === m.id) setSelectedMacroId(null);
                        }}
                        className="p-1 rounded-md text-[var(--text-muted)] opacity-60 group-hover:opacity-100 hover:text-rose-400 hover:bg-[var(--bg-elevated)] transition-all cursor-pointer shrink-0"
                        title="Delete saved macro"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Starter Templates */}
          <section className="pt-4 border-t border-[var(--border-subtle)] space-y-2">
            <div className="text-xs font-medium text-[var(--text-secondary)]">
              Starter Recipes
            </div>
            {filteredTemplates.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] py-1">
                No starter recipes match "{libraryQuery}".
              </p>
            ) : (
              <div className="space-y-1">
                {filteredTemplates.map(tpl => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyStarterTemplate(tpl)}
                    className="w-full text-left px-2.5 py-2 rounded-lg border border-transparent hover:bg-[var(--bg-input)] hover:border-[var(--border-subtle)] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                        {tpl.name}
                      </span>
                      <span className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums shrink-0">
                        {tpl.steps.length} steps
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                      {tpl.steps.map(s => s.label).join(' → ')}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Collapsible Import from Existing Pad Key */}
          <section className="pt-4 border-t border-[var(--border-subtle)] space-y-2.5">
            <button
              type="button"
              onClick={() => setImportDrawerOpen(prev => !prev)}
              className="w-full flex items-center justify-between text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <span>Load from Pad Key</span>
              {importDrawerOpen ? (
                <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              )}
            </button>

            {importDrawerOpen && (
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between gap-1.5">
                  <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] flex-1">
                    {profiles.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setImportProfileId(p.id)}
                        className={`py-1 px-2 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          importProfileId === p.id
                            ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                        }`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                  {connection.connected && (
                    <button
                      type="button"
                      onClick={onPullFromUsb}
                      title="Refresh controls from connected pad"
                      className="p-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer shrink-0"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="space-y-0.5">
                  {HARDWARE_SLOTS.map(slot => {
                    const act = importProfileSlots[slot];
                    const slotBind = getBindingForProfileSlot(
                      profiles,
                      importProfileId,
                      slot
                    );
                    const desc = describeFirmwareAction(act, slotBind?.repeatConfig);
                    return (
                      <button
                        key={`${importProfileId}-${slot}`}
                        type="button"
                        disabled={!act}
                        onClick={() => {
                          if (!act) return;
                          setSelectedMacroId(null);
                          setTargetProfile(importProfileId);
                          setTargetSlot(slot);
                          loadIntoBuilder(
                            act,
                            `${SLOT_LABELS[slot].short} · ${desc.shortLabel}`,
                            slotBind?.repeatConfig
                          );
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-[var(--bg-input)] disabled:opacity-40 disabled:pointer-events-none flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer"
                      >
                        <span className="font-mono text-[11px] text-[var(--text-muted)] shrink-0">
                          {SLOT_LABELS[slot].short}
                        </span>
                        <span className="text-[var(--text-secondary)] truncate">
                          {act ? desc.shortLabel : 'Empty'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </div>
      </aside>

      {/* Main Studio Canvas: Minimal, Focused Step Sequence Builder */}
      <main className="flex-1 lg:overflow-y-auto px-4 py-5 sm:px-8 sm:py-7 min-w-0">
        <div className="max-w-2xl mx-auto space-y-7">
          {/* Top Context & Document Header */}
          <header className="space-y-3 pb-5 border-b border-[var(--border-subtle)]">
            {onJumpToControl && (
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onJumpToControl(targetProfile, targetSlot)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Pad</span>
                </button>

                <span className="text-xs text-[var(--text-muted)] font-mono tabular-nums truncate">
                  Target: {activeTargetProfileObj.name} · {SLOT_LABELS[targetSlot].short}
                </span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex-1 min-w-0 space-y-1">
                <input
                  id="macro-sequence-name"
                  type="text"
                  maxLength={36}
                  aria-label="Macro name"
                  value={macroName}
                  onChange={e => setMacroName(e.target.value)}
                  placeholder="Untitled Macro"
                  className="w-full bg-transparent text-lg sm:text-xl font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border-b border-transparent hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:outline-none py-0.5 transition-colors"
                />

                {/* Quiet Unboxed Inline Summary (Zero Pills) */}
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] font-mono tabular-nums flex-wrap">
                  <span>
                    {macroSteps.length} {macroSteps.length === 1 ? 'step' : 'steps'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{formatDurationCompact(timingSummary.totalDelayMs)} wait</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {loopUntilStopped
                      ? `Loops every ${formatDurationCompact(parsedRepeatDelay)}`
                      : parsedRepeatCount > 1
                      ? `Repeats ${parsedRepeatCount}×`
                      : 'Runs once'}
                  </span>
                </div>
              </div>

              {/* Clean 3-Action Toolbar */}
              <div className="flex items-center gap-2 shrink-0">
                {isJobRunning ? (
                  <button
                    type="button"
                    onClick={onStopRepeat}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/40 hover:bg-rose-500/25 text-xs font-semibold text-rose-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>
                      Stop{isSimulating ? '' : ` (${activeRepeatJob?.currentIteration})`}
                    </span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={!isSequenceValid}
                      onClick={handlePreviewSimulation}
                      title="Animate each step in order to verify flow and timing"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Eye className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                      <span>Preview</span>
                    </button>

                    <button
                      type="button"
                      disabled={!isSequenceValid || !testAvail.canTest}
                      onClick={() => onTestBinding(builtBinding)}
                      title={testAvail.reason || 'Run live on connected MacroPad'}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-xs font-medium text-[var(--text-primary)] disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Play className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Test</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  disabled={!isSequenceValid}
                  onClick={handleSaveMacroItem}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  {justSavedFeedback ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Saved</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                      <span>Save</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {stepValidation && (
              <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-xs text-amber-300">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="truncate">{stepValidation.message}</span>
                </div>
                {stepValidation.stepId && expandedStepId !== stepValidation.stepId && (
                  <button
                    type="button"
                    onClick={() => setExpandedStepId(stepValidation.stepId)}
                    className="font-semibold text-amber-200 hover:underline cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Edit step
                  </button>
                )}
              </div>
            )}
          </header>

          {/* Step Sequence Section (Progressive Disclosure Accordion) */}
          <section className="space-y-3" aria-label="Macro steps">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[var(--text-secondary)]">
                Steps
              </span>
              {expandedStepId && macroSteps.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setExpandedStepId(null)}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap"
                >
                  Collapse step
                </button>
              ) : (
                <span className="text-[var(--text-muted)]">
                  Click any step to edit · drag to reorder
                </span>
              )}
            </div>

            {macroSteps.length === 0 ? (
              <div className="py-10 px-6 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-center space-y-3">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  No steps yet
                </p>
                <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto">
                  Start with a shortcut, typed text, or key press below to build a custom action sequence.
                </p>
              </div>
            ) : (
              <div className="space-y-2" role="list">
                {macroSteps.map((step, idx) => {
                  const isLastStep = idx === macroSteps.length - 1;
                  const isExpanded = expandedStepId === step.id;
                  const StepIcon = STEP_TYPE_META[step.actionType].icon;
                  const human = formatHumanStepSummary(step);

                  const isExecutingAction =
                    isJobRunning &&
                    activeRepeatJob?.activeStepIndex === idx &&
                    activeRepeatJob?.activeStepPhase === 'action';

                  const isExecutingDelay =
                    isJobRunning &&
                    activeRepeatJob?.activeStepIndex === idx &&
                    activeRepeatJob?.activeStepPhase === 'delay';

                  const isStepActive = isExecutingAction || isExecutingDelay;
                  const isDragged = draggedStepIndex === idx;

                  const showDropBefore =
                    dropIndicator?.index === idx &&
                    dropIndicator.position === 'before' &&
                    draggedStepIndex !== idx;
                  const showDropAfter =
                    dropIndicator?.index === idx &&
                    dropIndicator.position === 'after' &&
                    draggedStepIndex !== idx;

                  const parsedShortcut =
                    step.actionType === 'shortcut'
                      ? parseFirmwareShortcut(step.value)
                      : { mods: ['cmd'], key: 'c' };

                  const textCheck =
                    step.actionType === 'text'
                      ? validateTextMacroInput(step.value, 123)
                      : { valid: true, error: null };

                  const isCustomTvKey = step.value.startsWith('TVKEY:');
                  const isCustomTvApp = step.value.startsWith('TVAPP:');
                  const tvKeyParts = isCustomTvKey
                    ? step.value.split(':')
                    : ['TVKEY', '5', '1'];
                  const tvAppParts = isCustomTvApp
                    ? step.value.split(':')
                    : ['TVAPP', '1', '4', ''];

                  const nextStepIsEnter =
                    macroSteps[idx + 1]?.actionType === 'key' &&
                    macroSteps[idx + 1]?.value === 'enter';

                  return (
                    <div
                      key={step.id}
                      id={`macro-step-node-${step.id}`}
                      role="listitem"
                      draggable={dragArmedStepId === step.id}
                      onDragStart={e => {
                        setDraggedStepIndex(idx);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', String(idx));
                      }}
                      onDragOver={e => {
                        e.preventDefault();
                        if (draggedStepIndex === null) return;
                        e.dataTransfer.dropEffect = 'move';
                        const rect = e.currentTarget.getBoundingClientRect();
                        const midpoint = rect.top + rect.height / 2;
                        const position: 'before' | 'after' =
                          e.clientY < midpoint ? 'before' : 'after';
                        if (
                          !dropIndicator ||
                          dropIndicator.index !== idx ||
                          dropIndicator.position !== position
                        ) {
                          setDropIndicator({ index: idx, position });
                        }
                      }}
                      onDragLeave={e => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          setDropIndicator(prev => (prev?.index === idx ? null : prev));
                        }
                      }}
                      onDrop={e => {
                        e.preventDefault();
                        const from =
                          draggedStepIndex !== null
                            ? draggedStepIndex
                            : parseInt(e.dataTransfer.getData('text/plain'), 10);
                        if (!Number.isNaN(from) && dropIndicator) {
                          reorderStepsOnDrop(from, idx, dropIndicator.position);
                        } else if (!Number.isNaN(from) && from !== idx) {
                          reorderStepsOnDrop(from, idx, 'before');
                        }
                        setDraggedStepIndex(null);
                        setDropIndicator(null);
                        setDragArmedStepId(null);
                      }}
                      onDragEnd={() => {
                        setDraggedStepIndex(null);
                        setDropIndicator(null);
                        setDragArmedStepId(null);
                      }}
                    >
                      {showDropBefore && (
                        <div className="h-0.5 w-full rounded-full mb-1.5 bg-[var(--accent)]" />
                      )}

                      {!isExpanded ? (
                        /* COLLAPSED STEP ROW: Scannable, Calm, Single-Line */
                        <div
                          onClick={() => setExpandedStepId(step.id)}
                          className={`group px-3.5 py-3 rounded-xl bg-[var(--bg-panel)] border flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                            isStepActive
                              ? 'border-[var(--accent)] bg-[rgba(var(--accent-rgb),0.10)]'
                              : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                          } ${isDragged ? 'opacity-45 border-dashed' : ''}`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              onMouseDown={e => {
                                e.stopPropagation();
                                setDragArmedStepId(step.id);
                              }}
                              onClick={e => e.stopPropagation()}
                              className="p-0.5 -ml-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-grab active:cursor-grabbing shrink-0"
                              title="Drag to reorder"
                            >
                              <GripVertical className="w-4 h-4" />
                            </div>

                            <span className="font-mono text-xs text-[var(--text-muted)] tabular-nums w-5 shrink-0">
                              {String(idx + 1).padStart(2, '0')}
                            </span>

                            <StepIcon className="w-4 h-4 text-[var(--accent)] shrink-0" />

                            <div className="flex items-baseline gap-2 min-w-0">
                              <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                                {human.title}
                              </span>
                              <span className="text-xs text-[var(--text-muted)] truncate hidden sm:inline">
                                {human.detail}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            {/* Inline Execution / Timing Summary */}
                            <div className="font-mono text-xs tabular-nums text-[var(--text-muted)] flex items-center gap-1.5">
                              {isExecutingAction ? (
                                <span className="text-[var(--accent)] font-semibold">
                                  Running…
                                </span>
                              ) : isExecutingDelay ? (
                                <span className="text-[var(--accent)] font-semibold">
                                  Wait {step.delayMs} ms…
                                </span>
                              ) : (
                                <>
                                  {step.actionType !== 'delay' && step.repeatCount > 1 && (
                                    <span>{step.repeatCount}×</span>
                                  )}
                                  {!isLastStep &&
                                    step.actionType !== 'delay' &&
                                    step.delayMs > 0 && (
                                      <span>+{step.delayMs} ms</span>
                                    )}
                                </>
                              )}
                            </div>

                            {/* Quick Hover Reorder & Delete */}
                            <div
                              onClick={e => e.stopPropagation()}
                              className="hidden sm:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                            >
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => moveStepByOffset(idx, -1)}
                                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] disabled:opacity-25 disabled:pointer-events-none cursor-pointer"
                                title="Move up"
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={isLastStep}
                                onClick={() => moveStepByOffset(idx, 1)}
                                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] disabled:opacity-25 disabled:pointer-events-none cursor-pointer"
                                title="Move down"
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeStep(step.id)}
                                className="p-1 rounded text-[var(--text-muted)] hover:text-rose-400 hover:bg-[var(--bg-input)] cursor-pointer"
                                title="Delete step"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <ChevronRight className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                          </div>
                        </div>
                      ) : (
                        /* EXPANDED ACTIVE STEP EDITOR: Focused, Calm, Zero Clutter */
                        <div
                          className={`p-4 sm:p-5 rounded-xl bg-[var(--bg-panel)] border space-y-4 ${
                            isStepActive
                              ? 'border-[var(--accent)]'
                              : 'border-[var(--border-strong)]'
                          } ${isDragged ? 'opacity-45 border-dashed' : ''}`}
                        >
                          {/* Expanded Top Header */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                onMouseDown={() => setDragArmedStepId(step.id)}
                                className="p-0.5 -ml-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-grab active:cursor-grabbing shrink-0"
                                title="Drag to reorder"
                              >
                                <GripVertical className="w-4 h-4" />
                              </div>
                              <span className="font-mono text-xs font-semibold text-[var(--accent)] tabular-nums">
                                Step {String(idx + 1).padStart(2, '0')}
                              </span>
                              <span className="text-xs text-[var(--text-muted)] truncate">
                                · {human.title}
                              </span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => moveStepByOffset(idx, -1)}
                                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                                title="Move step up"
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={isLastStep}
                                onClick={() => moveStepByOffset(idx, 1)}
                                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                                title="Move step down"
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => duplicateStep(idx)}
                                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] cursor-pointer"
                                title="Duplicate step"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeStep(step.id)}
                                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-rose-400 hover:bg-[var(--bg-input)] cursor-pointer"
                                title="Delete step"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRecordingStepId(null);
                                  setExpandedStepId(null);
                                }}
                                className="ml-1 px-2.5 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0"
                              >
                                Done
                              </button>
                            </div>
                          </div>

                          {/* Clean Horizontal Action Type Selector */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {STEP_TYPE_ORDER.map(typeKey => {
                              const meta = STEP_TYPE_META[typeKey];
                              const Icon = meta.icon;
                              const isTypeSelected = step.actionType === typeKey;
                              return (
                                <button
                                  key={typeKey}
                                  type="button"
                                  onClick={() => changeStepType(step.id, typeKey)}
                                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                                    isTypeSelected
                                      ? 'border-[var(--accent)] bg-[rgba(var(--accent-rgb),0.14)] text-[var(--text-primary)]'
                                      : 'bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                                  }`}
                                >
                                  <Icon className="w-3.5 h-3.5" />
                                  <span>{meta.shortLabel}</span>
                                </button>
                              );
                            })}
                          </div>

                          {/* Focused Configuration Body for Active Type */}
                          {step.actionType === 'shortcut' && (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] flex-wrap">
                                <div className="space-y-0.5">
                                  <div className="text-[11px] text-[var(--text-muted)]">
                                    Current shortcut
                                  </div>
                                  <div className="font-mono text-sm font-semibold text-[var(--text-primary)]">
                                    {formatShortcutPretty(step.value)}
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setStepRecorderError(null);
                                    setRecordingStepId(prev =>
                                      prev === step.id ? null : step.id
                                    );
                                  }}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                                    recordingStepId === step.id
                                      ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                                      : 'bg-[var(--bg-panel)] border-[var(--border-strong)] hover:border-[var(--accent)] text-[var(--text-primary)]'
                                  }`}
                                >
                                  <Radio className="w-3.5 h-3.5" />
                                  <span>
                                    {recordingStepId === step.id
                                      ? 'Press keys now (Esc to cancel)…'
                                      : 'Record Keystroke'}
                                  </span>
                                </button>
                              </div>

                              <div className="flex items-center gap-1.5 flex-wrap">
                                {MOD_LIST.map(m => {
                                  const isModActive = parsedShortcut.mods.includes(m.id);
                                  return (
                                    <button
                                      key={m.id}
                                      type="button"
                                      onClick={() => {
                                        const nextMods = isModActive
                                          ? parsedShortcut.mods.filter(x => x !== m.id)
                                          : [...parsedShortcut.mods, m.id];
                                        updateStep(step.id, {
                                          value: buildFirmwareShortcut(
                                            nextMods,
                                            parsedShortcut.key
                                          )
                                        });
                                      }}
                                      className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-colors cursor-pointer whitespace-nowrap ${
                                        isModActive
                                          ? 'border-[var(--accent)] bg-[rgba(var(--accent-rgb),0.14)] text-[var(--text-primary)] font-semibold'
                                          : 'bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                                      }`}
                                    >
                                      {m.label}
                                    </button>
                                  );
                                })}

                                <span className="text-xs text-[var(--text-muted)] px-1">+</span>

                                <select
                                  aria-label="Shortcut key"
                                  value={parsedShortcut.key}
                                  onChange={e =>
                                    updateStep(step.id, {
                                      value: buildFirmwareShortcut(
                                        parsedShortcut.mods,
                                        e.target.value
                                      )
                                    })
                                  }
                                  className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
                                >
                                  {FIRMWARE_SUPPORTED_KEYS.map(k => (
                                    <option key={k} value={k}>
                                      {k.toUpperCase()}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {stepRecorderError?.stepId === step.id && (
                                <p className="text-xs text-rose-400">
                                  {stepRecorderError.message}
                                </p>
                              )}
                            </div>
                          )}

                          {step.actionType === 'text' && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-[var(--text-secondary)]">
                                  Text to type
                                </span>
                                <span
                                  className={`font-mono tabular-nums ${
                                    !textCheck.valid
                                      ? 'text-rose-400 font-semibold'
                                      : 'text-[var(--text-muted)]'
                                  }`}
                                >
                                  {step.value.length}/123
                                </span>
                              </div>
                              <input
                                type="text"
                                maxLength={123}
                                value={step.value}
                                onChange={e => updateStep(step.id, { value: e.target.value })}
                                placeholder="e.g. git status"
                                className={`w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border text-xs font-mono text-[var(--text-primary)] focus:outline-none ${
                                  !textCheck.valid
                                    ? 'border-rose-500'
                                    : 'border-[var(--border-subtle)] focus:border-[var(--accent)]'
                                }`}
                              />
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                {!textCheck.valid && textCheck.error ? (
                                  <p className="text-xs text-rose-400">{textCheck.error}</p>
                                ) : (
                                  <span className="text-[11px] text-[var(--text-muted)]">
                                    Types characters in order on your computer.
                                  </span>
                                )}

                                {!nextStepIsEnter && (
                                  <button
                                    type="button"
                                    onClick={() => insertStepAfter(idx, 'key', 'enter')}
                                    className="text-xs font-medium text-[var(--accent)] hover:underline cursor-pointer whitespace-nowrap shrink-0"
                                  >
                                    + Add Enter key after
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {step.actionType === 'key' && (
                            <div className="space-y-2.5">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {(
                                    [
                                      'enter',
                                      'tab',
                                      'space',
                                      'esc',
                                      'backspace',
                                      'up',
                                      'down'
                                    ] as const
                                  ).map(quickKey => {
                                    const active = step.value === quickKey;
                                    return (
                                      <button
                                        key={quickKey}
                                        type="button"
                                        onClick={() => updateStep(step.id, { value: quickKey })}
                                        className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono uppercase cursor-pointer whitespace-nowrap ${
                                          active
                                            ? 'border-[var(--accent)] bg-[rgba(var(--accent-rgb),0.14)] text-[var(--text-primary)] font-semibold'
                                            : 'bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                                        }`}
                                      >
                                        {quickKey}
                                      </button>
                                    );
                                  })}
                                </div>

                                <div className="flex items-center gap-2">
                                  <select
                                    aria-label="Single key"
                                    value={step.value}
                                    onChange={e => updateStep(step.id, { value: e.target.value })}
                                    className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
                                  >
                                    {FIRMWARE_SUPPORTED_KEYS.map(k => (
                                      <option key={k} value={k}>
                                        Key: {k.toUpperCase()}
                                      </option>
                                    ))}
                                  </select>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setStepRecorderError(null);
                                      setRecordingStepId(prev =>
                                        prev === step.id ? null : step.id
                                      );
                                    }}
                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-pointer whitespace-nowrap ${
                                      recordingStepId === step.id
                                        ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                                        : 'bg-[var(--bg-input)] border-[var(--border-subtle)] hover:border-[var(--accent)] text-[var(--text-primary)]'
                                    }`}
                                  >
                                    <Radio className="w-3.5 h-3.5" />
                                    <span>
                                      {recordingStepId === step.id ? 'Press key…' : 'Record'}
                                    </span>
                                  </button>
                                </div>
                              </div>

                              {stepRecorderError?.stepId === step.id && (
                                <p className="text-xs text-rose-400">
                                  {stepRecorderError.message}
                                </p>
                              )}
                            </div>
                          )}

                          {step.actionType === 'media' && (
                            <div>
                              <select
                                aria-label="Media or function key"
                                value={step.value}
                                onChange={e => updateStep(step.id, { value: e.target.value })}
                                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
                              >
                                {mediaCatalog.map(item => (
                                  <option key={item.action} value={item.action}>
                                    {item.label} — {item.description}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {step.actionType === 'os_action' && (
                            <div>
                              <select
                                aria-label="System action"
                                value={step.value}
                                onChange={e => updateStep(step.id, { value: e.target.value })}
                                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
                              >
                                <optgroup label="macOS">
                                  {osCatalog
                                    .filter(i => i.category === 'mac_macro')
                                    .map(item => (
                                      <option key={item.action} value={item.action}>
                                        {item.label}
                                      </option>
                                    ))}
                                </optgroup>
                                <optgroup label="Windows">
                                  {osCatalog
                                    .filter(i => i.category === 'win_macro')
                                    .map(item => (
                                      <option key={item.action} value={item.action}>
                                        {item.label}
                                      </option>
                                    ))}
                                </optgroup>
                              </select>
                            </div>
                          )}

                          {step.actionType === 'ble' && (
                            <div className="space-y-2">
                              <select
                                aria-label="Bluetooth host switch action"
                                value={step.value}
                                onChange={e => updateStep(step.id, { value: e.target.value })}
                                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
                              >
                                {bleCatalog.map(item => (
                                  <option key={item.action} value={item.action}>
                                    {item.label} — {item.description}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {step.actionType === 'tv' && (
                            <div className="space-y-2.5">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="text-xs text-[var(--text-secondary)]">
                                  Smart TV command
                                </span>
                                <div className="flex items-center gap-1">
                                  {[
                                    {
                                      id: 'preset',
                                      label: 'Standard',
                                      active: !isCustomTvKey && !isCustomTvApp
                                    },
                                    {
                                      id: 'tvkey',
                                      label: 'Remote Code',
                                      active: isCustomTvKey
                                    },
                                    {
                                      id: 'tvapp',
                                      label: 'Custom App',
                                      active: isCustomTvApp
                                    }
                                  ].map(modeBtn => (
                                    <button
                                      key={modeBtn.id}
                                      type="button"
                                      onClick={() => {
                                        if (modeBtn.id === 'preset') {
                                          updateStep(step.id, { value: 'TV:MUTE' });
                                        } else if (modeBtn.id === 'tvkey') {
                                          updateStep(step.id, { value: 'TVKEY:5:1' });
                                        } else {
                                          updateStep(step.id, { value: 'TVAPP:1:4' });
                                        }
                                      }}
                                      className={`px-2 py-1 rounded-md border text-[11px] font-medium cursor-pointer whitespace-nowrap ${
                                        modeBtn.active
                                          ? 'border-[var(--accent)] bg-[rgba(var(--accent-rgb),0.14)] text-[var(--text-primary)]'
                                          : 'bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                                      }`}
                                    >
                                      {modeBtn.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {!isCustomTvKey && !isCustomTvApp && (
                                <select
                                  aria-label="Smart TV action"
                                  value={step.value}
                                  onChange={e => updateStep(step.id, { value: e.target.value })}
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
                                >
                                  <optgroup label="TV Remote">
                                    {tvCatalog
                                      .filter(i => i.category === 'tv')
                                      .map(item => (
                                        <option key={item.action} value={item.action}>
                                          {item.label}
                                        </option>
                                      ))}
                                  </optgroup>
                                  <optgroup label="Streaming Apps">
                                    {tvCatalog
                                      .filter(i => i.category === 'tv_app')
                                      .map(item => (
                                        <option key={item.action} value={item.action}>
                                          Launch {item.label}
                                        </option>
                                      ))}
                                  </optgroup>
                                </select>
                              )}

                              {isCustomTvKey && (
                                <div className="grid grid-cols-2 gap-2.5">
                                  <label className="space-y-1 text-xs text-[var(--text-secondary)]">
                                    <span>Command Group</span>
                                    <input
                                      type="number"
                                      min={0}
                                      value={tvKeyParts[1] || '5'}
                                      onChange={e => {
                                        const cs = Math.max(
                                          0,
                                          parseInt(e.target.value, 10) || 0
                                        );
                                        const cd = Math.max(
                                          0,
                                          parseInt(tvKeyParts[2] || '1', 10) || 0
                                        );
                                        updateStep(step.id, { value: `TVKEY:${cs}:${cd}` });
                                      }}
                                      className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono tabular-nums text-[var(--text-primary)]"
                                    />
                                  </label>
                                  <label className="space-y-1 text-xs text-[var(--text-secondary)]">
                                    <span>Key Code</span>
                                    <input
                                      type="number"
                                      min={0}
                                      value={tvKeyParts[2] || '1'}
                                      onChange={e => {
                                        const cs = Math.max(
                                          0,
                                          parseInt(tvKeyParts[1] || '5', 10) || 0
                                        );
                                        const cd = Math.max(
                                          0,
                                          parseInt(e.target.value, 10) || 0
                                        );
                                        updateStep(step.id, { value: `TVKEY:${cs}:${cd}` });
                                      }}
                                      className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono tabular-nums text-[var(--text-primary)]"
                                    />
                                  </label>
                                </div>
                              )}

                              {isCustomTvApp && (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                  <label className="space-y-1 text-xs text-[var(--text-secondary)]">
                                    <span>App ID</span>
                                    <input
                                      type="text"
                                      value={tvAppParts[1] || '1'}
                                      onChange={e => {
                                        const cleanId =
                                          sanitizeSerialString(e.target.value.trim(), 32) || '1';
                                        const ns = Math.max(
                                          0,
                                          parseInt(tvAppParts[2] || '4', 10) || 0
                                        );
                                        const url = sanitizeSerialString(
                                          (tvAppParts.slice(3).join(':') || '').trim(),
                                          80
                                        );
                                        updateStep(step.id, {
                                          value: url
                                            ? `TVAPP:${cleanId}:${ns}:${url}`
                                            : `TVAPP:${cleanId}:${ns}`
                                        });
                                      }}
                                      className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)]"
                                    />
                                  </label>
                                  <label className="space-y-1 text-xs text-[var(--text-secondary)]">
                                    <span>Launch Mode</span>
                                    <input
                                      type="number"
                                      min={0}
                                      value={tvAppParts[2] || '4'}
                                      onChange={e => {
                                        const cleanId =
                                          sanitizeSerialString(
                                            (tvAppParts[1] || '1').trim(),
                                            32
                                          ) || '1';
                                        const ns = Math.max(
                                          0,
                                          parseInt(e.target.value, 10) || 0
                                        );
                                        const url = sanitizeSerialString(
                                          (tvAppParts.slice(3).join(':') || '').trim(),
                                          80
                                        );
                                        updateStep(step.id, {
                                          value: url
                                            ? `TVAPP:${cleanId}:${ns}:${url}`
                                            : `TVAPP:${cleanId}:${ns}`
                                        });
                                      }}
                                      className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono tabular-nums text-[var(--text-primary)]"
                                    />
                                  </label>
                                  <label className="space-y-1 text-xs text-[var(--text-secondary)]">
                                    <span>Deep Link (optional)</span>
                                    <input
                                      type="text"
                                      value={tvAppParts.slice(3).join(':') || ''}
                                      onChange={e => {
                                        const cleanId =
                                          sanitizeSerialString(
                                            (tvAppParts[1] || '1').trim(),
                                            32
                                          ) || '1';
                                        const ns = Math.max(
                                          0,
                                          parseInt(tvAppParts[2] || '4', 10) || 0
                                        );
                                        const url = sanitizeSerialString(
                                          e.target.value.trim(),
                                          80
                                        );
                                        updateStep(step.id, {
                                          value: url
                                            ? `TVAPP:${cleanId}:${ns}:${url}`
                                            : `TVAPP:${cleanId}:${ns}`
                                        });
                                      }}
                                      placeholder="Optional path"
                                      className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)]"
                                    />
                                  </label>
                                </div>
                              )}
                            </div>
                          )}

                          {step.actionType === 'delay' && (
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {PAUSE_STEP_PRESETS.map(msVal => {
                                  const active = step.delayMs === msVal;
                                  return (
                                    <button
                                      key={msVal}
                                      type="button"
                                      onClick={() => updateStep(step.id, { delayMs: msVal })}
                                      className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono tabular-nums cursor-pointer whitespace-nowrap ${
                                        active
                                          ? 'border-[var(--accent)] bg-[rgba(var(--accent-rgb),0.14)] text-[var(--text-primary)] font-semibold'
                                          : 'bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                                      }`}
                                    >
                                      {msVal >= 1000 ? `${msVal / 1000} s` : `${msVal} ms`}
                                    </button>
                                  );
                                })}
                              </div>

                              <div className="flex items-center gap-1.5">
                                <input
                                  aria-label="Wait duration in milliseconds"
                                  type="number"
                                  min={10}
                                  max={60000}
                                  step={50}
                                  value={step.delayMs}
                                  onChange={e =>
                                    updateStep(step.id, {
                                      delayMs: Math.max(
                                        0,
                                        Math.min(60000, parseInt(e.target.value, 10) || 0)
                                      )
                                    })
                                  }
                                  className="w-24 px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono tabular-nums text-[var(--text-primary)] text-right focus:outline-none focus:border-[var(--accent)]"
                                />
                                <span className="text-xs font-mono text-[var(--text-muted)]">
                                  ms
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Quiet Hairline Step Timing & Repeat Footer */}
                          {step.actionType !== 'delay' && (
                            <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between gap-3 flex-wrap text-xs">
                              {(!isLastStep || step.repeatCount > 1) ? (
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[var(--text-muted)]">
                                    {isLastStep ? 'Interval:' : 'Wait after:'}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    {QUICK_DELAY_PRESETS.map(presetMs => (
                                      <button
                                        key={presetMs}
                                        type="button"
                                        onClick={() =>
                                          updateStep(step.id, { delayMs: presetMs })
                                        }
                                        className={`px-2 py-0.5 rounded text-[11px] font-mono tabular-nums transition-colors cursor-pointer ${
                                          step.delayMs === presetMs
                                            ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-semibold border border-[var(--border-strong)]'
                                            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                                        }`}
                                      >
                                        {presetMs}
                                      </button>
                                    ))}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <input
                                      aria-label="Wait after step in milliseconds"
                                      type="number"
                                      min={0}
                                      max={60000}
                                      step={50}
                                      value={step.delayMs}
                                      onChange={e =>
                                        updateStep(step.id, {
                                          delayMs: Math.max(
                                            0,
                                            Math.min(60000, parseInt(e.target.value, 10) || 0)
                                          )
                                        })
                                      }
                                      className="w-16 px-2 py-0.5 rounded bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono tabular-nums text-[var(--text-primary)] text-right focus:outline-none focus:border-[var(--accent)]"
                                    />
                                    <span className="font-mono text-[11px] text-[var(--text-muted)]">
                                      ms
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-[var(--text-muted)]">
                                  Final step in sequence
                                </span>
                              )}

                              <label className="flex items-center gap-1.5 text-[var(--text-muted)]">
                                <span>Repeat step</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={99}
                                  value={step.repeatCount}
                                  onChange={e =>
                                    updateStep(step.id, {
                                      repeatCount: Math.max(
                                        1,
                                        Math.min(99, parseInt(e.target.value, 10) || 1)
                                      )
                                    })
                                  }
                                  className="w-12 px-1.5 py-0.5 rounded bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono tabular-nums text-[var(--text-primary)] text-center focus:outline-none focus:border-[var(--accent)]"
                                />
                                <span className="font-mono">×</span>
                              </label>
                            </div>
                          )}
                        </div>
                      )}

                      {showDropAfter && (
                        <div className="h-0.5 w-full rounded-full mt-1.5 bg-[var(--accent)]" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Calm "+ Add Step" Strip */}
            <div className="pt-1 flex items-center gap-1.5 flex-wrap">
              {STEP_TYPE_ORDER.map(type => {
                const meta = STEP_TYPE_META[type];
                const Icon = meta.icon;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => appendStep(type)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3 h-3 text-[var(--accent)]" />
                    <Icon className="w-3.5 h-3.5" />
                    <span>{meta.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Playback & Visual MacroPad Destination */}
          <section className="p-5 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-5">
            {/* Minimal Playback Selector */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  When Triggered
                </span>

                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)]">
                  <button
                    type="button"
                    onClick={() => {
                      setLoopUntilStopped(false);
                      setRepeatCountInput('1');
                    }}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      !loopUntilStopped && parsedRepeatCount === 1
                        ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    Run Once
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLoopUntilStopped(false);
                      if (parsedRepeatCount <= 1) setRepeatCountInput('3');
                    }}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      !loopUntilStopped && parsedRepeatCount > 1
                        ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    Repeat
                  </button>
                  <button
                    type="button"
                    onClick={() => setLoopUntilStopped(true)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      loopUntilStopped
                        ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    Loop
                  </button>
                </div>
              </div>

              {(loopUntilStopped || parsedRepeatCount > 1) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {!loopUntilStopped ? (
                    <label className="space-y-1 text-xs text-[var(--text-secondary)]">
                      <span>Repeat count</span>
                      <input
                        type="number"
                        min={2}
                        max={999}
                        value={repeatCountInput}
                        onChange={e => setRepeatCountInput(e.target.value)}
                        onBlur={() =>
                          setRepeatCountInput(
                            String(
                              Math.max(2, Math.min(999, parseInt(repeatCountInput, 10) || 2))
                            )
                          )
                        }
                        className="w-full px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono tabular-nums text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                      />
                    </label>
                  ) : (
                    <div className="space-y-1 text-xs text-[var(--text-secondary)]">
                      <span>Stop condition</span>
                      <div className="px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-muted)]">
                        Press key again or click Stop
                      </div>
                    </div>
                  )}

                  <label className="space-y-1 text-xs text-[var(--text-secondary)]">
                    <span>Pause between runs (ms)</span>
                    <input
                      type="number"
                      min={10}
                      max={300000}
                      step={50}
                      value={repeatDelayInput}
                      onChange={e => setRepeatDelayInput(e.target.value)}
                      onBlur={() =>
                        setRepeatDelayInput(
                          String(
                            Math.max(
                              10,
                              Math.min(300000, parseInt(repeatDelayInput, 10) || 500)
                            )
                          )
                        )
                      }
                      className="w-full px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono tabular-nums text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </label>
                </div>
              )}

              {needsLiveRunner && (
                <p className="text-[11px] text-[var(--text-muted)]">
                  Step 01 saves onto the pad; subsequent timed steps run automatically while connected via USB.
                </p>
              )}
            </div>

            {/* Visual MacroPad Control Picker */}
            <div className="pt-4 border-t border-[var(--border-subtle)] space-y-3.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  Assign to Pad
                </span>

                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)]">
                  {profiles.map(p => {
                    const ProfIcon = p.id === 'MAC' ? Laptop : Tv;
                    const active = targetProfile === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setTargetProfile(p.id)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          active
                            ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                        }`}
                      >
                        <ProfIcon className="w-3.5 h-3.5" />
                        <span>{p.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mini Physical Layout: 2x4 Keys + 3 Rotary Knob Slots */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                {/* 8 Keys (2 rows x 4 columns) */}
                <div className="sm:col-span-8 grid grid-cols-4 gap-1.5">
                  {BUTTON_GRID_SLOTS.map((slot, i) => {
                    const act = targetProfileSlots[slot];
                    const slotBind = getBindingForProfileSlot(
                      profiles,
                      targetProfile,
                      slot
                    );
                    const label = act
                      ? describeFirmwareAction(act, slotBind?.repeatConfig).shortLabel
                      : 'Empty';
                    const isSelected = targetSlot === slot;
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setTargetSlot(slot)}
                        className={`p-2 rounded-lg border text-left transition-colors cursor-pointer min-w-0 ${
                          isSelected
                            ? 'border-[var(--accent)] bg-[rgba(var(--accent-rgb),0.12)]'
                            : 'bg-[var(--bg-input)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                        }`}
                      >
                        <div className="font-mono text-[10px] text-[var(--text-muted)] tabular-nums">
                          K{i + 1}
                        </div>
                        <div
                          className={`text-[11px] font-medium truncate mt-0.5 ${
                            act ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
                          }`}
                        >
                          {label}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* 3 Rotary Encoder Actions */}
                <div className="sm:col-span-4 flex sm:flex-col gap-1.5">
                  {ENCODER_SLOTS.map(({ slot, shortTitle, icon: KnobIcon }) => {
                    const act = targetProfileSlots[slot];
                    const slotBind = getBindingForProfileSlot(
                      profiles,
                      targetProfile,
                      slot
                    );
                    const label = act
                      ? describeFirmwareAction(act, slotBind?.repeatConfig).shortLabel
                      : 'Empty';
                    const isSelected = targetSlot === slot;
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setTargetSlot(slot)}
                        className={`flex-1 px-2.5 py-1.5 rounded-lg border text-left flex items-center justify-between gap-2 transition-colors cursor-pointer min-w-0 ${
                          isSelected
                            ? 'border-[var(--accent)] bg-[rgba(var(--accent-rgb),0.12)]'
                            : 'bg-[var(--bg-input)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 shrink-0">
                          <KnobIcon className="w-3 h-3 text-[var(--text-muted)]" />
                          <span className="font-mono text-[10px] text-[var(--text-muted)] whitespace-nowrap">
                            {shortTitle}
                          </span>
                        </div>
                        <span
                          className={`text-[11px] font-medium truncate ${
                            act ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
                          }`}
                        >
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Assign Action Footer */}
              <div className="pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs text-[var(--text-muted)] truncate">
                  {justAssignedSlot &&
                  justAssignedSlot.profile === targetProfile &&
                  justAssignedSlot.slot === targetSlot ? (
                    <span className="text-emerald-400 font-medium">
                      Assigned to {activeTargetProfileObj.name} ·{' '}
                      {SLOT_LABELS[targetSlot].short}
                    </span>
                  ) : (
                    <span>
                      Current on {SLOT_LABELS[targetSlot].short}:{' '}
                      <span className="text-[var(--text-secondary)] font-medium">
                        {currentSlotDesc}
                      </span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {onJumpToControl &&
                    justAssignedSlot &&
                    justAssignedSlot.profile === targetProfile &&
                    justAssignedSlot.slot === targetSlot && (
                      <button
                        type="button"
                        onClick={() => onJumpToControl(targetProfile, targetSlot)}
                        className="flex items-center gap-1 px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <span>View on Pad</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    )}

                  <button
                    type="button"
                    disabled={!isSequenceValid}
                    onClick={handleAssignToControl}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-40 disabled:pointer-events-none transition-opacity cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>
                      Assign to {SLOT_LABELS[targetSlot].short}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};
