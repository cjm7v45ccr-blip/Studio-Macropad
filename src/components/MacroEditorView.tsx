import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ActionBinding,
  ActiveRepeatJob,
  BleHostProfileId,
  CustomMacroItem,
  DeviceConnectionInfo,
  HardwareProfileId,
  HardwareSlotId,
  HostOsMap,
  KeyboardLayoutId,
  MacroStepActionType,
  MacroStepConfig,
  StudioProfile,
  TextMacroRepeatConfig,
  isBleHostProfile,
  profileShortTag
} from '../types/studio';
import {
  FIRMWARE_STATIC_CATALOG,
  FIRMWARE_SUPPORTED_KEYS,
  HARDWARE_SLOTS,
  MAX_FIRMWARE_DELAY_STEP_MS,
  SLOT_LABELS,
  actionContainsTvSteps,
  actionToMacroSteps,
  analyzeMacroOptimizations,
  buildFirmwareShortcut,
  calculateStepsTiming,
  canonicalizeFirmwareAction,
  describeFirmwareAction,
  findEquivalentBuiltInSpec,
  firmwareActionToBinding,
  firmwareSupportsNativeDelay,
  formatShortcutPretty,
  fwKeyToPrintableAscii,
  getActionTestAvailability,
  getMacroCanonicalSignature,
  isGenericMacroName,
  isSupportedFirmwareKey,
  normalizeBrowserKeyToFirmware,
  parseFirmwareShortcut,
  parseMacroStepTag,
  parseSingleActionKeyValue,
  requiresUsbSequenceExecution,
  sanitizeSerialString,
  stepToFirmwareAction,
  suggestSmartMacroName,
  validateMacroSequenceDraft,
  validateTextMacroInput
} from '../data/firmwareCatalog';
import {
  extractProfileSlots,
  getBindingForProfileSlot,
  ToastVariant
} from '../hooks/useStudioState';
import { repeatMacroRunner } from '../services/repeatMacroRunner';
import { ActionPrefixTag, ParsedActionBadge } from './ActionTagBadge';
import { StudioSenseModal } from './StudioSenseModal';
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
  Bluetooth,
  Wand2,
  Download,
  Upload,
  Undo2,
  Redo2,
  Sparkles,
  Gauge,
  Layers,
  MoreHorizontal
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
  profiles: StudioProfile[];
  activeProfileId: HardwareProfileId;
  customMacros: CustomMacroItem[];
  keyboardLayout: KeyboardLayoutId;
  connection: DeviceConnectionInfo;
  activeRepeatJob?: ActiveRepeatJob | null;
  externalTarget?: MacroEditorExternalTarget | null;
  initialTargetSlot?: HardwareSlotId;
  hostOsMap?: HostOsMap;
  tvEnabled?: boolean;
  showAdvancedIds?: boolean;
  onSaveMacro: (
    macro: CustomMacroItem,
    options?: { forceNew?: boolean; silent?: boolean }
  ) => { saved: CustomMacroItem | null; updatedSlotCount: number } | void;
  onDeleteMacro: (id: string) => void;
  onCleanUpDuplicateMacros?: () => void;
  onExportMacrosFile?: () => void;
  onImportMacrosFile?: (file: File) => void;
  onAssignSlot: (
    profileId: HardwareProfileId,
    slot: HardwareSlotId,
    binding: ActionBinding
  ) => void;
  onTestBinding: (binding: ActionBinding) => void;
  onStopRepeat: () => void;
  onPullFromUsb: () => void;
  onJumpToControl?: (profileId: HardwareProfileId, slot: HardwareSlotId) => void;
  onToast?: (msg: string, variant?: ToastVariant) => void;
}

const MOD_LIST = [
  { id: 'cmd', label: '⌘ Cmd' },
  { id: 'ctrl', label: '⌃ Ctrl' },
  { id: 'alt', label: '⌥ Opt' },
  { id: 'shift', label: '⇧ Shift' },
  { id: 'win', label: '⊞ Win' }
];

const QUICK_DELAY_PRESETS = [0, 100, 250, 500, 1000];
const PAUSE_STEP_PRESETS = [100, 250, 500, 1000, 2000, 5000, 10000];
const INLINE_CONNECTOR_CYCLE_MS = [0, 100, 250, 500, 1000];

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

export type RecipeCategory = 'productivity' | 'forms' | 'dev' | 'stream' | 'tv';

export interface StarterTemplate {
  id: string;
  name: string;
  summary: string;
  category?: RecipeCategory;
  steps: Omit<MacroStepConfig, 'id'>[];
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: 'tpl-spotlight-app',
    name: 'Launch Terminal',
    summary: '3 steps · 350 ms',
    category: 'dev',
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
    name: 'Paste & Submit',
    summary: '2 steps · 120 ms',
    category: 'productivity',
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
    id: 'tpl-login-2fa-flow',
    name: 'Multi-Screen Login + 2FA Paste',
    summary: '7 steps · 2.4 s',
    category: 'forms',
    steps: [
      {
        label: 'Type Username',
        actionType: 'text',
        value: 'user@company.com',
        delayMs: 100,
        repeatCount: 1
      },
      {
        label: 'Next Field (Tab)',
        actionType: 'key',
        value: 'tab',
        delayMs: 100,
        repeatCount: 1
      },
      {
        label: 'Type Password',
        actionType: 'text',
        value: 'MyPassword123',
        delayMs: 100,
        repeatCount: 1
      },
      {
        label: 'Submit Credentials',
        actionType: 'key',
        value: 'enter',
        delayMs: 0,
        repeatCount: 1
      },
      {
        label: 'Wait for 2FA Screen',
        actionType: 'delay',
        value: '',
        delayMs: 2000,
        repeatCount: 1
      },
      {
        label: 'Paste Copied 2FA Code',
        actionType: 'os_action',
        value: 'MACRO:PASTE',
        delayMs: 120,
        repeatCount: 1
      },
      {
        label: 'Verify 2FA',
        actionType: 'key',
        value: 'enter',
        delayMs: 0,
        repeatCount: 1
      }
    ]
  },
  {
    id: 'tpl-git-sync',
    name: 'Git Status & Pull',
    summary: '4 steps · 550 ms',
    category: 'dev',
    steps: [
      {
        label: 'Check Repo Status',
        actionType: 'text',
        value: 'git status',
        delayMs: 100,
        repeatCount: 1
      },
      {
        label: 'Run Status',
        actionType: 'key',
        value: 'enter',
        delayMs: 350,
        repeatCount: 1
      },
      {
        label: 'Pull Latest Branch',
        actionType: 'text',
        value: 'git pull',
        delayMs: 100,
        repeatCount: 1
      },
      {
        label: 'Execute Pull',
        actionType: 'key',
        value: 'enter',
        delayMs: 0,
        repeatCount: 1
      }
    ]
  },
  {
    id: 'tpl-deep-work-window',
    name: 'New Browser Tab & Paste URL',
    summary: '3 steps · 300 ms',
    category: 'productivity',
    steps: [
      {
        label: 'Open New Tab',
        actionType: 'os_action',
        value: 'MACRO:NEW_TAB',
        delayMs: 180,
        repeatCount: 1
      },
      {
        label: 'Paste Copied Link',
        actionType: 'os_action',
        value: 'MACRO:PASTE',
        delayMs: 120,
        repeatCount: 1
      },
      {
        label: 'Navigate',
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
    category: 'stream',
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
    name: 'TV YouTube & Volume',
    summary: '3 steps · 1.5 s',
    category: 'tv',
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

interface DraftFingerprint {
  name: string;
  stepsKey: string;
  repeatKey: string;
}

function serializeDraftSteps(steps: MacroStepConfig[]): string {
  return steps
    .map(
      s =>
        `${s.actionType}:${s.value}@${Math.max(0, s.delayMs || 0)}x${Math.max(
          1,
          s.repeatCount || 1
        )}`
    )
    .join('|');
}

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

function sanitizeSnippetAscii(input: string): string {
  let out = '';
  for (let i = 0; i < input.length && out.length < 123; i++) {
    const ch = input[i];
    const code = input.charCodeAt(i);
    if (ch === '"' || ch === '“' || ch === '”' || ch === '\\') continue;
    if (code >= 0x20 && code <= 0x7e) {
      out += ch;
    }
  }
  return out;
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
  hostOsMap,
  tvEnabled,
  showAdvancedIds = false,
  onSaveMacro,
  onDeleteMacro,
  onCleanUpDuplicateMacros,
  onExportMacrosFile,
  onImportMacrosFile,
  onAssignSlot,
  onTestBinding,
  onStopRepeat,
  onPullFromUsb,
  onJumpToControl,
  onToast = () => {}
}) => {
  const isTvEnabled = tvEnabled ?? (connection.telemetry?.tvEnabled !== false);
  const visibleStepTypes = useMemo(
    () => (isTvEnabled ? STEP_TYPE_ORDER : STEP_TYPE_ORDER.filter(t => t !== 'tv')),
    [isTvEnabled]
  );
  const initialHydratedSteps = useMemo(
    () =>
      STARTER_TEMPLATES[0].steps.map((s, idx) => ({
        ...s,
        id: `init-step-${idx + 1}`
      })),
    []
  );

  const [libraryQuery, setLibraryQuery] = useState('');
  const [libraryTab, setLibraryTab] = useState<'all' | 'saved' | 'templates'>('all');
  const [recipeCategoryFilter, setRecipeCategoryFilter] = useState<'all' | RecipeCategory>('all');
  const [importDrawerOpen, setImportDrawerOpen] = useState(false);
  const [importProfileId, setImportProfileId] =
    useState<HardwareProfileId>(activeProfileId);

  const [selectedMacroId, setSelectedMacroId] = useState<string | null>(null);
  const [macroName, setMacroName] = useState(STARTER_TEMPLATES[0].name);
  const [autoNamingActive, setAutoNamingActive] = useState<boolean>(false);

  const [justSavedFeedback, setJustSavedFeedback] = useState<{
    mode: 'saved' | 'new';
    updatedSlots: number;
  } | null>(null);
  const [justAssignedSlot, setJustAssignedSlot] = useState<{
    profile: HardwareProfileId;
    slot: HardwareSlotId;
  } | null>(null);
  const [studioSenseOpen, setStudioSenseOpen] = useState<boolean>(false);
  const [builderMenuOpen, setBuilderMenuOpen] = useState<boolean>(false);
  const builderMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!builderMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (builderMenuRef.current && !builderMenuRef.current.contains(e.target as Node)) {
        setBuilderMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [builderMenuOpen]);

  const handleApplyStudioSenseSuggestion = (
    title: string,
    steps: Omit<MacroStepConfig, 'id'>[]
  ) => {
    const nextSteps: MacroStepConfig[] = steps.map((s, idx) => ({
      ...s,
      id: `sense-${Date.now()}-${idx}`
    }));
    setSelectedMacroId(null);
    setAutoNamingActive(false);
    setMacroName(title);
    setMacroSteps(nextSteps);
    setExpandedStepId(null);
    setRepeatCountInput('1');
    setLoopUntilStopped(false);
    setRepeatDelayInput('500');
    commitBaseline(title, nextSteps, '1', false, '500');
  };

  // Visual step sequence state + undo/redo stack
  const [macroSteps, setMacroSteps] = useState<MacroStepConfig[]>(initialHydratedSteps);
  const [stepPast, setStepPast] = useState<MacroStepConfig[][]>([]);
  const [stepFuture, setStepFuture] = useState<MacroStepConfig[][]>([]);

  const commitSteps = (
    updater: MacroStepConfig[] | ((prev: MacroStepConfig[]) => MacroStepConfig[]),
    recordHistory = true
  ) => {
    setMacroSteps(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (recordHistory && serializeDraftSteps(prev) !== serializeDraftSteps(next)) {
        setStepPast(h => [...h.slice(-24), prev]);
        setStepFuture([]);
      }
      return next;
    });
  };

  const handleUndoSteps = () => {
    if (stepPast.length === 0) return;
    const previous = stepPast[stepPast.length - 1];
    setStepPast(h => h.slice(0, -1));
    setStepFuture(f => [macroSteps, ...f.slice(0, 24)]);
    setMacroSteps(previous);
  };

  const handleRedoSteps = () => {
    if (stepFuture.length === 0) return;
    const next = stepFuture[0];
    setStepFuture(f => f.slice(1));
    setStepPast(h => [...h.slice(-24), macroSteps]);
    setMacroSteps(next);
  };

  // Progressive disclosure: only one step expanded at a time (null = all collapsed)
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);

  // Smart Action Composer (Form / Multi-Screen Builder + Script Line Splitter)
  const [smartComposerOpen, setSmartComposerOpen] = useState<boolean>(false);
  const [composerMode, setComposerMode] = useState<'form' | 'script'>('form');
  const [formField1, setFormField1] = useState<string>('');
  const [formSeparatorKey, setFormSeparatorKey] = useState<'tab' | 'enter'>('tab');
  const [formField2, setFormField2] = useState<string>('');
  const [formScreenWaitMs, setFormScreenWaitMs] = useState<string>('2000');
  const [formStage2Mode, setFormStage2Mode] = useState<'none' | 'paste_mac' | 'paste_win' | 'text'>('none');
  const [formStage2Text, setFormStage2Text] = useState<string>('');
  const [scriptLinesDraft, setScriptLinesDraft] = useState<string>('');
  const [scriptLineWaitMs, setScriptLineWaitMs] = useState<string>('250');

  // Sequence-level repeat / loop controls
  const [repeatCountInput, setRepeatCountInput] = useState<string>('1');
  const [loopUntilStopped, setLoopUntilStopped] = useState<boolean>(false);
  const [repeatDelayInput, setRepeatDelayInput] = useState<string>('500');

  // Unsaved draft guard state
  const [baseline, setBaseline] = useState<DraftFingerprint>(() => ({
    name: STARTER_TEMPLATES[0].name,
    stepsKey: serializeDraftSteps(initialHydratedSteps),
    repeatKey: '1:false:500'
  }));
  const [pendingNavigation, setPendingNavigation] = useState<{
    label: string;
    run: () => void;
  } | null>(null);

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

  // Live Multi-Step Sequence Recorder (with Logi-style Smart Text Coalescing)
  const [isRecordingSequence, setIsRecordingSequence] = useState<boolean>(false);
  const [captureSequenceTiming, setCaptureSequenceTiming] = useState<boolean>(true);
  const [coalesceTypedText, setCoalesceTypedText] = useState<boolean>(true);
  const [sequenceRecordedCount, setSequenceRecordedCount] = useState<number>(0);
  const [sequenceRecorderNotice, setSequenceRecorderNotice] = useState<string | null>(null);
  const lastSeqKeystrokeTsRef = useRef<number | null>(null);
  const importMacrosInputRef = useRef<HTMLInputElement>(null);

  // Target control assignment
  const [targetProfile, setTargetProfile] = useState<HardwareProfileId>(activeProfileId);
  const [targetSlot, setTargetSlot] = useState<HardwareSlotId>(initialTargetSlot);

  useEffect(() => {
    setTargetProfile(activeProfileId === 'TV' && !isTvEnabled ? 'HOST1' : activeProfileId);
    setImportProfileId(activeProfileId === 'TV' && !isTvEnabled ? 'HOST1' : activeProfileId);
  }, [activeProfileId, isTvEnabled]);

  useEffect(() => {
    if (!isTvEnabled) {
      if (recipeCategoryFilter === 'tv') setRecipeCategoryFilter('all');
      if (targetProfile === 'TV') setTargetProfile('HOST1');
      if (importProfileId === 'TV') setImportProfileId('HOST1');
    }
  }, [isTvEnabled, recipeCategoryFilter, targetProfile, importProfileId]);

  useEffect(() => {
    setTargetSlot(initialTargetSlot);
  }, [initialTargetSlot]);

  useEffect(() => {
    if (!justSavedFeedback) return;
    const t = setTimeout(() => setJustSavedFeedback(null), 2600);
    return () => clearTimeout(t);
  }, [justSavedFeedback]);

  useEffect(() => {
    if (!justAssignedSlot) return;
    const t = setTimeout(() => setJustAssignedSlot(null), 3500);
    return () => clearTimeout(t);
  }, [justAssignedSlot]);

  const commitBaseline = (
    nameVal: string,
    stepsVal: MacroStepConfig[],
    repCount: string,
    loopVal: boolean,
    repDelay: string
  ) => {
    setBaseline({
      name: nameVal.trim(),
      stepsKey: serializeDraftSteps(stepsVal),
      repeatKey: `${repCount}:${loopVal}:${repDelay}`
    });
    setPendingNavigation(null);
  };

  useEffect(() => {
    if (!externalTarget) return;
    setSelectedMacroId(externalTarget.macroId ?? null);
    setRecordingStepId(null);
    setIsRecordingSequence(false);
    setStepRecorderError(null);
    setSequenceRecorderNotice(null);
    setStepPast([]);
    setStepFuture([]);

    if (externalTarget.targetProfile) {
      setTargetProfile(externalTarget.targetProfile);
    }
    if (externalTarget.targetSlot) {
      setTargetSlot(externalTarget.targetSlot);
    }

    let nextSteps: MacroStepConfig[];
    let repCountStr = '1';
    let loopBool = false;
    let repDelayStr = '500';

    if (externalTarget.stepsOverride && externalTarget.stepsOverride.length > 0) {
      nextSteps = externalTarget.stepsOverride.map((s, idx) => ({
        ...s,
        id: `ext-${externalTarget.requestId}-${idx}`
      }));
      setExpandedStepId(nextSteps.length === 1 ? nextSteps[0].id : null);
    } else if (externalTarget.action) {
      const convertedSteps = actionToMacroSteps(
        externalTarget.action,
        externalTarget.repeatConfig
      );
      nextSteps =
        convertedSteps.length > 0 ? convertedSteps : [createDefaultStep('shortcut', 1)];
      setExpandedStepId(nextSteps.length === 1 ? nextSteps[0].id : null);
      repCountStr = String(externalTarget.repeatConfig?.repeatCount || 1);
      loopBool = Boolean(externalTarget.repeatConfig?.loopUntilStopped);
      repDelayStr = String(externalTarget.repeatConfig?.repeatDelayMs || 500);
    } else {
      const first = { ...createDefaultStep('shortcut', 1), delayMs: 0 };
      nextSteps = [first];
      setExpandedStepId(first.id);
    }

    const useAuto = isGenericMacroName(externalTarget.name);
    const resolvedName = useAuto
      ? suggestSmartMacroName(nextSteps, externalTarget.repeatConfig)
      : externalTarget.name;

    setAutoNamingActive(useAuto);
    setMacroName(resolvedName);
    setMacroSteps(nextSteps);
    setRepeatCountInput(repCountStr);
    setLoopUntilStopped(loopBool);
    setRepeatDelayInput(repDelayStr);
    commitBaseline(resolvedName, nextSteps, repCountStr, loopBool, repDelayStr);
  }, [externalTarget]);

  // Reset drag arming on global mouseup
  useEffect(() => {
    if (!dragArmedStepId) return;
    const handleUp = () => setDragArmedStepId(null);
    window.addEventListener('mouseup', handleUp);
    return () => window.removeEventListener('mouseup', handleUp);
  }, [dragArmedStepId]);

  // Single-step Keyboard Recorder
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
      commitSteps(prev =>
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

  // Live Multi-Step Sequence Recorder with Smart Text Coalescing
  useEffect(() => {
    if (!isRecordingSequence) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        setIsRecordingSequence(false);
        lastSeqKeystrokeTsRef.current = null;
        return;
      }

      if (['Meta', 'Control', 'Shift', 'Alt'].includes(e.key)) return;

      const hasSystemMod = e.metaKey || e.ctrlKey || e.altKey;
      const capturedMods: string[] = [];
      if (e.metaKey) capturedMods.push('cmd');
      if (e.ctrlKey) capturedMods.push('ctrl');
      if (e.altKey) capturedMods.push('alt');
      if (e.shiftKey) capturedMods.push('shift');

      const fwKey = normalizeBrowserKeyToFirmware(e.code, e.key, keyboardLayout);
      if (!isSupportedFirmwareKey(fwKey)) {
        setSequenceRecorderNotice(
          `Skipped unsupported key "${e.key || e.code}". Press Esc when finished.`
        );
        return;
      }

      const now = performance.now();
      const prevTs = lastSeqKeystrokeTsRef.current;
      lastSeqKeystrokeTsRef.current = now;

      let measuredGapMs = 120;
      if (captureSequenceTiming && prevTs !== null) {
        const rawDelta = Math.round((now - prevTs) / 10) * 10;
        measuredGapMs = Math.max(40, Math.min(5000, rawDelta));
      } else if (!captureSequenceTiming) {
        measuredGapMs = 100;
      }

      const printableChar =
        coalesceTypedText && !hasSystemMod
          ? fwKeyToPrintableAscii(fwKey, e.shiftKey)
          : null;

      setSequenceRecorderNotice(null);
      setSequenceRecordedCount(c => c + 1);

      commitSteps(prev => {
        // Smart Backspace editing when typing into a coalesced TEXT step
        if (
          coalesceTypedText &&
          !hasSystemMod &&
          !e.shiftKey &&
          fwKey === 'backspace' &&
          prev.length > 0 &&
          prev[prev.length - 1].actionType === 'text' &&
          prev[prev.length - 1].value.length > 0
        ) {
          const last = prev[prev.length - 1];
          const trimmedVal = last.value.slice(0, -1);
          if (!trimmedVal) {
            return prev.slice(0, -1);
          }
          return [
            ...prev.slice(0, -1),
            {
              ...last,
              value: trimmedVal
            }
          ];
        }

        // Coalesce consecutive printable characters into a single TEXT step (up to 120 chars)
        if (printableChar !== null) {
          const last = prev[prev.length - 1];
          // Merge into trailing TEXT step unless user paused > 1.8s between typing bursts
          const withinTypingBurst = prevTs === null || now - prevTs < 1800;
          if (
            last &&
            last.actionType === 'text' &&
            last.value.length < 120 &&
            withinTypingBurst
          ) {
            return [
              ...prev.slice(0, -1),
              {
                ...last,
                value: `${last.value}${printableChar}`
              }
            ];
          }

          const newTextStep: MacroStepConfig = {
            id: `rec-txt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            label: 'Type Text',
            actionType: 'text',
            value: printableChar,
            delayMs: 0,
            repeatCount: 1
          };

          if (prev.length === 0) return [newTextStep];
          const updatedPrev = prev.map((st, idx) =>
            idx === prev.length - 1 && st.actionType !== 'delay'
              ? { ...st, delayMs: prevTs !== null ? measuredGapMs : st.delayMs || 120 }
              : st
          );
          return [...updatedPrev, newTextStep];
        }

        const isSingleKey = capturedMods.length === 0;
        const newStep: MacroStepConfig = {
          id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          label: isSingleKey ? `Press ${fwKey.toUpperCase()}` : 'Recorded Shortcut',
          actionType: isSingleKey ? 'key' : 'shortcut',
          value: isSingleKey ? fwKey : buildFirmwareShortcut(capturedMods, fwKey),
          delayMs: 0,
          repeatCount: 1
        };

        if (prev.length === 0) return [newStep];
        const updatedPrev = prev.map((st, idx) =>
          idx === prev.length - 1 && st.actionType !== 'delay'
            ? { ...st, delayMs: prevTs !== null ? measuredGapMs : st.delayMs || 120 }
            : st
        );
        return [...updatedPrev, newStep];
      });
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isRecordingSequence, captureSequenceTiming, coalesceTypedText, keyboardLayout]);

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

  const smartNameSuggestion = useMemo(
    () => suggestSmartMacroName(macroSteps, builtRepeatConfig),
    [macroSteps, builtRepeatConfig]
  );

  useEffect(() => {
    if (autoNamingActive && smartNameSuggestion) {
      setMacroName(smartNameSuggestion);
    }
  }, [autoNamingActive, smartNameSuggestion]);

  const currentRepeatKey = `${repeatCountInput}:${loopUntilStopped}:${repeatDelayInput}`;
  const isDraftDirty = useMemo(() => {
    return (
      macroName.trim() !== baseline.name ||
      serializeDraftSteps(macroSteps) !== baseline.stepsKey ||
      currentRepeatKey !== baseline.repeatKey
    );
  }, [macroName, macroSteps, currentRepeatKey, baseline]);

  const runWithUnsavedCheck = (label: string, action: () => void) => {
    if (isDraftDirty && !isSequenceValid) {
      setPendingNavigation({ label, run: action });
      return;
    }
    action();
  };

  const loadIntoBuilderImmediate = (
    macroId: string | null,
    action: string,
    nameLabel: string,
    repeatConfig?: TextMacroRepeatConfig
  ) => {
    setSelectedMacroId(macroId);
    setRecordingStepId(null);
    setIsRecordingSequence(false);
    setStepRecorderError(null);
    setSequenceRecorderNotice(null);
    setStepPast([]);
    setStepFuture([]);

    const convertedSteps = actionToMacroSteps(action, repeatConfig);
    const nextSteps =
      convertedSteps.length > 0 ? convertedSteps : [createDefaultStep('shortcut', 1)];
    const repCountStr = String(repeatConfig?.repeatCount || 1);
    const loopBool = Boolean(repeatConfig?.loopUntilStopped);
    const repDelayStr = String(repeatConfig?.repeatDelayMs || 500);

    const useAuto = isGenericMacroName(nameLabel);
    const resolvedName = useAuto
      ? suggestSmartMacroName(nextSteps, repeatConfig)
      : nameLabel;

    setAutoNamingActive(useAuto);
    setMacroName(resolvedName);
    setMacroSteps(nextSteps);
    setExpandedStepId(nextSteps.length === 1 ? nextSteps[0].id : null);
    setRepeatCountInput(repCountStr);
    setLoopUntilStopped(loopBool);
    setRepeatDelayInput(repDelayStr);
    commitBaseline(resolvedName, nextSteps, repCountStr, loopBool, repDelayStr);
  };

  const applyStarterTemplateImmediate = (tpl: StarterTemplate) => {
    setSelectedMacroId(null);
    setRecordingStepId(null);
    setIsRecordingSequence(false);
    setStepRecorderError(null);
    setSequenceRecorderNotice(null);
    setStepPast([]);
    setStepFuture([]);
    setAutoNamingActive(false);
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
    commitBaseline(tpl.name, nextSteps, '1', false, '500');
  };

  const startBlankMacroImmediate = () => {
    setSelectedMacroId(null);
    setRecordingStepId(null);
    setIsRecordingSequence(false);
    setStepRecorderError(null);
    setSequenceRecorderNotice(null);
    setStepPast([]);
    setStepFuture([]);
    const first = { ...createDefaultStep('shortcut', 1), delayMs: 0 };
    const nextSteps = [first];
    const autoTitle = suggestSmartMacroName(nextSteps);
    setAutoNamingActive(true);
    setMacroName(autoTitle);
    setMacroSteps(nextSteps);
    setExpandedStepId(first.id);
    setRepeatCountInput('1');
    setLoopUntilStopped(false);
    setRepeatDelayInput('500');
    commitBaseline(autoTitle, nextSteps, '1', false, '500');
  };

  const handleToggleSequenceRecorder = (clearExisting = false) => {
    setRecordingStepId(null);
    setStepRecorderError(null);
    setSequenceRecorderNotice(null);

    if (isRecordingSequence && !clearExisting) {
      setIsRecordingSequence(false);
      lastSeqKeystrokeTsRef.current = null;
      return;
    }

    if (clearExisting) {
      commitSteps([]);
      setAutoNamingActive(true);
    }
    setExpandedStepId(null);
    setSequenceRecordedCount(0);
    lastSeqKeystrokeTsRef.current = null;
    setIsRecordingSequence(true);
  };

  const updateStep = (stepId: string, patch: Partial<MacroStepConfig>) => {
    commitSteps(prev =>
      prev.map(step => (step.id === stepId ? { ...step, ...patch } : step))
    );
  };

  const changeStepType = (stepId: string, nextType: MacroStepActionType) => {
    const template = createDefaultStep(nextType);
    setRecordingStepId(null);
    setStepRecorderError(null);
    commitSteps(prev =>
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
    commitSteps(prev => {
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
    commitSteps(prev => {
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
    commitSteps(prev => {
      const copy = [...prev];
      copy.splice(index + 1, 0, clone);
      return copy;
    });
    setExpandedStepId(clone.id);
  };

  const removeStep = (stepId: string) => {
    if (recordingStepId === stepId) setRecordingStepId(null);
    if (expandedStepId === stepId) setExpandedStepId(null);
    commitSteps(prev => prev.filter(s => s.id !== stepId));
  };

  const moveStepByOffset = (index: number, delta: -1 | 1) => {
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= macroSteps.length) return;
    commitSteps(prev => {
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
    commitSteps(prev => {
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

  // Batch Pacing Adjuster (Logi Options+ style global delay preset)
  const applyBatchPacing = (delayMs: number) => {
    commitSteps(prev =>
      prev.map((step, idx) => {
        if (step.actionType === 'delay') return step;
        const isLast = idx === prev.length - 1;
        if (isLast && (step.repeatCount || 1) <= 1 && !loopUntilStopped && parsedRepeatCount <= 1) {
          return { ...step, delayMs: 0 };
        }
        return { ...step, delayMs };
      })
    );
  };

  // Smart Flow Composer Generators
  const handleGenerateFormSteps = (append: boolean) => {
    const cleanF1 = sanitizeSnippetAscii(formField1);
    const cleanF2 = sanitizeSnippetAscii(formField2);
    const cleanStage2 = sanitizeSnippetAscii(formStage2Text);
    const waitMs = Math.max(0, Math.min(60000, parseInt(formScreenWaitMs, 10) || 0));

    const generated: MacroStepConfig[] = [];
    const ts = Date.now();

    if (cleanF1) {
      generated.push({
        id: `form-${ts}-1`,
        label: 'Field 1 Text',
        actionType: 'text',
        value: cleanF1,
        delayMs: 100,
        repeatCount: 1
      });
    }

    if (cleanF1 && cleanF2) {
      generated.push({
        id: `form-${ts}-sep`,
        label: `Press ${formSeparatorKey.toUpperCase()}`,
        actionType: 'key',
        value: formSeparatorKey,
        delayMs: 100,
        repeatCount: 1
      });
    }

    if (cleanF2) {
      generated.push({
        id: `form-${ts}-2`,
        label: 'Field 2 Text',
        actionType: 'text',
        value: cleanF2,
        delayMs: 100,
        repeatCount: 1
      });
    }

    if (cleanF1 || cleanF2) {
      generated.push({
        id: `form-${ts}-enter1`,
        label: 'Submit Screen 1',
        actionType: 'key',
        value: 'enter',
        delayMs: 0,
        repeatCount: 1
      });
    }

    if (formStage2Mode !== 'none') {
      if (waitMs > 0) {
        let remainingWait = waitMs;
        let waitChunkIdx = 1;
        while (remainingWait > 0) {
          const chunkMs = Math.min(MAX_FIRMWARE_DELAY_STEP_MS, remainingWait);
          generated.push({
            id: `form-${ts}-wait-${waitChunkIdx}`,
            label:
              waitMs > MAX_FIRMWARE_DELAY_STEP_MS
                ? `Wait for Next Screen (${waitChunkIdx})`
                : 'Wait for Next Screen',
            actionType: 'delay',
            value: '',
            delayMs: chunkMs,
            repeatCount: 1
          });
          remainingWait -= chunkMs;
          waitChunkIdx += 1;
        }
      }

      if (formStage2Mode === 'paste_mac' || formStage2Mode === 'paste_win') {
        generated.push({
          id: `form-${ts}-paste`,
          label: 'Paste Clipboard Code',
          actionType: 'os_action',
          value: formStage2Mode === 'paste_mac' ? 'MACRO:PASTE' : 'WIN:PASTE',
          delayMs: 120,
          repeatCount: 1
        });
        generated.push({
          id: `form-${ts}-enter2`,
          label: 'Confirm Stage 2',
          actionType: 'key',
          value: 'enter',
          delayMs: 0,
          repeatCount: 1
        });
      } else if (formStage2Mode === 'text' && cleanStage2) {
        generated.push({
          id: `form-${ts}-s2txt`,
          label: 'Stage 2 Text',
          actionType: 'text',
          value: cleanStage2,
          delayMs: 120,
          repeatCount: 1
        });
        generated.push({
          id: `form-${ts}-enter2`,
          label: 'Confirm Stage 2',
          actionType: 'key',
          value: 'enter',
          delayMs: 0,
          repeatCount: 1
        });
      }
    }

    if (generated.length === 0) return;
    commitSteps(prev => (append ? [...prev, ...generated] : generated));
    if (!append) {
      setAutoNamingActive(true);
    }
    setExpandedStepId(null);
    setSmartComposerOpen(false);
  };

  const handleGenerateScriptSteps = (append: boolean) => {
    const rawLines = scriptLinesDraft
      .split(/\r?\n/)
      .map(l => sanitizeSnippetAscii(l.trim()))
      .filter(Boolean);
    if (rawLines.length === 0) return;

    const lineGap = Math.max(50, Math.min(10000, parseInt(scriptLineWaitMs, 10) || 250));
    const ts = Date.now();
    const generated: MacroStepConfig[] = [];

    rawLines.forEach((line, idx) => {
      const isLastLine = idx === rawLines.length - 1;
      generated.push({
        id: `scr-${ts}-${idx}-txt`,
        label: `Line ${idx + 1}`,
        actionType: 'text',
        value: line,
        delayMs: 100,
        repeatCount: 1
      });
      generated.push({
        id: `scr-${ts}-${idx}-ret`,
        label: 'Run Line',
        actionType: 'key',
        value: 'enter',
        delayMs: isLastLine ? 0 : lineGap,
        repeatCount: 1
      });
    });

    commitSteps(prev => (append ? [...prev, ...generated] : generated));
    if (!append) {
      setAutoNamingActive(true);
    }
    setExpandedStepId(null);
    setSmartComposerOpen(false);
  };

  // Sequence timing, completeness validation, and optimizer analysis
  const timingSummary = useMemo(() => calculateStepsTiming(macroSteps), [macroSteps]);

  const nativeDelaySupported = firmwareSupportsNativeDelay(connection);

  const draftValidation = useMemo(
    () =>
      validateMacroSequenceDraft(macroSteps, builtRepeatConfig, {
        nativeDelay: nativeDelaySupported
      }),
    [macroSteps, builtRepeatConfig, nativeDelaySupported]
  );

  const issueStepIds = useMemo(() => {
    const set = new Set<string>();
    draftValidation.issues.forEach(iss => {
      if (iss.stepId) set.add(iss.stepId);
    });
    return set;
  }, [draftValidation.issues]);

  const optimization = useMemo(
    () => analyzeMacroOptimizations(macroSteps, builtRepeatConfig),
    [macroSteps, builtRepeatConfig]
  );

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
    if (!draftValidation.valid) return '';
    if (isSingleNativeStep) {
      return canonicalizeFirmwareAction(stepToFirmwareAction(macroSteps[0]));
    }
    return draftValidation.builtAction;
  }, [draftValidation, isSingleNativeStep, macroSteps]);

  const isSequenceValid = draftValidation.valid && Boolean(builtAction);
  const builtBinding = useMemo(
    () => firmwareActionToBinding(builtAction, effectiveRepeatConfig),
    [builtAction, effectiveRepeatConfig]
  );

  const currentSignature = useMemo(
    () => (isSequenceValid ? getMacroCanonicalSignature(builtAction, effectiveRepeatConfig) : ''),
    [isSequenceValid, builtAction, effectiveRepeatConfig]
  );

  // Detect native firmware built-in equivalence when user builds a raw SHORTCUT: step
  const nativeBuiltInMatch = useMemo(() => {
    if (!isSingleNativeStep || !macroSteps[0] || macroSteps[0].actionType !== 'shortcut') {
      return null;
    }
    return findEquivalentBuiltInSpec(macroSteps[0].value);
  }, [isSingleNativeStep, macroSteps]);

  // Map canonical signatures to all bound hardware slots across Host 1–3 + TV
  const signatureSlotUsageMap = useMemo(() => {
    const map = new Map<
      string,
      { profileId: HardwareProfileId; profileName: string; slot: HardwareSlotId }[]
    >();
    profiles.forEach(prof => {
      const slots = extractProfileSlots(prof);
      HARDWARE_SLOTS.forEach(slot => {
        const act = slots[slot];
        if (!act) return;
        const bind = getBindingForProfileSlot(profiles, prof.id, slot);
        const sig = getMacroCanonicalSignature(act, bind?.repeatConfig);
        if (!sig) return;
        const list = map.get(sig) || [];
        list.push({ profileId: prof.id, profileName: prof.name, slot });
        map.set(sig, list);
      });
    });
    return map;
  }, [profiles]);

  const activeMacroBoundSlots = useMemo(() => {
    if (selectedMacroId) {
      const savedObj = customMacros.find(m => m.id === selectedMacroId);
      if (savedObj) {
        const savedSig = getMacroCanonicalSignature(savedObj.action, savedObj.repeatConfig);
        if (savedSig) return signatureSlotUsageMap.get(savedSig) || [];
      }
    }
    if (!currentSignature) return [];
    return signatureSlotUsageMap.get(currentSignature) || [];
  }, [selectedMacroId, customMacros, currentSignature, signatureSlotUsageMap]);

  // Canonical duplicate or name collision check
  const duplicateMacroMatch = useMemo((): {
    item: CustomMacroItem;
    reason: 'identical_actions' | 'same_name';
  } | null => {
    const trimmedName = macroName.trim().toLowerCase();
    for (const m of customMacros) {
      if (m.id === selectedMacroId) continue;
      if (currentSignature) {
        const mSig = getMacroCanonicalSignature(m.action, m.repeatConfig);
        if (mSig && mSig === currentSignature) {
          return { item: m, reason: 'identical_actions' };
        }
      }
      if (
        trimmedName &&
        !isGenericMacroName(macroName) &&
        m.name.trim().toLowerCase() === trimmedName
      ) {
        return { item: m, reason: 'same_name' };
      }
    }
    return null;
  }, [customMacros, selectedMacroId, currentSignature, macroName]);

  const needsLiveRunner = requiresUsbSequenceExecution(effectiveRepeatConfig, {
    nativeDelay: nativeDelaySupported
  });
  const testAvail = getActionTestAvailability(builtAction, connection);
  const isSimulating = Boolean(activeRepeatJob?.id.startsWith('sim-'));
  const isJobRunning = Boolean(activeRepeatJob);

  const handlePreviewSimulation = () => {
    if (!isSequenceValid) return;
    repeatMacroRunner.simulateInUi(builtRepeatConfig).catch(() => {});
  };

  const handleTestSingleStep = (step: MacroStepConfig) => {
    if (step.actionType === 'delay') return;
    const stepAction = canonicalizeFirmwareAction(stepToFirmwareAction(step));
    if (!stepAction) return;
    onTestBinding(firmwareActionToBinding(stepAction));
  };

  const handleSaveMacroItem = (options?: {
    forceNew?: boolean;
    targetExistingId?: string;
    silent?: boolean;
  }): CustomMacroItem | null => {
    if (!isSequenceValid) return null;
    const forceNew = Boolean(options?.forceNew);
    const silent = Boolean(options?.silent);
    const trimmedInput = macroName.trim();
    const resolvedName =
      !trimmedInput || isGenericMacroName(macroName)
        ? smartNameSuggestion
        : trimmedInput;

    const effectiveId = forceNew
      ? `macro-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      : options?.targetExistingId || selectedMacroId || `macro-${Date.now()}`;

    const item: CustomMacroItem = {
      id: effectiveId,
      name: forceNew ? `${resolvedName} Copy` : resolvedName,
      action: builtAction,
      repeatConfig: effectiveRepeatConfig,
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      source: 'user'
    };

    const result = onSaveMacro(item, { forceNew, silent });
    const savedItem = result && 'saved' in result && result.saved ? result.saved : item;
    const updatedSlots = result && 'updatedSlotCount' in result ? result.updatedSlotCount : 0;

    setSelectedMacroId(savedItem.id);
    if (!silent || !trimmedInput) {
      setMacroName(savedItem.name);
      setAutoNamingActive(false);
    }
    if (!silent) {
      setJustSavedFeedback({ mode: forceNew ? 'new' : 'saved', updatedSlots });
    }
    commitBaseline(
      silent && trimmedInput ? trimmedInput : savedItem.name,
      macroSteps,
      repeatCountInput,
      loopUntilStopped,
      repeatDelayInput
    );
    return savedItem;
  };

  // Autosave valid edits to the single macro library
  useEffect(() => {
    if (
      !isDraftDirty ||
      !isSequenceValid ||
      isRecordingSequence ||
      Boolean(recordingStepId) ||
      Boolean(duplicateMacroMatch)
    ) {
      return;
    }
    const timer = setTimeout(() => {
      handleSaveMacroItem({ silent: true });
    }, 450);
    return () => clearTimeout(timer);
  }, [
    isDraftDirty,
    isSequenceValid,
    isRecordingSequence,
    recordingStepId,
    duplicateMacroMatch,
    macroName,
    builtAction,
    repeatCountInput,
    loopUntilStopped,
    repeatDelayInput
  ]);

  const handleAssignToControl = () => {
    if (!isSequenceValid) return;
    handleSaveMacroItem({ silent: true });
    onAssignSlot(targetProfile, targetSlot, builtBinding);
    setJustAssignedSlot({ profile: targetProfile, slot: targetSlot });
  };

  const targetHostOs = isBleHostProfile(targetProfile)
    ? hostOsMap?.[targetProfile as BleHostProfileId] || 'mac'
    : 'mac';

  // Categorized static catalog options (OS-aware for target device)
  const mediaCatalog = useMemo(
    () => FIRMWARE_STATIC_CATALOG.filter(item => item.category === 'media'),
    []
  );
  const osCatalog = useMemo(
    () =>
      FIRMWARE_STATIC_CATALOG.filter(item =>
        targetHostOs === 'mac'
          ? item.category === 'mac_macro'
          : item.category === 'win_macro'
      ),
    [targetHostOs]
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
    return customMacros.filter(
      m =>
        m.name.toLowerCase().includes(normalizedQuery) ||
        m.action.toLowerCase().includes(normalizedQuery)
    );
  }, [customMacros, normalizedQuery]);

  const filteredTemplates = useMemo(() => {
    return STARTER_TEMPLATES.filter(tpl => {
      if (!isTvEnabled && tpl.category === 'tv') {
        return false;
      }
      if (recipeCategoryFilter !== 'all' && tpl.category !== recipeCategoryFilter) {
        return false;
      }
      if (!normalizedQuery) return true;
      return (
        tpl.name.toLowerCase().includes(normalizedQuery) ||
        tpl.steps.some(
          s =>
            s.label.toLowerCase().includes(normalizedQuery) ||
            s.value.toLowerCase().includes(normalizedQuery)
        )
      );
    });
  }, [normalizedQuery, recipeCategoryFilter, isTvEnabled]);

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

  const showSmartRenameHint =
    !autoNamingActive &&
    Boolean(smartNameSuggestion) &&
    smartNameSuggestion.toLowerCase() !== macroName.trim().toLowerCase() &&
    (isGenericMacroName(macroName) || macroName.trim().length === 0);

  const memoryOverflow = draftValidation.byteLength > draftValidation.maxBytes;

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden min-w-0 bg-[var(--bg-canvas)]">
      {/* Left Library Rail: Smart Actions Library, Recipes & Pad Loader */}
      <aside className="w-full lg:w-72 xl:w-80 shrink-0 bg-[var(--bg-panel)] border-b lg:border-b-0 lg:border-r border-[var(--border-subtle)] flex flex-col lg:overflow-hidden">
        <div className="p-4 border-b border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Smart Actions
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                Saved macros & multi-step recipes
              </p>
            </div>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={libraryQuery}
              onChange={e => setLibraryQuery(e.target.value)}
              placeholder="Search macros or recipes…"
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

          {/* Segmented Library Filter */}
          <div
            role="tablist"
            aria-label="Library view filter"
            className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)]"
          >
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'saved', label: `Saved (${customMacros.length})` },
                { id: 'templates', label: 'Recipes' }
              ] as const
            ).map(tab => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={libraryTab === tab.id}
                onClick={() => setLibraryTab(tab.id)}
                className={`py-1 px-2 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap truncate tabular-nums ${
                  libraryTab === tab.id
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 lg:overflow-y-auto p-4 space-y-6">
          {/* Saved Macros */}
          {(libraryTab === 'all' || libraryTab === 'saved') && (
            <section className="space-y-2">
              <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span className="font-medium text-[var(--text-secondary)]">My Macros</span>
                <span className="font-mono tabular-nums">{filteredSavedMacros.length}</span>
              </div>

              {customMacros.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] leading-relaxed py-1">
                  Sequences you save or assign appear here, automatically named from their steps.
                </p>
              ) : filteredSavedMacros.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] py-1">
                  No saved macros match "{libraryQuery}".
                </p>
              ) : (
                <div className="space-y-1.5">
                  {filteredSavedMacros.map(m => {
                    const stepsForMacro = actionToMacroSteps(m.action, m.repeatConfig);
                    const { estimatedRunMs } = calculateStepsTiming(stepsForMacro);
                    const isSelected = selectedMacroId === m.id;
                    const mSig = getMacroCanonicalSignature(m.action, m.repeatConfig);
                    const boundSlots = mSig ? signatureSlotUsageMap.get(mSig) || [] : [];
                    const firstBound = boundSlots[0];

                    return (
                      <div
                        key={m.id}
                        className={`group px-2.5 py-2 rounded-xl border flex items-start justify-between gap-2 transition-colors ${
                          isSelected
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                            : 'bg-[var(--bg-input)]/45 border-[var(--border-subtle)] hover:bg-[var(--bg-input)] hover:border-[var(--border-strong)]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            runWithUnsavedCheck(`"${m.name}"`, () =>
                              loadIntoBuilderImmediate(m.id, m.action, m.name, m.repeatConfig)
                            )
                          }
                          className="min-w-0 flex-1 text-left cursor-pointer space-y-1"
                        >
                          <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                            {m.name}
                          </div>

                          <div className="min-w-0">
                            <ParsedActionBadge
                              action={m.action}
                              repeatConfig={m.repeatConfig}
                              maxSteps={2}
                              showRawId={showAdvancedIds}
                              customMacros={customMacros}
                            />
                          </div>

                          <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)] font-mono tabular-nums flex-wrap">
                            <span>
                              {stepsForMacro.length}{' '}
                              {stepsForMacro.length === 1 ? 'step' : 'steps'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>~{formatDurationCompact(estimatedRunMs)}</span>
                            <span aria-hidden="true">·</span>
                            {firstBound ? (
                              <span className="text-[var(--accent)] font-medium">
                                {profileShortTag(firstBound.profileId)}{' '}
                                {SLOT_LABELS[firstBound.slot].short}
                                {boundSlots.length > 1 ? ` +${boundSlots.length - 1}` : ''}
                              </span>
                            ) : (
                              <span className="text-[var(--text-muted)] font-sans">
                                Unassigned
                              </span>
                            )}
                            {!isTvEnabled && actionContainsTvSteps(m.action, m.repeatConfig) && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-amber-600 dark:text-amber-400 font-sans font-medium">
                                  TV off
                                </span>
                              </>
                            )}
                          </div>
                        </button>
                        <div className="flex items-center gap-0.5 shrink-0 opacity-65 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() =>
                              runWithUnsavedCheck(`copy of "${m.name}"`, () => {
                                loadIntoBuilderImmediate(
                                  null,
                                  m.action,
                                  `${m.name} Copy`,
                                  m.repeatConfig
                                );
                              })
                            }
                            className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
                            title="Clone as new draft"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteMacro(m.id);
                              if (selectedMacroId === m.id) setSelectedMacroId(null);
                            }}
                            className="p-1 rounded-md text-[var(--text-muted)] hover:text-rose-400 hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
                            title="Delete saved macro"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Smart Action Recipes */}
          {(libraryTab === 'all' || libraryTab === 'templates') && (
            <section
              className={`${
                libraryTab === 'all' ? 'pt-4 border-t border-[var(--border-subtle)]' : ''
              } space-y-2.5`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[var(--text-secondary)]">
                  Smart Action Templates
                </span>
                <span className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums">
                  {filteredTemplates.length}
                </span>
              </div>

              <div className="flex items-center gap-1 flex-wrap">
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'productivity', label: 'Work' },
                    { id: 'forms', label: 'Login' },
                    { id: 'dev', label: 'Dev' },
                    { id: 'stream', label: 'Stream' },
                    ...(isTvEnabled ? ([{ id: 'tv', label: 'TV' }] as const) : [])
                  ] as const
                ).map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setRecipeCategoryFilter(cat.id)}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-medium border transition-colors cursor-pointer ${
                      recipeCategoryFilter === cat.id
                        ? 'bg-[var(--bg-elevated)] border-[var(--border-strong)] text-[var(--text-primary)]'
                        : 'bg-transparent border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {filteredTemplates.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] py-1">
                  No templates match the current filter.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {filteredTemplates.map(tpl => {
                    const tplStepsHydrated = tpl.steps.map((s, idx) => ({
                      ...s,
                      id: `${tpl.id}-${idx}`
                    }));
                    const tplTiming = calculateStepsTiming(tplStepsHydrated);
                    const stepTags = tplStepsHydrated.slice(0, 3).map(s =>
                      parseMacroStepTag(s)
                    );
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() =>
                          runWithUnsavedCheck(`template "${tpl.name}"`, () =>
                            applyStarterTemplateImmediate(tpl)
                          )
                        }
                        className="w-full text-left px-2.5 py-2 rounded-xl bg-[var(--bg-input)]/40 border border-[var(--border-subtle)] hover:bg-[var(--bg-input)] hover:border-[var(--border-strong)] transition-colors cursor-pointer space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                            {tpl.name}
                          </span>
                          <span className="font-mono text-[10px] text-[var(--text-secondary)] tabular-nums shrink-0">
                            {tpl.steps.length} steps · ~{formatDurationCompact(tplTiming.estimatedRunMs)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] truncate">
                          {stepTags.map((tok, i) => (
                            <React.Fragment key={i}>
                              {i > 0 && (
                                <span className="text-[10px] text-[var(--text-muted)]" aria-hidden="true">
                                  →
                                </span>
                              )}
                              <span className="truncate">{tok.prettyValue}</span>
                            </React.Fragment>
                          ))}
                          {tpl.steps.length > 3 && (
                            <span className="font-mono text-[10px] text-[var(--text-muted)] tabular-nums shrink-0">
                              +{tpl.steps.length - 3}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Collapsible Import from Existing Pad Key */}
          <section className="pt-4 border-t border-[var(--border-subtle)] space-y-2.5">
            <button
              type="button"
              onClick={() => setImportDrawerOpen(prev => !prev)}
              className="w-full flex items-center justify-between text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <span>Load from Host Control</span>
              {importDrawerOpen ? (
                <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              )}
            </button>

            {importDrawerOpen && (
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between gap-1.5">
                  <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] flex-1 min-w-0">
                    {profiles.filter(p => p.id !== 'TV' || isTvEnabled).map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setImportProfileId(p.id)}
                        title={`${p.name} (${profileShortTag(p.id)})`}
                        className={`py-1 px-2 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap truncate ${
                          importProfileId === p.id
                            ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                        }`}
                      >
                        <span className="font-mono text-[10px] opacity-75 mr-1">
                          {profileShortTag(p.id)}
                        </span>
                        <span>{p.name}</span>
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

                <div className="space-y-1">
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
                          const slotSig = getMacroCanonicalSignature(
                            act,
                            slotBind?.repeatConfig
                          );
                          const existingMacro = slotSig
                            ? customMacros.find(
                                m =>
                                  getMacroCanonicalSignature(m.action, m.repeatConfig) ===
                                  slotSig
                              )
                            : undefined;

                          runWithUnsavedCheck(SLOT_LABELS[slot].short, () => {
                            setTargetProfile(importProfileId);
                            setTargetSlot(slot);
                            loadIntoBuilderImmediate(
                              existingMacro?.id ?? null,
                              act,
                              existingMacro?.name || desc.fullLabel,
                              slotBind?.repeatConfig
                            );
                          });
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[var(--bg-input)] disabled:opacity-40 disabled:pointer-events-none flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer"
                      >
                        <span className="font-mono text-[11px] text-[var(--text-secondary)] shrink-0">
                          {SLOT_LABELS[slot].short}
                        </span>
                        <div className="min-w-0 truncate">
                          {act ? (
                            <ParsedActionBadge
                              action={act}
                              repeatConfig={slotBind?.repeatConfig}
                              maxSteps={1}
                              showRawId={showAdvancedIds}
                              customMacros={customMacros}
                            />
                          ) : (
                            <span className="text-[var(--text-muted)] text-[11px]">
                              Empty
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Compact Library Tools Footer (Import / Export / Deduplicate) */}
        {(onExportMacrosFile || onImportMacrosFile || onCleanUpDuplicateMacros) && (
          <div className="p-3 border-t border-[var(--border-subtle)] flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5">
              {onExportMacrosFile && (
                <button
                  type="button"
                  disabled={customMacros.length === 0}
                  onClick={onExportMacrosFile}
                  title="Export saved macros to JSON"
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Download className="w-3 h-3" />
                  <span>Export</span>
                </button>
              )}
              {onImportMacrosFile && (
                <>
                  <button
                    type="button"
                    onClick={() => importMacrosInputRef.current?.click()}
                    title="Import macros from JSON"
                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Upload className="w-3 h-3" />
                    <span>Import</span>
                  </button>
                  <input
                    ref={importMacrosInputRef}
                    type="file"
                    accept="application/json,.json"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) onImportMacrosFile(f);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                </>
              )}
            </div>

            {onCleanUpDuplicateMacros && customMacros.length > 0 && (
              <button
                type="button"
                onClick={onCleanUpDuplicateMacros}
                title="Normalize macro names and merge canonical duplicates"
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0"
              >
                <Wand2 className="w-3 h-3 text-[var(--accent)]" />
                <span>Clean Library</span>
              </button>
            )}
          </div>
        )}
      </aside>

      {/* Main Studio Canvas: Logi Options+ Smart Actions Workbench */}
      <main className="flex-1 lg:overflow-y-auto min-w-0 flex flex-col justify-between">
        <div className="max-w-3xl w-full mx-auto px-4 pt-5 pb-8 sm:px-8 sm:pt-7 space-y-6">
          {/* Unsaved Draft Confirmation Bar */}
          {pendingNavigation && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div className="space-y-0.5 min-w-0">
                <div className="font-semibold text-amber-200">
                  Unsaved changes in current macro
                </div>
                <p className="text-amber-200/80">
                  Save your edits before switching to {pendingNavigation.label}, or discard them.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                {isSequenceValid && (
                  <button
                    type="button"
                    onClick={() => {
                      handleSaveMacroItem();
                      const nextFn = pendingNavigation.run;
                      setPendingNavigation(null);
                      nextFn();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white font-semibold hover:opacity-90 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Save & Switch
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const nextFn = pendingNavigation.run;
                    setPendingNavigation(null);
                    nextFn();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-200 font-semibold hover:bg-rose-500/25 cursor-pointer whitespace-nowrap shrink-0"
                >
                  Discard Edits
                </button>
                <button
                  type="button"
                  onClick={() => setPendingNavigation(null)}
                  className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Top Context & Document Header */}
          <header className="space-y-3.5 pb-5 border-b border-[var(--border-subtle)]">
            {onJumpToControl && (
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onJumpToControl(targetProfile, targetSlot)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Device</span>
                </button>

                <span className="text-xs text-[var(--text-secondary)] font-mono tabular-nums truncate">
                  Target: {activeTargetProfileObj.name} · {SLOT_LABELS[targetSlot].short}
                  {isDraftDirty ? ' · Unsaved draft' : ''}
                </span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    id="macro-sequence-name"
                    type="text"
                    maxLength={40}
                    aria-label="Macro name"
                    value={macroName}
                    onChange={e => {
                      setAutoNamingActive(false);
                      setMacroName(e.target.value);
                    }}
                    placeholder={smartNameSuggestion || 'Name this Smart Action…'}
                    className="w-full bg-transparent text-lg sm:text-xl font-bold text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border-b border-transparent hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:outline-none py-0.5 transition-colors"
                  />
                </div>

                {showSmartRenameHint && (
                  <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                    <span>Suggested name:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setMacroName(smartNameSuggestion);
                        setAutoNamingActive(true);
                      }}
                      className="font-semibold text-[var(--accent)] hover:underline cursor-pointer truncate"
                    >
                      {smartNameSuggestion}
                    </button>
                  </div>
                )}

                {/* Compact Stats · Estimated Run Time · Storage Badge · Bound Provenance */}
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-[var(--text-secondary)] tabular-nums">
                  <span className="font-mono">
                    {macroSteps.length} {macroSteps.length === 1 ? 'step' : 'steps'}
                  </span>
                  <span className="text-[var(--text-muted)]" aria-hidden="true">
                    ·
                  </span>
                  <span
                    className="font-mono"
                    title={`Estimated run time: ${formatDurationCompact(
                      timingSummary.totalDelayMs
                    )} explicit wait + ${
                      timingSummary.firmwareOverheadMs
                    } ms firmware pacing (50 ms after each step)`}
                  >
                    ~{formatDurationCompact(timingSummary.estimatedRunMs)} est. run
                  </span>
                  <span className="text-[var(--text-muted)]" aria-hidden="true">
                    ·
                  </span>
                  <span
                    title="Onboard macro slot storage usage (512 B max per key)"
                    className={`px-2 py-0.5 rounded-md bg-[var(--bg-panel)] font-mono text-[11px] ${
                      memoryOverflow
                        ? 'text-rose-600 dark:text-rose-400 font-semibold'
                        : draftValidation.byteLength > 400
                        ? 'text-amber-700 dark:text-amber-300'
                        : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    {draftValidation.byteLength} / {draftValidation.maxBytes} B
                  </span>
                  {needsLiveRunner && (
                    <>
                      <span className="text-[var(--text-muted)]" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-amber-700 dark:text-amber-300 font-medium">
                        USB Assisted
                      </span>
                    </>
                  )}
                  {!isTvEnabled && actionContainsTvSteps(builtAction, builtRepeatConfig) && (
                    <>
                      <span className="text-[var(--text-muted)]" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-amber-600 dark:text-amber-400 font-medium">
                        TV off
                      </span>
                    </>
                  )}
                  <span className="text-[var(--text-muted)]" aria-hidden="true">
                    ·
                  </span>
                  {activeMacroBoundSlots.length > 0 ? (
                    <span className="inline-flex items-center gap-1.5 flex-wrap">
                      {activeMacroBoundSlots.map((b, bIdx) => (
                        <React.Fragment key={`${b.profileId}-${b.slot}`}>
                          {bIdx > 0 && (
                            <span className="text-[var(--text-muted)]" aria-hidden="true">
                              ·
                            </span>
                          )}
                          {onJumpToControl ? (
                            <button
                              type="button"
                              onClick={() => onJumpToControl(b.profileId, b.slot)}
                              className="px-1.5 py-0.5 rounded-md bg-[var(--accent-soft)] font-mono text-[11px] font-medium text-[var(--accent)] hover:underline cursor-pointer"
                            >
                              {profileShortTag(b.profileId)} {SLOT_LABELS[b.slot].short}
                            </button>
                          ) : (
                            <span className="font-mono text-[11px] text-[var(--accent)] font-medium">
                              {profileShortTag(b.profileId)} {SLOT_LABELS[b.slot].short}
                            </span>
                          )}
                        </React.Fragment>
                      ))}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md bg-[var(--bg-panel)] text-[11px] text-[var(--text-muted)]">
                      Unassigned
                    </span>
                  )}
                </div>
              </div>

              {/* Clean Studio Action Toolbar */}
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                <div className="flex items-center rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-0.5">
                  <button
                    type="button"
                    disabled={stepPast.length === 0}
                    onClick={handleUndoSteps}
                    title="Undo step edit"
                    className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={stepFuture.length === 0}
                    onClick={handleRedoSteps}
                    title="Redo step edit"
                    className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                  >
                    <Redo2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {isJobRunning ? (
                  <button
                    type="button"
                    onClick={onStopRepeat}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/40 hover:bg-rose-500/25 text-xs font-semibold text-rose-300 transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums"
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
                      onClick={() => handleToggleSequenceRecorder(false)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        isRecordingSequence
                          ? 'bg-rose-500/15 border-rose-500/45 text-rose-300 font-semibold'
                          : 'bg-[var(--bg-panel)] border-[var(--border-subtle)] hover:border-[var(--accent)] text-[var(--text-primary)]'
                      }`}
                      title="Record live keystrokes with smart text coalescing"
                    >
                      <Radio className="w-3.5 h-3.5 text-rose-400" />
                      <span>{isRecordingSequence ? 'Stop Rec' : 'Record'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSmartComposerOpen(v => !v)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        smartComposerOpen
                          ? 'border-[var(--accent)] bg-[rgba(var(--accent-rgb),0.12)] text-[var(--text-primary)]'
                          : 'bg-[var(--bg-panel)] border-[var(--border-subtle)] hover:border-[var(--accent)] text-[var(--text-primary)]'
                      }`}
                      title="Build multi-field login flows or multi-line command sequences"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
                      <span>Smart Flow</span>
                    </button>

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
                      title={
                        testAvail.reason ||
                        'Connect MacroPad over USB or open Demo Mode to test live'
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-xs font-medium text-[var(--text-primary)] disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Play className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Test</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Live Multi-Step Sequence Recorder Banner */}
            {isRecordingSequence && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/35 space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 text-rose-200 font-semibold">
                    <Radio className="w-4 h-4 text-rose-400 shrink-0 animate-pulse" />
                    <span>
                      Recording Smart Action ({sequenceRecordedCount}{' '}
                      {sequenceRecordedCount === 1 ? 'keystroke' : 'keystrokes'}) — type or press shortcuts
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleSequenceRecorder(true)}
                      className="px-2.5 py-1 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                    >
                      Clear & Restart
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleSequenceRecorder(false)}
                      className="px-3 py-1 rounded-lg bg-rose-500 text-white font-semibold hover:opacity-90 cursor-pointer whitespace-nowrap"
                    >
                      Done (Esc)
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-4 flex-wrap text-[11px] text-rose-200/90">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={coalesceTypedText}
                      onChange={e => setCoalesceTypedText(e.target.checked)}
                      className="rounded border-[var(--border-strong)] accent-[var(--accent)]"
                    />
                    <span>Smart merge typed characters into Text steps</span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={captureSequenceTiming}
                      onChange={e => setCaptureSequenceTiming(e.target.checked)}
                      className="rounded border-[var(--border-strong)] accent-[var(--accent)]"
                    />
                    <span>Capture real millisecond delays</span>
                  </label>
                  {sequenceRecorderNotice && (
                    <span className="text-amber-200">{sequenceRecorderNotice}</span>
                  )}
                </div>
              </div>
            )}

            {/* Logi Options+ Style Smart Flow Composer */}
            {smartComposerOpen && (
              <div className="p-4 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-strong)] space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[var(--accent)]" />
                    <span className="text-xs font-bold text-[var(--text-primary)]">
                      Smart Flow Builder
                    </span>
                  </div>
                  <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)]">
                    <button
                      type="button"
                      onClick={() => setComposerMode('form')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer ${
                        composerMode === 'form'
                          ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                      }`}
                    >
                      Multi-Field / Login Flow
                    </button>
                    <button
                      type="button"
                      onClick={() => setComposerMode('script')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer ${
                        composerMode === 'script'
                          ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                      }`}
                    >
                      Multi-Line Commands
                    </button>
                  </div>
                </div>

                {composerMode === 'form' ? (
                  <div className="space-y-3 text-xs">
                    <p className="text-[var(--text-secondary)] leading-relaxed">
                      Generates clean <ActionPrefixTag prefix="TEXT" /> →{' '}
                      <ActionPrefixTag prefix="KEY" /> → <ActionPrefixTag prefix="WAIT" />{' '}
                      steps that run standalone over Bluetooth. Add a screen-load wait when transitioning to a second page or 2FA prompt.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <label className="space-y-1">
                        <span className="text-[11px] text-[var(--text-secondary)]">
                          Field 1 (e.g. ID / Username)
                        </span>
                        <input
                          type="text"
                          value={formField1}
                          onChange={e => setFormField1(e.target.value)}
                          placeholder="user@company.com"
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] font-mono text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                        />
                      </label>

                      <label className="space-y-1">
                        <span className="text-[11px] text-[var(--text-secondary)]">
                          Key between fields
                        </span>
                        <select
                          value={formSeparatorKey}
                          onChange={e =>
                            setFormSeparatorKey(e.target.value as 'tab' | 'enter')
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] font-mono text-xs text-[var(--text-primary)]"
                        >
                          <option value="tab">TAB (Next input)</option>
                          <option value="enter">ENTER (Next screen)</option>
                        </select>
                      </label>

                      <label className="space-y-1">
                        <span className="text-[11px] text-[var(--text-secondary)]">
                          Field 2 (e.g. Password)
                        </span>
                        <input
                          type="text"
                          value={formField2}
                          onChange={e => setFormField2(e.target.value)}
                          placeholder="Optional second field"
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] font-mono text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                      <label className="space-y-1">
                        <span className="text-[11px] text-[var(--text-secondary)]">
                          Second Screen / 2FA Step
                        </span>
                        <select
                          value={formStage2Mode}
                          onChange={e =>
                            setFormStage2Mode(
                              e.target.value as
                                | 'none'
                                | 'paste_mac'
                                | 'paste_win'
                                | 'text'
                            )
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
                        >
                          <option value="none">None (Stop after Enter)</option>
                          <option value="paste_mac">
                            Paste Clipboard (⌘V) + Enter
                          </option>
                          <option value="paste_win">
                            Paste Clipboard (Ctrl+V) + Enter
                          </option>
                          <option value="text">Type Fixed Code / Text + Enter</option>
                        </select>
                      </label>

                      {formStage2Mode !== 'none' && (
                        <label className="space-y-1">
                          <span className="text-[11px] text-[var(--text-secondary)]">
                            Screen Load Wait (ms)
                          </span>
                          <input
                            type="number"
                            min={100}
                            max={60000}
                            step={250}
                            value={formScreenWaitMs}
                            onChange={e => setFormScreenWaitMs(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] font-mono text-xs tabular-nums text-[var(--text-primary)]"
                          />
                        </label>
                      )}

                      {formStage2Mode === 'text' && (
                        <label className="space-y-1">
                          <span className="text-[11px] text-[var(--text-secondary)]">
                            Stage 2 Text
                          </span>
                          <input
                            type="text"
                            value={formStage2Text}
                            onChange={e => setFormStage2Text(e.target.value)}
                            placeholder="Follow-up input"
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] font-mono text-xs text-[var(--text-primary)]"
                          />
                        </label>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setSmartComposerOpen(false)}
                        className="px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        disabled={!formField1.trim() && !formField2.trim() && formStage2Mode === 'none'}
                        onClick={() => handleGenerateFormSteps(true)}
                        className="px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] disabled:opacity-40 cursor-pointer"
                      >
                        Append Steps
                      </button>
                      <button
                        type="button"
                        disabled={!formField1.trim() && !formField2.trim() && formStage2Mode === 'none'}
                        onClick={() => handleGenerateFormSteps(false)}
                        className="px-3.5 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold disabled:opacity-40 cursor-pointer"
                      >
                        Replace Sequence
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 text-xs">
                    <p className="text-[var(--text-secondary)]">
                      Paste terminal commands or text lines (one per line). Each line becomes a{' '}
                      <ActionPrefixTag prefix="TEXT" /> step followed by{' '}
                      <ActionPrefixTag prefix="KEY" /> <span className="font-mono">ENTER</span>.
                    </p>
                    <textarea
                      rows={3}
                      value={scriptLinesDraft}
                      onChange={e => setScriptLinesDraft(e.target.value)}
                      placeholder={'git checkout main\ngit pull\nnpm run build'}
                      className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] font-mono text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                    />
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <label className="inline-flex items-center gap-2 text-[var(--text-secondary)]">
                        <span>Delay between lines:</span>
                        <input
                          type="number"
                          min={50}
                          max={10000}
                          step={50}
                          value={scriptLineWaitMs}
                          onChange={e => setScriptLineWaitMs(e.target.value)}
                          className="w-20 px-2 py-1 rounded bg-[var(--bg-input)] border border-[var(--border-subtle)] font-mono text-xs tabular-nums text-[var(--text-primary)]"
                        />
                        <span className="font-mono">ms</span>
                      </label>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={!scriptLinesDraft.trim()}
                          onClick={() => handleGenerateScriptSteps(true)}
                          className="px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] disabled:opacity-40 cursor-pointer"
                        >
                          Append
                        </button>
                        <button
                          type="button"
                          disabled={!scriptLinesDraft.trim()}
                          onClick={() => handleGenerateScriptSteps(false)}
                          className="px-3.5 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold disabled:opacity-40 cursor-pointer"
                        >
                          Build Steps
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Strict Completeness Validation Issues */}
            {!draftValidation.valid && draftValidation.issues.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-1.5 text-xs text-amber-200">
                {draftValidation.issues.slice(0, 3).map((issue, idx) => (
                  <div
                    key={`${issue.stepId || 'seq'}-${idx}`}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="truncate">{issue.message}</span>
                    </div>
                    {issue.stepId && expandedStepId !== issue.stepId && (
                      <button
                        type="button"
                        onClick={() => setExpandedStepId(issue.stepId!)}
                        className="font-semibold text-amber-200 hover:underline cursor-pointer whitespace-nowrap shrink-0"
                      >
                        Fix step
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Native Firmware Built-In Equivalence Hint */}
            {nativeBuiltInMatch && (
              <div className="px-3 py-2 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex items-center justify-between gap-3 text-xs text-[var(--text-secondary)]">
                <div className="flex items-center gap-2 min-w-0 truncate">
                  <span>Matches native action</span>
                  <span className="font-semibold text-[var(--text-primary)] truncate">
                    {nativeBuiltInMatch.label}
                  </span>
                  <ParsedActionBadge
                    action={nativeBuiltInMatch.action}
                    showRawId={showAdvancedIds}
                    customMacros={customMacros}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const stepId = macroSteps[0]?.id;
                    if (!stepId) return;
                    const mappedType: MacroStepActionType =
                      nativeBuiltInMatch.category === 'media'
                        ? 'media'
                        : nativeBuiltInMatch.category === 'ble'
                        ? 'ble'
                        : nativeBuiltInMatch.category === 'tv' ||
                          nativeBuiltInMatch.category === 'tv_app'
                        ? 'tv'
                        : 'os_action';
                    updateStep(stepId, {
                      actionType: mappedType,
                      label: nativeBuiltInMatch.label,
                      value: nativeBuiltInMatch.action
                    });
                    if (isGenericMacroName(macroName) || autoNamingActive) {
                      setMacroName(nativeBuiltInMatch.label);
                    }
                  }}
                  className="font-semibold text-[var(--accent)] hover:underline cursor-pointer whitespace-nowrap shrink-0"
                >
                  Use native action
                </button>
              </div>
            )}

            {/* Safer Collision Notice with Explicit Update vs Save as New */}
            {duplicateMacroMatch && (
              <div className="p-3 rounded-xl bg-[var(--bg-panel)] border border-[var(--accent)]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[var(--text-primary)]">
                <div className="flex items-start gap-2 min-w-0">
                  <AlertCircle className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
                  <span className="text-[var(--text-secondary)] leading-relaxed">
                    {duplicateMacroMatch.reason === 'identical_actions' ? (
                      <>
                        Matches saved macro{' '}
                        <strong className="text-[var(--text-primary)]">
                          "{duplicateMacroMatch.item.name}"
                        </strong>
                        . Choose whether to update it or save a separate copy.
                      </>
                    ) : (
                      <>
                        A saved macro named{' '}
                        <strong className="text-[var(--text-primary)]">
                          "{duplicateMacroMatch.item.name}"
                        </strong>{' '}
                        already exists. Save as new to keep both intact.
                      </>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={!isSequenceValid}
                    onClick={() => handleSaveMacroItem({ forceNew: true })}
                    className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-strong)] hover:border-[var(--accent)] font-semibold text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                  >
                    Save as New
                  </button>
                  <button
                    type="button"
                    disabled={!isSequenceValid}
                    onClick={() =>
                      handleSaveMacroItem({
                        targetExistingId: duplicateMacroMatch.item.id
                      })
                    }
                    className="px-2.5 py-1.5 rounded-lg bg-[var(--accent)] text-white font-semibold hover:opacity-90 cursor-pointer whitespace-nowrap"
                  >
                    Update Existing
                  </button>
                </div>
              </div>
            )}

            {/* 1-Click Sequence Optimizer */}
            {optimization.canOptimize && isSequenceValid && (
              <div className="px-3 py-2 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 min-w-0 text-[var(--text-secondary)]">
                  <Wand2 className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  <span className="truncate">{optimization.reasons.join(' · ')}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    commitSteps(optimization.optimizedSteps);
                    setExpandedStepId(null);
                  }}
                  className="font-semibold text-[var(--accent)] hover:underline cursor-pointer whitespace-nowrap shrink-0"
                >
                  Optimize sequence
                </button>
              </div>
            )}
          </header>

          {/* Connected Smart Actions Step Flow Timeline */}
          <section className="space-y-3" aria-label="Macro steps">
            <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span className="font-semibold text-[var(--text-primary)]">
                  Action Flow
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {macroSteps.length > 1 && (
                  <div className="flex items-center gap-1 text-[11px]">
                    <Gauge className="w-3 h-3 text-[var(--text-muted)]" />
                    <span className="text-[var(--text-muted)] mr-0.5">Pacing:</span>
                    {(
                      [
                        { label: 'Fast 100ms', ms: 100 },
                        { label: 'Balanced 200ms', ms: 200 },
                        { label: 'App/Web 500ms', ms: 500 }
                      ] as const
                    ).map(p => (
                      <button
                        key={p.ms}
                        type="button"
                        onClick={() => applyBatchPacing(p.ms)}
                        className="px-2 py-0.5 rounded-md bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--accent)] font-mono text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer tabular-nums"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}

                {expandedStepId && macroSteps.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setExpandedStepId(null)}
                    className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Collapse
                  </button>
                )}
              </div>
            </div>

            {macroSteps.length === 0 ? (
              <div className="py-10 px-6 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-center space-y-3">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  No steps in this Smart Action yet
                </p>
                <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
                  Click Record above to type or capture shortcuts naturally, open Smart Flow, or add a step below.
                </p>
              </div>
            ) : (
              <div className="space-y-0" role="list">
                {macroSteps.map((step, idx) => {
                  const isLastStep = idx === macroSteps.length - 1;
                  const isExpanded = expandedStepId === step.id;
                  const hasStepIssue = issueStepIds.has(step.id);
                  const stepTag = parseMacroStepTag(step);

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

                  const stepTestAction =
                    step.actionType !== 'delay'
                      ? canonicalizeFirmwareAction(stepToFirmwareAction(step))
                      : '';
                  const stepCanTest =
                    Boolean(stepTestAction) &&
                    getActionTestAvailability(stepTestAction, connection).canTest;

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
                        /* COLLAPSED STEP CARD WITH COLORED PREFIX TAG */
                        <div
                          onClick={() => setExpandedStepId(step.id)}
                          className={`group px-3.5 py-3 rounded-xl bg-[var(--bg-panel)] border flex items-center justify-between gap-3 transition-all cursor-pointer ${
                            isStepActive
                              ? 'border-[var(--accent)] bg-[rgba(var(--accent-rgb),0.12)] shadow-sm'
                              : hasStepIssue
                              ? 'border-amber-500/55 bg-amber-500/5'
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

                            <ActionPrefixTag prefix={stepTag.prefix} size="sm" />

                            <div
                              className="flex items-baseline gap-2 min-w-0"
                              title={stepTag.value}
                            >
                              <span
                                className={`text-sm font-medium truncate ${
                                  hasStepIssue
                                    ? 'text-amber-700 dark:text-amber-200'
                                    : 'text-[var(--text-primary)]'
                                }`}
                              >
                                {stepTag.prettyValue}
                              </span>
                              {showAdvancedIds && stepTag.prettyValue !== stepTag.value && (
                                <span className="text-[11px] font-mono text-[var(--text-muted)] truncate hidden sm:inline">
                                  {stepTag.value}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0">
                            <div className="font-mono text-xs tabular-nums text-[var(--text-secondary)] flex items-center gap-1.5">
                              {isExecutingAction ? (
                                <span className="text-[var(--accent)] font-semibold">
                                  Running…
                                </span>
                              ) : hasStepIssue ? (
                                <span className="text-amber-300 font-sans font-medium">
                                  Incomplete
                                </span>
                              ) : (
                                step.actionType !== 'delay' &&
                                step.repeatCount > 1 && <span>{step.repeatCount}×</span>
                              )}
                            </div>

                            <div
                              onClick={e => e.stopPropagation()}
                              className="hidden sm:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                            >
                              {step.actionType !== 'delay' && (
                                <button
                                  type="button"
                                  disabled={!stepCanTest}
                                  onClick={() => handleTestSingleStep(step)}
                                  className="p-1 rounded text-[var(--text-muted)] hover:text-emerald-400 hover:bg-[var(--bg-input)] disabled:opacity-25 disabled:pointer-events-none cursor-pointer"
                                  title={
                                    stepCanTest
                                      ? 'Test only this step on MacroPad'
                                      : 'Connect MacroPad or enable Demo Mode to test step'
                                  }
                                >
                                  <Play className="w-3.5 h-3.5" />
                                </button>
                              )}
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
                                onClick={() => duplicateStep(idx)}
                                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] cursor-pointer"
                                title="Duplicate step"
                              >
                                <Copy className="w-3.5 h-3.5" />
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
                        /* EXPANDED ACTIVE STEP EDITOR */
                        <div
                          className={`p-4 sm:p-5 rounded-xl bg-[var(--bg-panel)] border space-y-4 ${
                            isStepActive
                              ? 'border-[var(--accent)]'
                              : hasStepIssue
                              ? 'border-amber-500/55'
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
                              <span className="font-mono text-xs font-semibold text-[var(--accent)] tabular-nums shrink-0">
                                Step {String(idx + 1).padStart(2, '0')}
                              </span>
                              <span
                                className="text-xs font-semibold text-[var(--text-primary)] truncate"
                                title={stepTag.value}
                              >
                                {stepTag.prettyValue}
                              </span>
                              {showAdvancedIds && stepTag.prettyValue !== stepTag.value && (
                                <span className="font-mono text-[11px] text-[var(--text-muted)] truncate">
                                  {stepTag.value}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {step.actionType !== 'delay' && (
                                <button
                                  type="button"
                                  disabled={!stepCanTest}
                                  onClick={() => handleTestSingleStep(step)}
                                  className="px-2 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-[11px] font-medium text-[var(--text-primary)] disabled:opacity-35 disabled:pointer-events-none flex items-center gap-1 cursor-pointer"
                                  title="Test this step immediately"
                                >
                                  <Play className="w-3 h-3 text-emerald-400" />
                                  <span>Test</span>
                                </button>
                              )}
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

                          {/* Action Type Selector */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {visibleStepTypes.map(typeKey => {
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
                                <div className="space-y-1">
                                  <div className="text-[11px] text-[var(--text-muted)]">
                                    Current shortcut
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <ActionPrefixTag prefix="SHORTCUT" size="sm" />
                                    <span className="font-mono text-sm font-semibold text-[var(--text-primary)]">
                                      {formatShortcutPretty(step.value)}
                                    </span>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsRecordingSequence(false);
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
                                    !step.value || !textCheck.valid
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
                                  !step.value || !textCheck.valid
                                    ? 'border-amber-500/60'
                                    : 'border-[var(--border-subtle)] focus:border-[var(--accent)]'
                                }`}
                              />
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                {!step.value ? (
                                  <p className="text-xs text-amber-300">
                                    Enter at least 1 character to type, or remove this step.
                                  </p>
                                ) : !textCheck.valid && textCheck.error ? (
                                  <p className="text-xs text-rose-400">{textCheck.error}</p>
                                ) : (
                                  <span className="text-[11px] text-[var(--text-muted)]">
                                    Types ASCII characters in order over Bluetooth HID.
                                  </span>
                                )}

                                <div className="flex items-center gap-3 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => insertStepAfter(idx, 'key', 'tab')}
                                    className="text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--accent)] cursor-pointer whitespace-nowrap"
                                  >
                                    + Add Tab after
                                  </button>
                                  {!nextStepIsEnter && (
                                    <button
                                      type="button"
                                      onClick={() => insertStepAfter(idx, 'key', 'enter')}
                                      className="text-xs font-medium text-[var(--accent)] hover:underline cursor-pointer whitespace-nowrap"
                                    >
                                      + Add Enter after
                                    </button>
                                  )}
                                </div>
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
                                        {k.toUpperCase()}
                                      </option>
                                    ))}
                                  </select>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setIsRecordingSequence(false);
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
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto pr-0.5">
                              {mediaCatalog.map(item => {
                                const parsedItem = parseSingleActionKeyValue(item.action);
                                const selected = step.value === item.action;
                                return (
                                  <button
                                    key={item.action}
                                    type="button"
                                    title={item.action}
                                    onClick={() => updateStep(step.id, { value: item.action })}
                                    className={`p-2 rounded-lg border text-left transition-colors cursor-pointer min-w-0 ${
                                      selected
                                        ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                                        : 'bg-[var(--bg-input)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                                    }`}
                                  >
                                    <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                                      {item.label}
                                    </div>
                                    {showAdvancedIds && (
                                      <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                                        <span className="font-mono text-[10px] text-[var(--text-muted)] truncate">
                                          {parsedItem.value}
                                        </span>
                                      </div>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {step.actionType === 'os_action' && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-52 overflow-y-auto pr-0.5">
                              {osCatalog.map(item => {
                                const parsedItem = parseSingleActionKeyValue(item.action);
                                const selected = step.value === item.action;
                                return (
                                  <button
                                    key={item.action}
                                    type="button"
                                    title={item.action}
                                    onClick={() => updateStep(step.id, { value: item.action })}
                                    className={`p-2 rounded-lg border text-left transition-colors cursor-pointer min-w-0 ${
                                      selected
                                        ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                                        : 'bg-[var(--bg-input)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                                    }`}
                                  >
                                    <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                                      {item.label}
                                    </div>
                                    {showAdvancedIds && (
                                      <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                                        <span className="font-mono text-[10px] text-[var(--text-muted)] truncate">
                                          {parsedItem.value}
                                        </span>
                                      </div>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {step.actionType === 'ble' && (
                            <div className="grid grid-cols-2 gap-1.5">
                              {bleCatalog.map(item => {
                                const parsedItem = parseSingleActionKeyValue(item.action);
                                const selected = step.value === item.action;
                                return (
                                  <button
                                    key={item.action}
                                    type="button"
                                    title={item.action}
                                    onClick={() => updateStep(step.id, { value: item.action })}
                                    className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer min-w-0 ${
                                      selected
                                        ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                                        : 'bg-[var(--bg-input)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                                    }`}
                                  >
                                    <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                                      {item.label}
                                    </div>
                                    {showAdvancedIds && (
                                      <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                                        <span className="font-mono text-[10px] text-[var(--text-muted)] truncate">
                                          {parsedItem.value}
                                        </span>
                                      </div>
                                    )}
                                  </button>
                                );
                              })}
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
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-52 overflow-y-auto pr-0.5">
                                  {tvCatalog.map(item => {
                                    const parsedItem = parseSingleActionKeyValue(item.action);
                                    const selected = step.value === item.action;
                                    return (
                                      <button
                                        key={item.action}
                                        type="button"
                                        title={item.action}
                                        onClick={() => updateStep(step.id, { value: item.action })}
                                        className={`p-2 rounded-lg border text-left transition-colors cursor-pointer min-w-0 ${
                                          selected
                                            ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                                            : 'bg-[var(--bg-input)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                                        }`}
                                      >
                                        <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                                          {item.label}
                                        </div>
                                        {showAdvancedIds && (
                                          <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                                            <span className="font-mono text-[10px] text-[var(--text-muted)] truncate">
                                              {parsedItem.value}
                                            </span>
                                          </div>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}

                              {isCustomTvKey && (
                                <div className="grid grid-cols-2 gap-2.5">
                                  <label className="space-y-1 text-xs text-[var(--text-secondary)]">
                                    <span>Command Group (Codeset)</span>
                                    <input
                                      type="number"
                                      min={0}
                                      value={tvKeyParts[1] ?? ''}
                                      onChange={e => {
                                        const rawCs = e.target.value.trim();
                                        const rawCd = (tvKeyParts[2] ?? '').trim();
                                        updateStep(step.id, { value: `TVKEY:${rawCs}:${rawCd}` });
                                      }}
                                      placeholder="5"
                                      className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono tabular-nums text-[var(--text-primary)]"
                                    />
                                  </label>
                                  <label className="space-y-1 text-xs text-[var(--text-secondary)]">
                                    <span>Key Code</span>
                                    <input
                                      type="number"
                                      min={0}
                                      value={tvKeyParts[2] ?? ''}
                                      onChange={e => {
                                        const rawCs = (tvKeyParts[1] ?? '').trim();
                                        const rawCd = e.target.value.trim();
                                        updateStep(step.id, { value: `TVKEY:${rawCs}:${rawCd}` });
                                      }}
                                      placeholder="1"
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
                                      value={tvAppParts[1] ?? ''}
                                      onChange={e => {
                                        const cleanId = sanitizeSerialString(
                                          e.target.value.trim(),
                                          32
                                        );
                                        const rawNs = (tvAppParts[2] ?? '').trim();
                                        const url = sanitizeSerialString(
                                          (tvAppParts.slice(3).join(':') || '').trim(),
                                          80
                                        );
                                        updateStep(step.id, {
                                          value: url
                                            ? `TVAPP:${cleanId}:${rawNs}:${url}`
                                            : `TVAPP:${cleanId}:${rawNs}`
                                        });
                                      }}
                                      placeholder="e.g. 1"
                                      className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)]"
                                    />
                                  </label>
                                  <label className="space-y-1 text-xs text-[var(--text-secondary)]">
                                    <span>Namespace</span>
                                    <input
                                      type="number"
                                      min={0}
                                      value={tvAppParts[2] ?? ''}
                                      onChange={e => {
                                        const cleanId = sanitizeSerialString(
                                          (tvAppParts[1] ?? '').trim(),
                                          32
                                        );
                                        const rawNs = e.target.value.trim();
                                        const url = sanitizeSerialString(
                                          (tvAppParts.slice(3).join(':') || '').trim(),
                                          80
                                        );
                                        updateStep(step.id, {
                                          value: url
                                            ? `TVAPP:${cleanId}:${rawNs}:${url}`
                                            : `TVAPP:${cleanId}:${rawNs}`
                                        });
                                      }}
                                      placeholder="4"
                                      className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono tabular-nums text-[var(--text-primary)]"
                                    />
                                  </label>
                                  <label className="space-y-1 text-xs text-[var(--text-secondary)]">
                                    <span>Deep Link (optional)</span>
                                    <input
                                      type="text"
                                      value={tvAppParts.slice(3).join(':') || ''}
                                      onChange={e => {
                                        const cleanId = sanitizeSerialString(
                                          (tvAppParts[1] ?? '').trim(),
                                          32
                                        );
                                        const rawNs = (tvAppParts[2] ?? '').trim();
                                        const url = sanitizeSerialString(
                                          e.target.value.trim(),
                                          80
                                        );
                                        updateStep(step.id, {
                                          value: url
                                            ? `TVAPP:${cleanId}:${rawNs}:${url}`
                                            : `TVAPP:${cleanId}:${rawNs}`
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
                            <div className="space-y-2.5">
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
                                            ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)] font-semibold'
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
                                    max={MAX_FIRMWARE_DELAY_STEP_MS}
                                    step={50}
                                    value={Math.min(MAX_FIRMWARE_DELAY_STEP_MS, step.delayMs)}
                                    onChange={e =>
                                      updateStep(step.id, {
                                        delayMs: Math.max(
                                          10,
                                          Math.min(
                                            MAX_FIRMWARE_DELAY_STEP_MS,
                                            parseInt(e.target.value, 10) || 0
                                          )
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

                              <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--text-muted)] flex-wrap">
                                <span>Max 10,000 ms (10 s) per firmware wait step.</span>
                                <button
                                  type="button"
                                  onClick={() => insertStepAfter(idx, 'delay')}
                                  className="font-medium text-[var(--accent)] hover:underline cursor-pointer whitespace-nowrap"
                                >
                                  + Chain another Wait step
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Step Timing & Repeat Footer */}
                          {step.actionType !== 'delay' && (
                            <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between gap-3 flex-wrap text-xs">
                              {!isLastStep || step.repeatCount > 1 ? (
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[var(--text-secondary)]">
                                    {isLastStep ? 'Interval:' : 'Delay before next step:'}
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
                                        {presetMs >= 1000 ? `${presetMs / 1000}s` : `${presetMs}`}
                                      </button>
                                    ))}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <input
                                      aria-label="Wait after step in milliseconds"
                                      type="number"
                                      min={0}
                                      max={MAX_FIRMWARE_DELAY_STEP_MS}
                                      step={50}
                                      value={Math.min(MAX_FIRMWARE_DELAY_STEP_MS, step.delayMs)}
                                      onChange={e =>
                                        updateStep(step.id, {
                                          delayMs: Math.max(
                                            0,
                                            Math.min(
                                              MAX_FIRMWARE_DELAY_STEP_MS,
                                              parseInt(e.target.value, 10) || 0
                                            )
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

                              <label className="flex items-center gap-1.5 text-[var(--text-secondary)]">
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

                      {/* LOGI OPTIONS+ CONNECTED FLOW TIMELINE SPINE BETWEEN STEPS */}
                      {!isLastStep && (
                        <div className="group/conn flex items-center gap-2 pl-7 py-1 select-none">
                          <div
                            className={`w-px h-5 transition-colors ${
                              isExecutingDelay
                                ? 'bg-[var(--accent)]'
                                : 'bg-[var(--border-strong)]'
                            }`}
                          />

                          {step.actionType !== 'delay' && (
                            <button
                              type="button"
                              onClick={() => {
                                const curIdx = INLINE_CONNECTOR_CYCLE_MS.indexOf(step.delayMs);
                                const nextMs =
                                  INLINE_CONNECTOR_CYCLE_MS[
                                    (curIdx + 1) % INLINE_CONNECTOR_CYCLE_MS.length
                                  ];
                                updateStep(step.id, { delayMs: nextMs });
                              }}
                              title="Click to cycle transition delay (0 → 100 → 250 → 500 → 1000 ms)"
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border font-mono text-[10px] tabular-nums transition-colors cursor-pointer ${
                                isExecutingDelay
                                  ? 'border-[var(--accent)] bg-[rgba(var(--accent-rgb),0.14)] text-[var(--accent)] font-semibold'
                                  : step.delayMs > 0
                                  ? 'bg-[var(--bg-panel)] border-[var(--border-subtle)] hover:border-[var(--accent)] text-[var(--text-secondary)]'
                                  : 'bg-transparent border-transparent hover:border-[var(--border-subtle)] text-[var(--text-muted)]'
                              }`}
                            >
                              <Clock className="w-2.5 h-2.5" />
                              <span>
                                {isExecutingDelay
                                  ? `Waiting ${step.delayMs} ms…`
                                  : step.delayMs > 0
                                  ? `+${formatDurationCompact(step.delayMs)}`
                                  : '0 ms (click to add delay)'}
                              </span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => insertStepAfter(idx, 'shortcut')}
                            className="opacity-0 group-hover/conn:opacity-100 focus:opacity-100 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-[10px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-opacity cursor-pointer"
                            title="Insert a new step here"
                          >
                            <Plus className="w-2.5 h-2.5 text-[var(--accent)]" />
                            <span>Insert step</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* "+ Add Step" Action Palette */}
            <div className="pt-1 flex items-center gap-1.5 flex-wrap">
              {visibleStepTypes.map(type => {
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
            {/* Trigger & Repeat Mode */}
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
                      <div className="px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
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
                <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                  {draftValidation.usbRequiredReason ||
                    'Keep Studio MacroPad open over USB to stream remaining steps or repeats.'}
                </p>
              )}
            </div>

            {/* Visual MacroPad Control Picker */}
            <div className="pt-4 border-t border-[var(--border-subtle)] space-y-3.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  Target Host & Control
                </span>

                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] flex-wrap">
                  {profiles.filter(p => p.id !== 'TV' || isTvEnabled).map(p => {
                    const ProfIcon = isBleHostProfile(p.id) ? Bluetooth : Tv;
                    const active = targetProfile === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setTargetProfile(p.id)}
                        title={`${p.name} (${profileShortTag(p.id)})`}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          active
                            ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                        }`}
                      >
                        <ProfIcon className="w-3.5 h-3.5 shrink-0" />
                        <span className="font-mono text-[10px] opacity-75">
                          {profileShortTag(p.id)}
                        </span>
                        <span className="truncate max-w-[96px]">{p.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mini Physical Layout: 2x4 Keys + 3 Rotary Knob Slots */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <div className="sm:col-span-8 grid grid-cols-4 gap-1.5">
                  {BUTTON_GRID_SLOTS.map((slot, i) => {
                    const act = targetProfileSlots[slot];
                    const slotBind = getBindingForProfileSlot(
                      profiles,
                      targetProfile,
                      slot
                    );
                    const isSelected = targetSlot === slot;
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setTargetSlot(slot)}
                        className={`p-2 rounded-lg border text-left transition-colors cursor-pointer min-w-0 ${
                          isSelected
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                            : 'bg-[var(--bg-input)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                        }`}
                      >
                        <div className="font-mono text-[10px] text-[var(--text-muted)] tabular-nums">
                          K{i + 1}
                        </div>
                        <div className="mt-1 min-w-0 truncate">
                          {act ? (
                            <ParsedActionBadge
                              action={act}
                              repeatConfig={slotBind?.repeatConfig}
                              maxSteps={1}
                              showRawId={showAdvancedIds}
                              customMacros={customMacros}
                            />
                          ) : (
                            <span className="text-[10px] font-mono text-[var(--text-muted)]">
                              Empty
                            </span>
                          )}
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
                    const isSelected = targetSlot === slot;
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setTargetSlot(slot)}
                        className={`flex-1 px-2.5 py-1.5 rounded-lg border text-left flex items-center justify-between gap-2 transition-colors cursor-pointer min-w-0 ${
                          isSelected
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                            : 'bg-[var(--bg-input)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 shrink-0">
                          <KnobIcon className="w-3 h-3 text-[var(--text-muted)]" />
                          <span className="font-mono text-[10px] text-[var(--text-muted)] whitespace-nowrap">
                            {shortTitle}
                          </span>
                        </div>
                        <div className="min-w-0 truncate">
                          {act ? (
                            <ParsedActionBadge
                              action={act}
                              repeatConfig={slotBind?.repeatConfig}
                              maxSteps={1}
                              showRawId={showAdvancedIds}
                              customMacros={customMacros}
                            />
                          ) : (
                            <span className="text-[10px] font-mono text-[var(--text-muted)]">
                              Empty
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Simplified Sticky Bottom Bar: Autosave status + Overflow Menu + Single Primary Assign CTA */}
        <footer className="sticky bottom-0 z-20 bg-[var(--bg-panel)]/95 backdrop-blur-md border-t border-[var(--border-subtle)] px-4 py-3 sm:px-8">
          <div className="max-w-3xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] min-w-0 flex-wrap">
              {justAssignedSlot &&
              justAssignedSlot.profile === targetProfile &&
              justAssignedSlot.slot === targetSlot ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  Assigned to {activeTargetProfileObj.name} · {SLOT_LABELS[targetSlot].short} ✓
                </span>
              ) : (
                <>
                  <span className="shrink-0">
                    {activeTargetProfileObj.name} · {SLOT_LABELS[targetSlot].short}:
                  </span>
                  {currentSlotAction ? (
                    <ParsedActionBadge
                      action={currentSlotAction}
                      repeatConfig={currentSlotBinding?.repeatConfig}
                      maxSteps={2}
                      showRawId={showAdvancedIds}
                      customMacros={customMacros}
                    />
                  ) : (
                    <span className="font-mono text-[var(--text-muted)]">Empty</span>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
              {/* Quiet Autosave Status */}
              <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">
                {justSavedFeedback?.mode === 'new'
                  ? 'Saved copy ✓'
                  : !isSequenceValid
                  ? 'Incomplete step'
                  : isDraftDirty
                  ? 'Autosaving…'
                  : selectedMacroId
                  ? 'Saved ✓'
                  : 'Ready'}
              </span>

              {onJumpToControl &&
                justAssignedSlot &&
                justAssignedSlot.profile === targetProfile &&
                justAssignedSlot.slot === targetSlot && (
                  <button
                    type="button"
                    onClick={() => onJumpToControl(targetProfile, targetSlot)}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-xs font-medium text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span>View on Device</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                )}

              {/* Secondary Actions Menu (Save as copy, New blank, Studio Sense, Delete) */}
              <div className="relative" ref={builderMenuRef}>
                <button
                  type="button"
                  onClick={() => setBuilderMenuOpen(v => !v)}
                  aria-label="More macro actions"
                  aria-expanded={builderMenuOpen}
                  title="More macro actions (Save as copy, New blank, Studio Sense)"
                  className="p-2 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shrink-0"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>

                {builderMenuOpen && (
                  <div className="absolute right-0 bottom-full mb-2 w-52 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-strong)] shadow-xl py-1.5 z-40 text-xs">
                    <button
                      type="button"
                      disabled={!isSequenceValid}
                      onClick={() => {
                        handleSaveMacroItem({ forceNew: true });
                        setBuilderMenuOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left flex items-center gap-2 text-[var(--text-primary)] hover:bg-[var(--bg-input)] disabled:opacity-40 disabled:pointer-events-none cursor-pointer whitespace-nowrap"
                    >
                      <Copy className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                      <span>Save as copy</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        startBlankMacroImmediate();
                        setBuilderMenuOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left flex items-center gap-2 text-[var(--text-primary)] hover:bg-[var(--bg-input)] cursor-pointer whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                      <span>New blank macro</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setStudioSenseOpen(true);
                        setBuilderMenuOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left flex items-center gap-2 text-[var(--text-primary)] hover:bg-[var(--bg-input)] cursor-pointer whitespace-nowrap"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
                      <span>Studio Sense suggestions…</span>
                    </button>

                    {selectedMacroId && (
                      <>
                        <div className="my-1 border-t border-[var(--border-subtle)]" />
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteMacro(selectedMacroId);
                            setSelectedMacroId(null);
                            setBuilderMenuOpen(false);
                          }}
                          className="w-full px-3 py-2 text-left flex items-center gap-2 text-rose-600 dark:text-rose-400 hover:bg-[var(--bg-input)] cursor-pointer whitespace-nowrap"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete from library</span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* One Primary CTA Button */}
              <button
                type="button"
                disabled={!isSequenceValid}
                onClick={handleAssignToControl}
                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-40 disabled:pointer-events-none transition-opacity cursor-pointer whitespace-nowrap shrink-0"
              >
                <Check className="w-3.5 h-3.5" />
                <span>
                  Assign to {profileShortTag(targetProfile)} {SLOT_LABELS[targetSlot].short}
                </span>
              </button>
            </div>
          </div>
        </footer>
      </main>

      <StudioSenseModal
        isOpen={studioSenseOpen}
        onClose={() => setStudioSenseOpen(false)}
        customMacros={customMacros}
        onApplySuggestion={handleApplyStudioSenseSuggestion}
        onToast={onToast}
      />
    </div>
  );
};
