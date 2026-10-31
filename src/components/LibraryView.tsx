import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CustomMacroItem,
  HARDWARE_PROFILE_IDS,
  HardwareBackupPayload,
  HardwareProfileId,
  HardwareSlotId,
  SlotRepeatMap,
  StudioProfile,
  UserPreset,
  isBleHostProfile,
  normalizeHardwareProfileId,
  profileShortTag
} from '../types/studio';
import { CURATED_PRESETS, ProfilePreset } from '../data/presetProfiles';
import {
  FACTORY_DEFAULT_SLOTS,
  HARDWARE_SLOTS,
  SLOT_LABELS,
  describeFirmwareAction,
  getProfilePresetSignature
} from '../data/firmwareCatalog';
import {
  extractProfileSlots,
  extractRepeatMapFromProfiles
} from '../hooks/useStudioState';
import { DiffConfirmModal, DiffPreviewRow } from './DiffConfirmModal';
import { ParsedActionBadge } from './ActionTagBadge';
import {
  Download,
  Upload,
  BookmarkPlus,
  Trash2,
  Copy,
  RefreshCw,
  ArrowRight,
  Bluetooth,
  Tv,
  Sliders,
  RotateCcw,
  Search,
  X,
  MoreHorizontal
} from 'lucide-react';

interface LibraryViewProps {
  profiles: StudioProfile[];
  activeProfileId: HardwareProfileId;
  userPresets: UserPreset[];
  customMacros: CustomMacroItem[];
  isConnected: boolean;
  showAdvancedIds?: boolean;
  onPullFromUsb: () => void;
  onPushAllToUsb: () => void;
  onCopyHardwareProfile: (source: HardwareProfileId, target: HardwareProfileId) => void;
  onAssignProfileSlots: (
    profileId: HardwareProfileId,
    slots: Partial<Record<HardwareSlotId, string>>,
    successMsg?: string,
    repeatOverrides?: SlotRepeatMap
  ) => void;
  onResetBothProfiles: () => void;
  onSaveUserSnapshot: (name: string, profileId?: HardwareProfileId) => void;
  onDeleteUserSnapshot: (id: string) => void;
  onOpenMacros?: () => void;
  onApplyHardwareBackup: (
    backup: HardwareBackupPayload,
    repeatConfigs?: SlotRepeatMap
  ) => void;
  onExportBackupFile: () => void;
  onImportBackupFile: (file: File) => void;
}

type LibraryModeFilter = 'all' | 'ble' | 'tv';

type PendingModalAction =
  | {
      kind: 'curated_preset';
      preset: ProfilePreset;
      targetProfile: HardwareProfileId;
      rows: DiffPreviewRow[];
    }
  | {
      kind: 'my_preset';
      preset: UserPreset;
      targetProfile: HardwareProfileId;
      slots: Record<HardwareSlotId, string>;
      rows: DiffPreviewRow[];
    }
  | {
      kind: 'copy_profile';
      source: HardwareProfileId;
      target: HardwareProfileId;
      rows: DiffPreviewRow[];
    }
  | {
      kind: 'reset_all';
      rows: DiffPreviewRow[];
    };

function buildSlotDiffRows(
  profileLabel: string,
  beforeSlots: Record<HardwareSlotId, string>,
  afterSlots: Record<HardwareSlotId, string>,
  customMacros: CustomMacroItem[]
): DiffPreviewRow[] {
  return HARDWARE_SLOTS.map(slot => {
    const beforeRaw = beforeSlots[slot] || '';
    const afterRaw = afterSlots[slot] || '';
    const beforeDesc = beforeRaw
      ? describeFirmwareAction(beforeRaw, undefined, customMacros).shortLabel
      : 'Unassigned';
    const afterDesc = afterRaw
      ? describeFirmwareAction(afterRaw, undefined, customMacros).shortLabel
      : 'Unassigned';
    return {
      id: `${profileLabel}-${slot}`,
      slotLabel: `${profileLabel} · ${SLOT_LABELS[slot].short}`,
      beforeLabel: beforeDesc,
      afterLabel: afterDesc,
      changed: beforeRaw !== afterRaw
    };
  });
}

function extractBackupSlotsForProfile(
  backup: HardwareBackupPayload,
  targetProfId: HardwareProfileId
): Record<HardwareSlotId, string> {
  const defaults = FACTORY_DEFAULT_SLOTS[targetProfId];
  const prefix =
    targetProfId === 'TV'
      ? 'tv_'
      : targetProfId === 'HOST2'
      ? 'h2_'
      : targetProfId === 'HOST3'
      ? 'h3_'
      : 'h1_';

  const result = { ...defaults };
  for (const slot of HARDWARE_SLOTS) {
    const directVal = backup[`${prefix}${slot}`];
    const legacyMacVal = targetProfId !== 'TV' ? backup[`mac_${slot}`] : undefined;
    if (typeof directVal === 'string' && directVal) {
      result[slot] = directVal;
    } else if (typeof legacyMacVal === 'string' && legacyMacVal) {
      result[slot] = legacyMacVal;
    }
  }
  return result;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  profiles,
  activeProfileId,
  userPresets,
  customMacros,
  isConnected,
  showAdvancedIds = false,
  onPullFromUsb,
  onPushAllToUsb,
  onCopyHardwareProfile,
  onAssignProfileSlots,
  onResetBothProfiles,
  onSaveUserSnapshot,
  onDeleteUserSnapshot,
  onOpenMacros,
  onApplyHardwareBackup,
  onExportBackupFile,
  onImportBackupFile
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<LibraryModeFilter>('all');
  const [presetNameDraft, setPresetNameDraft] = useState('');
  const [saveProfileTarget, setSaveProfileTarget] =
    useState<HardwareProfileId>(activeProfileId);
  const [copySource, setCopySource] = useState<HardwareProfileId>('HOST1');
  const [copyTarget, setCopyTarget] = useState<HardwareProfileId>('HOST2');
  const [pendingAction, setPendingAction] = useState<PendingModalAction | null>(null);
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);

  const importBackupRef = useRef<HTMLInputElement>(null);
  const overflowContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSaveProfileTarget(activeProfileId);
  }, [activeProfileId]);

  useEffect(() => {
    if (!overflowMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        overflowContainerRef.current &&
        !overflowContainerRef.current.contains(e.target as Node)
      ) {
        setOverflowMenuOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOverflowMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [overflowMenuOpen]);

  const getProfile = (id: HardwareProfileId): StudioProfile =>
    profiles.find(p => p.id === id) || profiles[0];

  const formatProfileLabel = (id: HardwareProfileId): string => {
    const prof = getProfile(id);
    const short = profileShortTag(id);
    return `${prof.name} (${short})`;
  };

  // Detect whether saving `saveProfileTarget` matches an already-saved UserPreset
  const matchingExistingPreset = useMemo(() => {
    if (userPresets.length === 0) return null;
    const targetProf = profiles.find(p => p.id === saveProfileTarget) || profiles[0];
    if (!targetProf) return null;
    const currentSlots = extractProfileSlots(targetProf);
    const currentRepeatMap = extractRepeatMapFromProfiles(profiles);
    const targetSig = getProfilePresetSignature(
      currentSlots,
      currentRepeatMap,
      saveProfileTarget
    );
    const cleanDraftName = presetNameDraft.trim().toLowerCase();

    for (const snap of userPresets) {
      const origin = normalizeHardwareProfileId(snap.targetProfile, 1);
      const snapSlots: Record<HardwareSlotId, string> = snap.profileSlots
        ? { ...FACTORY_DEFAULT_SLOTS[origin], ...snap.profileSlots }
        : extractBackupSlotsForProfile(snap.backup, origin);
      const snapSig = getProfilePresetSignature(snapSlots, snap.repeatConfigs, origin);
      if (snapSig === targetSig) {
        return { preset: snap, reason: 'identical_layout' as const };
      }
      if (cleanDraftName && snap.name.trim().toLowerCase() === cleanDraftName) {
        return { preset: snap, reason: 'same_name' as const };
      }
    }
    return null;
  }, [userPresets, profiles, saveProfileTarget, presetNameDraft]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredCuratedPresets = useMemo(() => {
    return CURATED_PRESETS.filter(preset => {
      const blePreset = isBleHostProfile(preset.mode);
      if (modeFilter === 'ble' && !blePreset) return false;
      if (modeFilter === 'tv' && blePreset) return false;
      if (!normalizedQuery) return true;
      const slotText = HARDWARE_SLOTS.map(
        s => describeFirmwareAction(preset.bindings[s], undefined, customMacros).shortLabel
      ).join(' ');
      const blob =
        `${preset.title} ${preset.subtitle} ${preset.description} ${slotText}`.toLowerCase();
      return blob.includes(normalizedQuery);
    });
  }, [modeFilter, normalizedQuery, customMacros]);

  const filteredUserPresets = useMemo(() => {
    return userPresets.filter(snap => {
      const target = normalizeHardwareProfileId(snap.targetProfile, 1);
      const bleSnap = isBleHostProfile(target);
      if (modeFilter === 'ble' && !bleSnap) return false;
      if (modeFilter === 'tv' && bleSnap) return false;
      if (!normalizedQuery) return true;
      const slotText = snap.profileSlots
        ? HARDWARE_SLOTS.map(
            s =>
              describeFirmwareAction(
                snap.profileSlots![s] || '',
                undefined,
                customMacros
              ).shortLabel
          ).join(' ')
        : '';
      return `${snap.name} ${profileShortTag(target)} ${slotText}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [userPresets, modeFilter, normalizedQuery, customMacros]);

  const handleSaveMyPreset = () => {
    const fallbackName = `${getProfile(saveProfileTarget).name} Layout`;
    onSaveUserSnapshot(presetNameDraft.trim() || fallbackName, saveProfileTarget);
    setPresetNameDraft('');
  };

  const openCuratedPresetPreview = (
    preset: ProfilePreset,
    targetProfId: HardwareProfileId
  ) => {
    const currentProf = getProfile(targetProfId);
    const beforeSlots = extractProfileSlots(currentProf);
    const rows = buildSlotDiffRows(
      formatProfileLabel(targetProfId),
      beforeSlots,
      preset.bindings,
      customMacros
    );
    setPendingAction({
      kind: 'curated_preset',
      preset,
      targetProfile: targetProfId,
      rows
    });
  };

  const openMyPresetPreview = (userPreset: UserPreset, targetProfId: HardwareProfileId) => {
    const currentProf = getProfile(targetProfId);
    const beforeSlots = extractProfileSlots(currentProf);
    const savedSlots: Record<HardwareSlotId, string> = userPreset.profileSlots
      ? {
          ...FACTORY_DEFAULT_SLOTS[targetProfId],
          ...userPreset.profileSlots
        }
      : extractBackupSlotsForProfile(userPreset.backup, targetProfId);

    const rows = buildSlotDiffRows(
      formatProfileLabel(targetProfId),
      beforeSlots,
      savedSlots,
      customMacros
    );
    setPendingAction({
      kind: 'my_preset',
      preset: userPreset,
      targetProfile: targetProfId,
      slots: savedSlots,
      rows
    });
  };

  const openCopyConfirm = (source: HardwareProfileId, target: HardwareProfileId) => {
    if (source === target) return;
    const srcProf = getProfile(source);
    const tgtProf = getProfile(target);
    const srcSlots = extractProfileSlots(srcProf);
    const tgtSlots = extractProfileSlots(tgtProf);
    const rows = buildSlotDiffRows(
      formatProfileLabel(target),
      tgtSlots,
      srcSlots,
      customMacros
    );
    setPendingAction({
      kind: 'copy_profile',
      source,
      target,
      rows
    });
  };

  const openResetAllConfirm = () => {
    const allRows: DiffPreviewRow[] = [];
    for (const id of HARDWARE_PROFILE_IDS) {
      const prof = getProfile(id);
      allRows.push(
        ...buildSlotDiffRows(
          formatProfileLabel(id),
          extractProfileSlots(prof),
          FACTORY_DEFAULT_SLOTS[id],
          customMacros
        )
      );
    }
    setPendingAction({
      kind: 'reset_all',
      rows: allRows
    });
  };

  const handleConfirmPendingAction = () => {
    if (!pendingAction) return;
    if (pendingAction.kind === 'curated_preset') {
      const targetName = formatProfileLabel(pendingAction.targetProfile);
      onAssignProfileSlots(
        pendingAction.targetProfile,
        pendingAction.preset.bindings,
        `Applied "${pendingAction.preset.title}" preset to ${targetName}`
      );
    } else if (pendingAction.kind === 'my_preset') {
      const savedOrigin = normalizeHardwareProfileId(pendingAction.preset.targetProfile, 1);
      const remappedRepeats: SlotRepeatMap = {};
      if (pendingAction.preset.repeatConfigs) {
        for (const slot of HARDWARE_SLOTS) {
          const cfg =
            pendingAction.preset.repeatConfigs[`${savedOrigin}:${slot}`] ||
            pendingAction.preset.repeatConfigs[`MAC:${slot}`];
          if (cfg) {
            remappedRepeats[`${pendingAction.targetProfile}:${slot}`] = cfg;
          }
        }
      }
      onAssignProfileSlots(
        pendingAction.targetProfile,
        pendingAction.slots,
        `Applied "${pendingAction.preset.name}" to ${formatProfileLabel(pendingAction.targetProfile)}`,
        remappedRepeats
      );
    } else if (pendingAction.kind === 'copy_profile') {
      onCopyHardwareProfile(pendingAction.source, pendingAction.target);
    } else if (pendingAction.kind === 'reset_all') {
      onResetBothProfiles();
    }
    setPendingAction(null);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 animate-panel-in">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Clean Header + Overflow Menu for Rare Backup / Restore / Reset Actions */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-[var(--text-primary)]">
              Profiles &amp; Presets
            </h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Apply 14-control layouts across Devices 1–3 and Smart TV, save snapshots, or clone profiles.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onOpenMacros && (
              <button
                type="button"
                onClick={onOpenMacros}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--bg-panel)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums"
              >
                <Sliders className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>My Macros ({customMacros.length})</span>
              </button>
            )}

            <div ref={overflowContainerRef} className="relative">
              <button
                type="button"
                onClick={() => setOverflowMenuOpen(v => !v)}
                aria-expanded={overflowMenuOpen}
                aria-haspopup="menu"
                aria-label="Backup, restore, and reset options"
                title="Backup, restore & reset"
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  overflowMenuOpen
                    ? 'bg-[var(--bg-elevated)] border-[var(--border-strong)] text-[var(--text-primary)]'
                    : 'bg-[var(--bg-panel)] hover:bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <MoreHorizontal className="w-4 h-4" />
                <span>Backups</span>
              </button>

              {overflowMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-1.5 w-60 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-strong)] shadow-xl p-1.5 z-30 space-y-0.5 animate-popover-in"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOverflowMenuOpen(false);
                      onExportBackupFile();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[var(--bg-input)] text-xs font-medium text-[var(--text-primary)] transition-colors cursor-pointer text-left"
                  >
                    <Download className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                    <span>Download backup (.json)</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOverflowMenuOpen(false);
                      importBackupRef.current?.click();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[var(--bg-input)] text-xs font-medium text-[var(--text-primary)] transition-colors cursor-pointer text-left"
                  >
                    <Upload className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                    <span>Restore backup (.json)…</span>
                  </button>

                  {isConnected && (
                    <>
                      <div className="my-1 border-t border-[var(--border-subtle)]" />
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setOverflowMenuOpen(false);
                          onPullFromUsb();
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[var(--bg-input)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer text-left"
                      >
                        <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                        <span>Read profiles from MacroPad</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setOverflowMenuOpen(false);
                          onPushAllToUsb();
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[var(--bg-input)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer text-left"
                      >
                        <Upload className="w-3.5 h-3.5 shrink-0" />
                        <span>Write all 4 profiles to MacroPad</span>
                      </button>
                    </>
                  )}

                  <div className="my-1 border-t border-[var(--border-subtle)]" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOverflowMenuOpen(false);
                      openResetAllConfirm();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-rose-500/12 text-xs font-medium text-rose-600 dark:text-rose-400 transition-colors cursor-pointer text-left"
                  >
                    <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                    <span>Reset all 4 profiles to defaults…</span>
                  </button>
                </div>
              )}

              <input
                ref={importBackupRef}
                type="file"
                accept="application/json,.json"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) onImportBackupFile(file);
                  e.target.value = '';
                }}
                className="hidden"
              />
            </div>
          </div>
        </div>

        {/* Search & Mode Filter Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Filter presets or bound actions…"
              aria-label="Filter presets"
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear preset search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div
            role="group"
            aria-label="Filter presets by target mode"
            className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] shrink-0 self-start sm:self-auto"
          >
            {(
              [
                { id: 'all', label: 'All Modes' },
                { id: 'ble', label: 'Devices 1–3' },
                { id: 'tv', label: 'Smart TV' }
              ] as const
            ).map(tab => {
              const active = modeFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setModeFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 1: My Saved Snapshots */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
                Saved Snapshots ({filteredUserPresets.length})
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Save any profile&apos;s 14 controls so you can switch or reapply layouts anytime.
              </p>
            </div>

            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={saveProfileTarget}
                  onChange={e =>
                    setSaveProfileTarget(e.target.value as HardwareProfileId)
                  }
                  aria-label="Profile to snapshot"
                  className="px-3 py-1.5 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                >
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>
                      {profileShortTag(p.id)} · {p.name}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  maxLength={32}
                  value={presetNameDraft}
                  onChange={e => setPresetNameDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSaveMyPreset();
                  }}
                  placeholder={`${getProfile(saveProfileTarget).name} Layout`}
                  aria-label="Snapshot name"
                  className="px-3 py-1.5 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                />
                <button
                  type="button"
                  onClick={handleSaveMyPreset}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap shrink-0"
                >
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  <span>
                    {matchingExistingPreset ? 'Update Snapshot' : 'Save Snapshot'}
                  </span>
                </button>
              </div>

              {matchingExistingPreset && (
                <div className="text-[11px] text-amber-700 dark:text-amber-300">
                  {matchingExistingPreset.reason === 'identical_layout'
                    ? `Matches "${matchingExistingPreset.preset.name}" — saving updates it in place`
                    : `"${matchingExistingPreset.preset.name}" already exists — saving updates its 14 bindings`}
                </div>
              )}
            </div>
          </div>

          {filteredUserPresets.length === 0 ? (
            <div className="p-6 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-center space-y-1">
              <div className="text-xs font-semibold text-[var(--text-secondary)]">
                {userPresets.length === 0
                  ? 'No saved snapshots yet'
                  : 'No saved snapshots match the current filter'}
              </div>
              <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
                {userPresets.length === 0
                  ? 'Customize a Device or Smart TV layout, give it a name above, and click Save Snapshot.'
                  : 'Clear the search filter or switch mode tabs to view all saved snapshots.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredUserPresets.map(snap => {
                const defaultTarget: HardwareProfileId = normalizeHardwareProfileId(
                  snap.targetProfile,
                  1
                );
                const otherTargets = HARDWARE_PROFILE_IDS.filter(
                  id => id !== defaultTarget
                );
                return (
                  <div
                    key={snap.id}
                    className="p-4 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">
                            {snap.name}
                          </h3>
                          <p className="text-[11px] text-[var(--text-muted)] mt-0.5 tabular-nums">
                            Saved {snap.createdAt} · {profileShortTag(defaultTarget)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onDeleteUserSnapshot(snap.id)}
                          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-[var(--bg-input)] transition-colors cursor-pointer shrink-0"
                          title="Delete snapshot"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {snap.profileSlots && (
                        <div className="grid grid-cols-2 gap-1.5 text-[11px] pt-0.5">
                          {HARDWARE_SLOTS.map(s => (
                            <div
                              key={s}
                              className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] flex items-center gap-2 min-w-0"
                            >
                              <span className="font-mono text-[10px] text-[var(--text-muted)] shrink-0 tabular-nums whitespace-nowrap">
                                {SLOT_LABELS[s].short}
                              </span>
                              <ParsedActionBadge
                                action={
                                  snap.profileSlots![s] ||
                                  FACTORY_DEFAULT_SLOTS[defaultTarget][s]
                                }
                                repeatConfig={
                                  snap.repeatConfigs?.[`${defaultTarget}:${s}`] ||
                                  snap.repeatConfigs?.[`MAC:${s}`]
                                }
                                showRawId={showAdvancedIds}
                                customMacros={customMacros}
                                maxSteps={1}
                                className="min-w-0 flex-1"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => openMyPresetPreview(snap, defaultTarget)}
                        className="flex-1 py-2 px-3 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap"
                      >
                        Apply to {profileShortTag(defaultTarget)}
                      </button>
                      {otherTargets.map(altId => (
                        <button
                          key={altId}
                          type="button"
                          onClick={() => openMyPresetPreview(snap, altId)}
                          className="py-2 px-2.5 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] font-mono text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                          title={`Apply "${snap.name}" to ${formatProfileLabel(altId)}`}
                        >
                          {profileShortTag(altId)}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          onApplyHardwareBackup(snap.backup, snap.repeatConfigs)
                        }
                        className="py-2 px-2.5 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                        title="Restore all 4 profiles from this full snapshot"
                      >
                        Restore All
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Section 2: Built-In Starter Presets */}
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
              Starter Presets ({filteredCuratedPresets.length})
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Preview all 14 control changes before applying a layout to Device 1, Device 2, Device 3, or Smart TV.
            </p>
          </div>

          {filteredCuratedPresets.length === 0 ? (
            <div className="p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-xs text-[var(--text-muted)] text-center">
              No starter presets match &ldquo;{searchQuery}&rdquo;.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCuratedPresets.map(preset => {
                const blePreset = isBleHostProfile(preset.mode);
                const ModeIcon = blePreset ? Bluetooth : Tv;
                const primaryTarget: HardwareProfileId =
                  preset.mode === 'TV'
                    ? 'TV'
                    : isBleHostProfile(activeProfileId)
                    ? activeProfileId
                    : preset.mode;
                const secondaryTargets = HARDWARE_PROFILE_IDS.filter(
                  id => id !== primaryTarget
                );

                return (
                  <div
                    key={preset.id}
                    className="p-4 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] flex flex-col justify-between gap-4 transition-colors"
                  >
                    <div className="space-y-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">
                            {preset.title}
                          </h3>
                          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] shrink-0">
                            <ModeIcon className="w-3.5 h-3.5 text-[var(--accent)]" />
                            <span>{blePreset ? 'BLE Host' : 'Smart TV'}</span>
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                          {preset.subtitle}
                        </p>
                      </div>

                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                        {preset.description}
                      </p>

                      <div className="grid grid-cols-2 gap-1.5 text-[11px] pt-0.5">
                        {HARDWARE_SLOTS.map(slot => (
                          <div
                            key={slot}
                            className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] flex items-center gap-1.5 min-w-0"
                          >
                            <span className="font-mono text-[10px] text-[var(--text-muted)] shrink-0 tabular-nums whitespace-nowrap">
                              {SLOT_LABELS[slot].short}
                            </span>
                            <ParsedActionBadge
                              action={preset.bindings[slot]}
                              showRawId={showAdvancedIds}
                              customMacros={customMacros}
                              maxSteps={1}
                              className="min-w-0 flex-1"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => openCuratedPresetPreview(preset, primaryTarget)}
                        className="flex-1 py-2 px-2.5 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap truncate"
                        title={`Preview & apply to ${formatProfileLabel(primaryTarget)}`}
                      >
                        Apply to {profileShortTag(primaryTarget)}
                      </button>
                      {secondaryTargets.map(altId => (
                        <button
                          key={altId}
                          type="button"
                          onClick={() => openCuratedPresetPreview(preset, altId)}
                          className="py-2 px-2.5 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] font-mono text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                          title={`Preview & apply to ${formatProfileLabel(altId)}`}
                        >
                          {profileShortTag(altId)}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Section 3: Clone Bindings Between Profiles */}
        <section className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex flex-col justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
              <Copy className="w-4 h-4 text-[var(--accent)]" />
              <span>Clone Bindings Between Profiles</span>
            </div>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Copy all 14 button and dual rotary dial assignments from one profile onto another with a diff preview before writing.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-end gap-2.5">
            <label className="space-y-1 text-xs text-[var(--text-secondary)]">
              <span>Source profile</span>
              <select
                value={copySource}
                onChange={e => {
                  const nextSrc = e.target.value as HardwareProfileId;
                  setCopySource(nextSrc);
                  if (nextSrc === copyTarget) {
                    const fallback = HARDWARE_PROFILE_IDS.find(id => id !== nextSrc);
                    if (fallback) setCopyTarget(fallback);
                  }
                }}
                aria-label="Source profile to copy from"
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              >
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>
                    {profileShortTag(p.id)} · {p.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="hidden sm:flex items-center justify-center pb-2.5 text-[var(--text-muted)]">
              <ArrowRight className="w-4 h-4" />
            </div>

            <label className="space-y-1 text-xs text-[var(--text-secondary)]">
              <span>Target profile</span>
              <select
                value={copyTarget}
                onChange={e => setCopyTarget(e.target.value as HardwareProfileId)}
                aria-label="Target profile to overwrite"
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              >
                {profiles.map(p => (
                  <option key={p.id} value={p.id} disabled={p.id === copySource}>
                    {profileShortTag(p.id)} · {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              {(
                [
                  ['HOST1', 'HOST2'],
                  ['HOST1', 'HOST3'],
                  ['HOST2', 'HOST3']
                ] as const
              ).map(([src, tgt]) => (
                <button
                  key={`${src}-${tgt}`}
                  type="button"
                  onClick={() => openCopyConfirm(src, tgt)}
                  className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] font-mono text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  {profileShortTag(src)} → {profileShortTag(tgt)}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={copySource === copyTarget}
              onClick={() => openCopyConfirm(copySource, copyTarget)}
              className="flex items-center justify-center gap-2 py-2 px-3.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>Copy {profileShortTag(copySource)}</span>
              <ArrowRight className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>{profileShortTag(copyTarget)}</span>
            </button>
          </div>
        </section>
      </div>

      {/* Diff Preview & Confirmation Modal */}
      <DiffConfirmModal
        isOpen={pendingAction !== null}
        title={
          pendingAction?.kind === 'curated_preset'
            ? `Apply "${pendingAction.preset.title}" to ${formatProfileLabel(pendingAction.targetProfile)}?`
            : pendingAction?.kind === 'my_preset'
            ? `Apply "${pendingAction.preset.name}" to ${formatProfileLabel(pendingAction.targetProfile)}?`
            : pendingAction?.kind === 'copy_profile'
            ? `Copy ${formatProfileLabel(pendingAction.source)} → ${formatProfileLabel(pendingAction.target)}?`
            : 'Reset all 4 profiles to universal defaults?'
        }
        description={
          pendingAction?.kind === 'curated_preset' || pendingAction?.kind === 'my_preset'
            ? `Review the 14 control changes that will be written to ${formatProfileLabel(pendingAction.targetProfile)}.`
            : pendingAction?.kind === 'copy_profile'
            ? `All 14 controls on ${formatProfileLabel(pendingAction.target)} will be overwritten with ${formatProfileLabel(pendingAction.source)}'s bindings.`
            : 'This restores all 56 controls across Device 1, Device 2, Device 3, and Smart TV to factory defaults. Wi-Fi and TV pairing are preserved.'
        }
        confirmLabel={
          pendingAction?.kind === 'reset_all'
            ? 'Reset All 4 Profiles'
            : pendingAction?.kind === 'copy_profile'
            ? `Copy ${profileShortTag(pendingAction.source)} → ${profileShortTag(pendingAction.target)}`
            : 'Apply Preset (14 Controls)'
        }
        tone={pendingAction?.kind === 'reset_all' ? 'danger' : 'accent'}
        requireWord={pendingAction?.kind === 'reset_all' ? 'RESET' : undefined}
        rows={pendingAction?.rows || []}
        onConfirm={handleConfirmPendingAction}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
};
