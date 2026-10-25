import React, { useRef, useState } from 'react';
import {
  HardwareBackupPayload,
  HardwareProfileId,
  HardwareSlotId,
  SlotRepeatMap,
  StudioProfile,
  UserPreset
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
  Laptop,
  Tv,
  Sparkles,
  RotateCcw
} from 'lucide-react';

interface LibraryViewProps {
  profiles: [StudioProfile, StudioProfile];
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
      kind: 'reset_both';
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
  const [pendingAction, setPendingAction] = useState<PendingModalAction | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const macProfile = profiles.find(p => p.id === 'MAC') || profiles[0];
  const tvProfile = profiles.find(p => p.id === 'TV') || profiles[1];

  const handleSaveMyPreset = () => {
    onSaveUserSnapshot(presetNameDraft, saveProfileTarget);
    setPresetNameDraft('');
  };

  const openCuratedPresetPreview = (
    preset: ProfilePreset,
    targetProfId: HardwareProfileId
  ) => {
    const currentProf = targetProfId === 'MAC' ? macProfile : tvProfile;
    const beforeSlots = extractProfileSlots(currentProf);
    const rows = buildSlotDiffRows(targetProfId, beforeSlots, preset.bindings);
    setPendingAction({
      kind: 'curated_preset',
      preset,
      targetProfile: targetProfId,
      rows
    });
  };

  const openMyPresetPreview = (userPreset: UserPreset, targetProfId: HardwareProfileId) => {
    const currentProf = targetProfId === 'MAC' ? macProfile : tvProfile;
    const beforeSlots = extractProfileSlots(currentProf);
    const savedSlots: Record<HardwareSlotId, string> = userPreset.profileSlots
      ? {
          ...FACTORY_DEFAULT_SLOTS[targetProfId],
          ...userPreset.profileSlots
        }
      : {
          b1:
            targetProfId === 'MAC' ? userPreset.backup.mac_b1 : userPreset.backup.tv_b1,
          b2:
            targetProfId === 'MAC' ? userPreset.backup.mac_b2 : userPreset.backup.tv_b2,
          b3:
            targetProfId === 'MAC' ? userPreset.backup.mac_b3 : userPreset.backup.tv_b3,
          b4:
            targetProfId === 'MAC' ? userPreset.backup.mac_b4 : userPreset.backup.tv_b4,
          b5:
            (targetProfId === 'MAC'
              ? userPreset.backup.mac_b5
              : userPreset.backup.tv_b5) || FACTORY_DEFAULT_SLOTS[targetProfId].b5,
          b6:
            (targetProfId === 'MAC'
              ? userPreset.backup.mac_b6
              : userPreset.backup.tv_b6) || FACTORY_DEFAULT_SLOTS[targetProfId].b6,
          b7:
            (targetProfId === 'MAC'
              ? userPreset.backup.mac_b7
              : userPreset.backup.tv_b7) || FACTORY_DEFAULT_SLOTS[targetProfId].b7,
          b8:
            (targetProfId === 'MAC'
              ? userPreset.backup.mac_b8
              : userPreset.backup.tv_b8) || FACTORY_DEFAULT_SLOTS[targetProfId].b8,
          dial:
            targetProfId === 'MAC' ? userPreset.backup.mac_dial : userPreset.backup.tv_dial,
          enc_cw:
            (targetProfId === 'MAC'
              ? userPreset.backup.mac_enc_cw
              : userPreset.backup.tv_enc_cw) || FACTORY_DEFAULT_SLOTS[targetProfId].enc_cw,
          enc_ccw:
            (targetProfId === 'MAC'
              ? userPreset.backup.mac_enc_ccw
              : userPreset.backup.tv_enc_ccw) || FACTORY_DEFAULT_SLOTS[targetProfId].enc_ccw
        };
    const rows = buildSlotDiffRows(targetProfId, beforeSlots, savedSlots);
    setPendingAction({
      kind: 'my_preset',
      preset: userPreset,
      targetProfile: targetProfId,
      slots: savedSlots,
      rows
    });
  };

  const openCopyConfirm = (source: HardwareProfileId, target: HardwareProfileId) => {
    const srcProf = source === 'MAC' ? macProfile : tvProfile;
    const tgtProf = target === 'MAC' ? macProfile : tvProfile;
    const srcSlots = extractProfileSlots(srcProf);
    const tgtSlots = extractProfileSlots(tgtProf);
    const rows = buildSlotDiffRows(target, tgtSlots, srcSlots);
    setPendingAction({
      kind: 'copy_profile',
      source,
      target,
      rows
    });
  };

  const openResetBothConfirm = () => {
    const macRows = buildSlotDiffRows(
      'MAC',
      extractProfileSlots(macProfile),
      FACTORY_DEFAULT_SLOTS.MAC
    );
    const tvRows = buildSlotDiffRows(
      'TV',
      extractProfileSlots(tvProfile),
      FACTORY_DEFAULT_SLOTS.TV
    );
    setPendingAction({
      kind: 'reset_both',
      rows: [...macRows, ...tvRows]
    });
  };

  const handleConfirmPendingAction = () => {
    if (!pendingAction) return;
    if (pendingAction.kind === 'curated_preset') {
      onAssignProfileSlots(
        pendingAction.targetProfile,
        pendingAction.preset.bindings,
        `Applied "${pendingAction.preset.title}" preset to ${pendingAction.targetProfile}`
      );
    } else if (pendingAction.kind === 'my_preset') {
      onAssignProfileSlots(
        pendingAction.targetProfile,
        pendingAction.slots,
        `Applied "${pendingAction.preset.name}" to ${pendingAction.targetProfile}`,
        pendingAction.preset.repeatConfigs
      );
    } else if (pendingAction.kind === 'copy_profile') {
      onCopyHardwareProfile(pendingAction.source, pendingAction.target);
    } else if (pendingAction.kind === 'reset_both') {
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
              Preview and apply 11-control presets, save your own layouts, copy profiles, or download and restore JSON backups.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isConnected && (
              <button
                type="button"
                onClick={onPullFromUsb}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Read Pad</span>
              </button>
            )}

            <button
              type="button"
              onClick={onExportBackupFile}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Download backup</span>
            </button>

            <button
              type="button"
              onClick={() => importRef.current?.click()}
              style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap"
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

        {/* Section 1: 6 Built-In Presets (each previews an 11-control diff before applying) */}
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Built-In Presets (6 Layouts · All 11 Controls)
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Every preset previews a before/after diff across Keys 1–8, Knob Press, Turn Right, and Turn Left before writing.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {CURATED_PRESETS.map(preset => {
              const ModeIcon = preset.mode === 'MAC' ? Laptop : Tv;
              return (
                <div
                  key={preset.id}
                  className="p-4 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] flex flex-col justify-between gap-4 transition-colors"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">
                          {preset.title}
                        </h3>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          {preset.subtitle}
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[10px] font-bold shrink-0 ${
                          preset.mode === 'MAC'
                            ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                            : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        }`}
                      >
                        <ModeIcon className="w-3 h-3" />
                        <span>{preset.mode}</span>
                      </span>
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

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => openCuratedPresetPreview(preset, preset.mode)}
                      style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
                      className="flex-1 py-2 px-3 rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap"
                    >
                      Apply to {preset.mode}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        openCuratedPresetPreview(
                          preset,
                          preset.mode === 'MAC' ? 'TV' : 'MAC'
                        )
                      }
                      className="py-2 px-2.5 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap"
                      title={`Preview & apply to ${preset.mode === 'MAC' ? 'TV' : 'MAC'} instead`}
                    >
                      → {preset.mode === 'MAC' ? 'TV' : 'MAC'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Section 2: My Presets (Save current profile under a name & reapply later) */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                My presets ({userPresets.length})
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Save your current profile under a custom name so you can reapply all 11 controls anytime.
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
                <option value="MAC">Current MAC Profile</option>
                <option value="TV">Current TV Profile</option>
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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap"
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
                Customize your MAC or TV controls, type a name above, and click Save to My presets.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {userPresets.map(snap => {
                const defaultTarget: HardwareProfileId = snap.targetProfile || 'MAC';
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
                          <p className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">
                            Saved {snap.createdAt} · {defaultTarget} profile
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
                                    snap.repeatConfigs?.[`${defaultTarget}:${s}`]
                                  ).shortLabel
                                }
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => openMyPresetPreview(snap, defaultTarget)}
                        style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
                        className="flex-1 py-2 px-3 rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap"
                      >
                        Apply to {defaultTarget}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          openMyPresetPreview(
                            snap,
                            defaultTarget === 'MAC' ? 'TV' : 'MAC'
                          )
                        }
                        className="py-2 px-3 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                      >
                        Apply to {defaultTarget === 'MAC' ? 'TV' : 'MAC'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onApplyHardwareBackup(snap.backup, snap.repeatConfigs)
                        }
                        className="py-2 px-3 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                        title="Restore both MAC and TV profiles from this snapshot"
                      >
                        Restore Both
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Section 3: Profile Copy & Reset Operations (all confirmed with Diff / RESET) */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex flex-col justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
                <Copy className="w-4 h-4 text-sky-400" />
                <span>Copy MAC → TV</span>
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Previews the 11-slot diff and copies all MAC bindings onto the TV profile.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openCopyConfirm('MAC', 'TV')}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
            >
              <span>Copy MAC</span>
              <ArrowRight className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>TV</span>
            </button>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex flex-col justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
                <Copy className="w-4 h-4 text-emerald-400" />
                <span>Copy TV → MAC</span>
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Previews the 11-slot diff and copies all TV bindings onto the MAC profile.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openCopyConfirm('TV', 'MAC')}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
            >
              <span>Copy TV</span>
              <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
              <span>MAC</span>
            </button>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex flex-col justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
                <RotateCcw className="w-4 h-4 text-rose-400" />
                <span>Reset both profiles</span>
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Asks you to type <span className="font-mono font-semibold">RESET</span> and restores all 22 controls to factory defaults while keeping Wi-Fi & TV pairing.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openResetBothConfirm}
                className="flex-1 py-2 px-3 rounded-xl bg-rose-500/12 hover:bg-rose-500/20 border border-rose-500/35 text-xs font-semibold text-rose-300 cursor-pointer whitespace-nowrap"
              >
                Reset both profiles
              </button>
              {isConnected && (
                <button
                  type="button"
                  onClick={onPushAllToUsb}
                  className="py-2 px-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
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
            ? `Apply "${pendingAction.preset.title}" to ${pendingAction.targetProfile}?`
            : pendingAction?.kind === 'my_preset'
            ? `Apply "${pendingAction.preset.name}" to ${pendingAction.targetProfile}?`
            : pendingAction?.kind === 'copy_profile'
            ? `Copy ${pendingAction.source} → ${pendingAction.target}?`
            : 'Reset both profiles to factory defaults?'
        }
        description={
          pendingAction?.kind === 'curated_preset' || pendingAction?.kind === 'my_preset'
            ? `Review the 11 control changes that will be written to ${pendingAction.targetProfile}.`
            : pendingAction?.kind === 'copy_profile'
            ? `All 11 controls on ${pendingAction.target} will be overwritten with ${pendingAction.source}'s bindings.`
            : 'This restores all 22 controls across MAC and TV to factory defaults. Wi-Fi and SmartCast TV pairing are preserved.'
        }
        confirmLabel={
          pendingAction?.kind === 'reset_both'
            ? 'Reset Both Profiles'
            : pendingAction?.kind === 'copy_profile'
            ? `Copy ${pendingAction.source} → ${pendingAction.target}`
            : 'Apply Preset (11 Controls)'
        }
        tone={pendingAction?.kind === 'reset_both' ? 'danger' : 'accent'}
        requireWord={pendingAction?.kind === 'reset_both' ? 'RESET' : undefined}
        rows={pendingAction?.rows || []}
        onConfirm={handleConfirmPendingAction}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
};
