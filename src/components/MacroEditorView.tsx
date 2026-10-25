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
  Send,
  Command,
  FileText,
  Tv,
  Laptop,
  Save,
  RefreshCw,
  Repeat,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Clock,
  Copy,
  Volume2,
  CornerDownLeft,
  Eye
} from 'lucide-react';

export interface MacroEditorExternalTarget {
  requestId: number;
  macroId?: string | null;
  name: string;
  action: string;
  repeatConfig?: TextMacroRepeatConfig;
  stepsOverride?: Omit<MacroStepConfig, 'id'>[];
}

interface MacroEditorViewProps {
  profiles: [StudioProfile, StudioProfile];
  activeProfileId: HardwareProfileId;
  customMacros: CustomMacroItem[];
  keyboardLayout: KeyboardLayoutId;
  connection: DeviceConnectionInfo;
  activeRepeatJob?: ActiveRepeatJob | null;
  externalTarget?: MacroEditorExternalTarget | null;
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
}

const MOD_LIST = [
  { id: 'cmd', label: '⌘ Cmd' },
  { id: 'ctrl', label: '⌃ Ctrl' },
  { id: 'alt', label: '⌥ Opt' },
  { id: 'shift', label: '⇧ Shift' },
  { id: 'win', label: '⊞ Win' }
];

const QUICK_DELAY_PRESETS = [0, 100, 250, 500, 1000];
const PAUSE_STEP_PRESETS = [100, 250, 500, 1000, 2000];

const STEP_TYPE_META: Record<
  MacroStepActionType,
  {
    label: string;
    addLabel: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  shortcut: { label: 'Keyboard Shortcut', addLabel: 'Shortcut', icon: Command },
  text: { label: 'Type Text', addLabel: 'Type Text', icon: FileText },
  key: { label: 'Single Key', addLabel: 'Key Press', icon: CornerDownLeft },
  media: { label: 'Media & Function', addLabel: 'Media', icon: Volume2 },
  os_action: { label: 'System Action', addLabel: 'System', icon: Laptop },
  tv: { label: 'Smart TV Control', addLabel: 'TV Control', icon: Tv },
  delay: { label: 'Timed Wait', addLabel: 'Wait Delay', icon: Clock }
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
        label: 'Single Key',
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
    case 'tv':
      return {
        id,
        label: 'Smart TV Control',
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

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const seconds = (ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 2);
  return `${seconds} s (${ms} ms)`;
}

function delayBarPercent(ms: number): number {
  if (ms <= 0) return 0;
  // Smooth log-like visual proportion between 8% and 100% up to 3000ms
  const clamped = Math.min(3000, Math.max(10, ms));
  return Math.min(100, Math.max(8, Math.round((Math.log10(clamped) / Math.log10(3000)) * 100)));
}

export const MacroEditorView: React.FC<MacroEditorViewProps> = ({
  profiles,
  activeProfileId,
  customMacros,
  keyboardLayout,
  connection,
  activeRepeatJob,
  externalTarget,
  onSaveMacro,
  onDeleteMacro,
  onAssignSlot,
  onTestBinding,
  onStopRepeat,
  onPullFromUsb
}) => {
  const [sidebarTab, setSidebarTab] = useState<'sequences' | 'controls'>('sequences');
  const [selectedMacroId, setSelectedMacroId] = useState<string | null>(null);
  const [macroName, setMacroName] = useState('Open App & Run');

  // Visual step sequence state
  const [macroSteps, setMacroSteps] = useState<MacroStepConfig[]>(() =>
    STARTER_TEMPLATES[0].steps.map((s, idx) => ({
      ...s,
      id: `init-step-${idx + 1}`
    }))
  );

  // Sequence-level repeat / loop controls
  const [repeatCountInput, setRepeatCountInput] = useState<string>('1');
  const [loopUntilStopped, setLoopUntilStopped] = useState<boolean>(false);
  const [repeatDelayInput, setRepeatDelayInput] = useState<string>('500');

  // Drag-and-drop state with precise insertion indicator
  const [dragArmedStepId, setDragArmedStepId] = useState<string | null>(null);
  const [draggedStepIndex, setDraggedStepIndex] = useState<number | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{
    index: number;
    position: 'before' | 'after';
  } | null>(null);

  // Per-step keyboard shortcut recorder
  const [recordingStepId, setRecordingStepId] = useState<string | null>(null);
  const [stepRecorderError, setStepRecorderError] = useState<{
    stepId: string;
    message: string;
  } | null>(null);

  // Target control assignment
  const [targetProfile, setTargetProfile] = useState<HardwareProfileId>(activeProfileId);
  const [targetSlot, setTargetSlot] = useState<HardwareSlotId>('b1');

  useEffect(() => {
    setTargetProfile(activeProfileId);
  }, [activeProfileId]);

  useEffect(() => {
    if (!externalTarget) return;
    setSidebarTab('sequences');
    setSelectedMacroId(externalTarget.macroId ?? null);
    setRecordingStepId(null);
    setStepRecorderError(null);
    setMacroName(externalTarget.name);

    if (externalTarget.stepsOverride && externalTarget.stepsOverride.length > 0) {
      setMacroSteps(
        externalTarget.stepsOverride.map((s, idx) => ({
          ...s,
          id: `ext-${externalTarget.requestId}-${idx}`
        }))
      );
      setRepeatCountInput('1');
      setLoopUntilStopped(false);
      setRepeatDelayInput('500');
    } else {
      const convertedSteps = actionToMacroSteps(
        externalTarget.action,
        externalTarget.repeatConfig
      );
      setMacroSteps(
        convertedSteps.length > 0 ? convertedSteps : [createDefaultStep('shortcut', 1)]
      );
      setRepeatCountInput(String(externalTarget.repeatConfig?.repeatCount || 1));
      setLoopUntilStopped(Boolean(externalTarget.repeatConfig?.loopUntilStopped));
      setRepeatDelayInput(String(externalTarget.repeatConfig?.repeatDelayMs || 500));
    }
  }, [externalTarget]);

  // Reset drag arming on global mouseup so inputs never stay locked in draggable state
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

      const nextShortcut = buildFirmwareShortcut(capturedMods, fwKey);
      setStepRecorderError(null);
      setMacroSteps(prev =>
        prev.map(s =>
          s.id === recordingStepId
            ? { ...s, actionType: 'shortcut', value: nextShortcut }
            : s
        )
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
    setMacroSteps(
      convertedSteps.length > 0 ? convertedSteps : [createDefaultStep('shortcut', 1)]
    );
    setRepeatCountInput(String(repeatConfig?.repeatCount || 1));
    setLoopUntilStopped(Boolean(repeatConfig?.loopUntilStopped));
    setRepeatDelayInput(String(repeatConfig?.repeatDelayMs || 500));
  };

  const applyStarterTemplate = (tpl: StarterTemplate) => {
    setSelectedMacroId(null);
    setRecordingStepId(null);
    setStepRecorderError(null);
    setMacroName(tpl.name);
    setMacroSteps(
      tpl.steps.map((s, idx) => ({
        ...s,
        id: `tpl-${Date.now()}-${idx}`
      }))
    );
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
    setMacroSteps(prev => {
      // Ensure previous trailing step has a sensible 150ms transition delay if it was 0ms
      const adjusted = prev.map((s, idx) =>
        idx === prev.length - 1 && s.actionType !== 'delay' && s.delayMs === 0
          ? { ...s, delayMs: 150 }
          : s
      );
      const nextStep = createDefaultStep(type, prev.length + 1);
      // Last step defaults to 0ms post-delay unless it is a pure wait step
      if (type !== 'delay') {
        nextStep.delayMs = 0;
      }
      return [...adjusted, nextStep];
    });
  };

  const insertStepAfter = (index: number, type: MacroStepActionType = 'key') => {
    setMacroSteps(prev => {
      const copy = [...prev];
      if (copy[index] && copy[index].actionType !== 'delay' && copy[index].delayMs === 0) {
        copy[index] = { ...copy[index], delayMs: 150 };
      }
      const inserted = createDefaultStep(type, copy.length + 1);
      if (index === copy.length - 1 && type !== 'delay') {
        inserted.delayMs = 0;
      }
      copy.splice(index + 1, 0, inserted);
      return copy;
    });
  };

  const duplicateStep = (index: number) => {
    setMacroSteps(prev => {
      const target = prev[index];
      if (!target) return prev;
      const copy = [...prev];
      const clone: MacroStepConfig = {
        ...target,
        id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      };
      copy.splice(index + 1, 0, clone);
      return copy;
    });
  };

  const removeStep = (stepId: string) => {
    if (recordingStepId === stepId) setRecordingStepId(null);
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

  const stepValidationIssue = useMemo((): string | null => {
    if (macroSteps.length === 0) {
      return 'Add at least one action step to build a macro.';
    }
    const actionable = macroSteps.filter(s => s.actionType !== 'delay');
    if (actionable.length === 0) {
      return 'Add at least one action step (sequences cannot contain only wait delays).';
    }
    for (let i = 0; i < macroSteps.length; i++) {
      const s = macroSteps[i];
      if (s.actionType === 'delay') continue;
      if (s.actionType === 'text') {
        if (!s.value) {
          return `Step ${String(i + 1).padStart(2, '0')}: Enter text to type.`;
        }
        const check = validateTextMacroInput(s.value, 123);
        if (!check.valid) {
          return `Step ${String(i + 1).padStart(2, '0')}: ${check.error}`;
        }
      } else if (!stepToFirmwareAction(s)) {
        return `Step ${String(i + 1).padStart(2, '0')}: Complete the action configuration.`;
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
    // Also populate legacy text/followUpKey fields when sequence is [text] or [text, key]
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
    if (stepValidationIssue) return '';
    if (isSingleNativeStep) {
      return stepToFirmwareAction(macroSteps[0]);
    }
    return buildFirmwareActionFromTextConfig(builtRepeatConfig);
  }, [stepValidationIssue, isSingleNativeStep, macroSteps, builtRepeatConfig]);

  const isSequenceValid = !stepValidationIssue && isValidFirmwareAction(builtAction);
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
  };

  const handleAssignToControl = () => {
    if (!isSequenceValid) return;
    handleSaveMacroItem();
    onAssignSlot(targetProfile, targetSlot, builtBinding);
  };

  // Categorized static catalog options for inline step pickers
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
  const tvCatalog = useMemo(
    () =>
      FIRMWARE_STATIC_CATALOG.filter(
        item => item.category === 'tv' || item.category === 'tv_app'
      ),
    []
  );

  // Build proportional segments for the visual timeline overview bar
  const timelineSegments = useMemo(() => {
    const segs: {
      key: string;
      kind: 'step' | 'delay';
      stepIndex: number;
      label: string;
      weight: number;
      ms?: number;
    }[] = [];

    macroSteps.forEach((step, idx) => {
      const desc = describeMacroStep(step);
      const isLast = idx === macroSteps.length - 1;
      const repeats = Math.max(1, step.repeatCount || 1);

      if (step.actionType === 'delay') {
        const waitMs = Math.max(0, step.delayMs) * repeats;
        segs.push({
          key: `${step.id}-wait`,
          kind: 'delay',
          stepIndex: idx,
          label: `${waitMs} ms`,
          weight: Math.max(1, Math.min(4, waitMs / 250)),
          ms: waitMs
        });
      } else {
        segs.push({
          key: `${step.id}-act`,
          kind: 'step',
          stepIndex: idx,
          label: `${String(idx + 1).padStart(2, '0')} ${desc.shortLabel}`,
          weight: 1.6
        });
        const postDelay =
          (!isLast ? Math.max(0, step.delayMs) : 0) +
          (repeats > 1 ? (repeats - 1) * Math.max(0, step.delayMs) : 0);
        if (postDelay > 0) {
          segs.push({
            key: `${step.id}-delay`,
            kind: 'delay',
            stepIndex: idx,
            label: `${postDelay} ms`,
            weight: Math.max(0.9, Math.min(3.6, postDelay / 250)),
            ms: postDelay
          });
        }
      }
    });

    return segs;
  }, [macroSteps]);

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden min-w-0">
      {/* Left Sidebar: Saved Sequences, Starter Templates & Pad Controls */}
      <aside className="w-full lg:w-80 xl:w-96 shrink-0 bg-[var(--bg-panel)] border-b lg:border-b-0 lg:border-r border-[var(--border-subtle)] flex flex-col lg:overflow-hidden">
        <div className="p-4 border-b border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Macro Sequences
            </h2>
            <button
              type="button"
              onClick={() => {
                setSelectedMacroId(null);
                setMacroName('New Macro Sequence');
                setMacroSteps([
                  createDefaultStep('shortcut', 1),
                  { ...createDefaultStep('key', 2), delayMs: 0 }
                ]);
                setRepeatCountInput('1');
                setLoopUntilStopped(false);
                setRepeatDelayInput('500');
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-xs font-medium text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>New Sequence</span>
            </button>
          </div>

          {/* Segmented Switcher: Saved Sequences vs Pad Controls */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => setSidebarTab('sequences')}
              className={`py-1.5 px-3 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                sidebarTab === 'sequences'
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              Saved & Templates
            </button>
            <button
              type="button"
              onClick={() => setSidebarTab('controls')}
              className={`py-1.5 px-3 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                sidebarTab === 'controls'
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              Pad Controls
            </button>
          </div>
        </div>

        <div className="flex-1 lg:overflow-y-auto p-4 space-y-5">
          {sidebarTab === 'sequences' ? (
            <>
              {/* User's Saved Custom Macros */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span className="font-semibold text-[var(--text-secondary)]">
                    Saved Macros
                  </span>
                  <span className="font-mono tabular-nums">{customMacros.length}</span>
                </div>

                {customMacros.length === 0 ? (
                  <div className="p-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-muted)] leading-relaxed">
                    No saved sequences yet. Build a step list on the right and click Save Macro, or start from a template below.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {customMacros.map(m => {
                      const stepsForMacro = actionToMacroSteps(m.action, m.repeatConfig);
                      const { totalDelayMs } = calculateStepsTiming(stepsForMacro);
                      const isSelected = selectedMacroId === m.id;
                      return (
                        <div
                          key={m.id}
                          style={
                            isSelected
                              ? {
                                  borderColor: 'var(--accent)',
                                  backgroundColor: 'rgba(var(--accent-rgb), 0.10)'
                                }
                              : undefined
                          }
                          className="p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] flex items-center justify-between gap-2 transition-colors"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedMacroId(m.id);
                              loadIntoBuilder(m.action, m.name, m.repeatConfig);
                            }}
                            className="min-w-0 flex-1 text-left cursor-pointer"
                          >
                            <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                              {m.name}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] font-mono tabular-nums mt-0.5 truncate">
                              <span>
                                {stepsForMacro.length}{' '}
                                {stepsForMacro.length === 1 ? 'step' : 'steps'}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{totalDelayMs} ms delay</span>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteMacro(m.id);
                              if (selectedMacroId === m.id) setSelectedMacroId(null);
                            }}
                            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-rose-400 hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer shrink-0"
                            title="Delete saved macro"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Starter Multi-Step Templates */}
              <div className="pt-4 border-t border-[var(--border-subtle)] space-y-2">
                <div className="text-xs font-semibold text-[var(--text-secondary)]">
                  Sequence Templates
                </div>
                <div className="space-y-1.5">
                  {STARTER_TEMPLATES.map(tpl => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => applyStarterTemplate(tpl)}
                      className="w-full text-left p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--accent)] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                          {tpl.name}
                        </span>
                        <span className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums shrink-0">
                          {tpl.summary}
                        </span>
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                        {tpl.steps.map(s => s.label).join(' → ')}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              {connection.connected && (
                <button
                  type="button"
                  onClick={onPullFromUsb}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh Controls from Device</span>
                </button>
              )}

              {profiles.map(prof => {
                const slots = extractProfileSlots(prof);
                const ProfIcon = prof.id === 'MAC' ? Laptop : Tv;
                return (
                  <div key={prof.id} className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                        <ProfIcon
                          className="w-3.5 h-3.5"
                          style={{ color: prof.id === 'MAC' ? '#3B82F6' : '#10B981' }}
                        />
                        <span>{prof.name} Profile</span>
                      </div>
                      <span className="text-[11px] text-[var(--text-muted)] font-mono tabular-nums">
                        11 controls
                      </span>
                    </div>

                    <div className="space-y-1">
                      {HARDWARE_SLOTS.map(slot => {
                        const act = slots[slot];
                        const slotBinding = getBindingForProfileSlot(profiles, prof.id, slot);
                        const desc = describeFirmwareAction(act, slotBinding?.repeatConfig);
                        const isTarget =
                          targetProfile === prof.id && targetSlot === slot;
                        return (
                          <button
                            key={`${prof.id}-${slot}`}
                            type="button"
                            onClick={() => {
                              setTargetProfile(prof.id);
                              setTargetSlot(slot);
                              setSelectedMacroId(null);
                              if (act) {
                                loadIntoBuilder(
                                  act,
                                  `${prof.name} · ${SLOT_LABELS[slot].short}`,
                                  slotBinding?.repeatConfig
                                );
                              }
                            }}
                            style={
                              isTarget
                                ? {
                                    borderColor: 'var(--accent)',
                                    backgroundColor: 'rgba(var(--accent-rgb), 0.10)'
                                  }
                                : undefined
                            }
                            className="w-full text-left px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] flex items-center justify-between gap-2 transition-colors cursor-pointer"
                          >
                            <span className="text-xs font-medium text-[var(--text-primary)] shrink-0">
                              {SLOT_LABELS[slot].short}
                            </span>
                            <span
                              className={`text-xs truncate ${
                                act
                                  ? 'text-[var(--text-secondary)]'
                                  : 'text-[var(--text-muted)] italic'
                              }`}
                            >
                              {act ? desc.shortLabel : 'Unassigned'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      {/* Main Workspace: Visual Step-Based Macro Sequence Builder */}
      <main className="flex-1 lg:overflow-y-auto p-4 sm:p-6 lg:p-8 min-w-0">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Header & Primary Sequence Controls */}
          <div className="p-5 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex-1 min-w-0 space-y-1">
                <label
                  htmlFor="macro-sequence-name"
                  className="text-xs font-medium text-[var(--text-muted)] block"
                >
                  Sequence Name
                </label>
                <input
                  id="macro-sequence-name"
                  type="text"
                  maxLength={36}
                  value={macroName}
                  onChange={e => setMacroName(e.target.value)}
                  placeholder="Name this macro sequence…"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-sm font-semibold text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap shrink-0 sm:self-end">
                {isJobRunning ? (
                  <button
                    type="button"
                    onClick={onStopRepeat}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-500/15 border border-rose-500/40 hover:bg-rose-500/25 text-xs font-semibold text-rose-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>
                      Stop{isSimulating ? ' Preview' : ` (${activeRepeatJob?.currentIteration})`}
                    </span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={!isSequenceValid}
                      onClick={handlePreviewSimulation}
                      title="Watch each step and sequential delay animate on the timeline"
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Eye className="w-3.5 h-3.5 text-[var(--accent)]" />
                      <span>Preview Timing</span>
                    </button>

                    <button
                      type="button"
                      disabled={!isSequenceValid || !testAvail.canTest}
                      onClick={() => onTestBinding(builtBinding)}
                      title={testAvail.reason || 'Execute sequence on connected pad'}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Play className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Test on Pad</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  disabled={!isSequenceValid}
                  onClick={handleSaveMacroItem}
                  style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-40 disabled:pointer-events-none transition-opacity cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Macro</span>
                </button>
              </div>
            </div>

            {/* Clean Unboxed Sequence Telemetry Bar */}
            <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between gap-3 flex-wrap text-xs text-[var(--text-secondary)]">
              <div className="flex items-center gap-2 font-mono tabular-nums flex-wrap">
                <span>
                  {macroSteps.length} {macroSteps.length === 1 ? 'step' : 'steps'}
                </span>
                <span aria-hidden="true" className="text-[var(--text-muted)]">
                  ·
                </span>
                <span>{timingSummary.actionStepCount} actions</span>
                <span aria-hidden="true" className="text-[var(--text-muted)]">
                  ·
                </span>
                <span className="text-[var(--text-primary)] font-semibold">
                  {formatDurationMs(timingSummary.totalDelayMs)} sequential delay
                </span>
                <span aria-hidden="true" className="text-[var(--text-muted)]">
                  ·
                </span>
                <span>
                  {loopUntilStopped
                    ? `Continuous loop (${parsedRepeatDelay} ms)`
                    : parsedRepeatCount > 1
                    ? `${parsedRepeatCount}× cycles (${parsedRepeatDelay} ms)`
                    : 'Single pass'}
                </span>
              </div>

              {isSequenceValid && !testAvail.canTest && testAvail.reason && (
                <span className="text-[11px] text-amber-400">
                  {testAvail.reason}
                </span>
              )}
            </div>

            {/* Proportional Sequence Timeline Map */}
            {timelineSegments.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                  <span>Execution Timeline Overview (click any segment to jump)</span>
                  <span className="font-mono tabular-nums">
                    Drag steps below to reorder
                  </span>
                </div>
                <div className="flex items-stretch gap-1 w-full overflow-x-auto py-0.5">
                  {timelineSegments.map(seg => {
                    const isStepActive =
                      isJobRunning &&
                      activeRepeatJob?.activeStepIndex === seg.stepIndex &&
                      ((seg.kind === 'step' && activeRepeatJob?.activeStepPhase === 'action') ||
                        (seg.kind === 'delay' && activeRepeatJob?.activeStepPhase === 'delay'));

                    return (
                      <button
                        key={seg.key}
                        type="button"
                        onClick={() => {
                          const el = document.getElementById(
                            `macro-step-node-${macroSteps[seg.stepIndex]?.id}`
                          );
                          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }}
                        style={{
                          flexGrow: seg.weight,
                          flexBasis: seg.kind === 'delay' ? '52px' : '84px',
                          ...(isStepActive
                            ? {
                                borderColor: 'var(--accent)',
                                backgroundColor: 'rgba(var(--accent-rgb), 0.22)'
                              }
                            : {})
                        }}
                        className={`px-2 py-1.5 rounded-md border text-[11px] font-mono tabular-nums truncate text-center transition-colors cursor-pointer ${
                          seg.kind === 'delay'
                            ? 'bg-[var(--bg-canvas)] border-dashed border-[var(--border-strong)] text-[var(--text-muted)]'
                            : 'bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--text-primary)] font-medium'
                        }`}
                        title={seg.label}
                      >
                        {seg.kind === 'delay' ? `Wait ${seg.label}` : seg.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {stepValidationIssue && (
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-2 text-xs text-amber-300">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{stepValidationIssue}</span>
              </div>
            )}
          </div>

          {/* Add Step Action Bar */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">
              Add Step to Sequence
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {(
                ['shortcut', 'text', 'key', 'media', 'os_action', 'tv', 'delay'] as const
              ).map(type => {
                const meta = STEP_TYPE_META[type];
                const Icon = meta.icon;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => appendStep(type)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-xs font-medium text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3 h-3 text-[var(--accent)]" />
                    <Icon className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                    <span>{meta.addLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Vertical Step-Based Sequence List with Drag-and-Drop & Explicit Delay Timing */}
          {macroSteps.length === 0 ? (
            <div className="p-8 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-center space-y-3">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                Sequence is empty
              </p>
              <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
                Add keyboard shortcuts, typed text, single keys, media controls, TV commands, or timed wait pauses to build a visual multi-step macro.
              </p>
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => appendStep('shortcut')}
                  style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
                  className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  Add First Step
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-0" role="list" aria-label="Macro sequence steps">
              {macroSteps.map((step, idx) => {
                const isLastStep = idx === macroSteps.length - 1;
                const StepIcon = STEP_TYPE_META[step.actionType].icon;
                const stepSummary = describeMacroStep(step);

                const isExecutingAction =
                  isJobRunning &&
                  activeRepeatJob?.activeStepIndex === idx &&
                  activeRepeatJob?.activeStepPhase === 'action';

                const isExecutingDelay =
                  isJobRunning &&
                  activeRepeatJob?.activeStepIndex === idx &&
                  activeRepeatJob?.activeStepPhase === 'delay';

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
                const tvKeyParts = isCustomTvKey ? step.value.split(':') : ['TVKEY', '5', '1'];
                const tvAppParts = isCustomTvApp ? step.value.split(':') : ['TVAPP', '1', '4', ''];

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
                    className="relative"
                  >
                    {/* Drop Insertion Indicator Line (Before) */}
                    {showDropBefore && (
                      <div
                        className="h-0.5 w-full rounded-full mb-2"
                        style={{ backgroundColor: 'var(--accent)' }}
                      />
                    )}

                    {/* Timeline Row: Left Spine + Right Step Surface */}
                    <div className="flex items-stretch gap-3 sm:gap-4">
                      {/* Left Vertical Stepper Spine */}
                      <div className="flex flex-col items-center w-8 shrink-0 select-none">
                        <div
                          style={
                            isExecutingAction || (step.actionType === 'delay' && isExecutingDelay)
                              ? {
                                  borderColor: 'var(--accent)',
                                  backgroundColor: 'var(--accent)',
                                  color: '#FFFFFF'
                                }
                              : undefined
                          }
                          className="w-8 h-8 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-strong)] flex items-center justify-center font-mono text-xs font-bold tabular-nums text-[var(--text-primary)] transition-colors shrink-0"
                        >
                          {String(idx + 1).padStart(2, '0')}
                        </div>
                        {!isLastStep && (
                          <div
                            style={
                              isExecutingDelay
                                ? { backgroundColor: 'var(--accent)' }
                                : undefined
                            }
                            className="w-px flex-1 bg-[var(--border-strong)] my-1 transition-colors"
                          />
                        )}
                      </div>

                      {/* Step Card + Post-Step Sequential Delay Connector */}
                      <div className="flex-1 min-w-0">
                        <div
                          style={
                            isExecutingAction || (step.actionType === 'delay' && isExecutingDelay)
                              ? {
                                  borderColor: 'var(--accent)',
                                  backgroundColor: 'rgba(var(--accent-rgb), 0.08)'
                                }
                              : undefined
                          }
                          className={`p-4 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] transition-opacity space-y-3 ${
                            isDragged ? 'opacity-45 border-dashed' : ''
                          }`}
                        >
                          {/* Step Header Bar */}
                          <div
                            onMouseDown={e => {
                              const interactive = (e.target as HTMLElement).closest(
                                'select, input, textarea, button'
                              );
                              if (!interactive) {
                                setDragArmedStepId(step.id);
                              }
                            }}
                            className="flex items-center justify-between gap-2 flex-wrap"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                onMouseDown={() => setDragArmedStepId(step.id)}
                                className="p-1 -ml-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] cursor-grab active:cursor-grabbing shrink-0"
                                title="Drag to reorder step"
                              >
                                <GripVertical className="w-4 h-4" />
                              </div>

                              <StepIcon className="w-4 h-4 text-[var(--accent)] shrink-0" />

                              <select
                                aria-label={`Step ${idx + 1} type`}
                                value={step.actionType}
                                onChange={e =>
                                  changeStepType(step.id, e.target.value as MacroStepActionType)
                                }
                                className="px-2.5 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
                              >
                                {(Object.keys(STEP_TYPE_META) as MacroStepActionType[]).map(
                                  typeKey => (
                                    <option key={typeKey} value={typeKey}>
                                      {STEP_TYPE_META[typeKey].label}
                                    </option>
                                  )
                                )}
                              </select>

                              <span className="text-xs text-[var(--text-muted)] truncate hidden sm:inline">
                                · {stepSummary.fullLabel}
                              </span>
                            </div>

                            {/* Step Repeat & Reorder / Duplicate / Delete Actions */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              {step.actionType !== 'delay' && (
                                <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] mr-1">
                                  <span>Repeat</span>
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
                                    className="w-12 px-2 py-1 rounded-md bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono tabular-nums text-[var(--text-primary)] text-center focus:outline-none focus:border-[var(--accent)]"
                                  />
                                  <span className="font-mono text-[var(--text-muted)]">×</span>
                                </label>
                              )}

                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => moveStepByOffset(idx, -1)}
                                className="p-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                                title="Move step up"
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={isLastStep}
                                onClick={() => moveStepByOffset(idx, 1)}
                                className="p-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                                title="Move step down"
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => duplicateStep(idx)}
                                className="p-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                                title="Duplicate step"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeStep(step.id)}
                                className="p-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-rose-400 cursor-pointer"
                                title="Remove step"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Step Type-Specific Inline Editor */}
                          {step.actionType === 'shortcut' && (
                            <div className="space-y-3 pt-1">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
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
                                        style={
                                          isModActive
                                            ? {
                                                borderColor: 'var(--accent)',
                                                backgroundColor: 'rgba(var(--accent-rgb), 0.16)'
                                              }
                                            : undefined
                                        }
                                        className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-colors cursor-pointer whitespace-nowrap ${
                                          isModActive
                                            ? 'text-[var(--text-primary)] font-semibold'
                                            : 'bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                                        }`}
                                      >
                                        {m.label}
                                      </button>
                                    );
                                  })}

                                  <span className="text-xs text-[var(--text-muted)] px-0.5">+</span>

                                  <select
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

                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs font-semibold text-[var(--accent)]">
                                    {formatShortcutPretty(step.value)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setStepRecorderError(null);
                                      setRecordingStepId(prev =>
                                        prev === step.id ? null : step.id
                                      );
                                    }}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                                      recordingStepId === step.id
                                        ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                                        : 'bg-[var(--bg-input)] border-[var(--border-subtle)] hover:border-[var(--accent)] text-[var(--text-primary)]'
                                    }`}
                                  >
                                    <Radio className="w-3.5 h-3.5" />
                                    <span>
                                      {recordingStepId === step.id
                                        ? 'Press keys…'
                                        : 'Record Keys'}
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

                          {step.actionType === 'text' && (
                            <div className="space-y-1.5 pt-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-[var(--text-secondary)]">
                                  Text characters to type sequentially
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
                                placeholder="Enter text string to type…"
                                className={`w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border text-xs font-mono text-[var(--text-primary)] focus:outline-none ${
                                  !textCheck.valid
                                    ? 'border-rose-500'
                                    : 'border-[var(--border-subtle)] focus:border-[var(--accent)]'
                                }`}
                              />
                              {!textCheck.valid && textCheck.error && (
                                <p className="text-xs text-rose-400">{textCheck.error}</p>
                              )}
                            </div>
                          )}

                          {step.actionType === 'key' && (
                            <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {(['enter', 'tab', 'space', 'esc', 'backspace'] as const).map(
                                  quickKey => {
                                    const active = step.value === quickKey;
                                    return (
                                      <button
                                        key={quickKey}
                                        type="button"
                                        onClick={() => updateStep(step.id, { value: quickKey })}
                                        style={
                                          active
                                            ? {
                                                borderColor: 'var(--accent)',
                                                backgroundColor: 'rgba(var(--accent-rgb), 0.16)'
                                              }
                                            : undefined
                                        }
                                        className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono uppercase cursor-pointer whitespace-nowrap ${
                                          active
                                            ? 'text-[var(--text-primary)] font-semibold'
                                            : 'bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                                        }`}
                                      >
                                        {quickKey}
                                      </button>
                                    );
                                  }
                                )}
                              </div>

                              <select
                                value={step.value}
                                onChange={e => updateStep(step.id, { value: e.target.value })}
                                className="px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
                              >
                                {FIRMWARE_SUPPORTED_KEYS.map(k => (
                                  <option key={k} value={k}>
                                    Key: {k.toUpperCase()}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {step.actionType === 'media' && (
                            <div className="pt-1">
                              <select
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
                            <div className="pt-1">
                              <select
                                value={step.value}
                                onChange={e => updateStep(step.id, { value: e.target.value })}
                                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
                              >
                                <optgroup label="macOS Actions">
                                  {osCatalog
                                    .filter(i => i.category === 'mac_macro')
                                    .map(item => (
                                      <option key={item.action} value={item.action}>
                                        {item.label}
                                      </option>
                                    ))}
                                </optgroup>
                                <optgroup label="Windows Actions">
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

                          {step.actionType === 'tv' && (
                            <div className="space-y-2.5 pt-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {[
                                  { id: 'preset', label: 'Remote & Apps', active: !isCustomTvKey && !isCustomTvApp },
                                  { id: 'tvkey', label: 'Custom Remote Code', active: isCustomTvKey },
                                  { id: 'tvapp', label: 'Custom App Launch', active: isCustomTvApp }
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
                                    style={
                                      modeBtn.active
                                        ? {
                                            borderColor: 'var(--accent)',
                                            backgroundColor: 'rgba(var(--accent-rgb), 0.14)'
                                          }
                                        : undefined
                                    }
                                    className={`px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer whitespace-nowrap ${
                                      modeBtn.active
                                        ? 'text-[var(--text-primary)]'
                                        : 'bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                                    }`}
                                  >
                                    {modeBtn.label}
                                  </button>
                                ))}
                              </div>

                              {!isCustomTvKey && !isCustomTvApp && (
                                <select
                                  value={step.value}
                                  onChange={e => updateStep(step.id, { value: e.target.value })}
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
                                >
                                  <optgroup label="TV Remote Controls">
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
                                        const cs = Math.max(0, parseInt(e.target.value, 10) || 0);
                                        const cd = Math.max(0, parseInt(tvKeyParts[2] || '1', 10) || 0);
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
                                        const cs = Math.max(0, parseInt(tvKeyParts[1] || '5', 10) || 0);
                                        const cd = Math.max(0, parseInt(e.target.value, 10) || 0);
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
                                    <span>App Identifier</span>
                                    <input
                                      type="text"
                                      value={tvAppParts[1] || '1'}
                                      onChange={e => {
                                        const cleanId = sanitizeSerialString(e.target.value.trim(), 32) || '1';
                                        const ns = Math.max(0, parseInt(tvAppParts[2] || '4', 10) || 0);
                                        const url = sanitizeSerialString((tvAppParts.slice(3).join(':') || '').trim(), 80);
                                        updateStep(step.id, {
                                          value: url ? `TVAPP:${cleanId}:${ns}:${url}` : `TVAPP:${cleanId}:${ns}`
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
                                        const cleanId = sanitizeSerialString((tvAppParts[1] || '1').trim(), 32) || '1';
                                        const ns = Math.max(0, parseInt(e.target.value, 10) || 0);
                                        const url = sanitizeSerialString((tvAppParts.slice(3).join(':') || '').trim(), 80);
                                        updateStep(step.id, {
                                          value: url ? `TVAPP:${cleanId}:${ns}:${url}` : `TVAPP:${cleanId}:${ns}`
                                        });
                                      }}
                                      className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono tabular-nums text-[var(--text-primary)]"
                                    />
                                  </label>
                                  <label className="space-y-1 text-xs text-[var(--text-secondary)]">
                                    <span>Deep-Link Path (optional)</span>
                                    <input
                                      type="text"
                                      value={tvAppParts.slice(3).join(':') || ''}
                                      onChange={e => {
                                        const cleanId = sanitizeSerialString((tvAppParts[1] || '1').trim(), 32) || '1';
                                        const ns = Math.max(0, parseInt(tvAppParts[2] || '4', 10) || 0);
                                        const url = sanitizeSerialString(e.target.value.trim(), 80);
                                        updateStep(step.id, {
                                          value: url ? `TVAPP:${cleanId}:${ns}:${url}` : `TVAPP:${cleanId}:${ns}`
                                        });
                                      }}
                                      placeholder="Optional URL"
                                      className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)]"
                                    />
                                  </label>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Standalone Wait Delay Step Editor */}
                          {step.actionType === 'delay' && (
                            <div className="space-y-2.5 pt-1">
                              <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {PAUSE_STEP_PRESETS.map(msVal => {
                                    const active = step.delayMs === msVal;
                                    return (
                                      <button
                                        key={msVal}
                                        type="button"
                                        onClick={() => updateStep(step.id, { delayMs: msVal })}
                                        style={
                                          active
                                            ? {
                                                borderColor: 'var(--accent)',
                                                backgroundColor: 'rgba(var(--accent-rgb), 0.16)'
                                              }
                                            : undefined
                                        }
                                        className={`px-2.5 py-1 rounded-md border text-xs font-mono tabular-nums cursor-pointer whitespace-nowrap ${
                                          active
                                            ? 'text-[var(--text-primary)] font-semibold'
                                            : 'bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                                        }`}
                                      >
                                        {msVal} ms
                                      </button>
                                    );
                                  })}
                                </div>

                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs text-[var(--text-secondary)]">
                                    Wait Duration:
                                  </span>
                                  <input
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
                                    className="w-24 px-2.5 py-1 rounded-md bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono tabular-nums text-[var(--text-primary)] text-right focus:outline-none focus:border-[var(--accent)]"
                                  />
                                  <span className="text-xs font-mono text-[var(--text-muted)]">
                                    ms
                                  </span>
                                </div>
                              </div>

                              {/* Visual Timing Proportion Bar */}
                              <div className="h-1.5 w-full rounded-full bg-[var(--bg-input)] overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-opacity"
                                  style={{
                                    width: `${delayBarPercent(step.delayMs)}%`,
                                    backgroundColor: 'var(--accent)',
                                    opacity: isExecutingDelay ? 1 : 0.65
                                  }}
                                />
                              </div>
                            </div>
                          )}

                          {/* Intra-step repeat interval on the final step when repeatCount > 1 */}
                          {isLastStep && step.actionType !== 'delay' && step.repeatCount > 1 && (
                            <div className="pt-2.5 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2 flex-wrap text-xs">
                              <span className="text-[var(--text-secondary)] flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-[var(--accent)]" />
                                <span>Interval between each of the {step.repeatCount} repeats</span>
                              </span>
                              <div className="flex items-center gap-1.5">
                                <input
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
                                  className="w-20 px-2 py-1 rounded-md bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono tabular-nums text-[var(--text-primary)] text-right focus:outline-none focus:border-[var(--accent)]"
                                />
                                <span className="font-mono text-[var(--text-muted)]">ms</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Explicit Sequential Delay Timing Node Between Steps */}
                        {!isLastStep && (
                          <div className="py-2.5 pl-1 pr-1 flex flex-col gap-1.5">
                            {step.actionType !== 'delay' ? (
                              <div
                                style={
                                  isExecutingDelay
                                    ? {
                                        borderColor: 'var(--accent)',
                                        backgroundColor: 'rgba(var(--accent-rgb), 0.12)'
                                      }
                                    : undefined
                                }
                                className="px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-dashed border-[var(--border-strong)] flex items-center justify-between gap-3 flex-wrap transition-colors"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <Clock className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                                  <span className="text-xs text-[var(--text-secondary)]">
                                    {step.repeatCount > 1
                                      ? `Repeat & delay before Step ${String(idx + 2).padStart(2, '0')}`
                                      : `Delay before Step ${String(idx + 2).padStart(2, '0')}`}
                                  </span>
                                  {/* Proportional Mini Timing Bar */}
                                  <div className="hidden sm:block w-24 h-1.5 rounded-full bg-[var(--bg-panel)] overflow-hidden shrink-0">
                                    <div
                                      className="h-full rounded-full"
                                      style={{
                                        width: `${delayBarPercent(step.delayMs)}%`,
                                        backgroundColor: 'var(--accent)'
                                      }}
                                    />
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <div className="hidden md:flex items-center gap-1">
                                    {QUICK_DELAY_PRESETS.map(presetMs => (
                                      <button
                                        key={presetMs}
                                        type="button"
                                        onClick={() => updateStep(step.id, { delayMs: presetMs })}
                                        className={`px-1.5 py-0.5 rounded text-[11px] font-mono tabular-nums transition-colors cursor-pointer ${
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
                                      aria-label={`Delay after step ${idx + 1} in milliseconds`}
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
                                      className="w-20 px-2 py-1 rounded-md bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-xs font-mono tabular-nums text-[var(--text-primary)] text-right focus:outline-none focus:border-[var(--accent)]"
                                    />
                                    <span className="text-xs font-mono text-[var(--text-muted)]">
                                      ms
                                    </span>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => insertStepAfter(idx)}
                                    className="ml-1 px-2 py-1 rounded-md bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap"
                                    title="Insert a new step here"
                                  >
                                    + Insert
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between px-2 text-[11px] text-[var(--text-muted)] font-mono tabular-nums">
                                <span>
                                  Then proceed to Step {String(idx + 2).padStart(2, '0')} after{' '}
                                  {step.delayMs * Math.max(1, step.repeatCount)} ms wait
                                </span>
                                <button
                                  type="button"
                                  onClick={() => insertStepAfter(idx)}
                                  className="px-2 py-0.5 rounded bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-[11px] font-sans font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                                >
                                  + Insert
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Drop Insertion Indicator Line (After) */}
                    {showDropAfter && (
                      <div
                        className="h-0.5 w-full rounded-full mt-2"
                        style={{ backgroundColor: 'var(--accent)' }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Sequence Cycle Repeat & Direct Control Assignment */}
          <div className="p-5 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-5">
            {/* Sequence Cycle / Loop Options */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                  <Repeat className="w-4 h-4 text-[var(--accent)]" />
                  <span>Sequence Cycle Mode</span>
                </div>

                <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)]">
                  <button
                    type="button"
                    onClick={() => {
                      setLoopUntilStopped(false);
                      setRepeatCountInput('1');
                    }}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      !loopUntilStopped && parsedRepeatCount === 1
                        ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    Single Pass
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLoopUntilStopped(false);
                      if (parsedRepeatCount <= 1) setRepeatCountInput('3');
                    }}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      !loopUntilStopped && parsedRepeatCount > 1
                        ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    Repeat Count
                  </button>
                  <button
                    type="button"
                    onClick={() => setLoopUntilStopped(true)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      loopUntilStopped
                        ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    Loop Until Stopped
                  </button>
                </div>
              </div>

              {(loopUntilStopped || parsedRepeatCount > 1) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {!loopUntilStopped ? (
                    <label className="space-y-1 text-xs text-[var(--text-secondary)]">
                      <span>Total Cycles (2–999)</span>
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
                        className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono tabular-nums text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                      />
                    </label>
                  ) : (
                    <div className="space-y-1 text-xs text-[var(--text-secondary)]">
                      <span>Loop Behavior</span>
                      <div className="px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]">
                        Press assigned control again or click Stop to end loop
                      </div>
                    </div>
                  )}

                  <label className="space-y-1 text-xs text-[var(--text-secondary)]">
                    <span>Delay Between Cycles (ms)</span>
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
                      className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono tabular-nums text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </label>
                </div>
              )}

              {needsLiveRunner && (
                <p className="text-xs text-[var(--text-muted)]">
                  Step 01 saves directly to your pad; subsequent steps and timed delays run seamlessly while your pad is connected.
                </p>
              )}
            </div>

            {/* Direct Control Assignment */}
            <div className="pt-4 border-t border-[var(--border-subtle)] space-y-3">
              <div className="text-xs font-semibold text-[var(--text-primary)]">
                Assign Sequence to Control
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <select
                  aria-label="Target profile"
                  value={targetProfile}
                  onChange={e => setTargetProfile(e.target.value as HardwareProfileId)}
                  className="px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
                >
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} Profile ({p.id})
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Target physical control"
                  value={targetSlot}
                  onChange={e => setTargetSlot(e.target.value as HardwareSlotId)}
                  className="px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
                >
                  {HARDWARE_SLOTS.map(s => (
                    <option key={s} value={s}>
                      {SLOT_LABELS[s].full}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={!isSequenceValid}
                  onClick={handleAssignToControl}
                  style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-40 disabled:pointer-events-none transition-opacity cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    Assign to {targetProfile} · {SLOT_LABELS[targetSlot].short}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
