import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ActionBinding,
  ConflictWarning,
  CustomMacroItem,
  EncoderControlConfig,
  HardwareBackupPayload,
  HardwareEventPacket,
  HardwareProfileId,
  HardwareSlotId,
  KeyAppearance,
  KeyId,
  SerializedPadProfiles,
  StoredPadRecord,
  StudioProfile,
  StudioSettings,
  SyncConflictDiffItem,
  SyncConflictState,
  SyncStatusPill,
  UserPreset
} from '../types/studio';
import {
  KEY_TO_SLOT,
  buildBlankHardwareProfiles,
  buildHardwareProfile
} from '../data/presetTemplates';
import {
  HARDWARE_SLOTS,
  SLOT_LABELS,
  bindingToFirmwareAction,
  deriveAppearanceForAction,
  describeFirmwareAction,
  isValidFirmwareAction,
  sanitizeFirmwareAlias
} from '../data/firmwareCatalog';
import { FirmwareStatusPacket, usbHardware } from '../services/usbHardwareService';
import { soundEngine } from '../services/soundEffects';

const UI_PREFS_KEY = 'studio_macropad_ui_prefs_v5';
const PAD_LAST_ID_KEY = 'pad:__last_id__';
const DRAFT_PAD_ID = '__draft__';

interface WorkspaceSnapshot {
  profiles: [StudioProfile, StudioProfile];
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
  soundEnabled: true
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

function readStoredPadRecord(deviceId: string): StoredPadRecord | null {
  try {
    const raw = localStorage.getItem(`pad:${deviceId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.profiles) return null;
    return {
      rev: typeof parsed.rev === 'number' ? parsed.rev : 0,
      profiles: parsed.profiles as SerializedPadProfiles,
      dirty: Boolean(parsed.dirty)
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
    dial: bindingToFirmwareAction(layer.encoder.dial),
    enc_cw: bindingToFirmwareAction(layer.encoder.cw),
    enc_ccw: bindingToFirmwareAction(layer.encoder.ccw)
  };
}

export function snapshotToSerializedProfiles(
  profiles: [StudioProfile, StudioProfile],
  activeProfileId: HardwareProfileId
): SerializedPadProfiles {
  const macProf = profiles.find(p => p.id === 'MAC') || profiles[0];
  const tvProf = profiles.find(p => p.id === 'TV') || profiles[1];
  return {
    active: activeProfileId,
    mac_name: sanitizeFirmwareAlias(macProf.name, 'MAC'),
    tv_name: sanitizeFirmwareAlias(tvProf.name, 'TV'),
    mac: extractProfileSlots(macProf),
    tv: extractProfileSlots(tvProf)
  };
}

export function statusPacketToSerializedProfiles(
  pkt: FirmwareStatusPacket
): SerializedPadProfiles {
  const macItem = pkt.profiles?.items?.find(i => i.id === 'MAC');
  const tvItem = pkt.profiles?.items?.find(i => i.id === 'TV');

  return {
    active: pkt.profiles?.active === 'TV' ? 'TV' : 'MAC',
    mac_name: macItem?.name || 'Mac',
    tv_name: tvItem?.name || 'TV',
    mac: {
      b1: macItem?.controls?.b1 ?? pkt.mac_b1 ?? '',
      b2: macItem?.controls?.b2 ?? pkt.mac_b2 ?? '',
      b3: macItem?.controls?.b3 ?? pkt.mac_b3 ?? '',
      b4: macItem?.controls?.b4 ?? pkt.mac_b4 ?? '',
      dial: macItem?.controls?.dial ?? pkt.mac_dial ?? '',
      enc_cw: macItem?.controls?.enc_cw ?? '',
      enc_ccw: macItem?.controls?.enc_ccw ?? ''
    },
    tv: {
      b1: tvItem?.controls?.b1 ?? pkt.tv_b1 ?? '',
      b2: tvItem?.controls?.b2 ?? pkt.tv_b2 ?? '',
      b3: tvItem?.controls?.b3 ?? pkt.tv_b3 ?? '',
      b4: tvItem?.controls?.b4 ?? pkt.tv_b4 ?? '',
      dial: tvItem?.controls?.dial ?? pkt.tv_dial ?? '',
      enc_cw: tvItem?.controls?.enc_cw ?? '',
      enc_ccw: tvItem?.controls?.enc_ccw ?? ''
    }
  };
}

function serializedProfilesToStudioProfiles(
  serialized: SerializedPadProfiles,
  overrides: Record<string, KeyAppearance>,
  prevProfiles?: [StudioProfile, StudioProfile]
): [StudioProfile, StudioProfile] {
  const prevMac = prevProfiles?.find(p => p.id === 'MAC');
  const prevTv = prevProfiles?.find(p => p.id === 'TV');

  const nextMac = buildHardwareProfile('MAC', serialized.mac_name || 'Mac', serialized.mac, prevMac);
  const nextTv = buildHardwareProfile('TV', serialized.tv_name || 'TV', serialized.tv, prevTv);

  (['k1', 'k2', 'k3', 'k4'] as const).forEach(kid => {
    const mOv = overrides[`MAC:${kid}`];
    if (mOv) {
      nextMac.layers[0].keys[kid].appearance = deriveAppearanceForAction(
        serialized.mac[KEY_TO_SLOT[kid]],
        mOv
      );
    }
    const tOv = overrides[`TV:${kid}`];
    if (tOv) {
      nextTv.layers[0].keys[kid].appearance = deriveAppearanceForAction(
        serialized.tv[KEY_TO_SLOT[kid]],
        tOv
      );
    }
  });

  return [nextMac, nextTv];
}

function computeProfileDiffs(
  website: SerializedPadProfiles,
  pad: SerializedPadProfiles
): SyncConflictDiffItem[] {
  const diffs: SyncConflictDiffItem[] = [];

  if (website.mac_name !== pad.mac_name) {
    diffs.push({
      id: 'mac_name',
      label: 'MAC Profile Alias',
      websiteValue: website.mac_name,
      padValue: pad.mac_name
    });
  }
  if (website.tv_name !== pad.tv_name) {
    diffs.push({
      id: 'tv_name',
      label: 'TV Profile Alias',
      websiteValue: website.tv_name,
      padValue: pad.tv_name
    });
  }

  for (const profId of ['MAC', 'TV'] as const) {
    const webSlots = profId === 'MAC' ? website.mac : website.tv;
    const padSlots = profId === 'MAC' ? pad.mac : pad.tv;
    for (const slot of HARDWARE_SLOTS) {
      const wVal = webSlots[slot] || '';
      const pVal = padSlots[slot] || '';
      // If website slot was left empty in a pre-connect draft, it inherits pad's value on merge
      if (wVal && wVal !== pVal) {
        diffs.push({
          id: `${profId}-${slot}`,
          label: `${profId} · ${SLOT_LABELS[slot].short}`,
          websiteValue: `${describeFirmwareAction(wVal).shortLabel} (${wVal})`,
          padValue: pVal ? `${describeFirmwareAction(pVal).shortLabel} (${pVal})` : 'Unassigned'
        });
      }
    }
  }

  return diffs;
}

export function buildBackupFromProfiles(
  profiles: [StudioProfile, StudioProfile]
): HardwareBackupPayload {
  const macProf = profiles.find(p => p.id === 'MAC') || profiles[0];
  const tvProf = profiles.find(p => p.id === 'TV') || profiles[1];
  const mac = extractProfileSlots(macProf);
  const tv = extractProfileSlots(tvProf);

  return {
    schema: 'studio-pad-config',
    version: 1,
    mac_name: sanitizeFirmwareAlias(macProf.name, 'MAC'),
    tv_name: sanitizeFirmwareAlias(tvProf.name, 'TV'),
    mac_b1: mac.b1,
    mac_b2: mac.b2,
    mac_b3: mac.b3,
    mac_b4: mac.b4,
    mac_dial: mac.dial,
    mac_enc_cw: mac.enc_cw,
    mac_enc_ccw: mac.enc_ccw,
    tv_b1: tv.b1,
    tv_b2: tv.b2,
    tv_b3: tv.b3,
    tv_b4: tv.b4,
    tv_dial: tv.dial,
    tv_enc_cw: tv.enc_cw,
    tv_enc_ccw: tv.enc_ccw
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
  serialized: SerializedPadProfiles
): CustomMacroItem[] {
  const merged = [...existing];
  const allEntries = [
    ...Object.entries(serialized.mac).map(([slot, act]) => ({ profile: 'MAC', slot, act })),
    ...Object.entries(serialized.tv).map(([slot, act]) => ({ profile: 'TV', slot, act }))
  ];
  for (const entry of allEntries) {
    if (entry.act && isCustomDynamicAction(entry.act)) {
      if (!merged.some(m => m.action === entry.act)) {
        const desc = describeFirmwareAction(entry.act);
        merged.push({
          id: `dev-macro-${entry.profile}-${entry.slot}-${merged.length}`,
          name: `${desc.fullLabel} (${entry.profile} ${entry.slot.toUpperCase()})`,
          action: entry.act,
          createdAt: 'Synced from Pad',
          source: 'device'
        });
      }
    }
  }
  return merged;
}

export function useStudioState(onToast: (msg: string) => void) {
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

  // Load saved copy for last known pad (`localStorage["pad:" + id]`) or pre-connect draft if present
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
              initialUiPrefs.appearanceOverrides
            ),
            activeProfileId: rec.profiles.active || 'MAC',
            customMacros: mergeDiscoveredCustomMacros(
              initialUiPrefs.customMacros,
              rec.profiles
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
            initialUiPrefs.appearanceOverrides
          ),
          activeProfileId: draft.profiles.active || 'MAC',
          customMacros: mergeDiscoveredCustomMacros(
            initialUiPrefs.customMacros,
            draft.profiles
          )
        };
      }
    } catch {}

    return {
      deviceId: null as string | null,
      rev: 0,
      dirty: false,
      hasStoredPad: false,
      profiles: buildBlankHardwareProfiles(),
      activeProfileId: 'MAC' as HardwareProfileId,
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

  // Refs for synchronous access inside async USB callbacks
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
  const latestConfigEventRevRef = useRef<number | null>(null);

  // Apply theme & accent CSS variables
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', settings.theme);
    root.style.setProperty('--accent', settings.accentColor);
    root.style.setProperty('--accent-rgb', hexToRgbString(settings.accentColor));
    soundEngine.setEnabled(settings.soundEnabled);
  }, [settings]);

  // Persist UI preferences (never Wi-Fi, TV pairing, or HTTP token)
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

  // Listen to USB connection changes (including `navigator.serial` disconnect -> Disconnected)
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

  /**
   * Adopt authoritative pad settings into Studio state & `localStorage["pad:" + id]`
   */
  const adoptPadState = useCallback(
    (deviceId: string, rev: number, padProfiles: SerializedPadProfiles) => {
      setSnapshot(prev => ({
        profiles: serializedProfilesToStudioProfiles(
          padProfiles,
          overridesRef.current,
          prev.profiles
        ),
        activeProfileId: padProfiles.active,
        customMacros: mergeDiscoveredCustomMacros(prev.customMacros, padProfiles)
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
        dirty: false
      });
      removeStoredPadRecord(DRAFT_PAD_ID);
    },
    []
  );

  /**
   * Persist draft while unplugged (or on failed write) with `dirty: true` -> "Out of sync"
   */
  const saveOfflineDraft = useCallback(
    (nextSnap: WorkspaceSnapshot) => {
      const targetId =
        usbHardware.info.deviceId ||
        (deviceIdRef.current && deviceIdRef.current !== DRAFT_PAD_ID
          ? deviceIdRef.current
          : DRAFT_PAD_ID);
      const serialized = snapshotToSerializedProfiles(
        nextSnap.profiles,
        nextSnap.activeProfileId
      );
      setCurrentDeviceId(targetId);
      deviceIdRef.current = targetId;
      setDirty(true);
      dirtyRef.current = true;
      writeStoredPadRecord(targetId, {
        rev: revRef.current,
        profiles: serialized,
        dirty: true
      });
    },
    []
  );

  /**
   * After a live edit succeeds over USB, obtain the new `rev` (from reply, `config` event, or `/api/status`)
   * and persist `{ rev, profiles, dirty: false }` to `localStorage["pad:" + id]`
   */
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
        dirty: false
      });
      removeStoredPadRecord(DRAFT_PAD_ID);
    },
    []
  );

  /**
   * Exact On-Connect Sync Rules Engine:
   * 1. Read `status` and use `device.id` as key `localStorage["pad:" + id]`.
   * 2. No saved copy -> adopt pad's settings.
   * 3. Same `rev` and `!dirty` -> already in sync.
   * 4. Different `rev` and `!dirty` -> pad changed elsewhere, adopt pad's settings.
   * 5. `dirty === true` -> ask "Use website settings or pad settings?"
   */
  useEffect(() => {
    const unsubConnect = usbHardware.onConnectStatus(status => {
      const id = status.device?.id || 'studio-pad';
      const padRev = typeof status.rev === 'number' ? status.rev : 0;
      const padProfiles = statusPacketToSerializedProfiles(status);

      const saved = readStoredPadRecord(id);
      const preConnectDraft = !saved ? readStoredPadRecord(DRAFT_PAD_ID) : null;
      const effectiveRecord = saved || (preConnectDraft?.dirty ? preConnectDraft : null);

      if (!effectiveRecord) {
        // Rule 1: No saved copy -> adopt the pad's settings
        adoptPadState(id, padRev, padProfiles);
        onToast(`Connected & adopted settings from ${status.device?.name || 'MacroPad'}`);
        return;
      }

      if (effectiveRecord.dirty) {
        // Rule 4: Unsynced edits (dirty) -> ask "Use website settings or pad settings?"
        const websiteProfiles = effectiveRecord.profiles;
        setSnapshot(prev => ({
          profiles: serializedProfilesToStudioProfiles(
            websiteProfiles,
            overridesRef.current,
            prev.profiles
          ),
          activeProfileId: websiteProfiles.active || prev.activeProfileId,
          customMacros: mergeDiscoveredCustomMacros(prev.customMacros, websiteProfiles)
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
          diffs: computeProfileDiffs(websiteProfiles, padProfiles)
        });
        return;
      }

      if (effectiveRecord.rev === padRev) {
        // Rule 2: Same rev and no unsynced edits -> already in sync
        adoptPadState(id, padRev, padProfiles);
        onToast('MacroPad connected — already in sync');
        return;
      }

      // Rule 3: Different rev and no unsynced edits -> pad changed elsewhere, adopt pad's settings
      adoptPadState(id, padRev, padProfiles);
      onToast(`Pad changed elsewhere (rev ${padRev}) — adopted MacroPad settings`);
    });

    return unsubConnect;
  }, [adoptPadState, onToast]);

  /**
   * Handle live events from `PadLink` (`profile` & `config`)
   */
  useEffect(() => {
    const unsubEvents = usbHardware.onHardwareEvent((e: HardwareEventPacket) => {
      if (e.event === 'profile') {
        const nextActive: HardwareProfileId =
          (e.active || e.profile) === 'TV' ? 'TV' : 'MAC';
        setSnapshot(prev => {
          const updated = { ...prev, activeProfileId: nextActive };
          const devId = usbHardware.info.deviceId || deviceIdRef.current;
          if (devId && !dirtyRef.current) {
            writeStoredPadRecord(devId, {
              rev: revRef.current,
              profiles: snapshotToSerializedProfiles(updated.profiles, nextActive),
              dirty: false
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

        // If we are currently saving from the website, `finalizeConnectedSave` handles persisting
        if (savingCountRef.current > 0) return;

        // External change on the pad while connected and clean -> adopt latest pad state
        if (!dirtyRef.current) {
          const devId = usbHardware.info.deviceId || deviceIdRef.current || 'studio-pad';
          if (e.profiles && Array.isArray(e.profiles.items)) {
            const padProfiles = statusPacketToSerializedProfiles({
              device: {
                id: devId,
                name: usbHardware.info.deviceName,
                firmware: usbHardware.info.firmwareVersion
              },
              rev: e.rev ?? revRef.current,
              profiles: {
                active: e.profiles.active || snapshotRef.current.activeProfileId,
                items: e.profiles.items
              }
            });
            adoptPadState(devId, e.rev ?? revRef.current, padProfiles);
          } else {
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
      }
    });

    return unsubEvents;
  }, [adoptPadState]);

  /**
   * Conflict Resolution Option 1: Use Pad Settings
   */
  const resolveConflictUsePad = useCallback(() => {
    if (!conflictPrompt) return;
    adoptPadState(
      conflictPrompt.deviceId,
      conflictPrompt.padRev,
      conflictPrompt.padProfiles
    );
    onToast('Adopted MacroPad settings');
  }, [conflictPrompt, adoptPadState, onToast]);

  /**
   * Conflict Resolution Option 2: Use Website Settings
   * Pushes all 7 slots per profile with `/api/profile/save` in one go per profile!
   */
  const resolveConflictUseWebsite = useCallback(async () => {
    if (!conflictPrompt) return;
    const { deviceId, websiteProfiles, padProfiles } = conflictPrompt;

    // Fill any blank pre-connect slots with the pad's existing valid slot so all 7 slots are valid
    const mergedMac: Record<HardwareSlotId, string> = { ...padProfiles.mac };
    const mergedTv: Record<HardwareSlotId, string> = { ...padProfiles.tv };
    for (const s of HARDWARE_SLOTS) {
      if (isValidFirmwareAction(websiteProfiles.mac[s])) {
        mergedMac[s] = websiteProfiles.mac[s];
      }
      if (isValidFirmwareAction(websiteProfiles.tv[s])) {
        mergedTv[s] = websiteProfiles.tv[s];
      }
    }

    const mergedSerialized: SerializedPadProfiles = {
      active: websiteProfiles.active || padProfiles.active,
      mac_name: sanitizeFirmwareAlias(websiteProfiles.mac_name || padProfiles.mac_name, 'MAC'),
      tv_name: sanitizeFirmwareAlias(websiteProfiles.tv_name || padProfiles.tv_name, 'TV'),
      mac: mergedMac,
      tv: mergedTv
    };

    setSavingCount(c => c + 1);
    setConflictPrompt(null);

    try {
      latestConfigEventRevRef.current = null;
      await usbHardware.saveFullProfile('MAC', mergedMac);
      await usbHardware.saveFullProfile('TV', mergedTv);

      if (mergedSerialized.mac_name !== padProfiles.mac_name) {
        await usbHardware.renameProfile('MAC', mergedSerialized.mac_name);
      }
      if (mergedSerialized.tv_name !== padProfiles.tv_name) {
        await usbHardware.renameProfile('TV', mergedSerialized.tv_name);
      }
      if (mergedSerialized.active !== padProfiles.active) {
        await usbHardware.activateProfile(mergedSerialized.active).catch(() => {});
      }

      const freshStatus = await usbHardware.fetchStatus();
      const freshRev =
        typeof freshStatus.rev === 'number'
          ? freshStatus.rev
          : latestConfigEventRevRef.current ?? revRef.current;

      adoptPadState(deviceId, freshRev, statusPacketToSerializedProfiles(freshStatus));
      onToast('Pushed website settings to MacroPad');
    } catch (err: any) {
      setDirty(true);
      dirtyRef.current = true;
      writeStoredPadRecord(deviceId, {
        rev: conflictPrompt.localRev,
        profiles: mergedSerialized,
        dirty: true
      });
      onToast(err?.message || 'Could not push website settings — kept as draft');
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

  /**
   * 4-State Sync Status Pill: `Synced` | `Saving` | `Out of sync` | `Disconnected`
   */
  const syncStatus: SyncStatusPill = useMemo(() => {
    if (savingCount > 0) return 'Saving';
    if (dirty || conflictPrompt !== null) return 'Out of sync';
    if (isConnected) return 'Synced';
    return 'Disconnected';
  }, [savingCount, dirty, conflictPrompt, isConnected]);

  // Duplicate assignment warning on active profile
  const conflicts: ConflictWarning[] = useMemo(() => {
    const warnings: ConflictWarning[] = [];
    const seen = new Map<string, KeyId>();

    for (const kid of ['k1', 'k2', 'k3', 'k4'] as const) {
      const act = bindingToFirmwareAction(activeLayer.keys[kid]?.triggers.tap);
      if (!act) continue;
      const existing = seen.get(act);
      if (existing) {
        warnings.push({
          controlA: existing,
          controlB: kid,
          summary: `B${existing.slice(1)} and B${kid.slice(1)} both trigger "${describeFirmwareAction(act).shortLabel}".`
        });
      } else {
        seen.set(act, kid);
      }
    }
    return warnings;
  }, [activeLayer]);

  const runConnectedWrite = useCallback(
    async (
      nextSnap: WorkspaceSnapshot,
      operation: () => Promise<{ rev?: number } | void>,
      successMsg?: string
    ) => {
      if (!usbHardware.info.connected || conflictPrompt !== null) {
        saveOfflineDraft(nextSnap);
        return;
      }

      setSavingCount(c => c + 1);
      latestConfigEventRevRef.current = null;
      try {
        const res = await operation();
        await finalizeConnectedSave(
          res && typeof res.rev === 'number' ? res.rev : undefined,
          nextSnap
        );
        if (successMsg) onToast(successMsg);
      } catch (err: any) {
        saveOfflineDraft(nextSnap);
        onToast(err?.message || 'Save failed — changes kept as offline draft');
      } finally {
        setSavingCount(c => Math.max(0, c - 1));
      }
    },
    [conflictPrompt, finalizeConnectedSave, onToast, saveOfflineDraft]
  );

  const pushBothProfilesSnapshot = useCallback(
    async (targetSnap: WorkspaceSnapshot, labelMsg: string) => {
      if (!usbHardware.info.connected || conflictPrompt !== null) {
        saveOfflineDraft(targetSnap);
        onToast(`${labelMsg} (saved as offline draft)`);
        return;
      }

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
        await finalizeConnectedSave(undefined, targetSnap);
        onToast(labelMsg);
      } catch (err: any) {
        saveOfflineDraft(targetSnap);
        onToast(err?.message || 'Out of sync — saved locally');
      } finally {
        setSavingCount(c => Math.max(0, c - 1));
      }
    },
    [conflictPrompt, finalizeConnectedSave, onToast, saveOfflineDraft]
  );

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast(p => p.slice(0, -1));
    setFuture(f => [snapshotRef.current, ...f]);
    setSnapshot(previous);
    pushBothProfilesSnapshot(previous, 'Undid last change');
  }, [past, pushBothProfilesSnapshot]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const [nextState, ...rest] = future;
    setFuture(rest);
    setPast(p => [...p, snapshotRef.current]);
    setSnapshot(nextState);
    pushBothProfilesSnapshot(nextState, 'Redid change');
  }, [future, pushBothProfilesSnapshot]);

  // Global keyboard Undo/Redo
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

  /**
   * Select active profile (`MAC` or `TV`) and activate it on the physical pad if connected
   */
  const selectProfile = useCallback((profileId: HardwareProfileId) => {
    setSnapshot(prev => {
      const updated = { ...prev, activeProfileId: profileId };
      const devId = usbHardware.info.deviceId || deviceIdRef.current;
      if (devId) {
        writeStoredPadRecord(devId, {
          rev: revRef.current,
          profiles: snapshotToSerializedProfiles(updated.profiles, profileId),
          dirty: dirtyRef.current
        });
      }
      return updated;
    });

    if (usbHardware.info.connected) {
      usbHardware.activateProfile(profileId).catch(() => {});
    }
  }, []);

  const toggleActiveProfile = useCallback(() => {
    const nextId: HardwareProfileId =
      snapshotRef.current.activeProfileId === 'MAC' ? 'TV' : 'MAC';
    selectProfile(nextId);
    onToast(
      usbHardware.info.connected
        ? `Activated ${nextId} profile on MacroPad`
        : `Switched draft view to ${nextId}`
    );
  }, [selectProfile, onToast]);

  const renameProfile = useCallback(
    async (profileId: HardwareProfileId, rawName: string) => {
      const cleanName = sanitizeFirmwareAlias(rawName, profileId);
      const prevSnap = snapshotRef.current;
      const nextSnap: WorkspaceSnapshot = {
        ...prevSnap,
        profiles: prevSnap.profiles.map(p =>
          p.id === profileId ? { ...p, name: cleanName } : p
        ) as [StudioProfile, StudioProfile]
      };

      setPast(h => [...h.slice(-34), prevSnap]);
      setFuture([]);
      setSnapshot(nextSnap);

      await runConnectedWrite(
        nextSnap,
        () => usbHardware.renameProfile(profileId, cleanName),
        `Renamed ${profileId} profile to "${cleanName}"`
      );
    },
    [runConnectedWrite]
  );

  const copyHardwareProfile = useCallback(
    async (source: HardwareProfileId, target: HardwareProfileId) => {
      if (source === target) return;
      const prevSnap = snapshotRef.current;
      const srcProf = prevSnap.profiles.find(p => p.id === source);
      const tgtProf = prevSnap.profiles.find(p => p.id === target);
      if (!srcProf || !tgtProf) return;

      const srcSlots = extractProfileSlots(srcProf);
      const updatedTarget = buildHardwareProfile(target, tgtProf.name, srcSlots, tgtProf);
      const nextSnap: WorkspaceSnapshot = {
        ...prevSnap,
        profiles: prevSnap.profiles.map(p =>
          p.id === target ? updatedTarget : p
        ) as [StudioProfile, StudioProfile]
      };

      setPast(h => [...h.slice(-34), prevSnap]);
      setFuture([]);
      setSnapshot(nextSnap);

      await runConnectedWrite(
        nextSnap,
        () => usbHardware.copyProfile(source, target),
        `Copied ${source} bindings to ${target}`
      );
    },
    [runConnectedWrite]
  );

  const assignSlotAction = useCallback(
    (profileId: HardwareProfileId, slot: HardwareSlotId, binding: ActionBinding) => {
      const actionStr = bindingToFirmwareAction(binding);
      if (!actionStr || !isValidFirmwareAction(actionStr)) return;

      const prevSnap = snapshotRef.current;
      const nextProfiles = prevSnap.profiles.map(prof => {
        if (prof.id !== profileId) return prof;
        const layer = prof.layers[0];

        if (slot === 'b1' || slot === 'b2' || slot === 'b3' || slot === 'b4') {
          const kid = (slot === 'b1'
            ? 'k1'
            : slot === 'b2'
            ? 'k2'
            : slot === 'b3'
            ? 'k3'
            : 'k4') as 'k1' | 'k2' | 'k3' | 'k4';

          const existingApp = layer.keys[kid].appearance;
          const nextAppearance = deriveAppearanceForAction(actionStr, {
            ...existingApp,
            customLabel: false,
            customIcon: existingApp.icon.startsWith('data:image/')
          });

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
      }) as [StudioProfile, StudioProfile];

      let nextMacros = prevSnap.customMacros;
      if (isCustomDynamicAction(actionStr) && !nextMacros.some(m => m.action === actionStr)) {
        const info = describeFirmwareAction(actionStr);
        nextMacros = [
          {
            id: `custom-${Date.now()}`,
            name: info.fullLabel,
            action: actionStr,
            createdAt: new Date().toLocaleTimeString(),
            source: 'user'
          },
          ...nextMacros
        ];
      }

      const nextSnap: WorkspaceSnapshot = {
        ...prevSnap,
        profiles: nextProfiles,
        customMacros: nextMacros
      };

      setPast(h => [...h.slice(-34), prevSnap]);
      setFuture([]);
      setSnapshot(nextSnap);

      runConnectedWrite(nextSnap, () =>
        usbHardware.saveSlotBinding(profileId, slot, actionStr)
      );
    },
    [runConnectedWrite]
  );

  const updateKeyBinding = useCallback(
    (kid: KeyId, binding: ActionBinding) => {
      if (kid === 'k5') return;
      const slot = KEY_TO_SLOT[kid];
      assignSlotAction(activeProfile.id, slot, binding);
    },
    [activeProfile.id, assignSlotAction]
  );

  const updateKeyAppearance = useCallback(
    (kid: KeyId, patch: Partial<KeyAppearance>) => {
      if (kid === 'k5') return;
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
        }) as [StudioProfile, StudioProfile];
        return { ...prev, profiles: nextProfiles };
      });
    },
    [activeProfile.id]
  );

  const resetKeyAppearance = useCallback(
    (kid: KeyId) => {
      if (kid === 'k5') return;
      const slot = KEY_TO_SLOT[kid];
      const currentAct = bindingToFirmwareAction(activeLayer.keys[kid].triggers.tap);
      const freshApp = deriveAppearanceForAction(currentAct);

      setAppearanceOverrides(ov => {
        const copy = { ...ov };
        delete copy[`${activeProfile.id}:${kid}`];
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
        }) as [StudioProfile, StudioProfile]
      }));
      onToast(`Reset ${slot.toUpperCase()} legend`);
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
        }) as [StudioProfile, StudioProfile]
      }));
    },
    [activeProfile.id]
  );

  const pullFromUsbNow = useCallback(async () => {
    if (!usbHardware.info.connected) {
      onToast('Connect your MacroPad via USB first');
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
      onToast(err?.message || 'Failed to read status from MacroPad');
      return false;
    }
  }, [adoptPadState, onToast]);

  const pushAllToDeviceNow = useCallback(async () => {
    if (!usbHardware.info.connected) {
      onToast('Connect USB cable to push draft changes to MacroPad');
      return false;
    }
    await pushBothProfilesSnapshot(snapshotRef.current, 'Saved all profiles to MacroPad');
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

  const saveUserSnapshot = useCallback(
    (name: string) => {
      const backup = buildBackupFromProfiles(snapshotRef.current.profiles);
      const entry: UserPreset = {
        id: `snap-${Date.now()}`,
        name: name.trim() || `MacroPad Snapshot ${userPresets.length + 1}`,
        createdAt: new Date().toLocaleString(),
        backup
      };
      setUserPresets(prev => [entry, ...prev]);
      onToast(`Saved snapshot "${entry.name}"`);
    },
    [userPresets.length, onToast]
  );

  const deleteUserSnapshot = useCallback((id: string) => {
    setUserPresets(prev => prev.filter(item => item.id !== id));
  }, []);

  const applyHardwareBackup = useCallback(
    async (backup: HardwareBackupPayload) => {
      const macSlots: Record<HardwareSlotId, string> = {
        b1: backup.mac_b1 || '',
        b2: backup.mac_b2 || '',
        b3: backup.mac_b3 || '',
        b4: backup.mac_b4 || '',
        dial: backup.mac_dial || '',
        enc_cw: backup.mac_enc_cw || '',
        enc_ccw: backup.mac_enc_ccw || ''
      };
      const tvSlots: Record<HardwareSlotId, string> = {
        b1: backup.tv_b1 || '',
        b2: backup.tv_b2 || '',
        b3: backup.tv_b3 || '',
        b4: backup.tv_b4 || '',
        dial: backup.tv_dial || '',
        enc_cw: backup.tv_enc_cw || '',
        enc_ccw: backup.tv_enc_ccw || ''
      };

      const prevSnap = snapshotRef.current;
      const nextSnap: WorkspaceSnapshot = {
        ...prevSnap,
        profiles: [
          buildHardwareProfile('MAC', backup.mac_name || 'Mac', macSlots),
          buildHardwareProfile('TV', backup.tv_name || 'TV', tvSlots)
        ]
      };

      setPast(h => [...h.slice(-34), prevSnap]);
      setFuture([]);
      setSnapshot(nextSnap);

      await runConnectedWrite(
        nextSnap,
        () => usbHardware.importHardwareConfig(backup),
        'Restored configuration to MacroPad'
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

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
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
        ? 'Exported live hardware config from MacroPad'
        : 'Exported offline draft backup'
    );
  }, [onToast]);

  const importHardwareBackupFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const parsed = JSON.parse(String(reader.result));
          if (parsed?.schema === 'studio-pad-config') {
            await applyHardwareBackup(parsed as HardwareBackupPayload);
            return;
          }
          onToast('Incompatible JSON: expected schema "studio-pad-config"');
        } catch {
          onToast('Failed to parse backup JSON file');
        }
      };
      reader.readAsText(file);
    },
    [applyHardwareBackup, onToast]
  );

  const clearLocalUnSyncedState = useCallback(() => {
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

    setSnapshot({
      profiles: buildBlankHardwareProfiles(),
      activeProfileId: 'MAC',
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
