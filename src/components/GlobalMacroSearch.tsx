import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  ActionBinding,
  ControlId,
  CustomMacroItem,
  DeviceConnectionInfo,
  HardwareProfileId,
  HardwareSlotId,
  HostOsType,
  MacroStepConfig,
  StudioProfile,
  TextMacroRepeatConfig,
  hostOsFullLabel,
  isBleHostProfile,
  profileShortTag
} from '../types/studio';
import {
  FIRMWARE_STATIC_CATALOG,
  SLOT_LABELS,
  actionContainsTvSteps,
  actionToMacroSteps,
  buildFirmwareActionFromTextConfig,
  calculateStepsTiming,
  deriveAppearanceForAction,
  describeFirmwareAction,
  firmwareActionToBinding,
  formatDurationCompact,
  getMacroCanonicalSignature,
  getShortcutsForHostOs,
  getVisibleHardwareSlots,
  hasKeyHoldCapability,
  isHoldSlot,
  isMotionSlot,
  parseMacroStepTag
} from '../data/firmwareCatalog';
import { extractProfileSlots, getBindingForProfileSlot } from '../hooks/useStudioState';
import {
  ActionKeyId,
  ButtonSlotId,
  KEY_TO_SLOT,
  SLOT_TO_ACTION_KEY
} from '../data/presetTemplates';
import { CURATED_PRESETS } from '../data/presetProfiles';
import { KeycapIcon } from '../data/iconRegistry';
import { STARTER_TEMPLATES } from './MacroEditorView';
import { ParsedActionBadge } from './ActionTagBadge';
import {
  Search,
  X,
  Sliders,
  Play,
  ArrowUpRight,
  Tv,
  CornerDownLeft,
  Layers,
  Bluetooth,
  Plus,
  Zap
} from 'lucide-react';

export interface GlobalMacroSearchOpenBuilderPayload {
  macroId?: string | null;
  name: string;
  action: string;
  repeatConfig?: TextMacroRepeatConfig;
  stepsOverride?: Omit<MacroStepConfig, 'id'>[];
}

interface GlobalMacroSearchProps {
  profiles: StudioProfile[];
  activeProfileId: HardwareProfileId;
  activeHostOs?: HostOsType;
  tvEnabled?: boolean;
  showAdvancedIds?: boolean;
  selectedControl: ControlId;
  customMacros: CustomMacroItem[];
  connection: DeviceConnectionInfo;
  onSaveMacro: (macro: CustomMacroItem) => unknown;
  onAssignSlot: (
    profileId: HardwareProfileId,
    slot: HardwareSlotId,
    binding: ActionBinding
  ) => void;
  onJumpToControl: (profileId: HardwareProfileId, controlId: ControlId) => void;
  onOpenInMacroEditor: (payload: GlobalMacroSearchOpenBuilderPayload) => void;
  onApplyProfilePreset: (
    profileId: HardwareProfileId,
    slots: Partial<Record<HardwareSlotId, string>>,
    presetTitle: string
  ) => void;
  onTestBinding: (binding: ActionBinding) => void;
}

type SearchFilterTab = 'all' | 'custom' | 'assigned' | 'catalog' | 'templates';

const FILTER_TAB_ORDER: SearchFilterTab[] = [
  'all',
  'custom',
  'assigned',
  'catalog',
  'templates'
];

interface SearchResultEntry {
  id: string;
  kind: 'custom' | 'assigned' | 'catalog' | 'sequence_template' | 'preset';
  filterGroup: Exclude<SearchFilterTab, 'all'>;
  title: string;
  metaParts: string[];
  stepPreviewTokens?: string[];
  totalStepCount?: number;
  boundSlotsSummary?: string;
  searchBlob: string;
  icon: string;
  iconColor: string;
  action?: string;
  binding?: ActionBinding;
  customMacroId?: string;
  stepsOverride?: Omit<MacroStepConfig, 'id'>[];
  assignedProfileId?: HardwareProfileId;
  assignedControlId?: ControlId;
  presetMode?: HardwareProfileId;
  presetBindings?: Record<HardwareSlotId, string>;
}

const CATALOG_CATEGORY_LABELS: Record<string, string> = {
  media: 'Media & Keys',
  ble: 'BLE Host',
  tv: 'TV Remote',
  tv_app: 'TV App'
};

function controlToHardwareSlot(control: ControlId): HardwareSlotId {
  if (isHoldSlot(control) || isMotionSlot(control)) return control;
  if (
    control === 'k1' ||
    control === 'k2' ||
    control === 'k3' ||
    control === 'k4' ||
    control === 'k5' ||
    control === 'k6' ||
    control === 'k7' ||
    control === 'k8'
  ) {
    return KEY_TO_SLOT[control as ActionKeyId];
  }
  if (control === 'enc_cw') return 'enc_cw';
  if (control === 'enc_ccw') return 'enc_ccw';
  if (control === 'push_cw') return 'push_cw';
  if (control === 'push_ccw') return 'push_ccw';
  if (control === 'dial' || control === 'encoder') return 'dial';
  if (control === 'e2_cw') return 'e2_cw';
  if (control === 'e2_ccw') return 'e2_ccw';
  if (control === 'dial2' || control === 'encoder2') return 'dial2';
  return 'b1';
}

function hardwareSlotToControl(slot: HardwareSlotId): ControlId {
  if (isHoldSlot(slot) || isMotionSlot(slot)) return slot;
  if (slot === 'dial') return 'dial';
  if (slot === 'enc_cw') return 'enc_cw';
  if (slot === 'enc_ccw') return 'enc_ccw';
  if (slot === 'push_cw') return 'push_cw';
  if (slot === 'push_ccw') return 'push_ccw';
  if (slot === 'dial2') return 'dial2';
  if (slot === 'e2_cw') return 'e2_cw';
  if (slot === 'e2_ccw') return 'e2_ccw';
  return SLOT_TO_ACTION_KEY[slot as ButtonSlotId];
}

function buildStarterTemplateBinding(
  steps: Omit<MacroStepConfig, 'id'>[]
): { action: string; repeatConfig: TextMacroRepeatConfig; binding: ActionBinding } {
  const hydratedSteps: MacroStepConfig[] = steps.map((s, idx) => ({
    ...s,
    id: `tpl-step-${idx + 1}`
  }));

  let legacyText = '';
  let legacyFollowUp = '';
  let legacyKeyDelay = 0;
  if (hydratedSteps.length === 1 && hydratedSteps[0].actionType === 'text') {
    legacyText = hydratedSteps[0].value;
  } else if (
    hydratedSteps.length === 2 &&
    hydratedSteps[0].actionType === 'text' &&
    hydratedSteps[1].actionType === 'key'
  ) {
    legacyText = hydratedSteps[0].value;
    legacyFollowUp = hydratedSteps[1].value;
    legacyKeyDelay = hydratedSteps[0].delayMs;
  }

  const repeatConfig: TextMacroRepeatConfig = {
    text: legacyText,
    followUpKey: legacyFollowUp,
    keyDelayMs: legacyKeyDelay,
    repeatCount: 1,
    loopUntilStopped: false,
    repeatDelayMs: 500,
    steps: hydratedSteps
  };

  const action = buildFirmwareActionFromTextConfig(repeatConfig);
  const binding = firmwareActionToBinding(action, repeatConfig);
  return { action, repeatConfig, binding };
}

export const GlobalMacroSearch: React.FC<GlobalMacroSearchProps> = ({
  profiles,
  activeProfileId,
  activeHostOs = 'mac',
  tvEnabled,
  showAdvancedIds = false,
  selectedControl,
  customMacros,
  connection,
  onSaveMacro,
  onAssignSlot,
  onJumpToControl,
  onOpenInMacroEditor,
  onApplyProfilePreset,
  onTestBinding
}) => {
  const isTvEnabled = tvEnabled ?? (connection.telemetry?.tvEnabled !== false);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SearchFilterTab>('all');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [assignProfile, setAssignProfile] = useState<HardwareProfileId>(
    activeProfileId === 'TV' && !isTvEnabled ? 'HOST1' : activeProfileId
  );
  const [assignSlot, setAssignSlot] = useState<HardwareSlotId>(() =>
    controlToHardwareSlot(selectedControl)
  );

  const modalInputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const isMacPlatform = useMemo(() => {
    if (typeof navigator === 'undefined') return true;
    return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
  }, []);

  const hasKeyHold = hasKeyHoldCapability(connection.telemetry?.capabilities);
  const visibleSlots = useMemo(
    () => getVisibleHardwareSlots(connection.telemetry?.capabilities),
    [connection.telemetry?.capabilities]
  );

  useEffect(() => {
    setAssignProfile(activeProfileId === 'TV' && !isTvEnabled ? 'HOST1' : activeProfileId);
  }, [activeProfileId, isTvEnabled]);

  useEffect(() => {
    const mapped = controlToHardwareSlot(selectedControl);
    setAssignSlot(!hasKeyHold && isHoldSlot(mapped) ? 'b1' : mapped);
  }, [selectedControl, hasKeyHold]);

  useEffect(() => {
    if (!hasKeyHold && isHoldSlot(assignSlot)) {
      setAssignSlot('b1');
    }
  }, [hasKeyHold, assignSlot]);

  const openCommandPalette = useCallback((initialTab?: SearchFilterTab) => {
    if (initialTab) setActiveTab(initialTab);
    setIsOpen(true);
    requestAnimationFrame(() => {
      modalInputRef.current?.focus();
      modalInputRef.current?.select();
    });
  }, []);

  // Global keyboard shortcut: Cmd/Ctrl + K (and '/' when not typing)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isModK =
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        !e.shiftKey &&
        (e.key.toLowerCase() === 'k' || e.code === 'KeyK');

      if (isModK) {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(prev => {
          if (prev && document.activeElement === modalInputRef.current) {
            return false;
          }
          requestAnimationFrame(() => {
            modalInputRef.current?.focus();
            modalInputRef.current?.select();
          });
          return true;
        });
        return;
      }

      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isOpen) {
        if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
        const active = document.activeElement as HTMLElement | null;
        const tag = active?.tagName?.toLowerCase();
        const isEditable =
          tag === 'input' ||
          tag === 'textarea' ||
          tag === 'select' ||
          Boolean(active?.isContentEditable);
        if (!isEditable) {
          e.preventDefault();
          openCommandPalette();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, openCommandPalette]);

  // Focus modal input whenever modal opens
  useEffect(() => {
    if (!isOpen) return;
    const raf = requestAnimationFrame(() => {
      modalInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  const customMacroBySignature = useMemo(() => {
    const map = new Map<string, CustomMacroItem>();
    for (const m of customMacros) {
      const sig = getMacroCanonicalSignature(m.action, m.repeatConfig);
      if (sig && !map.has(sig)) {
        map.set(sig, m);
      }
    }
    return map;
  }, [customMacros]);

  // Map canonical macro signatures to their bound slots across all profiles
  const signatureBoundSlotsMap = useMemo(() => {
    const map = new Map<string, string[]>();
    profiles
      .filter(p => p.id !== 'TV' || isTvEnabled)
      .forEach(prof => {
        const slots = extractProfileSlots(prof);
        visibleSlots.forEach(slot => {
          const raw = slots[slot];
          if (!raw) return;
          const bind = getBindingForProfileSlot(profiles, prof.id, slot);
          const sig = getMacroCanonicalSignature(raw, bind?.repeatConfig);
          if (!sig) return;
          const list = map.get(sig) || [];
          list.push(`${profileShortTag(prof.id)} ${SLOT_LABELS[slot].short}`);
          map.set(sig, list);
        });
      });
    return map;
  }, [profiles, isTvEnabled, visibleSlots]);

  // Build unified site-wide searchable entries
  const allEntries = useMemo<SearchResultEntry[]>(() => {
    const results: SearchResultEntry[] = [];

    // 1. User's Saved Macro Library
    customMacros.forEach(macro => {
      const steps = actionToMacroSteps(macro.action, macro.repeatConfig);
      const timing = calculateStepsTiming(steps);
      const appearance = deriveAppearanceForAction(
        macro.action,
        undefined,
        macro.repeatConfig,
        customMacros
      );
      const binding = firmwareActionToBinding(macro.action, macro.repeatConfig);
      const stepSummary = steps.map(s => `${s.label} ${s.value}`).join(' ');
      const stepPreviewTokens = steps.slice(0, 4).map(s => parseMacroStepTag(s).prettyValue);
      const sig = getMacroCanonicalSignature(macro.action, macro.repeatConfig);
      const boundSlots = sig ? signatureBoundSlotsMap.get(sig) || [] : [];
      const boundSlotsSummary =
        boundSlots.length > 0
          ? `${boundSlots[0]}${boundSlots.length > 1 ? ` +${boundSlots.length - 1}` : ''}`
          : undefined;

      const metaParts: string[] = [
        'Saved Macro',
        `${steps.length} ${steps.length === 1 ? 'step' : 'steps'}`,
        `~${formatDurationCompact(timing.estimatedRunMs)}`
      ];
      if (macro.repeatConfig?.loopUntilStopped) {
        metaParts.push('Loop');
      } else if (macro.repeatConfig && macro.repeatConfig.repeatCount > 1) {
        metaParts.push(`×${macro.repeatConfig.repeatCount}`);
      }
      if (!isTvEnabled && actionContainsTvSteps(macro.action, macro.repeatConfig)) {
        metaParts.push('TV off');
      }

      results.push({
        id: `custom-${macro.id}`,
        kind: 'custom',
        filterGroup: 'custom',
        title: macro.name,
        metaParts,
        stepPreviewTokens,
        totalStepCount: steps.length,
        boundSlotsSummary,
        searchBlob: `${macro.name} ${macro.action} ${stepSummary} ${boundSlots.join(' ')} saved custom macro sequence`.toLowerCase(),
        icon: appearance.icon,
        iconColor: appearance.labelColor,
        action: macro.action,
        binding,
        customMacroId: macro.id
      });
    });

    // 2. Currently Assigned Controls across Host 1–3 & TV Profiles
    const sortedProfiles = [...profiles]
      .filter(p => p.id !== 'TV' || isTvEnabled)
      .sort((a, b) =>
        a.id === activeProfileId ? -1 : b.id === activeProfileId ? 1 : 0
      );

    sortedProfiles.forEach(prof => {
      const slots = extractProfileSlots(prof);
      visibleSlots.forEach(slot => {
        const rawAction = slots[slot] || '';
        const binding = getBindingForProfileSlot(profiles, prof.id, slot);
        const controlId = hardwareSlotToControl(slot);
        const slotLabel = SLOT_LABELS[slot].short;

        const keyCfg =
          slot in SLOT_TO_ACTION_KEY
            ? prof.layers[0].keys[controlId as ActionKeyId]
            : null;

        const slotSig = rawAction
          ? getMacroCanonicalSignature(rawAction, binding?.repeatConfig)
          : '';
        const matchedCustom = slotSig ? customMacroBySignature.get(slotSig) : undefined;
        const desc = rawAction
          ? describeFirmwareAction(rawAction, binding?.repeatConfig, customMacros)
          : null;

        const displayTitle = matchedCustom
          ? matchedCustom.name
          : keyCfg?.appearance.customLabel && keyCfg.appearance.label
          ? keyCfg.appearance.label
          : desc
          ? desc.fullLabel
          : 'Unassigned Slot';

        const appearance = keyCfg
          ? keyCfg.appearance
          : deriveAppearanceForAction(
              rawAction,
              undefined,
              binding?.repeatConfig,
              customMacros
            );

        const metaParts = [
          `${prof.name} (${profileShortTag(prof.id)})`,
          slotLabel
        ];
        if (!isTvEnabled && actionContainsTvSteps(rawAction, binding?.repeatConfig)) {
          metaParts.push('TV off');
        }

        results.push({
          id: `assigned-${prof.id}-${slot}`,
          kind: 'assigned',
          filterGroup: 'assigned',
          title: displayTitle,
          metaParts,
          searchBlob: `${displayTitle} ${prof.name} ${prof.id} ${profileShortTag(prof.id)} ${slotLabel} ${SLOT_LABELS[slot].full} ${slot} ${rawAction} ${desc?.description || ''} assigned pad key knob`.toLowerCase(),
          icon: appearance.icon,
          iconColor: appearance.labelColor,
          action: rawAction,
          binding,
          customMacroId: matchedCustom?.id,
          assignedProfileId: prof.id,
          assignedControlId: controlId
        });
      });

      results.push({
        id: `assigned-${prof.id}-k9`,
        kind: 'assigned',
        filterGroup: 'assigned',
        title: 'Mode Key',
        metaParts: [`${prof.name} (${profileShortTag(prof.id)})`, 'Key 9'],
        searchBlob: `hardware mode switch key 9 k9 9th button profile toggle bluetooth ble host 1 2 3 dial setup oled ${prof.name} ${prof.id} ${profileShortTag(prof.id)}`.toLowerCase(),
        icon: 'layers',
        iconColor: '#F2A33A',
        assignedProfileId: prof.id,
        assignedControlId: 'k9'
      });
    });

    // 3. Multi-Step Starter Sequences & Curated Pad Presets
    STARTER_TEMPLATES.filter(tpl => isTvEnabled || tpl.category !== 'tv').forEach(tpl => {
      const compiled = buildStarterTemplateBinding(tpl.steps);
      const tplSig = getMacroCanonicalSignature(compiled.action, compiled.repeatConfig);
      const existingSaved = tplSig ? customMacroBySignature.get(tplSig) : undefined;
      const stepKeywords = tpl.steps.map(s => `${s.label} ${s.value}`).join(' ');
      const hydrated = tpl.steps.map((s, idx) => ({ ...s, id: `${tpl.id}-${idx}` }));
      const stepPreviewTokens = hydrated.slice(0, 4).map(s => parseMacroStepTag(s).prettyValue);

      results.push({
        id: `seq-tpl-${tpl.id}`,
        kind: 'sequence_template',
        filterGroup: 'templates',
        title: tpl.name,
        metaParts: ['Smart Recipe', tpl.summary],
        stepPreviewTokens,
        totalStepCount: tpl.steps.length,
        searchBlob: `${tpl.name} ${tpl.summary} ${stepKeywords} ${tpl.category || ''} starter template recipe multi step sequence macro`.toLowerCase(),
        icon: 'zap',
        iconColor: '#F2A33A',
        action: compiled.action,
        binding: compiled.binding,
        customMacroId: existingSaved?.id,
        stepsOverride: tpl.steps
      });
    });

    CURATED_PRESETS.filter(preset => isTvEnabled || preset.mode !== 'TV').forEach(preset => {
      const bleMode = isBleHostProfile(preset.mode);
      results.push({
        id: `preset-${preset.id}`,
        kind: 'preset',
        filterGroup: 'templates',
        title: preset.title,
        metaParts: [
          'Pad Preset',
          `${profileShortTag(preset.mode)}`,
          preset.subtitle
        ],
        searchBlob: `${preset.title} ${preset.subtitle} ${preset.description} ${preset.mode} ${profileShortTag(preset.mode)} preset layout profile`.toLowerCase(),
        icon: bleMode ? 'monitor' : 'tv',
        iconColor: bleMode ? '#F2A33A' : '#ECEAE4',
        presetMode: preset.mode,
        presetBindings: preset.bindings
      });
    });

    // 4. Per-Device OS Mapped Shortcuts + Non-OS Static Actions
    const mappedShortcuts = getShortcutsForHostOs(activeHostOs);
    const mappedShortcutActions = new Set<string>();
    mappedShortcuts.forEach(spec => {
      mappedShortcutActions.add(spec.action);
      const binding = firmwareActionToBinding(spec.action);
      results.push({
        id: `catalog-os-${spec.id}`,
        kind: 'catalog',
        filterGroup: 'catalog',
        title: spec.label,
        metaParts: [`Shortcut (${hostOsFullLabel(activeHostOs)})`, spec.shortcutHint],
        searchBlob: `${spec.label} ${spec.shortcutHint} ${spec.description} ${spec.action} ${hostOsFullLabel(activeHostOs)} shortcut`.toLowerCase(),
        icon: spec.icon,
        iconColor: spec.color,
        action: spec.action,
        binding
      });
    });

    FIRMWARE_STATIC_CATALOG.filter(
      spec =>
        !mappedShortcutActions.has(spec.action) &&
        spec.category !== 'mac_macro' &&
        spec.category !== 'win_macro' &&
        (isTvEnabled || (spec.category !== 'tv' && spec.category !== 'tv_app'))
    ).forEach(spec => {
      const catLabel = CATALOG_CATEGORY_LABELS[spec.category] || 'Action';
      const binding = firmwareActionToBinding(spec.action);
      results.push({
        id: `catalog-${spec.action}`,
        kind: 'catalog',
        filterGroup: 'catalog',
        title: spec.label,
        metaParts: [catLabel, spec.description],
        searchBlob: `${spec.label} ${spec.shortLabel} ${spec.description} ${spec.action} ${catLabel}`.toLowerCase(),
        icon: spec.icon,
        iconColor: spec.color,
        action: spec.action,
        binding
      });
    });

    return results;
  }, [
    profiles,
    activeProfileId,
    activeHostOs,
    isTvEnabled,
    customMacros,
    customMacroBySignature,
    signatureBoundSlotsMap,
    visibleSlots
  ]);

  const { filteredEntries, tabCounts } = useMemo(() => {
    const tokens = query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    const matchedWithScores: { entry: SearchResultEntry; score: number }[] = [];

    allEntries.forEach(entry => {
      if (tokens.length === 0) {
        if (
          entry.kind === 'assigned' &&
          (!entry.action || entry.assignedControlId === 'k9') &&
          activeTab === 'all'
        ) {
          return;
        }
        let defaultScore = 10;
        if (entry.kind === 'custom') defaultScore = 100;
        else if (entry.kind === 'sequence_template') defaultScore = 80;
        else if (
          entry.kind === 'assigned' &&
          entry.assignedProfileId === activeProfileId
        ) {
          defaultScore = 60;
        } else if (entry.kind === 'catalog') {
          defaultScore = 40;
        } else if (entry.kind === 'preset') {
          defaultScore = 30;
        }
        matchedWithScores.push({ entry, score: defaultScore });
        return;
      }

      const matchesAll = tokens.every(tok => entry.searchBlob.includes(tok));
      if (!matchesAll) return;

      const titleLower = entry.title.toLowerCase();
      const fullQuery = tokens.join(' ');
      let score = 20;

      if (titleLower === fullQuery) score += 140;
      else if (titleLower.startsWith(fullQuery)) score += 90;
      else if (tokens.every(tok => titleLower.includes(tok))) score += 55;

      if (entry.action && entry.action.toLowerCase().includes(fullQuery)) {
        score += 45;
      }
      if (entry.kind === 'custom') score += 30;
      if (entry.kind === 'sequence_template') score += 15;
      if (entry.assignedProfileId === activeProfileId) score += 12;

      matchedWithScores.push({ entry, score });
    });

    matchedWithScores.sort((a, b) => b.score - a.score);

    const counts: Record<SearchFilterTab, number> = {
      all: matchedWithScores.length,
      custom: 0,
      assigned: 0,
      catalog: 0,
      templates: 0
    };

    matchedWithScores.forEach(({ entry }) => {
      counts[entry.filterGroup] += 1;
    });

    const tabFiltered = matchedWithScores
      .filter(({ entry }) => activeTab === 'all' || entry.filterGroup === activeTab)
      .map(({ entry }) => entry);

    const capped =
      tokens.length === 0 && activeTab === 'all'
        ? tabFiltered.slice(0, 36)
        : tabFiltered.slice(0, 64);

    return { filteredEntries: capped, tabCounts: counts };
  }, [allEntries, query, activeTab, activeProfileId]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, activeTab]);

  useEffect(() => {
    if (!isOpen) return;
    const el = itemRefs.current[highlightedIndex];
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, isOpen]);

  const currentTargetSlotSummary = useMemo(() => {
    const currentBinding = getBindingForProfileSlot(profiles, assignProfile, assignSlot);
    if (!currentBinding?.value) return 'Empty';
    return describeFirmwareAction(
      currentBinding.value,
      currentBinding.repeatConfig,
      customMacros
    ).shortLabel;
  }, [profiles, assignProfile, assignSlot, customMacros]);

  const handleAssignEntry = useCallback(
    (entry: SearchResultEntry) => {
      if (!entry.binding || !entry.action) return;

      if (entry.kind === 'sequence_template') {
        const sig = getMacroCanonicalSignature(entry.action, entry.binding.repeatConfig);
        if (!sig || !customMacroBySignature.has(sig)) {
          const savedItem: CustomMacroItem = {
            id: `macro-${Date.now()}`,
            name: entry.title,
            action: entry.action,
            repeatConfig: entry.binding.repeatConfig,
            createdAt: new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit'
            }),
            source: 'user'
          };
          onSaveMacro(savedItem);
        }
      }

      onAssignSlot(assignProfile, assignSlot, entry.binding);
      setIsOpen(false);
    },
    [assignProfile, assignSlot, customMacroBySignature, onAssignSlot, onSaveMacro]
  );

  const handleOpenInBuilder = useCallback(
    (entry: SearchResultEntry) => {
      if (!entry.action && !entry.stepsOverride) return;
      onOpenInMacroEditor({
        macroId: entry.customMacroId ?? null,
        name: entry.title,
        action: entry.action || '',
        repeatConfig: entry.binding?.repeatConfig,
        stepsOverride: entry.stepsOverride
      });
      setIsOpen(false);
    },
    [onOpenInMacroEditor]
  );

  const handleCreateNewMacro = useCallback(() => {
    onOpenInMacroEditor({
      macroId: null,
      name: query.trim() || 'New Smart Action',
      action: activeHostOs === 'mac' ? 'SHORTCUT:cmd:space' : 'SHORTCUT:ctrl:space'
    });
    setIsOpen(false);
  }, [activeHostOs, onOpenInMacroEditor, query]);

  const handlePrimaryAction = useCallback(
    (entry: SearchResultEntry) => {
      if (entry.kind === 'assigned') {
        if (entry.assignedProfileId && entry.assignedControlId) {
          onJumpToControl(entry.assignedProfileId, entry.assignedControlId);
          setIsOpen(false);
        }
        return;
      }
      if (entry.kind === 'preset') {
        if (entry.presetMode && entry.presetBindings) {
          onApplyProfilePreset(entry.presetMode, entry.presetBindings, entry.title);
          setIsOpen(false);
        }
        return;
      }
      handleAssignEntry(entry);
    },
    [handleAssignEntry, onApplyProfilePreset, onJumpToControl]
  );

  const handleModalInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (query) {
        setQuery('');
      } else {
        setIsOpen(false);
      }
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const idx = FILTER_TAB_ORDER.indexOf(activeTab);
      const nextIdx = e.shiftKey
        ? (idx - 1 + FILTER_TAB_ORDER.length) % FILTER_TAB_ORDER.length
        : (idx + 1) % FILTER_TAB_ORDER.length;
      setActiveTab(FILTER_TAB_ORDER[nextIdx]);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filteredEntries.length > 0) {
        setHighlightedIndex(prev => (prev + 1) % filteredEntries.length);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredEntries.length > 0) {
        setHighlightedIndex(prev =>
          prev - 1 < 0 ? filteredEntries.length - 1 : prev - 1
        );
      }
      return;
    }

    if (e.key === 'Enter' && filteredEntries.length > 0) {
      e.preventDefault();
      const target = filteredEntries[highlightedIndex] || filteredEntries[0];
      if (!target) return;

      if (e.altKey && target.binding && target.action) {
        onTestBinding(target.binding);
        return;
      }

      if (
        e.shiftKey &&
        (target.kind === 'custom' ||
          target.kind === 'catalog' ||
          target.kind === 'sequence_template' ||
          (target.kind === 'assigned' && target.action))
      ) {
        handleOpenInBuilder(target);
      } else {
        handlePrimaryAction(target);
      }
    }
  };

  const filterTabs: { id: SearchFilterTab; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: tabCounts.all },
    { id: 'custom', label: 'My Macros', count: tabCounts.custom },
    { id: 'assigned', label: 'On Pad', count: tabCounts.assigned },
    { id: 'catalog', label: 'Actions', count: tabCounts.catalog },
    { id: 'templates', label: 'Recipes', count: tabCounts.templates }
  ];

  return (
    <div className="relative w-full min-w-0 flex items-center">
      {/* Compact Mobile Search Button (< md) */}
      <button
        type="button"
        onClick={() => openCommandPalette()}
        aria-label="Open Command Palette & Macro Search (Cmd+K)"
        title={`Search macros, actions & presets (${isMacPlatform ? '⌘K' : 'Ctrl+K'})`}
        className="md:hidden flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors cursor-pointer shrink-0"
      >
        <Search className="w-4 h-4" />
      </button>

      {/* Desktop TopBar Command Palette Trigger (>= md) */}
      <button
        type="button"
        onClick={() => openCommandPalette()}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label="Search macros, actions & presets (Cmd+K)"
        className={`hidden md:flex items-center justify-between gap-2 px-3 h-9 rounded-xl bg-[var(--bg-input)] border transition-colors w-full cursor-pointer text-left group ${
          isOpen
            ? 'border-[var(--accent)] shadow-xs'
            : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
        }`}
      >
        <span className="flex items-center gap-2 min-w-0 flex-1">
          <Search className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors shrink-0" />
          <span className="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] truncate transition-colors">
            {query ? `Search: "${query}"` : 'Search macros, actions & presets…'}
          </span>
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          {customMacros.length > 0 && (
            <span className="hidden lg:inline font-mono text-[10px] text-[var(--text-muted)] tabular-nums">
              {customMacros.length} {customMacros.length === 1 ? 'macro' : 'macros'}
            </span>
          )}
          <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-subtle)] font-mono text-[10px] font-semibold text-[var(--text-secondary)] shrink-0">
            {isMacPlatform ? '⌘K' : 'Ctrl K'}
          </kbd>
        </span>
      </button>

      {/* Flagship Global Command Palette Modal */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="global-macro-search-title"
          className="fixed inset-0 z-50 flex items-start justify-center pt-10 sm:pt-16 px-3 sm:px-4 pb-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setIsOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[calc(100dvh-5rem)] rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-strong)] shadow-2xl flex flex-col overflow-hidden animate-popover-in"
          >
            {/* Dedicated Command Palette Search Input Header */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] shrink-0">
              <Search className="w-4 h-4 text-[var(--accent)] shrink-0" />
              <h2 id="global-macro-search-title" className="sr-only">
                Global Macro &amp; Action Command Palette
              </h2>
              <input
                ref={modalInputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleModalInputKeyDown}
                role="combobox"
                aria-expanded={isOpen}
                aria-controls="global-macro-search-listbox"
                aria-autocomplete="list"
                aria-label="Search saved macros, starter recipes, shortcuts, and hardware controls"
                placeholder="Search macros, recipes, shortcuts, pad keys, or type a name to create…"
                className="flex-1 min-w-0 bg-transparent text-xs sm:text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none select-text"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    modalInputRef.current?.focus();
                  }}
                  aria-label="Clear search query"
                  className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={handleCreateNewMacro}
                title="Create a new multi-step macro in Macro Studio"
                className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-[11px] font-semibold text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>New Macro</span>
              </button>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close command palette"
                title="Close (Esc)"
                className="px-2 py-1 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-panel)] border border-[var(--border-subtle)] font-mono text-[10px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shrink-0"
              >
                ESC
              </button>
            </div>

            {/* Filter Tabs + Quick Target Slot Assignment Bar */}
            <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)] space-y-2.5 shrink-0">
              <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
                <div
                  role="tablist"
                  aria-label="Filter command palette categories"
                  className="flex items-center gap-0.5 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]"
                >
                  {filterTabs.map(tab => {
                    const selected = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => {
                          setActiveTab(tab.id);
                          modalInputRef.current?.focus();
                        }}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          selected
                            ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-semibold shadow-2xs'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                        }`}
                      >
                        <span>{tab.label}</span>
                        <span className="font-mono text-[10px] opacity-75 tabular-nums">
                          {tab.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <span className="hidden md:inline text-[10px] font-mono text-[var(--text-muted)] whitespace-nowrap shrink-0">
                  Press <strong className="text-[var(--text-secondary)]">Tab</strong> to cycle tabs
                </span>
              </div>

              {/* Target Slot Selector */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                  <Layers className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  <span className="font-medium">Quick-assign target:</span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <div className="inline-flex items-center p-0.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)]">
                    {profiles.filter(p => p.id !== 'TV' || isTvEnabled).map(prof => {
                      const active = assignProfile === prof.id;
                      const ProfIcon = isBleHostProfile(prof.id) ? Bluetooth : Tv;
                      return (
                        <button
                          key={prof.id}
                          type="button"
                          onClick={() => {
                            setAssignProfile(prof.id);
                            modalInputRef.current?.focus();
                          }}
                          title={`${prof.name} (${profileShortTag(prof.id)})`}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                            active
                              ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-semibold shadow-2xs'
                              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                          }`}
                        >
                          <ProfIcon className="w-3 h-3" />
                          <span>{profileShortTag(prof.id)}</span>
                        </button>
                      );
                    })}
                  </div>

                  <select
                    aria-label="Target control slot for macro assignment"
                    value={assignSlot}
                    onChange={e => {
                      setAssignSlot(e.target.value as HardwareSlotId);
                      modalInputRef.current?.focus();
                    }}
                    className="px-2 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[11px] font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
                  >
                    {visibleSlots.map(slot => (
                      <option key={slot} value={slot}>
                        {SLOT_LABELS[slot].short}
                      </option>
                    ))}
                  </select>

                  <span className="text-[var(--text-muted)] text-[11px] hidden sm:inline truncate max-w-[160px]">
                    ({currentTargetSlotSummary})
                  </span>
                </div>
              </div>
            </div>

            {/* Search Results List */}
            <div
              id="global-macro-search-listbox"
              role="listbox"
              aria-label="Macro and action search results"
              className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)]/60"
            >
              {filteredEntries.length === 0 ? (
                <div className="px-6 py-10 text-center space-y-2.5">
                  <div className="text-xs font-semibold text-[var(--text-primary)]">
                    No actions or macros match “{query}”
                  </div>
                  <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto leading-relaxed">
                    Search by shortcut (Copy, Close Tab, Spotlight, F13), streaming app (Netflix, YouTube), pad slot (Key 5, Knob), or build a custom multi-step sequence.
                  </p>
                  <div className="pt-2 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={handleCreateNewMacro}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>
                        {query.trim()
                          ? `Build “${query.trim().slice(0, 28)}” in Macro Studio`
                          : 'Create New Sequence in Macro Studio'}
                      </span>
                    </button>
                  </div>
                </div>
              ) : (
                filteredEntries.map((entry, idx) => {
                  const isHighlighted = idx === highlightedIndex;
                  const canCustomize =
                    entry.kind === 'custom' ||
                    entry.kind === 'catalog' ||
                    entry.kind === 'sequence_template' ||
                    (entry.kind === 'assigned' && Boolean(entry.action));

                  return (
                    <div
                      key={entry.id}
                      ref={el => {
                        itemRefs.current[idx] = el;
                      }}
                      role="option"
                      aria-selected={isHighlighted}
                      title={entry.action ? `${entry.title} — ${entry.action}` : entry.title}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      onClick={() => handlePrimaryAction(entry)}
                      className={`px-4 py-2.5 flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                        isHighlighted ? 'bg-[rgba(var(--accent-rgb),0.10)]' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0">
                          <KeycapIcon
                            icon={entry.icon}
                            className={`w-4 h-4 ${
                              isHighlighted
                                ? 'text-[var(--accent)]'
                                : 'text-[var(--text-secondary)]'
                            }`}
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                              {entry.title}
                            </span>
                            {entry.boundSlotsSummary && (
                              <span className="font-mono text-[10px] font-medium text-[var(--accent)] shrink-0">
                                · {entry.boundSlotsSummary}
                              </span>
                            )}
                            {showAdvancedIds && entry.action && (
                              <ParsedActionBadge
                                action={entry.action}
                                repeatConfig={entry.binding?.repeatConfig}
                                showRawId
                                maxSteps={2}
                                className="shrink-0"
                              />
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] truncate mt-0.5 tabular-nums">
                            {entry.metaParts.map((part, pIdx) => (
                              <React.Fragment key={pIdx}>
                                {pIdx > 0 && <span aria-hidden="true">·</span>}
                                <span className="truncate">{part}</span>
                              </React.Fragment>
                            ))}
                            {entry.stepPreviewTokens && entry.stepPreviewTokens.length > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono text-[10px] text-[var(--text-secondary)] truncate">
                                  {entry.stepPreviewTokens.join(' → ')}
                                  {entry.totalStepCount &&
                                  entry.totalStepCount > entry.stepPreviewTokens.length
                                    ? ` +${entry.totalStepCount - entry.stepPreviewTokens.length}`
                                    : ''}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div
                        className="flex items-center gap-1.5 shrink-0"
                        onClick={e => e.stopPropagation()}
                      >
                        {entry.binding && entry.action && (
                          <button
                            type="button"
                            onClick={() => onTestBinding(entry.binding!)}
                            title={`Preview & test "${entry.title}" (Alt + Enter)`}
                            className="p-1.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
                          >
                            <Play className="w-3 h-3" />
                          </button>
                        )}

                        {canCustomize && (
                          <button
                            type="button"
                            onClick={() => handleOpenInBuilder(entry)}
                            title="Open in Macro Studio (Shift + Enter)"
                            className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <Sliders className="w-3 h-3" />
                            <span>{entry.customMacroId ? 'Edit' : 'Customize'}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handlePrimaryAction(entry)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                            isHighlighted
                              ? 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-xs'
                              : 'bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)]'
                          }`}
                        >
                          {entry.kind === 'assigned' ? (
                            <>
                              <span>View Key</span>
                              <ArrowUpRight className="w-3 h-3" />
                            </>
                          ) : entry.kind === 'preset' ? (
                            <>
                              <span>
                                Apply{' '}
                                {entry.presetMode
                                  ? profileShortTag(entry.presetMode)
                                  : ''}
                              </span>
                              <CornerDownLeft className="w-3 h-3" />
                            </>
                          ) : (
                            <span>Assign · {SLOT_LABELS[assignSlot].short}</span>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Clean Keyboard Navigation Footer */}
            <div className="px-4 py-2.5 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-muted)] shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span>
                  <strong className="font-mono text-[var(--text-secondary)]">↑↓</strong>{' '}
                  Navigate
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  <strong className="font-mono text-[var(--text-secondary)]">↵</strong>{' '}
                  Assign / Jump
                </span>
                <span className="hidden sm:inline" aria-hidden="true">
                  ·
                </span>
                <span className="hidden sm:inline">
                  <strong className="font-mono text-[var(--text-secondary)]">⇧↵</strong>{' '}
                  Edit in Builder
                </span>
                <span className="hidden md:inline" aria-hidden="true">
                  ·
                </span>
                <span className="hidden md:inline">
                  <strong className="font-mono text-[var(--text-secondary)]">⌥↵</strong>{' '}
                  Test
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  <strong className="font-mono text-[var(--text-secondary)]">Esc</strong>{' '}
                  Close
                </span>
              </div>
              <span className="font-mono text-[10px] tabular-nums">
                {tabCounts.all} {tabCounts.all === 1 ? 'item' : 'items'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
