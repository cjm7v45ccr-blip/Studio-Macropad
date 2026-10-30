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
  HARDWARE_SLOTS,
  SLOT_LABELS,
  actionToMacroSteps,
  buildFirmwareActionFromTextConfig,
  calculateStepsTiming,
  deriveAppearanceForAction,
  describeFirmwareAction,
  firmwareActionToBinding,
  formatDurationCompact,
  getActionTestAvailability,
  getMacroCanonicalSignature,
  getShortcutsForHostOs
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
  Bluetooth
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

interface SearchResultEntry {
  id: string;
  kind: 'custom' | 'assigned' | 'catalog' | 'sequence_template' | 'preset';
  filterGroup: Exclude<SearchFilterTab, 'all'>;
  title: string;
  metaParts: string[];
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
  if (control === 'dial' || control === 'encoder') return 'dial';
  return 'b1';
}

function hardwareSlotToControl(slot: HardwareSlotId): ControlId {
  if (slot === 'dial') return 'dial';
  if (slot === 'enc_cw') return 'enc_cw';
  if (slot === 'enc_ccw') return 'enc_ccw';
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
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SearchFilterTab>('all');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [assignProfile, setAssignProfile] = useState<HardwareProfileId>(activeProfileId);
  const [assignSlot, setAssignSlot] = useState<HardwareSlotId>(() =>
    controlToHardwareSlot(selectedControl)
  );

  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const isMacPlatform = useMemo(() => {
    if (typeof navigator === 'undefined') return true;
    return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
  }, []);

  useEffect(() => {
    setAssignProfile(activeProfileId);
  }, [activeProfileId]);

  useEffect(() => {
    setAssignSlot(controlToHardwareSlot(selectedControl));
  }, [selectedControl]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (wrapperRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;

      const isModK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (isModK) {
        e.preventDefault();
        setIsOpen(true);
        requestAnimationFrame(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        });
        return;
      }

      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const active = document.activeElement as HTMLElement | null;
        const tag = active?.tagName?.toLowerCase();
        const isEditable =
          tag === 'input' ||
          tag === 'textarea' ||
          tag === 'select' ||
          Boolean(active?.isContentEditable);
        if (!isEditable) {
          e.preventDefault();
          setIsOpen(true);
          requestAnimationFrame(() => {
            inputRef.current?.focus();
          });
        }
      }
    };

    window.addEventListener('keydown', onKeyDown, false);
    return () => window.removeEventListener('keydown', onKeyDown, false);
  }, []);

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

  // Build unified site-wide searchable entries
  const allEntries = useMemo<SearchResultEntry[]>(() => {
    const results: SearchResultEntry[] = [];

    // 1. User's Single Macro Library
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

      const metaParts: string[] = [
        'My Macro',
        `${steps.length} ${steps.length === 1 ? 'step' : 'steps'}`,
        `~${formatDurationCompact(timing.estimatedRunMs)}`
      ];
      if (macro.repeatConfig?.loopUntilStopped) {
        metaParts.push('Loop');
      } else if (macro.repeatConfig && macro.repeatConfig.repeatCount > 1) {
        metaParts.push(`×${macro.repeatConfig.repeatCount}`);
      }

      results.push({
        id: `custom-${macro.id}`,
        kind: 'custom',
        filterGroup: 'custom',
        title: macro.name,
        metaParts,
        searchBlob: `${macro.name} ${macro.action} ${stepSummary} saved custom macro sequence`.toLowerCase(),
        icon: appearance.icon,
        iconColor: appearance.labelColor,
        action: macro.action,
        binding,
        customMacroId: macro.id
      });
    });

    // 2. Currently Assigned Controls across Host 1–3 & TV Profiles
    const sortedProfiles = [...profiles].sort((a, b) =>
      a.id === activeProfileId ? -1 : b.id === activeProfileId ? 1 : 0
    );

    sortedProfiles.forEach(prof => {
      const slots = extractProfileSlots(prof);
      HARDWARE_SLOTS.forEach(slot => {
        const rawAction = slots[slot] || '';
        const binding = getBindingForProfileSlot(profiles, prof.id, slot);
        const controlId = hardwareSlotToControl(slot);
        const slotLabel = SLOT_LABELS[slot].short;

        const keyCfg =
          slot !== 'dial' && slot !== 'enc_cw' && slot !== 'enc_ccw'
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
        iconColor: '#38BDF8',
        assignedProfileId: prof.id,
        assignedControlId: 'k9'
      });
    });

    // 3. Multi-Step Starter Sequences & Curated Pad Presets
    STARTER_TEMPLATES.forEach(tpl => {
      const compiled = buildStarterTemplateBinding(tpl.steps);
      const tplSig = getMacroCanonicalSignature(compiled.action, compiled.repeatConfig);
      const existingSaved = tplSig ? customMacroBySignature.get(tplSig) : undefined;
      const stepKeywords = tpl.steps.map(s => `${s.label} ${s.value}`).join(' ');
      results.push({
        id: `seq-tpl-${tpl.id}`,
        kind: 'sequence_template',
        filterGroup: 'templates',
        title: tpl.name,
        metaParts: ['Starter Recipe', tpl.summary],
        searchBlob: `${tpl.name} ${tpl.summary} ${stepKeywords} starter template recipe multi step sequence macro`.toLowerCase(),
        icon: 'zap',
        iconColor: '#38BDF8',
        action: compiled.action,
        binding: compiled.binding,
        customMacroId: existingSaved?.id,
        stepsOverride: tpl.steps
      });
    });

    CURATED_PRESETS.forEach(preset => {
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
        iconColor: bleMode ? '#3B82F6' : '#10B981',
        presetMode: preset.mode,
        presetBindings: preset.bindings
      });
    });

    // 4. Per-Device OS Mapped Shortcuts + Non-OS Static Actions (no duplicate Mac + PC rows!)
    const mappedShortcuts = getShortcutsForHostOs(activeHostOs);
    mappedShortcuts.forEach(spec => {
      const binding = firmwareActionToBinding(spec.action);
      results.push({
        id: `catalog-os-${spec.id}`,
        kind: 'catalog',
        filterGroup: 'catalog',
        title: spec.label,
        metaParts: [`Shortcut (${hostOsFullLabel(activeHostOs)})`, spec.shortcutHint],
        searchBlob: `${spec.label} ${spec.shortcutHint} ${spec.description} ${spec.action} shortcut`.toLowerCase(),
        icon: spec.icon,
        iconColor: spec.color,
        action: spec.action,
        binding
      });
    });

    FIRMWARE_STATIC_CATALOG.filter(
      spec => spec.category !== 'mac_macro' && spec.category !== 'win_macro'
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
  }, [profiles, activeProfileId, activeHostOs, customMacros, customMacroBySignature]);

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
        ? tabFiltered.slice(0, 32)
        : tabFiltered.slice(0, 60);

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

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (query) {
        setQuery('');
      } else {
        setIsOpen(false);
        inputRef.current?.blur();
      }
      return;
    }

    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setIsOpen(true);
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
    { id: 'templates', label: 'Templates', count: tabCounts.templates }
  ];

  return (
    <div ref={wrapperRef} className="relative w-full min-w-0">
      {/* Widened Site-Wide Search Input */}
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--bg-input)] border transition-colors w-full ${
          isOpen
            ? 'border-[var(--accent)] shadow-xs'
            : 'border-transparent hover:border-[var(--border-subtle)]'
        }`}
      >
        <Search className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onFocus={() => setIsOpen(true)}
          onClick={() => setIsOpen(true)}
          onChange={e => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onKeyDown={handleInputKeyDown}
          role="combobox"
          aria-expanded={isOpen}
          aria-controls="global-macro-search-listbox"
          aria-autocomplete="list"
          aria-label="Search actions and macros across workspace"
          placeholder="Search actions & macros…"
          className="flex-1 min-w-0 bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none select-text"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <kbd className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-[var(--bg-elevated)] font-mono text-[10px] text-[var(--text-muted)] shrink-0">
            {isMacPlatform ? '⌘K' : 'Ctrl K'}
          </kbd>
        )}
      </div>

      {/* Site-Wide Search Backdrop + Results Command Panel */}
      {isOpen && (
        <>
          <div
            aria-hidden="true"
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-30 bg-black/35 backdrop-blur-[1px]"
          />

          <div
            ref={panelRef}
            className="fixed top-14 left-1/2 -translate-x-1/2 w-[min(96vw,700px)] max-h-[calc(100dvh-76px)] z-50 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] shadow-2xl flex flex-col overflow-hidden animate-popover-in"
          >
            {/* Filter Tabs + Quick Target Slot Assignment Bar */}
            <div className="px-3.5 pt-3 pb-2.5 border-b border-[var(--border-subtle)] space-y-2.5 shrink-0">
              <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
                <div
                  role="tablist"
                  aria-label="Filter search results"
                  className="flex items-center gap-0.5 p-1 rounded-xl bg-[var(--bg-input)]"
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
                          inputRef.current?.focus();
                        }}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          selected
                            ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-semibold shadow-2xs'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                        }`}
                      >
                        <span>{tab.label}</span>
                        <span className="font-mono text-[10px] opacity-70 tabular-nums">
                          {tab.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer shrink-0"
                  title="Close search (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Target Slot Selector */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                  <Layers className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  <span className="font-medium">Assign to:</span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <div className="inline-flex items-center p-0.5 rounded-lg bg-[var(--bg-input)]">
                    {profiles.map(prof => {
                      const active = assignProfile === prof.id;
                      const ProfIcon = isBleHostProfile(prof.id) ? Bluetooth : Tv;
                      return (
                        <button
                          key={prof.id}
                          type="button"
                          onClick={() => {
                            setAssignProfile(prof.id);
                            inputRef.current?.focus();
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
                      inputRef.current?.focus();
                    }}
                    className="px-2 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[11px] font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
                  >
                    {HARDWARE_SLOTS.map(slot => (
                      <option key={slot} value={slot}>
                        {SLOT_LABELS[slot].short}
                      </option>
                    ))}
                  </select>

                  <span className="text-[var(--text-muted)] text-[11px] hidden sm:inline truncate max-w-[140px]">
                    ({currentTargetSlotSummary})
                  </span>
                </div>
              </div>
            </div>

            {/* Search Results List */}
            <div
              id="global-macro-search-listbox"
              role="listbox"
              aria-label="Macro search results"
              className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)]/60"
            >
              {filteredEntries.length === 0 ? (
                <div className="px-6 py-10 text-center space-y-2">
                  <div className="text-xs font-semibold text-[var(--text-primary)]">
                    No actions or macros match “{query}”
                  </div>
                  <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
                    Search by shortcut (Copy, Close Tab, F13), streaming app (Netflix, YouTube), pad slot (Key 5, Knob), or build a custom macro.
                  </p>
                  {query.trim() && (
                    <div className="pt-2 flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onOpenInMacroEditor({
                            macroId: null,
                            name: query.trim(),
                            action: 'SHORTCUT:cmd,shift:4'
                          });
                          setIsOpen(false);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        <span>Build “{query.trim().slice(0, 28)}” in Macro Builder</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                filteredEntries.map((entry, idx) => {
                  const isHighlighted = idx === highlightedIndex;
                  const canCustomize =
                    entry.kind === 'custom' ||
                    entry.kind === 'catalog' ||
                    entry.kind === 'sequence_template' ||
                    (entry.kind === 'assigned' && Boolean(entry.action));

                  const testAvailability =
                    entry.action && entry.binding
                      ? getActionTestAvailability(entry.action, connection)
                      : { canTest: false, reason: 'Unassigned slot' };

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
                      className={`px-3.5 py-2.5 flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                        isHighlighted ? 'bg-[rgba(var(--accent-rgb),0.09)]' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-[var(--bg-input)] flex items-center justify-center shrink-0">
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
                            disabled={!testAvailability.canTest}
                            title={
                              testAvailability.canTest
                                ? `Test "${entry.title}" now`
                                : testAvailability.reason ||
                                  'Connect USB pad or start Demo Mode to test'
                            }
                            className="p-1.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
                          >
                            <Play className="w-3 h-3" />
                          </button>
                        )}

                        {canCustomize && (
                          <button
                            type="button"
                            onClick={() => handleOpenInBuilder(entry)}
                            title="Open in Macro Builder (Shift + Enter)"
                            className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap"
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
                              ? 'bg-[var(--accent)] text-white shadow-xs'
                              : 'bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)]'
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
            <div className="px-3.5 py-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-muted)] shrink-0">
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
                  Open in Builder
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  <strong className="font-mono text-[var(--text-secondary)]">Esc</strong>{' '}
                  Close
                </span>
              </div>
              <span className="font-mono text-[10px] tabular-nums">
                {tabCounts.all} items
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
