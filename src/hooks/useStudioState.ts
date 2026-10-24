import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ActionBinding,
  ConflictWarning,
  CustomMacroItem,
  EncoderControlConfig,
  HardwareBackupPayload,
  HardwareProfileId,
  HardwareSlotId,
  KeyAppearance,
  KeyId,
  StudioProfile,
  StudioSettings,
  UserPreset
} from '../types/studio';
import {
  ALL_KEY_IDS,
  KEY_TO_SLOT,
  buildBlankHardwareProfiles,
  buildHardwareProfile
} from '../data/presetTemplates';
import {
  HARDWARE_SLOTS,
  bindingToFirmwareAction,
  deriveAppearanceForAction,
  describeFirmwareAction,
  isValidFirmwareAction,
  sanitizeFirmwareAlias
} from '../data/firmwareCatalog';
import { FirmwareStatusPacket, usbHardware } from '../services/usbHardwareService';
import { soundEngine } from '../services/soundEffects';

const PREFS_STORAGE_KEY = 'studio_macropad_usb_prefs_v4';

interface WorkspaceSnapshot {
  profiles: [StudioProfile, StudioProfile];
  activeProfileId: HardwareProfileId;
  customMacros: CustomMacroItem[];
}

interface PersistedPrefs {
  settings: StudioSettings;
  userPresets: UserPreset[];
  customMacros: CustomMacroItem[];
  appearanceOverrides: Record<string, KeyAppearance>; // key: "MAC:k1", "TV:k2", etc.
}

const DEFAULT_SETTINGS: StudioSettings = {
  theme: 'dark',
  accentColor: '#3B82F6',
  keyboardLayout: 'us_qwerty',
  encoderPlacement: 'grid',
  soundEnabled: true,
  autoSyncOnEdit: true
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

export function useStudioState(onToast: (msg: string) => void) {
  const initialPrefs = useMemo((): PersistedPrefs => {
    try {
      const raw = localStorage.getItem(PREFS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
          userPresets: Array.isArray(parsed.userPresets) ? parsed.userPresets : [],
          customMacros: Array.isArray(parsed.customMacros) ? parsed.customMacros : [],
          appearanceOverrides: parsed.appearanceOverrides || {}
        };
      }
    } catch (_) {}
    return {
      settings: DEFAULT_SETTINGS,
      userPresets: [],
      customMacros: [],
      appearanceOverrides: {}
    };
  }, []);

  // Start strictly with blank un-preset MAC & TV hardware profiles until USB syncs
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot>(() => ({
    profiles: buildBlankHardwareProfiles(),
    activeProfileId: 'MAC',
    customMacros: initialPrefs.customMacros
  }));

  const [isSyncedWithHardware, setIsSyncedWithHardware] = useState(false);
  const [appearanceOverrides, setAppearanceOverrides] = useState<Record<string, KeyAppearance>>(
    initialPrefs.appearanceOverrides
  );
  const [past, setPast] = useState<WorkspaceSnapshot[]>([]);
  const [future, setFuture] = useState<WorkspaceSnapshot[]>([]);
  const [userPresets, setUserPresets] = useState<UserPreset[]>(initialPrefs.userPresets);
  const [settings, setSettings] = useState<StudioSettings>(initialPrefs.settings);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const lastHardwareActiveModeRef = useRef<HardwareProfileId | null>(null);
  const overridesRef = useRef(appearanceOverrides);
  overridesRef.current = appearanceOverrides;
  const hasUnsavedRef = useRef(hasUnsavedChanges);
  hasUnsavedRef.current = hasUnsavedChanges;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Apply theme & accent CSS variables
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', settings.theme);
    root.style.setProperty('--accent', settings.accentColor);
    root.style.setProperty('--accent-rgb', hexToRgbString(settings.accentColor));
    soundEngine.setEnabled(settings.soundEnabled);
  }, [settings]);

  // Persist only UI preferences, user-saved snapshots, and user-created custom macros (never fake presets)
  useEffect(() => {
    try {
      const toStore: PersistedPrefs = {
        settings,
        userPresets,
        customMacros: snapshot.customMacros,
        appearanceOverrides
      };
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(toStore));
    } catch (_) {}
  }, [settings, userPresets, snapshot.customMacros, appearanceOverrides]);

  /**
   * Apply incoming /api/status packet directly from the ESP32 over USB
   */
  const applyHardwareStatusPacket = useCallback(
    (pkt: FirmwareStatusPacket, announce: boolean) => {
      // Do not overwrite un-pushed offline edits during silent background polls unless manual/initial sync
      if (!announce && hasUnsavedRef.current) {
        return;
      }

      const macItem = pkt.profiles?.items?.find(i => i.id === 'MAC');
      const tvItem = pkt.profiles?.items?.find(i => i.id === 'TV');

      const macSlots: Record<HardwareSlotId, string> = {
        b1: macItem?.controls?.b1 ?? pkt.mac_b1 ?? '',
        b2: macItem?.controls?.b2 ?? pkt.mac_b2 ?? '',
        b3: macItem?.controls?.b3 ?? pkt.mac_b3 ?? '',
        b4: macItem?.controls?.b4 ?? pkt.mac_b4 ?? '',
        dial: macItem?.controls?.dial ?? pkt.mac_dial ?? '',
        enc_cw: macItem?.controls?.enc_cw ?? '',
        enc_ccw: macItem?.controls?.enc_ccw ?? ''
      };

      const tvSlots: Record<HardwareSlotId, string> = {
        b1: tvItem?.controls?.b1 ?? pkt.tv_b1 ?? '',
        b2: tvItem?.controls?.b2 ?? pkt.tv_b2 ?? '',
        b3: tvItem?.controls?.b3 ?? pkt.tv_b3 ?? '',
        b4: tvItem?.controls?.b4 ?? pkt.tv_b4 ?? '',
        dial: tvItem?.controls?.dial ?? pkt.tv_dial ?? '',
        enc_cw: tvItem?.controls?.enc_cw ?? '',
        enc_ccw: tvItem?.controls?.enc_ccw ?? ''
      };

      const hwActive: HardwareProfileId = pkt.profiles?.active === 'TV' ? 'TV' : 'MAC';
      const hardwareModeChanged =
        lastHardwareActiveModeRef.current !== null &&
        lastHardwareActiveModeRef.current !== hwActive;
      lastHardwareActiveModeRef.current = hwActive;

      setSnapshot(prev => {
        const prevMac = prev.profiles.find(p => p.id === 'MAC');
        const prevTv = prev.profiles.find(p => p.id === 'TV');

        const nextMac = buildHardwareProfile(
          'MAC',
          macItem?.name || 'Mac',
          macSlots,
          prevMac
        );
        const nextTv = buildHardwareProfile(
          'TV',
          tvItem?.name || 'TV',
          tvSlots,
          prevTv
        );

        // Apply any custom user icon/label overrides
        (['k1', 'k2', 'k3', 'k4'] as const).forEach(kid => {
          const mOv = overridesRef.current[`MAC:${kid}`];
          if (mOv) {
            nextMac.layers[0].keys[kid].appearance = deriveAppearanceForAction(
              macSlots[KEY_TO_SLOT[kid]],
              mOv
            );
          }
          const tOv = overridesRef.current[`TV:${kid}`];
          if (tOv) {
            nextTv.layers[0].keys[kid].appearance = deriveAppearanceForAction(
              tvSlots[KEY_TO_SLOT[kid]],
              tOv
            );
          }
        });

        // Auto-discover any custom SHORTCUT: / TEXT: / TVKEY: / TVAPP: macros stored on the ESP32
        const mergedMacros = [...prev.customMacros];
        const allDeviceActions = [
          ...Object.entries(macSlots).map(([slot, act]) => ({ profile: 'MAC', slot, act })),
          ...Object.entries(tvSlots).map(([slot, act]) => ({ profile: 'TV', slot, act }))
        ];
        for (const entry of allDeviceActions) {
          if (entry.act && isCustomDynamicAction(entry.act)) {
            const exists = mergedMacros.some(m => m.action === entry.act);
            if (!exists) {
              const desc = describeFirmwareAction(entry.act);
              mergedMacros.push({
                id: `dev-macro-${entry.profile}-${entry.slot}-${mergedMacros.length}`,
                name: `${desc.fullLabel} (${entry.profile} ${entry.slot.toUpperCase()})`,
                action: entry.act,
                createdAt: 'Synced from USB',
                source: 'device'
              });
            }
          }
        }

        const nextActiveId =
          announce || hardwareModeChanged ? hwActive : prev.activeProfileId;

        return {
          profiles: [nextMac, nextTv],
          activeProfileId: nextActiveId,
          customMacros: mergedMacros
        };
      });

      setIsSyncedWithHardware(true);
      if (announce) {
        setHasUnsavedChanges(false);
        onToast('Synced live macros & profiles from MacroPad over USB');
      } else if (hardwareModeChanged) {
        onToast(`Hardware switched to ${hwActive} profile`);
      }
    },
    [onToast]
  );

  // Subscribe to USB status packets
  useEffect(() => {
    const unsub = usbHardware.onHardwareStatus((pkt, announce) => {
      applyHardwareStatusPacket(pkt, announce);
    });
    return unsub;
  }, [applyHardwareStatusPacket]);

  const activeProfile: StudioProfile = useMemo(() => {
    return (
      snapshot.profiles.find(p => p.id === snapshot.activeProfileId) ||
      snapshot.profiles[0]
    );
  }, [snapshot]);

  const activeLayer = activeProfile.layers[0];

  // Detect duplicate action assignments across B1..B4 on active profile
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
          summary: `B${existing.slice(1)} and B${kid.slice(1)} both trigger "${describeFirmwareAction(act).shortLabel}" (${act}).`
        });
      } else {
        seen.set(act, kid);
      }
    }
    return warnings;
  }, [activeLayer]);

  const pushSlotToUsbIfConnected = useCallback(
    async (profileId: HardwareProfileId, slot: HardwareSlotId, actionStr: string) => {
      if (!usbHardware.info.connected || !settingsRef.current.autoSyncOnEdit) {
        setHasUnsavedChanges(true);
        return;
      }
      if (!isValidFirmwareAction(actionStr)) {
        setHasUnsavedChanges(true);
        return;
      }
      try {
        await usbHardware.saveSlotBinding(profileId, slot, actionStr);
        setHasUnsavedChanges(false);
        setIsSyncedWithHardware(true);
        onToast(`Synced ${profileId} ${slot.toUpperCase()} → ${describeFirmwareAction(actionStr).shortLabel}`);
      } catch (err: any) {
        setHasUnsavedChanges(true);
        onToast(err?.message || 'Could not sync slot to MacroPad');
      }
    },
    [onToast]
  );

  const syncFullSnapshotToUsbIfConnected = useCallback(
    async (targetSnap: WorkspaceSnapshot) => {
      if (!usbHardware.info.connected) return;
      for (const prof of targetSnap.profiles) {
        const slots = extractProfileSlots(prof);
        for (const s of HARDWARE_SLOTS) {
          if (isValidFirmwareAction(slots[s])) {
            await usbHardware.saveSlotBinding(prof.id, s, slots[s]).catch(() => {});
          }
        }
      }
    },
    []
  );

  const commitChange = useCallback(
    (updater: (prev: WorkspaceSnapshot) => WorkspaceSnapshot, markUnsaved = false) => {
      setSnapshot(prev => {
        const next = updater(prev);
        setPast(h => [...h.slice(-34), prev]);
        setFuture([]);
        if (markUnsaved) setHasUnsavedChanges(true);
        return next;
      });
    },
    []
  );

  const undo = useCallback(() => {
    setPast(prevPast => {
      if (prevPast.length === 0) return prevPast;
      const previous = prevPast[prevPast.length - 1];
      setSnapshot(curr => {
        setFuture(f => [curr, ...f]);
        return previous;
      });
      if (usbHardware.info.connected && settingsRef.current.autoSyncOnEdit) {
        syncFullSnapshotToUsbIfConnected(previous).then(() => {
          onToast('Undid change & synced to MacroPad');
        });
      } else {
        setHasUnsavedChanges(true);
        onToast('Undid last change');
      }
      return prevPast.slice(0, -1);
    });
  }, [onToast, syncFullSnapshotToUsbIfConnected]);

  const redo = useCallback(() => {
    setFuture(prevFuture => {
      if (prevFuture.length === 0) return prevFuture;
      const [nextState, ...rest] = prevFuture;
      setSnapshot(curr => {
        setPast(p => [...p, curr]);
        return nextState;
      });
      if (usbHardware.info.connected && settingsRef.current.autoSyncOnEdit) {
        syncFullSnapshotToUsbIfConnected(nextState).then(() => {
          onToast('Redid change & synced to MacroPad');
        });
      } else {
        setHasUnsavedChanges(true);
        onToast('Redid change');
      }
      return rest;
    });
  }, [onToast, syncFullSnapshotToUsbIfConnected]);

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

  const selectProfile = useCallback((profileId: HardwareProfileId) => {
    setSnapshot(prev => ({ ...prev, activeProfileId: profileId }));
  }, []);

  const toggleActiveProfile = useCallback(() => {
    setSnapshot(prev => {
      const nextId: HardwareProfileId = prev.activeProfileId === 'MAC' ? 'TV' : 'MAC';
      onToast(`Viewing ${nextId} profile`);
      return { ...prev, activeProfileId: nextId };
    });
  }, [onToast]);

  const renameProfile = useCallback(
    async (profileId: HardwareProfileId, rawName: string) => {
      const cleanName = sanitizeFirmwareAlias(rawName, profileId);
      commitChange(prev => ({
        ...prev,
        profiles: prev.profiles.map(p =>
          p.id === profileId ? { ...p, name: cleanName } : p
        ) as [StudioProfile, StudioProfile]
      }));

      if (usbHardware.info.connected) {
        try {
          await usbHardware.renameProfile(profileId, cleanName);
          onToast(`Renamed ${profileId} profile to "${cleanName}" on MacroPad`);
        } catch (err: any) {
          setHasUnsavedChanges(true);
          onToast(err?.message || 'Could not rename profile on device');
        }
      } else {
        setHasUnsavedChanges(true);
      }
    },
    [commitChange, onToast]
  );

  const copyHardwareProfile = useCallback(
    async (source: HardwareProfileId, target: HardwareProfileId) => {
      if (source === target) return;
      if (usbHardware.info.connected) {
        try {
          await usbHardware.copyProfile(source, target);
          onToast(`Copied ${source} bindings to ${target} on MacroPad`);
          return;
        } catch (err: any) {
          onToast(err?.message || 'Failed to copy profile on MacroPad');
          return;
        }
      }

      commitChange(prev => {
        const srcProf = prev.profiles.find(p => p.id === source);
        const tgtProf = prev.profiles.find(p => p.id === target);
        if (!srcProf || !tgtProf) return prev;
        const srcSlots = extractProfileSlots(srcProf);
        const updatedTarget = buildHardwareProfile(target, tgtProf.name, srcSlots, tgtProf);
        return {
          ...prev,
          profiles: prev.profiles.map(p => (p.id === target ? updatedTarget : p)) as [
            StudioProfile,
            StudioProfile
          ]
        };
      }, true);
      onToast(`Copied ${source} bindings to ${target} (connect USB to flash)`);
    },
    [commitChange, onToast]
  );

  const assignSlotAction = useCallback(
    (profileId: HardwareProfileId, slot: HardwareSlotId, binding: ActionBinding) => {
      const actionStr = bindingToFirmwareAction(binding);

      commitChange(prev => {
        const nextProfiles = prev.profiles.map(prof => {
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
              // Refresh auto label & icon when user picks a new action unless custom uploaded image
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

        // Also register custom dynamic macro into library if brand new
        let nextMacros = prev.customMacros;
        if (actionStr && isCustomDynamicAction(actionStr)) {
          if (!nextMacros.some(m => m.action === actionStr)) {
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
        }

        return {
          ...prev,
          profiles: nextProfiles,
          customMacros: nextMacros
        };
      });

      if (actionStr) {
        pushSlotToUsbIfConnected(profileId, slot, actionStr);
      } else {
        setHasUnsavedChanges(true);
      }
    },
    [commitChange, pushSlotToUsbIfConnected]
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
      onToast(`Reset ${slot.toUpperCase()} legend to match ${currentAct || 'slot'}`);
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
      setHasUnsavedChanges(false);
      await usbHardware.fetchStatus({ isManualOrInitial: true, timeoutMs: 3000 });
      return true;
    } catch (err: any) {
      onToast(err?.message || 'Failed to read status from MacroPad');
      return false;
    }
  }, [onToast]);

  const pushAllToDeviceNow = useCallback(async () => {
    if (!usbHardware.info.connected) {
      onToast('Connect USB cable to sync macros to your MacroPad');
      return false;
    }

    try {
      let syncedCount = 0;
      for (const prof of snapshot.profiles) {
        await usbHardware.renameProfile(prof.id, prof.name);
        const slots = extractProfileSlots(prof);
        const allValid = HARDWARE_SLOTS.every(s => isValidFirmwareAction(slots[s]));
        if (allValid) {
          await usbHardware.saveFullProfile(prof.id, slots);
          syncedCount += 7;
        } else {
          for (const s of HARDWARE_SLOTS) {
            if (isValidFirmwareAction(slots[s])) {
              await usbHardware.saveSlotBinding(prof.id, s, slots[s]);
              syncedCount++;
            }
          }
        }
      }
      await usbHardware.fetchStatus({ isManualOrInitial: false }).catch(() => {});
      setHasUnsavedChanges(false);
      setIsSyncedWithHardware(true);
      onToast(
        syncedCount > 0
          ? `Flashed & verified ${syncedCount} bindings to MacroPad over USB`
          : 'Synced with MacroPad over USB'
      );
      return true;
    } catch (err: any) {
      onToast(err?.message || 'Error syncing profiles to MacroPad');
      return false;
    }
  }, [snapshot.profiles, onToast]);

  const saveCustomMacro = useCallback(
    (item: CustomMacroItem) => {
      setSnapshot(prev => {
        const exists = prev.customMacros.some(m => m.id === item.id);
        const nextList = exists
          ? prev.customMacros.map(m => (m.id === item.id ? item : m))
          : [item, ...prev.customMacros];
        return { ...prev, customMacros: nextList };
      });
    },
    []
  );

  const deleteCustomMacro = useCallback((id: string) => {
    setSnapshot(prev => ({
      ...prev,
      customMacros: prev.customMacros.filter(m => m.id !== id)
    }));
  }, []);

  const saveUserSnapshot = useCallback(
    (name: string) => {
      const backup = buildBackupFromProfiles(snapshot.profiles);
      const entry: UserPreset = {
        id: `snap-${Date.now()}`,
        name: name.trim() || `MacroPad Snapshot ${userPresets.length + 1}`,
        createdAt: new Date().toLocaleString(),
        backup
      };
      setUserPresets(prev => [entry, ...prev]);
      onToast(`Saved snapshot "${entry.name}"`);
    },
    [snapshot.profiles, userPresets.length, onToast]
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

      commitChange(prev => ({
        ...prev,
        profiles: [
          buildHardwareProfile('MAC', backup.mac_name || 'Mac', macSlots),
          buildHardwareProfile('TV', backup.tv_name || 'TV', tvSlots)
        ]
      }));

      if (usbHardware.info.connected) {
        try {
          await usbHardware.importHardwareConfig(backup);
          setHasUnsavedChanges(false);
          setIsSyncedWithHardware(true);
          onToast('Restored configuration directly to MacroPad NVS over USB');
        } catch (err: any) {
          setHasUnsavedChanges(true);
          onToast(err?.message || 'Loaded locally — click Sync to Device to flash');
        }
      } else {
        setHasUnsavedChanges(true);
        onToast('Loaded configuration — connect USB to flash to MacroPad');
      }
    },
    [commitChange, onToast]
  );

  const exportHardwareBackupFile = useCallback(async () => {
    let payload: HardwareBackupPayload;
    if (usbHardware.info.connected) {
      try {
        payload = await usbHardware.exportHardwareConfig();
      } catch (_) {
        payload = buildBackupFromProfiles(snapshot.profiles);
      }
    } else {
      payload = buildBackupFromProfiles(snapshot.profiles);
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'studio-pad-backup.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    onToast(
      usbHardware.info.connected
        ? 'Exported live hardware config from MacroPad'
        : 'Downloaded studio-pad-backup.json'
    );
  }, [snapshot.profiles, onToast]);

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
        } catch (_) {
          onToast('Failed to parse backup JSON file');
        }
      };
      reader.readAsText(file);
    },
    [applyHardwareBackup, onToast]
  );

  const clearLocalUnSyncedState = useCallback(() => {
    setSnapshot({
      profiles: buildBlankHardwareProfiles(),
      activeProfileId: 'MAC',
      customMacros: []
    });
    setUserPresets([]);
    setAppearanceOverrides({});
    setPast([]);
    setFuture([]);
    setHasUnsavedChanges(false);
    setIsSyncedWithHardware(false);
    localStorage.removeItem(PREFS_STORAGE_KEY);
    if (usbHardware.info.connected) {
      usbHardware.fetchStatus({ isManualOrInitial: true }).catch(() => {});
    }
    onToast('Cleared local cache');
  }, [onToast]);

  return {
    profiles: snapshot.profiles,
    activeProfile,
    activeLayer,
    customMacros: snapshot.customMacros,
    userPresets,
    settings,
    conflicts,
    isSyncedWithHardware,
    hasUnsavedChanges,
    setHasUnsavedChanges,
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
