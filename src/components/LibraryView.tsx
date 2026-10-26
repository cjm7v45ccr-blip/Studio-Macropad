import React, { useEffect, useRef, useState } from 'react';
import {
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
  describeFirmwareAction
} from '../data/firmwareCatalog';
import { extractProfileSlots } from '../hooks/useStudioState';
import { DiffConfirmModal, DiffPreviewRow } from './DiffConfirmModal';
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
  Sparkles,
  RotateCcw
} from 'lucide-react';

interface LibraryViewProps {
  profiles: StudioProfile[];
  activeProfileId: HardwareProfileId;
  userPresets: UserPreset[];
  isConnected: boolean;
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
  onApplyHardwareBackup: (
    backup: HardwareBackupPayload,
    repeatConfigs?: SlotRepeatMap
  ) => void;
  onExportBackupFile: () => void;
  onImportBackupFile: (file: File) => void;
}

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
  afterSlots: Record<HardwareSlotId, string>
): DiffPreviewRow[] {
  return HARDWARE_SLOTS.map(slot => {
    const beforeRaw = beforeSlots[slot] || '';
    const afterRaw = afterSlots[slot] || '';
    const beforeDesc = beforeRaw ? describeFirmwareAction(beforeRaw).shortLabel : 'Unassigned';
    const afterDesc = afterRaw ? describeFirmwareAction(afterRaw).shortLabel : 'Unassigned';
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
  isConnected,
  onPullFromUsb,
  onPushAllToUsb,
  onCopyHardwareProfile,
  onAssignProfileSlots,
  onResetBothProfiles,
  onSaveUserSnapshot,
  onDeleteUserSnapshot,
  onApplyHardwareBackup,
  onExportBackupFile,
  onImportBackupFile
}) => {
  const [presetNameDraft, setPresetNameDraft] = useState('');
  const [saveProfileTarget, setSaveProfileTarget] =
    useState<HardwareProfileId>(activeProfileId);
  const [copySource, setCopySource] = useState<HardwareProfileId>('HOST1');
  const [copyTarget, setCopyTarget] = useState<HardwareProfileId>('HOST2');
  const [pendingAction, setPendingAction] = useState<PendingModalAction | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSaveProfileTarget(activeProfileId);
  }, [activeProfileId]);

  const getProfile = (id: HardwareProfileId): StudioProfile =>
    profiles.find(p => p.id === id) || profiles[0];

  const formatProfileLabel = (id: HardwareProfileId): string => {
    const prof = getProfile(id);
    const short = profileShortTag(id);
    return `${prof.name} (${short})`;
  };

  const handleSaveMyPreset = () => {
    onSaveUserSnapshot(presetNameDraft, saveProfileTarget);
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
      preset.bindings
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
      savedSlots
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
      srcSlots
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
          FACTORY_DEFAULT_SLOTS[id]
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
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header + Download / Restore Backup Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-[var(--text-primary)]">
              Profiles, Presets & Backups
            </h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Assign independent 11-control layouts to Bluetooth Hosts 1–3 and TV, clone bindings across devices, or download v2 JSON backups.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isConnected && (
              <button
                type="button"
                onClick={onPullFromUsb}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Read Pad</span>
              </button>
            )}

            <button
              type="button"
              onClick={onExportBackupFile}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Download backup</span>
            </button>

            <button
              type="button"
              onClick={() => importRef.current?.click()}
              style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Restore backup</span>
            </button>
            <input
              ref={importRef}
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

        {/* Section 1: Built-In Presets (each previews an 11-control diff before applying to any Host or TV) */}
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Built-In Presets ({CURATED_PRESETS.length} Layouts · All 11 Controls)
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Apply different OS or app layouts to each Bluetooth Host (e.g. Mac on Host 1, Windows on Host 2, Streamer on Host 3) and Smart TV on TV.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {CURATED_PRESETS.map(preset => {
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
                        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[var(--text-muted)] shrink-0">
                          <ModeIcon
                            className={`w-3.5 h-3.5 ${
                              blePreset ? 'text-sky-400' : 'text-emerald-400'
                            }`}
                          />
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

                    <div className="grid grid-cols-2 gap-1 text-[10px] font-mono pt-1">
                      {HARDWARE_SLOTS.map(slot => (
                        <div
                          key={slot}
                          className="px-2 py-1 rounded bg-[var(--bg-input)] border border-[var(--border-subtle)] truncate"
                        >
                          <span className="text-[var(--text-muted)]">
                            {SLOT_LABELS[slot].short}:{' '}
                          </span>
                          <span className="text-[var(--text-primary)]">
                            {describeFirmwareAction(preset.bindings[slot]).shortLabel}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => openCuratedPresetPreview(preset, primaryTarget)}
                      style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
                      className="flex-1 py-2 px-2.5 rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap truncate"
                      title={`Preview & apply to ${formatProfileLabel(primaryTarget)}`}
                    >
                      Apply to {profileShortTag(primaryTarget)}
                    </button>
                    {secondaryTargets.map(altId => (
                      <button
                        key={altId}
                        type="button"
                        onClick={() => openCuratedPresetPreview(preset, altId)}
                        className="py-2 px-2 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] font-mono text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
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
        </section>

        {/* Section 2: My Presets (Save any Host or TV profile under a name & reapply later) */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                My presets ({userPresets.length})
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Save any Host or TV layout under a custom name so you can reapply its 11 controls to any device slot later.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={saveProfileTarget}
                onChange={e =>
                  setSaveProfileTarget(e.target.value as HardwareProfileId)
                }
                aria-label="Profile to save"
                className="px-2.5 py-1.5 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)]"
              >
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>
                    [{profileShortTag(p.id)}] {p.name}
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
                placeholder="Preset name…"
                aria-label="New preset name"
                className="px-3 py-1.5 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              />
              <button
                type="button"
                onClick={handleSaveMyPreset}
                style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap shrink-0"
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
                <span>Save to My presets</span>
              </button>
            </div>
          </div>

          {userPresets.length === 0 ? (
            <div className="p-6 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-center space-y-1">
              <div className="text-xs font-semibold text-[var(--text-secondary)]">
                No saved presets in My presets yet
              </div>
              <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
                Customize Host 1, Host 2, Host 3, or TV controls, type a name above, and click Save to My presets.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {userPresets.map(snap => {
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
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                            <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">
                              {snap.name}
                            </h3>
                          </div>
                          <p className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5 tabular-nums">
                            Saved {snap.createdAt} · {profileShortTag(defaultTarget)} snapshot
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onDeleteUserSnapshot(snap.id)}
                          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-rose-400 hover:bg-[var(--bg-input)] transition-colors cursor-pointer shrink-0"
                          title="Delete preset"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {snap.profileSlots && (
                        <div className="grid grid-cols-2 gap-1 text-[10px] font-mono pt-1">
                          {HARDWARE_SLOTS.map(s => (
                            <div
                              key={s}
                              className="px-2 py-1 rounded bg-[var(--bg-input)] border border-[var(--border-subtle)] truncate"
                            >
                              <span className="text-[var(--text-muted)]">
                                {SLOT_LABELS[s].short}:{' '}
                              </span>
                              <span className="text-[var(--text-primary)]">
                                {
                                  describeFirmwareAction(
                                    snap.profileSlots![s] ||
                                      FACTORY_DEFAULT_SLOTS[defaultTarget][s],
                                    snap.repeatConfigs?.[`${defaultTarget}:${s}`] ||
                                      snap.repeatConfigs?.[`MAC:${s}`]
                                  ).shortLabel
                                }
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => openMyPresetPreview(snap, defaultTarget)}
                        style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
                        className="flex-1 py-2 px-3 rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap"
                      >
                        Apply to {profileShortTag(defaultTarget)}
                      </button>
                      {otherTargets.map(altId => (
                        <button
                          key={altId}
                          type="button"
                          onClick={() => openMyPresetPreview(snap, altId)}
                          className="py-2 px-2.5 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] font-mono text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0"
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
                        className="py-2 px-2.5 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0"
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

        {/* Section 3: 4-Profile Clone & Factory Reset Operations */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 p-4 sm:p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex flex-col justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
                <Copy className="w-4 h-4 text-sky-400" />
                <span>Clone Bindings Between Profiles</span>
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Copy all 11 button and rotary dial assignments from any Host or TV profile onto another device slot with a full diff preview.
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
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                >
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>
                      [{profileShortTag(p.id)}] {p.name}
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
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                >
                  {profiles.map(p => (
                    <option key={p.id} value={p.id} disabled={p.id === copySource}>
                      [{profileShortTag(p.id)}] {p.name}
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
                    className="px-2.5 py-1 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] font-mono text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {profileShortTag(src)} → {profileShortTag(tgt)}
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={copySource === copyTarget}
                onClick={() => openCopyConfirm(copySource, copyTarget)}
                className="flex items-center justify-center gap-2 py-2 px-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
              >
                <span>Copy {profileShortTag(copySource)}</span>
                <ArrowRight className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>{profileShortTag(copyTarget)}</span>
              </button>
            </div>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex flex-col justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
                <RotateCcw className="w-4 h-4 text-rose-400" />
                <span>Reset all 4 profiles</span>
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Asks you to type <span className="font-mono font-semibold">RESET</span> and restores all 44 controls across Host 1–3 and TV to universal defaults while keeping Wi-Fi & TV pairing.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openResetAllConfirm}
                className="flex-1 py-2 px-3 rounded-xl bg-rose-500/12 hover:bg-rose-500/20 border border-rose-500/35 text-xs font-semibold text-rose-300 cursor-pointer whitespace-nowrap"
              >
                Reset all profiles
              </button>
              {isConnected && (
                <button
                  type="button"
                  onClick={onPushAllToUsb}
                  className="py-2 px-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0"
                >
                  Push All
                </button>
              )}
            </div>
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
            ? `Review the 11 control changes that will be written to ${formatProfileLabel(pendingAction.targetProfile)}.`
            : pendingAction?.kind === 'copy_profile'
            ? `All 11 controls on ${formatProfileLabel(pendingAction.target)} will be overwritten with ${formatProfileLabel(pendingAction.source)}'s bindings.`
            : 'This restores all 44 controls across Host 1, Host 2, Host 3, and TV to universal factory defaults. Wi-Fi and SmartCast TV pairing are preserved.'
        }
        confirmLabel={
          pendingAction?.kind === 'reset_all'
            ? 'Reset All 4 Profiles'
            : pendingAction?.kind === 'copy_profile'
            ? `Copy ${profileShortTag(pendingAction.source)} → ${profileShortTag(pendingAction.target)}`
            : 'Apply Preset (11 Controls)'
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
