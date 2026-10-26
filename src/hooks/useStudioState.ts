import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ActionBinding,
  BleHostSlot,
  ConflictWarning,
  CustomMacroItem,
  EncoderControlConfig,
  HARDWARE_PROFILE_IDS,
  HardwareBackupPayload,
  HardwareEventPacket,
  HardwareProfileId,
  HardwareSlotId,
  KeyAppearance,
  KeyId,
  SerializedPadProfiles,
  SlotRepeatMap,
  StoredPadRecord,
  StudioProfile,
  StudioSettings,
  SyncConflictDiffItem,
  SyncConflictState,
  SyncStatusPill,
  UserPreset,
  bleSlotToProfileId,
  defaultProfileAlias,
  normalizeHardwareProfileId,
  profileIdToBleSlot
} from '../types/studio';
import {
  ACTION_KEY_IDS,
  ButtonSlotId,
  KEY_TO_SLOT,
  SLOT_TO_ACTION_KEY,
  buildHardwareProfile
} from '../data/presetTemplates';
import {
  FACTORY_DEFAULT_SLOTS,
  HARDWARE_SLOTS,
  SLOT_LABELS,
  bindingToFirmwareAction,
  deriveAppearanceForAction,
  describeFirmwareAction,
  firmwareActionToBinding,
  isValidFirmwareAction,
  requiresUsbSequenceExecution,
  sanitizeFirmwareAlias,
  validateFirmwareAlias
} from '../data/firmwareCatalog';
import { FirmwareStatusPacket, usbHardware } from '../services/usbHardwareService';
import { DEFAULT_FIRMWARE_GITHUB_REPO } from '../services/firmwareUpdateService';
import { repeatMacroRunner } from '../services/repeatMacroRunner';
import { soundEngine } from '../services/soundEffects';

const UI_PREFS_KEY = 'studio_macropad_ui_prefs_v5';
const PAD_LAST_ID_KEY = 'pad:__last_id__';
const DRAFT_PAD_ID = '__draft__';
const MIN_SAVING_DWELL_MS = 220;

export type ToastVariant = 'success' | 'error';

interface WorkspaceSnapshot {
  profiles: StudioProfile[];
  activeProfileId: HardwareProfileId;
  customMacros: CustomMacroItem[];
}

interface PersistedUiPrefs {
  settings: StudioSettings;
  userPresets: UserPreset[];
  customMacros: CustomMacroItem[];
  appearanceOverrides: Record<string, KeyAppearance>;
}

const DEFAULT_SETTINGS: StudioSettings = {
  theme: 'dark',
  accentColor: '#3B82F6',
  keyboardLayout: 'us_qwerty',
  encoderPlacement: 'grid',
  soundEnabled: true,
  liveEventsEnabled: true,
  autoCheckFirmwareUpdates: false,
  firmwareRepo: DEFAULT_FIRMWARE_GITHUB_REPO
};

function hexToRgbString(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return '59, 130, 246';
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if ([r, g, b].some(v => Number.isNaN(v))) return '59, 130, 246';
  return `${r}, ${g}, ${b}`;
}

function migrateRepeatConfigs(rawRepeats?: SlotRepeatMap): SlotRepeatMap {
  if (!rawRepeats) return {};
  const next: SlotRepeatMap = {};
  for (const [k, val] of Object.entries(rawRepeats)) {
    if (!val) continue;
    if (k.startsWith('MAC:')) {
      const slot = k.slice(4);
      if (!rawRepeats[`HOST1:${slot}`]) {
        next[`HOST1:${slot}`] = val;
      }
    } else {
      next[k] = val;
    }
  }
  return next;
}

function readStoredPadRecord(deviceId: string): StoredPadRecord | null {
  try {
    const raw = localStorage.getItem(`pad:${deviceId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.profiles) return null;
    const rawProfiles = parsed.profiles as SerializedPadProfiles;
    const normalizedProfiles: SerializedPadProfiles = {
      active: normalizeHardwareProfileId(rawProfiles.active, 1),
      h1_name: rawProfiles.h1_name || rawProfiles.mac_name || 'Host 1',
      h2_name: rawProfiles.h2_name || 'Host 2',
      h3_name: rawProfiles.h3_name || 'Host 3',
      tv_name: rawProfiles.tv_name || 'TV',
      h1: {
        ...FACTORY_DEFAULT_SLOTS.HOST1,
        ...(rawProfiles.mac || {}),
        ...(rawProfiles.h1 || {})
      },
      h2: {
        ...FACTORY_DEFAULT_SLOTS.HOST2,
        ...(rawProfiles.h2 || {})
      },
      h3: {
        ...FACTORY_DEFAULT_SLOTS.HOST3,
        ...(rawProfiles.h3 || {})
      },
      tv: {
        ...FACTORY_DEFAULT_SLOTS.TV,
        ...(rawProfiles.tv || {})
      }
    };
    return {
      rev: typeof parsed.rev === 'number' ? parsed.rev : 0,
      profiles: normalizedProfiles,
      dirty: Boolean(parsed.dirty),
      repeatConfigs: migrateRepeatConfigs(parsed.repeatConfigs)
    };
  } catch {
    return null;
  }
}

function writeStoredPadRecord(deviceId: string, record: StoredPadRecord) {
  try {
    localStorage.setItem(`pad:${deviceId}`, JSON.stringify(record));
    if (deviceId !== DRAFT_PAD_ID) {
      localStorage.setItem(PAD_LAST_ID_KEY, deviceId);
    }
  } catch {}
}

function removeStoredPadRecord(deviceId: string) {
  try {
    localStorage.removeItem(`pad:${deviceId}`);
  } catch {}
}

export function extractProfileSlots(profile: StudioProfile): Record<HardwareSlotId, string> {
  const layer = profile.layers[0];
  return {
    b1: bindingToFirmwareAction(layer.keys.k1.triggers.tap),
    b2: bindingToFirmwareAction(layer.keys.k2.triggers.tap),
    b3: bindingToFirmwareAction(layer.keys.k3.triggers.tap),
    b4: bindingToFirmwareAction(layer.keys.k4.triggers.tap),
    b5: bindingToFirmwareAction(layer.keys.k5.triggers.tap),
    b6: bindingToFirmwareAction(layer.keys.k6.triggers.tap),
    b7: bindingToFirmwareAction(layer.keys.k7.triggers.tap),
    b8: bindingToFirmwareAction(layer.keys.k8.triggers.tap),
    dial: bindingToFirmwareAction(layer.encoder.dial),
    enc_cw: bindingToFirmwareAction(layer.encoder.cw),
    enc_ccw: bindingToFirmwareAction(layer.encoder.ccw)
  };
}

export function extractRepeatMapFromProfiles(
  profiles: StudioProfile[]
): SlotRepeatMap {
  const map: SlotRepeatMap = {};
  for (const prof of profiles) {
    const layer = prof.layers[0];
    ACTION_KEY_IDS.forEach(kid => {
      const slot = KEY_TO_SLOT[kid];
      const rc = layer.keys[kid].triggers.tap.repeatConfig;
      if (rc) map[`${prof.id}:${slot}`] = rc;
    });
    if (layer.encoder.dial.repeatConfig) {
      map[`${prof.id}:dial`] = layer.encoder.dial.repeatConfig;
    }
    if (layer.encoder.cw.repeatConfig) {
      map[`${prof.id}:enc_cw`] = layer.encoder.cw.repeatConfig;
    }
    if (layer.encoder.ccw.repeatConfig) {
      map[`${prof.id}:enc_ccw`] = layer.encoder.ccw.repeatConfig;
    }
  }
  return map;
}

export function getBindingForProfileSlot(
  profiles: StudioProfile[],
  profileId: HardwareProfileId,
  slot: HardwareSlotId
): ActionBinding | undefined {
  const prof = profiles.find(p => p.id === profileId);
  if (!prof) return undefined;
  const layer = prof.layers[0];
  if (slot in SLOT_TO_ACTION_KEY) {
    const kid = SLOT_TO_ACTION_KEY[slot as ButtonSlotId];
    return layer.keys[kid].triggers.tap;
  }
  if (slot === 'dial') return layer.encoder.dial;
  if (slot === 'enc_cw') return layer.encoder.cw;
  if (slot === 'enc_ccw') return layer.encoder.ccw;
  return undefined;
}

export function snapshotToSerializedProfiles(
  profiles: StudioProfile[],
  activeProfileId: HardwareProfileId
): SerializedPadProfiles {
  const h1Prof =
    profiles.find(p => p.id === 'HOST1') ||
    buildHardwareProfile('HOST1', 'Host 1', FACTORY_DEFAULT_SLOTS.HOST1);
  const h2Prof =
    profiles.find(p => p.id === 'HOST2') ||
    buildHardwareProfile('HOST2', 'Host 2', FACTORY_DEFAULT_SLOTS.HOST2);
  const h3Prof =
    profiles.find(p => p.id === 'HOST3') ||
    buildHardwareProfile('HOST3', 'Host 3', FACTORY_DEFAULT_SLOTS.HOST3);
  const tvProf =
    profiles.find(p => p.id === 'TV') ||
    buildHardwareProfile('TV', 'TV', FACTORY_DEFAULT_SLOTS.TV);

  return {
    active: activeProfileId,
    h1_name: sanitizeFirmwareAlias(h1Prof.name, 'HOST1'),
    h2_name: sanitizeFirmwareAlias(h2Prof.name, 'HOST2'),
    h3_name: sanitizeFirmwareAlias(h3Prof.name, 'HOST3'),
    tv_name: sanitizeFirmwareAlias(tvProf.name, 'TV'),
    h1: extractProfileSlots(h1Prof),
    h2: extractProfileSlots(h2Prof),
    h3: extractProfileSlots(h3Prof),
    tv: extractProfileSlots(tvProf)
  };
}

export function statusPacketToSerializedProfiles(
  pkt: FirmwareStatusPacket
): SerializedPadProfiles {
  const rawSlot = Number(pkt.ble?.active_host ?? pkt.ble_slot ?? 1);
  const activeHost: BleHostSlot = rawSlot === 2 ? 2 : rawSlot === 3 ? 3 : 1;

  const h1Item = pkt.profiles?.items?.find(i => i.id === 'HOST1' || i.id === 'H1');
  const h2Item = pkt.profiles?.items?.find(i => i.id === 'HOST2' || i.id === 'H2');
  const h3Item = pkt.profiles?.items?.find(i => i.id === 'HOST3' || i.id === 'H3');
  const macItem = pkt.profiles?.items?.find(i => i.id === 'MAC');
  const tvItem = pkt.profiles?.items?.find(i => i.id === 'TV');

  const buildHostSlots = (
    hostNum: BleHostSlot,
    directItem: typeof h1Item,
    defaults: Record<HardwareSlotId, string>
  ): Record<HardwareSlotId, string> => {
    const useMacFallback = !directItem && activeHost === hostNum;
    const item = directItem || (useMacFallback ? macItem : undefined);
    return {
      b1: item?.controls?.b1 ?? (useMacFallback ? pkt.mac_b1 : undefined) ?? defaults.b1,
      b2: item?.controls?.b2 ?? (useMacFallback ? pkt.mac_b2 : undefined) ?? defaults.b2,
      b3: item?.controls?.b3 ?? (useMacFallback ? pkt.mac_b3 : undefined) ?? defaults.b3,
      b4: item?.controls?.b4 ?? (useMacFallback ? pkt.mac_b4 : undefined) ?? defaults.b4,
      b5: item?.controls?.b5 ?? (useMacFallback ? pkt.mac_b5 : undefined) ?? defaults.b5,
      b6: item?.controls?.b6 ?? (useMacFallback ? pkt.mac_b6 : undefined) ?? defaults.b6,
      b7: item?.controls?.b7 ?? (useMacFallback ? pkt.mac_b7 : undefined) ?? defaults.b7,
      b8: item?.controls?.b8 ?? (useMacFallback ? pkt.mac_b8 : undefined) ?? defaults.b8,
      dial:
        item?.controls?.dial ?? (useMacFallback ? pkt.mac_dial : undefined) ?? defaults.dial,
      enc_cw: item?.controls?.enc_cw ?? defaults.enc_cw,
      enc_ccw: item?.controls?.enc_ccw ?? defaults.enc_ccw
    };
  };

  return {
    active: normalizeHardwareProfileId(pkt.profiles?.active, activeHost),
    h1_name:
      h1Item?.name || (activeHost === 1 && macItem?.name ? macItem.name : 'Host 1'),
    h2_name:
      h2Item?.name || (activeHost === 2 && macItem?.name ? macItem.name : 'Host 2'),
    h3_name:
      h3Item?.name || (activeHost === 3 && macItem?.name ? macItem.name : 'Host 3'),
    tv_name: tvItem?.name || 'TV',
    h1: buildHostSlots(1, h1Item, FACTORY_DEFAULT_SLOTS.HOST1),
    h2: buildHostSlots(2, h2Item, FACTORY_DEFAULT_SLOTS.HOST2),
    h3: buildHostSlots(3, h3Item, FACTORY_DEFAULT_SLOTS.HOST3),
    tv: {
      b1: tvItem?.controls?.b1 ?? pkt.tv_b1 ?? FACTORY_DEFAULT_SLOTS.TV.b1,
      b2: tvItem?.controls?.b2 ?? pkt.tv_b2 ?? FACTORY_DEFAULT_SLOTS.TV.b2,
      b3: tvItem?.controls?.b3 ?? pkt.tv_b3 ?? FACTORY_DEFAULT_SLOTS.TV.b3,
      b4: tvItem?.controls?.b4 ?? pkt.tv_b4 ?? FACTORY_DEFAULT_SLOTS.TV.b4,
      b5: tvItem?.controls?.b5 ?? pkt.tv_b5 ?? FACTORY_DEFAULT_SLOTS.TV.b5,
      b6: tvItem?.controls?.b6 ?? pkt.tv_b6 ?? FACTORY_DEFAULT_SLOTS.TV.b6,
      b7: tvItem?.controls?.b7 ?? pkt.tv_b7 ?? FACTORY_DEFAULT_SLOTS.TV.b7,
      b8: tvItem?.controls?.b8 ?? pkt.tv_b8 ?? FACTORY_DEFAULT_SLOTS.TV.b8,
      dial: tvItem?.controls?.dial ?? pkt.tv_dial ?? FACTORY_DEFAULT_SLOTS.TV.dial,
      enc_cw: tvItem?.controls?.enc_cw ?? FACTORY_DEFAULT_SLOTS.TV.enc_cw,
      enc_ccw: tvItem?.controls?.enc_ccw ?? FACTORY_DEFAULT_SLOTS.TV.enc_ccw
    }
  };
}

function getSerializedProfileSlots(
  serialized: SerializedPadProfiles,
  id: HardwareProfileId
): Record<HardwareSlotId, string> {
  if (id === 'TV') return serialized.tv;
  if (id === 'HOST2') return serialized.h2;
  if (id === 'HOST3') return serialized.h3;
  return serialized.h1;
}

function getSerializedProfileName(
  serialized: SerializedPadProfiles,
  id: HardwareProfileId
): string {
  if (id === 'TV') return serialized.tv_name || 'TV';
  if (id === 'HOST2') return serialized.h2_name || 'Host 2';
  if (id === 'HOST3') return serialized.h3_name || 'Host 3';
  return serialized.h1_name || 'Host 1';
}

function serializedProfilesToStudioProfiles(
  serialized: SerializedPadProfiles,
  overrides: Record<string, KeyAppearance>,
  repeatConfigs?: SlotRepeatMap,
  prevProfiles?: StudioProfile[]
): StudioProfile[] {
  return HARDWARE_PROFILE_IDS.map(profId => {
    const prevProf = prevProfiles?.find(p => p.id === profId);
    const slots = getSerializedProfileSlots(serialized, profId);
    const name = getSerializedProfileName(serialized, profId);
    const built = buildHardwareProfile(profId, name, slots, prevProf, repeatConfigs);

    ACTION_KEY_IDS.forEach(kid => {
      const slot = KEY_TO_SLOT[kid];
      const ov =
        overrides[`${profId}:${kid}`] ||
        (profId === 'HOST1' ? overrides[`MAC:${kid}`] : undefined);
      if (ov) {
        built.layers[0].keys[kid].appearance = deriveAppearanceForAction(
          slots[slot],
          ov,
          built.layers[0].keys[kid].triggers.tap.repeatConfig
        );
      }
    });

    return built;
  });
}

function computeProfileDiffs(
  website: SerializedPadProfiles,
  pad: SerializedPadProfiles
): SyncConflictDiffItem[] {
  const diffs: SyncConflictDiffItem[] = [];

  const nameChecks: {
    id: string;
    label: string;
    web: string;
    pad: string;
  }[] = [
    { id: 'h1_name', label: 'Host 1 Alias', web: website.h1_name, pad: pad.h1_name },
    { id: 'h2_name', label: 'Host 2 Alias', web: website.h2_name, pad: pad.h2_name },
    { id: 'h3_name', label: 'Host 3 Alias', web: website.h3_name, pad: pad.h3_name },
    { id: 'tv_name', label: 'TV Profile Alias', web: website.tv_name, pad: pad.tv_name }
  ];

  for (const nc of nameChecks) {
    if (nc.web && nc.web !== nc.pad) {
      diffs.push({
        id: nc.id,
        label: nc.label,
        websiteValue: nc.web,
        padValue: nc.pad
      });
    }
  }

  for (const profId of HARDWARE_PROFILE_IDS) {
    const webSlots = getSerializedProfileSlots(website, profId);
    const padSlots = getSerializedProfileSlots(pad, profId);
    const profLabel = defaultProfileAlias(profId);
    for (const slot of HARDWARE_SLOTS) {
      const wVal = webSlots[slot] || '';
      const pVal = padSlots[slot] || '';
      if (wVal && wVal !== pVal) {
        diffs.push({
          id: `${profId}-${slot}`,
          label: `${profLabel} · ${SLOT_LABELS[slot].short}`,
          websiteValue: `${describeFirmwareAction(wVal).shortLabel} (${wVal.replace(/\n/g, '\\n')})`,
          padValue: pVal
            ? `${describeFirmwareAction(pVal).shortLabel} (${pVal.replace(/\n/g, '\\n')})`
            : 'Unassigned'
        });
      }
    }
  }

  return diffs;
}

export function buildBackupFromProfiles(
  profiles: StudioProfile[]
): HardwareBackupPayload {
  const h1Prof =
    profiles.find(p => p.id === 'HOST1') ||
    buildHardwareProfile('HOST1', 'Host 1', FACTORY_DEFAULT_SLOTS.HOST1);
  const h2Prof =
    profiles.find(p => p.id === 'HOST2') ||
    buildHardwareProfile('HOST2', 'Host 2', FACTORY_DEFAULT_SLOTS.HOST2);
  const h3Prof =
    profiles.find(p => p.id === 'HOST3') ||
    buildHardwareProfile('HOST3', 'Host 3', FACTORY_DEFAULT_SLOTS.HOST3);
  const tvProf =
    profiles.find(p => p.id === 'TV') ||
    buildHardwareProfile('TV', 'TV', FACTORY_DEFAULT_SLOTS.TV);

  const h1 = extractProfileSlots(h1Prof);
  const h2 = extractProfileSlots(h2Prof);
  const h3 = extractProfileSlots(h3Prof);
  const tv = extractProfileSlots(tvProf);

  const h1Name = sanitizeFirmwareAlias(h1Prof.name, 'HOST1');
  const h2Name = sanitizeFirmwareAlias(h2Prof.name, 'HOST2');
  const h3Name = sanitizeFirmwareAlias(h3Prof.name, 'HOST3');
  const tvName = sanitizeFirmwareAlias(tvProf.name, 'TV');

  return {
    schema: 'studio-pad-config',
    version: 2,
    tv_name: tvName,
    h1_name: h1Name,
    h2_name: h2Name,
    h3_name: h3Name,
    ...Object.fromEntries(
      HARDWARE_SLOTS.map(s => [`h1_${s}`, h1[s] || FACTORY_DEFAULT_SLOTS.HOST1[s]])
    ),
    ...Object.fromEntries(
      HARDWARE_SLOTS.map(s => [`h2_${s}`, h2[s] || FACTORY_DEFAULT_SLOTS.HOST2[s]])
    ),
    ...Object.fromEntries(
      HARDWARE_SLOTS.map(s => [`h3_${s}`, h3[s] || FACTORY_DEFAULT_SLOTS.HOST3[s]])
    ),
    tv_b1: tv.b1 || FACTORY_DEFAULT_SLOTS.TV.b1,
    tv_b2: tv.b2 || FACTORY_DEFAULT_SLOTS.TV.b2,
    tv_b3: tv.b3 || FACTORY_DEFAULT_SLOTS.TV.b3,
    tv_b4: tv.b4 || FACTORY_DEFAULT_SLOTS.TV.b4,
    tv_b5: tv.b5 || FACTORY_DEFAULT_SLOTS.TV.b5,
    tv_b6: tv.b6 || FACTORY_DEFAULT_SLOTS.TV.b6,
    tv_b7: tv.b7 || FACTORY_DEFAULT_SLOTS.TV.b7,
    tv_b8: tv.b8 || FACTORY_DEFAULT_SLOTS.TV.b8,
    tv_dial: tv.dial || FACTORY_DEFAULT_SLOTS.TV.dial,
    tv_enc_cw: tv.enc_cw || FACTORY_DEFAULT_SLOTS.TV.enc_cw,
    tv_enc_ccw: tv.enc_ccw || FACTORY_DEFAULT_SLOTS.TV.enc_ccw,
    mac_name: h1Name,
    ...Object.fromEntries(
      HARDWARE_SLOTS.map(s => [`mac_${s}`, h1[s] || FACTORY_DEFAULT_SLOTS.HOST1[s]])
    )
  };
}

function isCustomDynamicAction(action: string): boolean {
  return (
    action.startsWith('SHORTCUT:') ||
    action.startsWith('TEXT:') ||
    action.startsWith('TVKEY:') ||
    action.startsWith('TVAPP:')
  );
}

function mergeDiscoveredCustomMacros(
  existing: CustomMacroItem[],
  serialized: SerializedPadProfiles,
  repeatConfigs?: SlotRepeatMap
): CustomMacroItem[] {
  const merged = [...existing];
  const allEntries = [
    ...Object.entries(serialized.h1).map(([slot, act]) => ({ profile: 'HOST1', slot, act })),
    ...Object.entries(serialized.h2).map(([slot, act]) => ({ profile: 'HOST2', slot, act })),
    ...Object.entries(serialized.h3).map(([slot, act]) => ({ profile: 'HOST3', slot, act })),
    ...Object.entries(serialized.tv).map(([slot, act]) => ({ profile: 'TV', slot, act }))
  ];
  for (const entry of allEntries) {
    if (entry.act && isCustomDynamicAction(entry.act)) {
      const slotRc = repeatConfigs?.[`${entry.profile}:${entry.slot}`];
      const exists = merged.some(
        m =>
          m.action === entry.act &&
          JSON.stringify(m.repeatConfig || null) === JSON.stringify(slotRc || null)
      );
      if (!exists) {
        const desc = describeFirmwareAction(entry.act, slotRc);
        merged.push({
          id: `dev-macro-${entry.profile}-${entry.slot}-${merged.length}`,
          name: `${desc.fullLabel} (${defaultProfileAlias(entry.profile as HardwareProfileId)} ${entry.slot.toUpperCase()})`,
          action: entry.act,
          repeatConfig: slotRc,
          createdAt: 'Synced from Pad',
          source: 'device'
        });
      }
    }
  }
  return merged;
}

export function useStudioState(
  onToast: (msg: string, variant?: ToastVariant) => void
) {
  const initialUiPrefs = useMemo((): PersistedUiPrefs => {
    try {
      const raw = localStorage.getItem(UI_PREFS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
          userPresets: Array.isArray(parsed.userPresets) ? parsed.userPresets : [],
          customMacros: Array.isArray(parsed.customMacros) ? parsed.customMacros : [],
          appearanceOverrides: parsed.appearanceOverrides || {}
        };
      }
    } catch {}
    return {
      settings: DEFAULT_SETTINGS,
      userPresets: [],
      customMacros: [],
      appearanceOverrides: {}
    };
  }, []);

  const bootPadData = useMemo(() => {
    try {
      const lastId = localStorage.getItem(PAD_LAST_ID_KEY);
      if (lastId) {
        const rec = readStoredPadRecord(lastId);
        if (rec) {
          return {
            deviceId: lastId,
            rev: rec.rev,
            dirty: rec.dirty,
            hasStoredPad: true,
            profiles: serializedProfilesToStudioProfiles(
              rec.profiles,
              initialUiPrefs.appearanceOverrides,
              rec.repeatConfigs
            ),
            activeProfileId: rec.profiles.active || 'HOST1',
            customMacros: mergeDiscoveredCustomMacros(
              initialUiPrefs.customMacros,
              rec.profiles,
              rec.repeatConfigs
            )
          };
        }
      }
      const draft = readStoredPadRecord(DRAFT_PAD_ID);
      if (draft) {
        return {
          deviceId: DRAFT_PAD_ID,
          rev: 0,
          dirty: draft.dirty,
          hasStoredPad: false,
          profiles: serializedProfilesToStudioProfiles(
            draft.profiles,
            initialUiPrefs.appearanceOverrides,
            draft.repeatConfigs
          ),
          activeProfileId: draft.profiles.active || 'HOST1',
          customMacros: mergeDiscoveredCustomMacros(
            initialUiPrefs.customMacros,
            draft.profiles,
            draft.repeatConfigs
          )
        };
      }
    } catch {}

    // Offline pre-connect state uses universal factory defaults across Host 1–3 + TV
    const factorySerialized: SerializedPadProfiles = {
      active: 'HOST1',
      h1_name: 'Host 1',
      h2_name: 'Host 2',
      h3_name: 'Host 3',
      tv_name: 'TV',
      h1: { ...FACTORY_DEFAULT_SLOTS.HOST1 },
      h2: { ...FACTORY_DEFAULT_SLOTS.HOST2 },
      h3: { ...FACTORY_DEFAULT_SLOTS.HOST3 },
      tv: { ...FACTORY_DEFAULT_SLOTS.TV }
    };

    return {
      deviceId: null as string | null,
      rev: 0,
      dirty: false,
      hasStoredPad: false,
      profiles: serializedProfilesToStudioProfiles(
        factorySerialized,
        initialUiPrefs.appearanceOverrides
      ),
      activeProfileId: 'HOST1' as HardwareProfileId,
      customMacros: initialUiPrefs.customMacros
    };
  }, [initialUiPrefs]);

  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot>({
    profiles: bootPadData.profiles,
    activeProfileId: bootPadData.activeProfileId,
    customMacros: bootPadData.customMacros
  });

  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(bootPadData.deviceId);
  const [currentRev, setCurrentRev] = useState<number>(bootPadData.rev);
  const [dirty, setDirty] = useState<boolean>(bootPadData.dirty);
  const [savingCount, setSavingCount] = useState<number>(0);
  const [isConnected, setIsConnected] = useState<boolean>(usbHardware.info.connected);
  const [isSyncedWithHardware, setIsSyncedWithHardware] = useState<boolean>(
    bootPadData.hasStoredPad
  );
  const [conflictPrompt, setConflictPrompt] = useState<SyncConflictState | null>(null);

  const [appearanceOverrides, setAppearanceOverrides] = useState<Record<string, KeyAppearance>>(
    initialUiPrefs.appearanceOverrides
  );
  const [past, setPast] = useState<WorkspaceSnapshot[]>([]);
  const [future, setFuture] = useState<WorkspaceSnapshot[]>([]);
  const [userPresets, setUserPresets] = useState<UserPreset[]>(initialUiPrefs.userPresets);
  const [settings, setSettings] = useState<StudioSettings>(initialUiPrefs.settings);

  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const deviceIdRef = useRef(currentDeviceId);
  deviceIdRef.current = currentDeviceId;
  const revRef = useRef(currentRev);
  revRef.current = currentRev;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const savingCountRef = useRef(savingCount);
  savingCountRef.current = savingCount;
  const overridesRef = useRef(appearanceOverrides);
  overridesRef.current = appearanceOverrides;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const latestConfigEventRevRef = useRef<number | null>(null);

  // Sync theme (System / Dark / Light), accent color, sound, and live events flag
  useEffect(() => {
    const root = document.documentElement;
    const applyResolvedTheme = () => {
      let resolved: 'dark' | 'light' = 'dark';
      if (settings.theme === 'light') {
        resolved = 'light';
      } else if (settings.theme === 'system') {
        resolved = window.matchMedia?.('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark';
      }
      root.setAttribute('data-theme', resolved);
    };

    applyResolvedTheme();
    root.style.setProperty('--accent', settings.accentColor);
    root.style.setProperty('--accent-rgb', hexToRgbString(settings.accentColor));
    soundEngine.setEnabled(settings.soundEnabled);
    usbHardware.setEventsEnabled(settings.liveEventsEnabled);

    if (settings.theme === 'system' && window.matchMedia) {
      const mql = window.matchMedia('(prefers-color-scheme: light)');
      const handler = () => applyResolvedTheme();
      mql.addEventListener?.('change', handler);
      return () => mql.removeEventListener?.('change', handler);
    }
  }, [settings]);

  useEffect(() => {
    try {
      const toStore: PersistedUiPrefs = {
        settings,
        userPresets,
        customMacros: snapshot.customMacros,
        appearanceOverrides
      };
      localStorage.setItem(UI_PREFS_KEY, JSON.stringify(toStore));
    } catch {}
  }, [settings, userPresets, snapshot.customMacros, appearanceOverrides]);

  useEffect(() => {
    const unsub = usbHardware.onConnectionChange(info => {
      setIsConnected(info.connected);
      if (!info.connected) {
        setSavingCount(0);
        setConflictPrompt(null);
      }
    });
    return unsub;
  }, []);

  const adoptPadState = useCallback(
    (
      deviceId: string,
      rev: number,
      padProfiles: SerializedPadProfiles,
      knownRepeats?: SlotRepeatMap
    ) => {
      const existingRec = readStoredPadRecord(deviceId);
      const effectiveRepeats =
        knownRepeats ??
        existingRec?.repeatConfigs ??
        extractRepeatMapFromProfiles(snapshotRef.current.profiles);

      const builtProfiles = serializedProfilesToStudioProfiles(
        padProfiles,
        overridesRef.current,
        effectiveRepeats,
        snapshotRef.current.profiles
      );
      const cleanedRepeatMap = extractRepeatMapFromProfiles(builtProfiles);

      setSnapshot(prev => ({
        profiles: builtProfiles,
        activeProfileId: padProfiles.active,
        customMacros: mergeDiscoveredCustomMacros(
          prev.customMacros,
          padProfiles,
          cleanedRepeatMap
        )
      }));

      setCurrentDeviceId(deviceId);
      deviceIdRef.current = deviceId;
      setCurrentRev(rev);
      revRef.current = rev;
      setDirty(false);
      dirtyRef.current = false;
      setIsSyncedWithHardware(true);
      setConflictPrompt(null);

      writeStoredPadRecord(deviceId, {
        rev,
        profiles: padProfiles,
        dirty: false,
        repeatConfigs: cleanedRepeatMap
      });
      removeStoredPadRecord(DRAFT_PAD_ID);
    },
    []
  );

  const saveOfflineDraft = useCallback((nextSnap: WorkspaceSnapshot) => {
    const targetId =
      usbHardware.info.deviceId ||
      (deviceIdRef.current && deviceIdRef.current !== DRAFT_PAD_ID
        ? deviceIdRef.current
        : DRAFT_PAD_ID);
    const serialized = snapshotToSerializedProfiles(
      nextSnap.profiles,
      nextSnap.activeProfileId
    );
    const repeatMap = extractRepeatMapFromProfiles(nextSnap.profiles);
    setCurrentDeviceId(targetId);
    deviceIdRef.current = targetId;
    setDirty(true);
    dirtyRef.current = true;
    writeStoredPadRecord(targetId, {
      rev: revRef.current,
      profiles: serialized,
      dirty: true,
      repeatConfigs: repeatMap
    });
  }, []);

  const finalizeConnectedSave = useCallback(
    async (replyRev?: number, targetSnap?: WorkspaceSnapshot) => {
      let nextRev: number | undefined =
        typeof replyRev === 'number'
          ? replyRev
          : latestConfigEventRevRef.current !== null
          ? latestConfigEventRevRef.current
          : undefined;

      if (typeof nextRev !== 'number') {
        try {
          const fresh = await usbHardware.fetchStatus();
          if (typeof fresh.rev === 'number') {
            nextRev = fresh.rev;
          }
        } catch {}
      }

      const resolvedRev = typeof nextRev === 'number' ? nextRev : revRef.current;
      const devId =
        usbHardware.info.deviceId ||
        (deviceIdRef.current && deviceIdRef.current !== DRAFT_PAD_ID
          ? deviceIdRef.current
          : 'studio-pad');

      const snapToSave = targetSnap || snapshotRef.current;
      const serialized = snapshotToSerializedProfiles(
        snapToSave.profiles,
        snapToSave.activeProfileId
      );
      const repeatMap = extractRepeatMapFromProfiles(snapToSave.profiles);

      setCurrentDeviceId(devId);
      deviceIdRef.current = devId;
      setCurrentRev(resolvedRev);
      revRef.current = resolvedRev;
      setDirty(false);
      dirtyRef.current = false;
      setIsSyncedWithHardware(true);

      writeStoredPadRecord(devId, {
        rev: resolvedRev,
        profiles: serialized,
        dirty: false,
        repeatConfigs: repeatMap
      });
      removeStoredPadRecord(DRAFT_PAD_ID);
    },
    []
  );

  // On-Connect Sync Rules
  useEffect(() => {
    const unsubConnect = usbHardware.onConnectStatus(status => {
      const id = status.device?.id || 'studio-pad';
      const padRev = typeof status.rev === 'number' ? status.rev : 0;
      const padProfiles = statusPacketToSerializedProfiles(status);

      const saved = readStoredPadRecord(id);
      const preConnectDraft = !saved ? readStoredPadRecord(DRAFT_PAD_ID) : null;
      const effectiveRecord = saved || (preConnectDraft?.dirty ? preConnectDraft : null);

      if (!effectiveRecord) {
        adoptPadState(id, padRev, padProfiles);
        onToast(`Connected & adopted settings from ${status.device?.name || 'MacroPad'}`);
        return;
      }

      if (effectiveRecord.dirty) {
        const websiteProfiles = effectiveRecord.profiles;
        const diffs = computeProfileDiffs(websiteProfiles, padProfiles);
        if (diffs.length === 0) {
          adoptPadState(id, padRev, padProfiles, effectiveRecord.repeatConfigs);
          onToast('MacroPad reconnected — offline edits already match pad');
          return;
        }

        setSnapshot(prev => ({
          profiles: serializedProfilesToStudioProfiles(
            websiteProfiles,
            overridesRef.current,
            effectiveRecord.repeatConfigs,
            prev.profiles
          ),
          activeProfileId: websiteProfiles.active || prev.activeProfileId,
          customMacros: mergeDiscoveredCustomMacros(
            prev.customMacros,
            websiteProfiles,
            effectiveRecord.repeatConfigs
          )
        }));
        setCurrentDeviceId(id);
        deviceIdRef.current = id;
        setDirty(true);
        dirtyRef.current = true;
        setConflictPrompt({
          deviceId: id,
          deviceName: status.device?.name || 'Studio MacroPad',
          padRev,
          localRev: effectiveRecord.rev,
          padProfiles,
          websiteProfiles,
          diffs
        });
        return;
      }

      if (effectiveRecord.rev === padRev) {
        adoptPadState(id, padRev, padProfiles, effectiveRecord.repeatConfigs);
        onToast('MacroPad connected — already in sync');
        return;
      }

      adoptPadState(id, padRev, padProfiles, effectiveRecord.repeatConfigs);
      onToast(`Pad changed elsewhere (rev ${padRev}) — adopted MacroPad settings`);
    });

    return unsubConnect;
  }, [adoptPadState, onToast]);

  // Live Hardware Events (`profile`, `config`, AND physical `press` / `turn` repeat sequences)
  useEffect(() => {
    const unsubEvents = usbHardware.onHardwareEvent((e: HardwareEventPacket) => {
      if (!settingsRef.current.liveEventsEnabled && e.event !== 'config') {
        return;
      }

      if (e.event === 'press' || e.event === 'turn') {
        const rawSlot = String(e.slot || '').toLowerCase();
        const rawDir = String(e.dir || '').toLowerCase();
        let hwSlot: HardwareSlotId | null = null;

        if (rawSlot in SLOT_TO_ACTION_KEY || rawSlot === 'dial') {
          hwSlot = rawSlot as HardwareSlotId;
        } else if (
          rawSlot === 'enc_cw' ||
          rawSlot === 'cw' ||
          (e.event === 'turn' && rawDir !== 'ccw')
        ) {
          hwSlot = 'enc_cw';
        } else if (
          rawSlot === 'enc_ccw' ||
          rawSlot === 'ccw' ||
          (e.event === 'turn' && rawDir === 'ccw')
        ) {
          hwSlot = 'enc_ccw';
        }

        if (hwSlot) {
          const activeProfId =
            usbHardware.info.telemetry?.activeProfile ||
            snapshotRef.current.activeProfileId;
          const binding = getBindingForProfileSlot(
            snapshotRef.current.profiles,
            activeProfId,
            hwSlot
          );
          if (binding?.repeatConfig && requiresUsbSequenceExecution(binding.repeatConfig)) {
            repeatMacroRunner
              .handleHardwareSlotTrigger(
                `${activeProfId}:${hwSlot}`,
                binding.repeatConfig
              )
              .then(outcome => {
                if (outcome === 'stopped') {
                  onToast('Stopped active repeat macro');
                }
              });
          }
        }
        return;
      }

      if (e.event === 'profile') {
        const currentSlot = usbHardware.info.telemetry?.bleActiveHost ?? 1;
        const nextActive = normalizeHardwareProfileId(
          e.active || e.profile,
          currentSlot
        );
        setSnapshot(prev => {
          const updated = { ...prev, activeProfileId: nextActive };
          const devId = usbHardware.info.deviceId || deviceIdRef.current;
          if (devId && !dirtyRef.current) {
            writeStoredPadRecord(devId, {
              rev: revRef.current,
              profiles: snapshotToSerializedProfiles(updated.profiles, nextActive),
              dirty: false,
              repeatConfigs: extractRepeatMapFromProfiles(updated.profiles)
            });
          }
          return updated;
        });
      } else if (e.event === 'ble_host') {
        const slotNum = Number(e.ble_slot);
        const nextSlot: BleHostSlot = slotNum === 2 ? 2 : slotNum === 3 ? 3 : 1;
        const nextHostProf = bleSlotToProfileId(nextSlot);
        setSnapshot(prev => {
          const nextActive: HardwareProfileId =
            prev.activeProfileId === 'TV' && e.active === 'TV' ? 'TV' : nextHostProf;
          const updated = { ...prev, activeProfileId: nextActive };
          const devId = usbHardware.info.deviceId || deviceIdRef.current;
          if (devId && !dirtyRef.current) {
            writeStoredPadRecord(devId, {
              rev: revRef.current,
              profiles: snapshotToSerializedProfiles(updated.profiles, nextActive),
              dirty: false,
              repeatConfigs: extractRepeatMapFromProfiles(updated.profiles)
            });
          }
          return updated;
        });
      } else if (e.event === 'config') {
        if (typeof e.rev === 'number') {
          latestConfigEventRevRef.current = e.rev;
          setCurrentRev(e.rev);
          revRef.current = e.rev;
        }

        if (savingCountRef.current > 0) return;

        if (!dirtyRef.current) {
          const devId = usbHardware.info.deviceId || deviceIdRef.current || 'studio-pad';
          usbHardware
            .fetchStatus()
            .then(st => {
              const stId = st.device?.id || devId;
              const stRev = typeof st.rev === 'number' ? st.rev : revRef.current;
              adoptPadState(stId, stRev, statusPacketToSerializedProfiles(st));
            })
            .catch(() => {});
        }
      }
    });

    return unsubEvents;
  }, [adoptPadState, onToast]);

  const resolveConflictUsePad = useCallback(() => {
    if (!conflictPrompt) return;
    adoptPadState(
      conflictPrompt.deviceId,
      conflictPrompt.padRev,
      conflictPrompt.padProfiles,
      {}
    );
    onToast('Adopted MacroPad settings');
  }, [conflictPrompt, adoptPadState, onToast]);

  const resolveConflictUseWebsite = useCallback(async () => {
    if (!conflictPrompt) return;
    const { deviceId, websiteProfiles, padProfiles } = conflictPrompt;

    const mergeMap = (
      padMap: Record<HardwareSlotId, string>,
      webMap: Record<HardwareSlotId, string>
    ): Record<HardwareSlotId, string> => {
      const out = { ...padMap };
      for (const s of HARDWARE_SLOTS) {
        if (isValidFirmwareAction(webMap[s])) {
          out[s] = webMap[s];
        }
      }
      return out;
    };

    const mergedH1 = mergeMap(padProfiles.h1, websiteProfiles.h1);
    const mergedH2 = mergeMap(padProfiles.h2, websiteProfiles.h2);
    const mergedH3 = mergeMap(padProfiles.h3, websiteProfiles.h3);
    const mergedTv = mergeMap(padProfiles.tv, websiteProfiles.tv);

    const mergedSerialized: SerializedPadProfiles = {
      active: websiteProfiles.active || padProfiles.active,
      h1_name: sanitizeFirmwareAlias(websiteProfiles.h1_name || padProfiles.h1_name, 'HOST1'),
      h2_name: sanitizeFirmwareAlias(websiteProfiles.h2_name || padProfiles.h2_name, 'HOST2'),
      h3_name: sanitizeFirmwareAlias(websiteProfiles.h3_name || padProfiles.h3_name, 'HOST3'),
      tv_name: sanitizeFirmwareAlias(websiteProfiles.tv_name || padProfiles.tv_name, 'TV'),
      h1: mergedH1,
      h2: mergedH2,
      h3: mergedH3,
      tv: mergedTv
    };

    const currentRepeats = extractRepeatMapFromProfiles(snapshotRef.current.profiles);

    setSavingCount(c => c + 1);
    setConflictPrompt(null);

    try {
      latestConfigEventRevRef.current = null;
      await usbHardware.saveFullProfile('HOST1', mergedH1);
      await usbHardware.saveFullProfile('HOST2', mergedH2);
      await usbHardware.saveFullProfile('HOST3', mergedH3);
      await usbHardware.saveFullProfile('TV', mergedTv);

      if (mergedSerialized.h1_name !== padProfiles.h1_name) {
        await usbHardware.renameProfile('HOST1', mergedSerialized.h1_name);
      }
      if (mergedSerialized.h2_name !== padProfiles.h2_name) {
        await usbHardware.renameProfile('HOST2', mergedSerialized.h2_name);
      }
      if (mergedSerialized.h3_name !== padProfiles.h3_name) {
        await usbHardware.renameProfile('HOST3', mergedSerialized.h3_name);
      }
      if (mergedSerialized.tv_name !== padProfiles.tv_name) {
        await usbHardware.renameProfile('TV', mergedSerialized.tv_name);
      }
      if ((mergedSerialized.active === 'TV') !== (padProfiles.active === 'TV')) {
        await usbHardware.activateProfile(mergedSerialized.active).catch(() => {});
      }

      const freshStatus = await usbHardware.fetchStatus();
      const freshRev =
        typeof freshStatus.rev === 'number'
          ? freshStatus.rev
          : latestConfigEventRevRef.current ?? revRef.current;

      adoptPadState(
        deviceId,
        freshRev,
        statusPacketToSerializedProfiles(freshStatus),
        currentRepeats
      );
      onToast('Pushed website settings to MacroPad');
    } catch (err: any) {
      setDirty(true);
      dirtyRef.current = true;
      writeStoredPadRecord(deviceId, {
        rev: conflictPrompt.localRev,
        profiles: mergedSerialized,
        dirty: true,
        repeatConfigs: currentRepeats
      });
      onToast(err?.message || 'Could not push website settings — kept as draft', 'error');
    } finally {
      setSavingCount(c => Math.max(0, c - 1));
    }
  }, [conflictPrompt, adoptPadState, onToast]);

  const activeProfile: StudioProfile = useMemo(() => {
    return (
      snapshot.profiles.find(p => p.id === snapshot.activeProfileId) ||
      snapshot.profiles[0]
    );
  }, [snapshot]);

  const activeLayer = activeProfile.layers[0];

  const syncStatus: SyncStatusPill = useMemo(() => {
    if (savingCount > 0) return 'Saving';
    if (dirty || conflictPrompt !== null) return 'Out of sync';
    if (isConnected) return 'Synced';
    return 'Disconnected';
  }, [savingCount, dirty, conflictPrompt, isConnected]);

  const conflicts: ConflictWarning[] = useMemo(() => {
    const warnings: ConflictWarning[] = [];
    const seen = new Map<string, KeyId>();

    for (const kid of ACTION_KEY_IDS) {
      const tap = activeLayer.keys[kid]?.triggers.tap;
      const act = bindingToFirmwareAction(tap);
      if (!act) continue;
      const signature = `${act}::${JSON.stringify(tap?.repeatConfig || null)}`;
      const existing = seen.get(signature);
      if (existing) {
        warnings.push({
          controlA: existing,
          controlB: kid,
          summary: `Key ${existing.slice(1)} and Key ${kid.slice(1)} both trigger "${describeFirmwareAction(act, tap?.repeatConfig).shortLabel}".`
        });
      } else {
        seen.set(signature, kid);
      }
    }
    return warnings;
  }, [activeLayer]);

  /**
   * Executes a connected write:
   * - Shows `Saving…` for at least MIN_SAVING_DWELL_MS so the transition `Saving…` -> `Synced` is clearly visible.
   * - If the pad rejects the save (or fails while still connected), rolls back `snapshot` to `prevSnap` and shows the pad's error message!
   * - Only saves as an offline draft if unplugged (`!usbHardware.info.connected`).
   */
  const runConnectedWrite = useCallback(
    async (
      prevSnap: WorkspaceSnapshot,
      nextSnap: WorkspaceSnapshot,
      operation: () => Promise<{ rev?: number } | void>,
      successMsg?: string
    ): Promise<boolean> => {
      if (!usbHardware.info.connected || conflictPrompt !== null) {
        saveOfflineDraft(nextSnap);
        if (successMsg) onToast(`${successMsg} (saved offline)`);
        return true;
      }

      const startedAt = Date.now();
      setSavingCount(c => c + 1);
      latestConfigEventRevRef.current = null;
      try {
        const res = await operation();
        const elapsed = Date.now() - startedAt;
        if (elapsed < MIN_SAVING_DWELL_MS) {
          await new Promise(r => setTimeout(r, MIN_SAVING_DWELL_MS - elapsed));
        }
        await finalizeConnectedSave(
          res && typeof res.rev === 'number' ? res.rev : undefined,
          nextSnap
        );
        if (successMsg) onToast(successMsg);
        return true;
      } catch (err: any) {
        if (usbHardware.info.connected) {
          // Connected save failed -> roll back to previous state and display the pad's message!
          setSnapshot(prevSnap);
          setPast(h => h.slice(0, -1));
          onToast(err?.message || 'Pad rejected save — restored previous action', 'error');
          return false;
        } else {
          // Cable unplugged mid-save -> keep as offline draft
          saveOfflineDraft(nextSnap);
          onToast('Cable unplugged during save — kept as offline draft', 'error');
          return false;
        }
      } finally {
        setSavingCount(c => Math.max(0, c - 1));
      }
    },
    [conflictPrompt, finalizeConnectedSave, onToast, saveOfflineDraft]
  );

  const pushBothProfilesSnapshot = useCallback(
    async (
      prevSnap: WorkspaceSnapshot,
      targetSnap: WorkspaceSnapshot,
      labelMsg: string
    ) => {
      if (!usbHardware.info.connected || conflictPrompt !== null) {
        saveOfflineDraft(targetSnap);
        onToast(`${labelMsg} (saved as offline draft)`);
        return;
      }

      const startedAt = Date.now();
      setSavingCount(c => c + 1);
      latestConfigEventRevRef.current = null;
      try {
        for (const prof of targetSnap.profiles) {
          const slots = extractProfileSlots(prof);
          const allValid = HARDWARE_SLOTS.every(s => isValidFirmwareAction(slots[s]));
          if (allValid) {
            await usbHardware.saveFullProfile(prof.id, slots);
          } else {
            for (const s of HARDWARE_SLOTS) {
              if (isValidFirmwareAction(slots[s])) {
                await usbHardware.saveSlotBinding(prof.id, s, slots[s]);
              }
            }
          }
          await usbHardware.renameProfile(prof.id, prof.name);
        }
        const elapsed = Date.now() - startedAt;
        if (elapsed < MIN_SAVING_DWELL_MS) {
          await new Promise(r => setTimeout(r, MIN_SAVING_DWELL_MS - elapsed));
        }
        await finalizeConnectedSave(undefined, targetSnap);
        onToast(labelMsg);
      } catch (err: any) {
        if (usbHardware.info.connected) {
          setSnapshot(prevSnap);
          onToast(err?.message || 'Pad rejected profile save — restored previous state', 'error');
        } else {
          saveOfflineDraft(targetSnap);
          onToast(err?.message || 'Out of sync — saved locally', 'error');
        }
      } finally {
        setSavingCount(c => Math.max(0, c - 1));
      }
    },
    [conflictPrompt, finalizeConnectedSave, onToast, saveOfflineDraft]
  );

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const current = snapshotRef.current;
    const previous = past[past.length - 1];
    setPast(p => p.slice(0, -1));
    setFuture(f => [current, ...f]);
    setSnapshot(previous);
    pushBothProfilesSnapshot(current, previous, 'Undid last change');
  }, [past, pushBothProfilesSnapshot]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const current = snapshotRef.current;
    const [nextState, ...rest] = future;
    setFuture(rest);
    setPast(p => [...p, current]);
    setSnapshot(nextState);
    pushBothProfilesSnapshot(current, nextState, 'Redid change');
  }, [future, pushBothProfilesSnapshot]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  const selectProfile = useCallback((profileId: HardwareProfileId) => {
    setSnapshot(prev => {
      const updated = { ...prev, activeProfileId: profileId };
      const devId = usbHardware.info.deviceId || deviceIdRef.current;
      if (devId) {
        writeStoredPadRecord(devId, {
          rev: revRef.current,
          profiles: snapshotToSerializedProfiles(updated.profiles, profileId),
          dirty: dirtyRef.current,
          repeatConfigs: extractRepeatMapFromProfiles(updated.profiles)
        });
      }
      return updated;
    });

    if (usbHardware.info.connected) {
      const liveBleSlot = usbHardware.info.telemetry?.bleActiveHost ?? 1;
      const liveHostProf = bleSlotToProfileId(liveBleSlot);
      // Switch live hardware mode without rebooting when toggling between TV and the active BLE host
      if (profileId === 'TV' || profileId === liveHostProf) {
        if (usbHardware.info.telemetry?.activeProfile !== profileId) {
          usbHardware.activateProfile(profileId).catch((err: any) => {
            onToast(err?.message || 'Could not switch profile on pad', 'error');
          });
        }
      }
    }
  }, [onToast]);

  const toggleActiveProfile = useCallback(() => {
    const liveSlot =
      usbHardware.info.telemetry?.bleActiveHost ??
      profileIdToBleSlot(snapshotRef.current.activeProfileId) ??
      1;
    const hostProf = bleSlotToProfileId(liveSlot);
    const nextId: HardwareProfileId =
      snapshotRef.current.activeProfileId === 'TV' ? hostProf : 'TV';
    const nextProfObj = snapshotRef.current.profiles.find(p => p.id === nextId);
    const label = nextProfObj?.name || defaultProfileAlias(nextId);
    selectProfile(nextId);
    onToast(
      usbHardware.info.connected
        ? `Activated ${label} on MacroPad`
        : `Switched draft view to ${label}`
    );
  }, [selectProfile, onToast]);

  const renameProfile = useCallback(
    async (profileId: HardwareProfileId, rawName: string): Promise<boolean> => {
      const check = validateFirmwareAlias(rawName);
      if (!check.valid) {
        onToast(check.error || 'Invalid profile name', 'error');
        return false;
      }

      const prevSnap = snapshotRef.current;
      const nextSnap: WorkspaceSnapshot = {
        ...prevSnap,
        profiles: prevSnap.profiles.map(p =>
          p.id === profileId ? { ...p, name: rawName } : p
        )
      };

      setPast(h => [...h.slice(-34), prevSnap]);
      setFuture([]);
      setSnapshot(nextSnap);

      return await runConnectedWrite(
        prevSnap,
        nextSnap,
        () => usbHardware.renameProfile(profileId, rawName),
        `Renamed ${defaultProfileAlias(profileId)} to "${rawName}"`
      );
    },
    [onToast, runConnectedWrite]
  );

  const copyHardwareProfile = useCallback(
    async (source: HardwareProfileId, target: HardwareProfileId) => {
      if (source === target) return;
      const prevSnap = snapshotRef.current;
      const srcProf = prevSnap.profiles.find(p => p.id === source);
      const tgtProf = prevSnap.profiles.find(p => p.id === target);
      if (!srcProf || !tgtProf) return;

      const srcSlots = extractProfileSlots(srcProf);
      const allRepeats = extractRepeatMapFromProfiles(prevSnap.profiles);
      for (const s of HARDWARE_SLOTS) {
        if (allRepeats[`${source}:${s}`]) {
          allRepeats[`${target}:${s}`] = allRepeats[`${source}:${s}`];
        } else {
          delete allRepeats[`${target}:${s}`];
        }
      }

      const updatedTarget = buildHardwareProfile(
        target,
        tgtProf.name,
        srcSlots,
        tgtProf,
        allRepeats
      );
      const nextSnap: WorkspaceSnapshot = {
        ...prevSnap,
        profiles: prevSnap.profiles.map(p => (p.id === target ? updatedTarget : p))
      };

      setPast(h => [...h.slice(-34), prevSnap]);
      setFuture([]);
      setSnapshot(nextSnap);

      await runConnectedWrite(
        prevSnap,
        nextSnap,
        () => usbHardware.copyProfile(source, target),
        `Copied ${srcProf.name} → ${tgtProf.name}`
      );
    },
    [runConnectedWrite]
  );

  const assignSlotAction = useCallback(
    (profileId: HardwareProfileId, slot: HardwareSlotId, binding: ActionBinding) => {
      const actionStr = bindingToFirmwareAction(binding);
      if (!actionStr || !isValidFirmwareAction(actionStr)) {
        onToast('Rejected unsupported or incomplete firmware action', 'error');
        return;
      }

      const prevSnap = snapshotRef.current;
      const nextProfiles = prevSnap.profiles.map(prof => {
        if (prof.id !== profileId) return prof;
        const layer = prof.layers[0];

        if (slot in SLOT_TO_ACTION_KEY) {
          const kid = SLOT_TO_ACTION_KEY[slot as ButtonSlotId];

          const existingApp = layer.keys[kid].appearance;
          const nextAppearance = deriveAppearanceForAction(
            actionStr,
            {
              ...existingApp,
              customLabel: false,
              customIcon: existingApp.icon.startsWith('data:image/')
            },
            binding.repeatConfig
          );

          return {
            ...prof,
            layers: [
              {
                ...layer,
                keys: {
                  ...layer.keys,
                  [kid]: {
                    ...layer.keys[kid],
                    triggers: { tap: binding },
                    appearance: nextAppearance
                  }
                }
              }
            ] as [typeof layer]
          };
        }

        const nextEncoder: EncoderControlConfig = {
          ...layer.encoder,
          [slot === 'dial' ? 'dial' : slot === 'enc_cw' ? 'cw' : 'ccw']: binding
        };

        return {
          ...prof,
          layers: [
            {
              ...layer,
              encoder: nextEncoder
            }
          ] as [typeof layer]
        };
      });

      let nextMacros = prevSnap.customMacros;
      if (isCustomDynamicAction(actionStr)) {
        const exists = nextMacros.some(
          m =>
            m.action === actionStr &&
            JSON.stringify(m.repeatConfig || null) ===
              JSON.stringify(binding.repeatConfig || null)
        );
        if (!exists) {
          const info = describeFirmwareAction(actionStr, binding.repeatConfig);
          nextMacros = [
            {
              id: `custom-${Date.now()}`,
              name: info.fullLabel,
              action: actionStr,
              repeatConfig: binding.repeatConfig,
              createdAt: new Date().toLocaleTimeString(),
              source: 'user'
            },
            ...nextMacros
          ];
        }
      }

      const nextSnap: WorkspaceSnapshot = {
        ...prevSnap,
        profiles: nextProfiles,
        customMacros: nextMacros
      };

      setPast(h => [...h.slice(-34), prevSnap]);
      setFuture([]);
      setSnapshot(nextSnap);

      runConnectedWrite(prevSnap, nextSnap, () =>
        usbHardware.saveSlotBinding(profileId, slot, actionStr)
      );
    },
    [onToast, runConnectedWrite]
  );

  /**
   * Atomically updates multiple or all 11 slots on a single profile (used by Presets, My Presets, Knob Presets, Swap Directions)
   */
  const assignProfileSlots = useCallback(
    async (
      profileId: HardwareProfileId,
      partialSlots: Partial<Record<HardwareSlotId, string>>,
      successMsg?: string,
      repeatOverrides?: SlotRepeatMap
    ) => {
      const prevSnap = snapshotRef.current;
      const targetProf = prevSnap.profiles.find(p => p.id === profileId);
      if (!targetProf) return;

      const currentSlots = extractProfileSlots(targetProf);
      const mergedSlots: Record<HardwareSlotId, string> = {
        b1: partialSlots.b1 ?? (currentSlots.b1 || FACTORY_DEFAULT_SLOTS[profileId].b1),
        b2: partialSlots.b2 ?? (currentSlots.b2 || FACTORY_DEFAULT_SLOTS[profileId].b2),
        b3: partialSlots.b3 ?? (currentSlots.b3 || FACTORY_DEFAULT_SLOTS[profileId].b3),
        b4: partialSlots.b4 ?? (currentSlots.b4 || FACTORY_DEFAULT_SLOTS[profileId].b4),
        b5: partialSlots.b5 ?? (currentSlots.b5 || FACTORY_DEFAULT_SLOTS[profileId].b5),
        b6: partialSlots.b6 ?? (currentSlots.b6 || FACTORY_DEFAULT_SLOTS[profileId].b6),
        b7: partialSlots.b7 ?? (currentSlots.b7 || FACTORY_DEFAULT_SLOTS[profileId].b7),
        b8: partialSlots.b8 ?? (currentSlots.b8 || FACTORY_DEFAULT_SLOTS[profileId].b8),
        dial: partialSlots.dial ?? (currentSlots.dial || FACTORY_DEFAULT_SLOTS[profileId].dial),
        enc_cw:
          partialSlots.enc_cw ?? (currentSlots.enc_cw || FACTORY_DEFAULT_SLOTS[profileId].enc_cw),
        enc_ccw:
          partialSlots.enc_ccw ??
          (currentSlots.enc_ccw || FACTORY_DEFAULT_SLOTS[profileId].enc_ccw)
      };

      const existingRepeats = extractRepeatMapFromProfiles(prevSnap.profiles);
      for (const s of HARDWARE_SLOTS) {
        if (partialSlots[s] !== undefined) {
          const overrideRc = repeatOverrides?.[`${profileId}:${s}`];
          if (overrideRc) {
            existingRepeats[`${profileId}:${s}`] = overrideRc;
          } else {
            delete existingRepeats[`${profileId}:${s}`];
          }
        }
      }

      const rebuilt = buildHardwareProfile(
        profileId,
        targetProf.name,
        mergedSlots,
        targetProf,
        existingRepeats
      );

      const nextSnap: WorkspaceSnapshot = {
        ...prevSnap,
        profiles: prevSnap.profiles.map(p => (p.id === profileId ? rebuilt : p))
      };

      setPast(h => [...h.slice(-34), prevSnap]);
      setFuture([]);
      setSnapshot(nextSnap);

      await runConnectedWrite(
        prevSnap,
        nextSnap,
        () => usbHardware.saveFullProfile(profileId, mergedSlots),
        successMsg
      );
    },
    [runConnectedWrite]
  );

  const resetSlotToDefault = useCallback(
    (profileId: HardwareProfileId, slot: HardwareSlotId) => {
      const factoryAction = FACTORY_DEFAULT_SLOTS[profileId][slot];
      const binding = firmwareActionToBinding(factoryAction);
      assignSlotAction(profileId, slot, binding);
      onToast(
        `Reset ${SLOT_LABELS[slot].short} to default (${describeFirmwareAction(factoryAction).shortLabel})`
      );
    },
    [assignSlotAction, onToast]
  );

  const resetBothProfilesToDefault = useCallback(async () => {
    const prevSnap = snapshotRef.current;
    const nextProfiles: StudioProfile[] = [
      buildHardwareProfile('HOST1', 'Host 1', { ...FACTORY_DEFAULT_SLOTS.HOST1 }),
      buildHardwareProfile('HOST2', 'Host 2', { ...FACTORY_DEFAULT_SLOTS.HOST2 }),
      buildHardwareProfile('HOST3', 'Host 3', { ...FACTORY_DEFAULT_SLOTS.HOST3 }),
      buildHardwareProfile('TV', 'TV', { ...FACTORY_DEFAULT_SLOTS.TV })
    ];
    const activeHostSlot = usbHardware.info.telemetry?.bleActiveHost ?? 1;
    const nextSnap: WorkspaceSnapshot = {
      ...prevSnap,
      profiles: nextProfiles,
      activeProfileId: bleSlotToProfileId(activeHostSlot)
    };

    setPast(h => [...h.slice(-34), prevSnap]);
    setFuture([]);
    setSnapshot(nextSnap);
    setAppearanceOverrides({});

    if (usbHardware.info.connected) {
      await runConnectedWrite(
        prevSnap,
        nextSnap,
        async () => {
          const res = await usbHardware.resetHardwareDefaults();
          return res;
        },
        'Restored all 3 BLE host profiles and TV to defaults'
      );
    } else {
      saveOfflineDraft(nextSnap);
      onToast('Restored all 4 profiles to defaults (offline draft)');
    }
  }, [onToast, runConnectedWrite, saveOfflineDraft]);

  const updateKeyBinding = useCallback(
    (kid: KeyId, binding: ActionBinding) => {
      if (kid === 'k9') return;
      const slot = KEY_TO_SLOT[kid];
      assignSlotAction(activeProfile.id, slot, binding);
    },
    [activeProfile.id, assignSlotAction]
  );

  const updateKeyAppearance = useCallback(
    (kid: KeyId, patch: Partial<KeyAppearance>) => {
      if (kid === 'k9') return;
      setSnapshot(prev => {
        const nextProfiles = prev.profiles.map(prof => {
          if (prof.id !== activeProfile.id) return prof;
          const layer = prof.layers[0];
          const prevApp = layer.keys[kid].appearance;
          const updated: KeyAppearance = {
            ...prevApp,
            ...patch,
            customLabel: patch.label !== undefined ? true : prevApp.customLabel,
            customIcon: patch.icon !== undefined ? true : prevApp.customIcon
          };
          setAppearanceOverrides(ov => ({
            ...ov,
            [`${prof.id}:${kid}`]: updated
          }));
          return {
            ...prof,
            layers: [
              {
                ...layer,
                keys: {
                  ...layer.keys,
                  [kid]: {
                    ...layer.keys[kid],
                    appearance: updated
                  }
                }
              }
            ] as [typeof layer]
          };
        });
        return { ...prev, profiles: nextProfiles };
      });
    },
    [activeProfile.id]
  );

  const resetKeyAppearance = useCallback(
    (kid: KeyId) => {
      if (kid === 'k9') return;
      const slot = KEY_TO_SLOT[kid];
      const tap = activeLayer.keys[kid].triggers.tap;
      const currentAct = bindingToFirmwareAction(tap);
      const freshApp = deriveAppearanceForAction(currentAct, undefined, tap.repeatConfig);

      setAppearanceOverrides(ov => {
        const copy = { ...ov };
        delete copy[`${activeProfile.id}:${kid}`];
        if (activeProfile.id === 'HOST1') delete copy[`MAC:${kid}`];
        return copy;
      });

      setSnapshot(prev => ({
        ...prev,
        profiles: prev.profiles.map(prof => {
          if (prof.id !== activeProfile.id) return prof;
          const layer = prof.layers[0];
          return {
            ...prof,
            layers: [
              {
                ...layer,
                keys: {
                  ...layer.keys,
                  [kid]: {
                    ...layer.keys[kid],
                    appearance: freshApp
                  }
                }
              }
            ] as [typeof layer]
          };
        })
      }));
      onToast(`Reset ${slot.toUpperCase()} keycap legend`);
    },
    [activeLayer, activeProfile.id, onToast]
  );

  const updateEncoderSlot = useCallback(
    (slot: 'dial' | 'enc_cw' | 'enc_ccw', binding: ActionBinding) => {
      assignSlotAction(activeProfile.id, slot, binding);
    },
    [activeProfile.id, assignSlotAction]
  );

  const updateEncoderColor = useCallback(
    (color: string) => {
      setSnapshot(prev => ({
        ...prev,
        profiles: prev.profiles.map(prof => {
          if (prof.id !== activeProfile.id) return prof;
          const layer = prof.layers[0];
          return {
            ...prof,
            layers: [
              {
                ...layer,
                encoder: {
                  ...layer.encoder,
                  color
                }
              }
            ] as [typeof layer]
          };
        })
      }));
    },
    [activeProfile.id]
  );

  const pullFromUsbNow = useCallback(async () => {
    if (!usbHardware.info.connected) {
      onToast('Connect your MacroPad via USB first', 'error');
      return false;
    }
    try {
      const status = await usbHardware.fetchStatus();
      const id = status.device?.id || deviceIdRef.current || 'studio-pad';
      const rev = typeof status.rev === 'number' ? status.rev : revRef.current;
      adoptPadState(id, rev, statusPacketToSerializedProfiles(status));
      onToast(`Synced from MacroPad (rev ${rev})`);
      return true;
    } catch (err: any) {
      onToast(err?.message || 'Failed to read status from MacroPad', 'error');
      return false;
    }
  }, [adoptPadState, onToast]);

  const pushAllToDeviceNow = useCallback(async () => {
    if (!usbHardware.info.connected) {
      onToast('Connect USB cable to push draft changes to MacroPad', 'error');
      return false;
    }
    await pushBothProfilesSnapshot(
      snapshotRef.current,
      snapshotRef.current,
      'Saved all profiles to MacroPad'
    );
    return true;
  }, [pushBothProfilesSnapshot, onToast]);

  const saveCustomMacro = useCallback((item: CustomMacroItem) => {
    setSnapshot(prev => {
      const exists = prev.customMacros.some(m => m.id === item.id);
      const nextList = exists
        ? prev.customMacros.map(m => (m.id === item.id ? item : m))
        : [item, ...prev.customMacros];
      return { ...prev, customMacros: nextList };
    });
  }, []);

  const deleteCustomMacro = useCallback((id: string) => {
    setSnapshot(prev => ({
      ...prev,
      customMacros: prev.customMacros.filter(m => m.id !== id)
    }));
  }, []);

  /**
   * Saves the active profile (and full backup) into "My presets" so it can be reapplied anytime
   */
  const saveUserSnapshot = useCallback(
    (name: string, profileId?: HardwareProfileId) => {
      const targetProfId = profileId || snapshotRef.current.activeProfileId;
      const prof =
        snapshotRef.current.profiles.find(p => p.id === targetProfId) ||
        snapshotRef.current.profiles[0];
      const profileSlots = extractProfileSlots(prof);
      const backup = buildBackupFromProfiles(snapshotRef.current.profiles);
      const repeatConfigs = extractRepeatMapFromProfiles(snapshotRef.current.profiles);

      const entry: UserPreset = {
        id: `preset-${Date.now()}`,
        name: name.trim() || `${prof.name} Preset ${userPresets.length + 1}`,
        createdAt: new Date().toLocaleString(),
        targetProfile: targetProfId,
        profileSlots,
        backup,
        repeatConfigs
      };
      setUserPresets(prev => [entry, ...prev]);
      onToast(`Saved "${entry.name}" to My presets`);
    },
    [userPresets.length, onToast]
  );

  const deleteUserSnapshot = useCallback((id: string) => {
    setUserPresets(prev => prev.filter(item => item.id !== id));
  }, []);

  /**
   * Restores a `studio-pad-config` JSON backup (supports v2 4-profile backups and v1 legacy files)
   */
  const applyHardwareBackup = useCallback(
    async (backup: HardwareBackupPayload, repeatConfigs?: SlotRepeatMap) => {
      const prevSnap = snapshotRef.current;
      const prevH1 = prevSnap.profiles.find(p => p.id === 'HOST1');
      const prevH2 = prevSnap.profiles.find(p => p.id === 'HOST2');
      const prevH3 = prevSnap.profiles.find(p => p.id === 'HOST3');
      const prevTv = prevSnap.profiles.find(p => p.id === 'TV');

      const buildSlotsFromBackup = (
        prefix: 'h1' | 'h2' | 'h3' | 'tv',
        prevProf: StudioProfile | undefined,
        defaults: Record<HardwareSlotId, string>,
        allowLegacyMacFallback = false
      ): Record<HardwareSlotId, string> => {
        const prevSlots = prevProf ? extractProfileSlots(prevProf) : defaults;
        const out = { ...defaults };
        for (const s of HARDWARE_SLOTS) {
          const direct = backup[`${prefix}_${s}`];
          const legacy = allowLegacyMacFallback ? backup[`mac_${s}`] : undefined;
          if (typeof direct === 'string' && direct.length > 0) {
            out[s] = direct;
          } else if (typeof legacy === 'string' && legacy.length > 0) {
            out[s] = legacy;
          } else {
            out[s] = prevSlots[s] || defaults[s];
          }
        }
        return out;
      };

      const h1Slots = buildSlotsFromBackup('h1', prevH1, FACTORY_DEFAULT_SLOTS.HOST1, true);
      const h2Slots = buildSlotsFromBackup('h2', prevH2, FACTORY_DEFAULT_SLOTS.HOST2, false);
      const h3Slots = buildSlotsFromBackup('h3', prevH3, FACTORY_DEFAULT_SLOTS.HOST3, false);
      const tvSlots = buildSlotsFromBackup('tv', prevTv, FACTORY_DEFAULT_SLOTS.TV, false);

      const normalizedRepeats = migrateRepeatConfigs(repeatConfigs);

      const nextSnap: WorkspaceSnapshot = {
        ...prevSnap,
        profiles: [
          buildHardwareProfile(
            'HOST1',
            backup.h1_name || backup.mac_name || prevH1?.name || 'Host 1',
            h1Slots,
            prevH1,
            normalizedRepeats
          ),
          buildHardwareProfile(
            'HOST2',
            backup.h2_name || prevH2?.name || 'Host 2',
            h2Slots,
            prevH2,
            normalizedRepeats
          ),
          buildHardwareProfile(
            'HOST3',
            backup.h3_name || prevH3?.name || 'Host 3',
            h3Slots,
            prevH3,
            normalizedRepeats
          ),
          buildHardwareProfile(
            'TV',
            backup.tv_name || prevTv?.name || 'TV',
            tvSlots,
            prevTv,
            normalizedRepeats
          )
        ]
      };

      setPast(h => [...h.slice(-34), prevSnap]);
      setFuture([]);
      setSnapshot(nextSnap);

      const isV2 = backup.version === 2 || Boolean(backup.h1_b1);
      await runConnectedWrite(
        prevSnap,
        nextSnap,
        () => usbHardware.importHardwareConfig(backup),
        isV2
          ? 'Restored all 3 BLE host profiles and TV configuration'
          : 'Restored v1 backup configuration into Host 1 & TV'
      );
    },
    [runConnectedWrite]
  );

  const exportHardwareBackupFile = useCallback(async () => {
    let payload: HardwareBackupPayload;
    if (usbHardware.info.connected) {
      try {
        payload = await usbHardware.exportHardwareConfig();
      } catch {
        payload = buildBackupFromProfiles(snapshotRef.current.profiles);
      }
    } else {
      payload = buildBackupFromProfiles(snapshotRef.current.profiles);
    }

    const fallback = buildBackupFromProfiles(snapshotRef.current.profiles);
    const cleanPayload: HardwareBackupPayload = {
      schema: 'studio-pad-config',
      version: 2,
      tv_name: payload.tv_name || fallback.tv_name,
      h1_name: payload.h1_name || payload.mac_name || fallback.h1_name,
      h2_name: payload.h2_name || fallback.h2_name,
      h3_name: payload.h3_name || fallback.h3_name,
      ...Object.fromEntries(
        HARDWARE_SLOTS.map(s => [
          `h1_${s}`,
          payload[`h1_${s}`] || payload[`mac_${s}`] || fallback[`h1_${s}`]
        ])
      ),
      ...Object.fromEntries(
        HARDWARE_SLOTS.map(s => [`h2_${s}`, payload[`h2_${s}`] || fallback[`h2_${s}`]])
      ),
      ...Object.fromEntries(
        HARDWARE_SLOTS.map(s => [`h3_${s}`, payload[`h3_${s}`] || fallback[`h3_${s}`]])
      ),
      tv_b1: payload.tv_b1 || fallback.tv_b1,
      tv_b2: payload.tv_b2 || fallback.tv_b2,
      tv_b3: payload.tv_b3 || fallback.tv_b3,
      tv_b4: payload.tv_b4 || fallback.tv_b4,
      tv_b5: payload.tv_b5 || fallback.tv_b5,
      tv_b6: payload.tv_b6 || fallback.tv_b6,
      tv_b7: payload.tv_b7 || fallback.tv_b7,
      tv_b8: payload.tv_b8 || fallback.tv_b8,
      tv_dial: payload.tv_dial || fallback.tv_dial,
      tv_enc_cw: payload.tv_enc_cw || fallback.tv_enc_cw,
      tv_enc_ccw: payload.tv_enc_ccw || fallback.tv_enc_ccw
    };

    const blob = new Blob([JSON.stringify(cleanPayload, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'studio-pad-backup.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    onToast(
      usbHardware.info.connected
        ? 'Downloaded studio-pad-backup.json (v2 · 4 profiles) from MacroPad'
        : 'Downloaded studio-pad-backup.json (v2 · 4 profiles)'
    );
  }, [onToast]);

  const importHardwareBackupFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const parsed = JSON.parse(String(reader.result));
          if (
            parsed?.schema === 'studio-pad-config' &&
            (parsed.h1_b1 || parsed.mac_b1) &&
            parsed.tv_b1
          ) {
            await applyHardwareBackup(parsed as HardwareBackupPayload);
            return;
          }
          onToast('Incompatible JSON: expected schema "studio-pad-config"', 'error');
        } catch {
          onToast('Failed to parse backup JSON file', 'error');
        }
      };
      reader.readAsText(file);
    },
    [applyHardwareBackup, onToast]
  );

  const clearLocalUnSyncedState = useCallback(() => {
    repeatMacroRunner.stop();
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('pad:')) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
      localStorage.removeItem(UI_PREFS_KEY);
    } catch {}

    const factoryProfiles: StudioProfile[] = [
      buildHardwareProfile('HOST1', 'Host 1', { ...FACTORY_DEFAULT_SLOTS.HOST1 }),
      buildHardwareProfile('HOST2', 'Host 2', { ...FACTORY_DEFAULT_SLOTS.HOST2 }),
      buildHardwareProfile('HOST3', 'Host 3', { ...FACTORY_DEFAULT_SLOTS.HOST3 }),
      buildHardwareProfile('TV', 'TV', { ...FACTORY_DEFAULT_SLOTS.TV })
    ];

    setSnapshot({
      profiles: factoryProfiles,
      activeProfileId: 'HOST1',
      customMacros: []
    });
    setUserPresets([]);
    setAppearanceOverrides({});
    setPast([]);
    setFuture([]);
    setDirty(false);
    dirtyRef.current = false;
    setCurrentRev(0);
    revRef.current = 0;
    setCurrentDeviceId(null);
    deviceIdRef.current = null;
    setIsSyncedWithHardware(false);
    setConflictPrompt(null);

    if (usbHardware.info.connected) {
      pullFromUsbNow();
    } else {
      onToast('Cleared local cache');
    }
  }, [onToast, pullFromUsbNow]);

  return {
    profiles: snapshot.profiles,
    activeProfile,
    activeLayer,
    customMacros: snapshot.customMacros,
    userPresets,
    settings,
    conflicts,
    syncStatus,
    currentRev,
    currentDeviceId,
    dirty,
    isSyncedWithHardware,
    conflictPrompt,
    resolveConflictUseWebsite,
    resolveConflictUsePad,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    undo,
    redo,
    selectProfile,
    toggleActiveProfile,
    renameProfile,
    copyHardwareProfile,
    assignSlotAction,
    assignProfileSlots,
    resetSlotToDefault,
    resetBothProfilesToDefault,
    updateKeyBinding,
    updateKeyAppearance,
    resetKeyAppearance,
    updateEncoderSlot,
    updateEncoderColor,
    pullFromUsbNow,
    pushAllToDeviceNow,
    saveCustomMacro,
    deleteCustomMacro,
    saveUserSnapshot,
    deleteUserSnapshot,
    applyHardwareBackup,
    exportHardwareBackupFile,
    importHardwareBackupFile,
    clearLocalUnSyncedState,
    updateSettings: (patch: Partial<StudioSettings>) =>
      setSettings(prev => ({ ...prev, ...patch }))
  };
}
