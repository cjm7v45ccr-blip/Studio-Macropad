import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ActionBinding,
  ConflictWarning,
  EncoderControlConfig,
  KeyControlConfig,
  KeyId,
  LayerConfig,
  MacroFolder,
  MacroItem,
  StudioProfile,
  StudioSettings,
  TriggerType,
  UserPreset
} from '../types/studio';
import {
  ALL_KEY_IDS,
  DEFAULT_MACROS,
  DEFAULT_MACRO_FOLDERS,
  PRESET_TEMPLATES,
  makeKey,
  emptyAction,
  buildDefaultEncoder
} from '../data/presetTemplates';
import { soundEngine } from '../services/soundEffects';
import { actionStrToBinding } from '../services/usbHardwareService';

const STORAGE_KEY = 'studio_macropad_workspace_v3_5key';

interface WorkspaceSnapshot {
  profiles: StudioProfile[];
  activeProfileId: string;
  macros: MacroItem[];
  macroFolders: MacroFolder[];
}

interface PersistedWorkspace extends WorkspaceSnapshot {
  userPresets: UserPreset[];
  settings: StudioSettings;
}

function buildStarterProfiles(): StudioProfile[] {
  const prod = PRESET_TEMPLATES[0].buildProfile('Default Productivity');
  const code = PRESET_TEMPLATES[1].buildProfile('VS Code Dev');
  const obs = PRESET_TEMPLATES[5].buildProfile('OBS Streaming');
  return [prod, code, obs];
}

const DEFAULT_SETTINGS: StudioSettings = {
  theme: 'dark',
  accentColor: '#3B82F6',
  keyboardLayout: 'us_qwerty',
  pollingRateHz: 1000,
  globalDebounceMs: 12,
  encoderPlacement: 'grid',
  soundEnabled: true
};

function normalizeProfile(raw: any): StudioProfile {
  const fallback = PRESET_TEMPLATES[0].buildProfile(raw?.name || 'Imported Profile');
  if (!raw || !Array.isArray(raw.layers) || raw.layers.length < 4) {
    return fallback;
  }

  const normalizedLayers = raw.layers.slice(0, 4).map((layer: any, lIdx: number): LayerConfig => {
    const keys = {} as Record<KeyId, KeyControlConfig>;
    ALL_KEY_IDS.forEach((kid, kIdx) => {
      const candidate = layer?.keys?.[kid];
      if (candidate && candidate.triggers && candidate.appearance && candidate.advanced) {
        keys[kid] = candidate;
      } else {
        keys[kid] = makeKey(kid, `Key ${kIdx + 1}`, 'none', emptyAction());
      }
    });

    return {
      id: layer?.id || `layer-${lIdx + 1}`,
      name: layer?.name || `Layer ${lIdx + 1}`,
      color: layer?.color || fallback.layers[lIdx].color,
      keys,
      encoder: layer?.encoder && Array.isArray(layer.encoder.modes)
        ? layer.encoder
        : buildDefaultEncoder()
    };
  }) as StudioProfile['layers'];

  return {
    id: raw.id || `prof-${Date.now()}`,
    name: raw.name || 'Custom Profile',
    appHint: raw.appHint,
    activeLayerIndex:
      typeof raw.activeLayerIndex === 'number' && raw.activeLayerIndex >= 0 && raw.activeLayerIndex < 4
        ? raw.activeLayerIndex
        : 0,
    layers: normalizedLayers
  };
}

function hexToRgbString(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return '59, 130, 246';
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if ([r, g, b].some(v => Number.isNaN(v))) return '59, 130, 246';
  return `${r}, ${g}, ${b}`;
}

export function useStudioState(onToast: (msg: string) => void) {
  const initialData = useMemo((): PersistedWorkspace => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.profiles) && parsed.profiles.length > 0) {
          const safeProfiles = parsed.profiles.map(normalizeProfile);
          const safePlacement =
            parsed.settings?.encoderPlacement === 'top' ? 'top' : 'grid';
          return {
            profiles: safeProfiles,
            activeProfileId: parsed.activeProfileId || safeProfiles[0].id,
            macros: parsed.macros || DEFAULT_MACROS,
            macroFolders: parsed.macroFolders || DEFAULT_MACRO_FOLDERS,
            userPresets: (parsed.userPresets || []).map((up: any) => ({
              ...up,
              profile: normalizeProfile(up.profile)
            })),
            settings: {
              ...DEFAULT_SETTINGS,
              ...(parsed.settings || {}),
              encoderPlacement: safePlacement
            }
          };
        }
      }
    } catch (_) {}

    const starters = buildStarterProfiles();
    return {
      profiles: starters,
      activeProfileId: starters[0].id,
      macros: DEFAULT_MACROS,
      macroFolders: DEFAULT_MACRO_FOLDERS,
      userPresets: [],
      settings: DEFAULT_SETTINGS
    };
  }, []);

  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot>({
    profiles: initialData.profiles,
    activeProfileId: initialData.activeProfileId,
    macros: initialData.macros,
    macroFolders: initialData.macroFolders
  });
  const [past, setPast] = useState<WorkspaceSnapshot[]>([]);
  const [future, setFuture] = useState<WorkspaceSnapshot[]>([]);

  const [userPresets, setUserPresets] = useState<UserPreset[]>(initialData.userPresets);
  const [settings, setSettings] = useState<StudioSettings>(initialData.settings);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);

  // Sync theme & accent CSS variables
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', settings.theme);
    root.style.setProperty('--accent', settings.accentColor);
    root.style.setProperty('--accent-rgb', hexToRgbString(settings.accentColor));
    soundEngine.setEnabled(settings.soundEnabled);
  }, [settings]);

  // Persist workspace to localStorage
  useEffect(() => {
    try {
      const payload: PersistedWorkspace = {
        ...snapshot,
        userPresets,
        settings
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (_) {}
  }, [snapshot, userPresets, settings]);

  // Import shared URL hash preset (#preset=...)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (hash.startsWith('#preset=')) {
      try {
        const encoded = hash.slice('#preset='.length);
        const decoded = JSON.parse(decodeURIComponent(atob(encoded)));
        if (decoded && Array.isArray(decoded.layers) && decoded.layers.length >= 4) {
          const imported: StudioProfile = normalizeProfile({
            ...decoded,
            id: `prof-${Date.now()}`,
            name: `${decoded.name || 'Shared'} (Imported)`
          });
          setSnapshot(prev => ({
            ...prev,
            profiles: [...prev.profiles, imported],
            activeProfileId: imported.id
          }));
          window.history.replaceState(null, '', window.location.pathname);
          onToast(`Imported shared profile "${imported.name}"`);
        }
      } catch (_) {}
    }
  }, []);

  const commitChange = useCallback(
    (updater: (prev: WorkspaceSnapshot) => WorkspaceSnapshot, markUnsaved = true) => {
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
      setHasUnsavedChanges(true);
      onToast('Undid last change');
      return prevPast.slice(0, -1);
    });
  }, [onToast]);

  const redo = useCallback(() => {
    setFuture(prevFuture => {
      if (prevFuture.length === 0) return prevFuture;
      const [nextState, ...rest] = prevFuture;
      setSnapshot(curr => {
        setPast(p => [...p, curr]);
        return nextState;
      });
      setHasUnsavedChanges(true);
      onToast('Redid change');
      return rest;
    });
  }, [onToast]);

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

  const activeProfile = useMemo(() => {
    return (
      snapshot.profiles.find(p => p.id === snapshot.activeProfileId) ||
      snapshot.profiles[0]
    );
  }, [snapshot]);

  const activeLayer: LayerConfig = useMemo(() => {
    return activeProfile.layers[activeProfile.activeLayerIndex] || activeProfile.layers[0];
  }, [activeProfile]);

  // Detect duplicate shortcut/action conflicts on the active layer
  const conflicts: ConflictWarning[] = useMemo(() => {
    const warnings: ConflictWarning[] = [];
    const seen = new Map<string, KeyId>();

    for (const kid of ALL_KEY_IDS) {
      const tap = activeLayer.keys[kid]?.triggers.tap;
      if (!tap || tap.type === 'none' || !tap.value) continue;
      const signature = `${tap.type}:${tap.value.toLowerCase()}`;
      const existingKey = seen.get(signature);
      if (existingKey) {
        warnings.push({
          controlA: existingKey,
          controlB: kid,
          summary: `Key ${existingKey.slice(1)} and Key ${kid.slice(1)} both trigger "${tap.value}" on Tap.`
        });
      } else {
        seen.set(signature, kid);
      }
    }
    return warnings;
  }, [activeLayer]);

  const updateActiveProfile = (updater: (p: StudioProfile) => StudioProfile, markUnsaved = true) => {
    commitChange(prev => ({
      ...prev,
      profiles: prev.profiles.map(p => (p.id === activeProfile.id ? updater(p) : p))
    }), markUnsaved);
  };

  const updateActiveLayer = (updater: (l: LayerConfig) => LayerConfig) => {
    updateActiveProfile(p => {
      const nextLayers = [...p.layers] as StudioProfile['layers'];
      nextLayers[p.activeLayerIndex] = updater(nextLayers[p.activeLayerIndex]);
      return { ...p, layers: nextLayers };
    });
  };

  const selectProfile = (profileId: string) => {
    setSnapshot(prev => ({ ...prev, activeProfileId: profileId }));
  };

  const createProfile = (name: string) => {
    const fresh = PRESET_TEMPLATES[0].buildProfile(name);
    commitChange(prev => ({
      ...prev,
      profiles: [...prev.profiles, fresh],
      activeProfileId: fresh.id
    }));
    onToast(`Created profile "${name}"`);
  };

  const renameProfile = (profileId: string, name: string) => {
    commitChange(prev => ({
      ...prev,
      profiles: prev.profiles.map(p => (p.id === profileId ? { ...p, name } : p))
    }));
  };

  const duplicateProfile = (profileId: string) => {
    const target = snapshot.profiles.find(p => p.id === profileId);
    if (!target) return;
    const clone: StudioProfile = {
      ...JSON.parse(JSON.stringify(target)),
      id: `prof-${Date.now()}`,
      name: `${target.name} Copy`
    };
    commitChange(prev => ({
      ...prev,
      profiles: [...prev.profiles, clone],
      activeProfileId: clone.id
    }));
    onToast(`Duplicated "${target.name}"`);
  };

  const deleteProfile = (profileId: string) => {
    if (snapshot.profiles.length <= 1) return;
    commitChange(prev => {
      const remaining = prev.profiles.filter(p => p.id !== profileId);
      return {
        ...prev,
        profiles: remaining,
        activeProfileId:
          prev.activeProfileId === profileId ? remaining[0].id : prev.activeProfileId
      };
    });
  };

  const selectLayer = (layerIndex: number) => {
    setSnapshot(prev => ({
      ...prev,
      profiles: prev.profiles.map(p =>
        p.id === activeProfile.id ? { ...p, activeLayerIndex: layerIndex } : p
      )
    }));
  };

  const updateLayerMeta = (
    layerIndex: number,
    patch: Partial<Pick<LayerConfig, 'name' | 'color'>>
  ) => {
    updateActiveProfile(p => {
      const nextLayers = [...p.layers] as StudioProfile['layers'];
      nextLayers[layerIndex] = { ...nextLayers[layerIndex], ...patch };
      return { ...p, layers: nextLayers };
    });
  };

  const updateKeyTrigger = (kid: KeyId, trigger: TriggerType, binding: ActionBinding) => {
    updateActiveLayer(layer => ({
      ...layer,
      keys: {
        ...layer.keys,
        [kid]: {
          ...layer.keys[kid],
          triggers: {
            ...layer.keys[kid].triggers,
            [trigger]: binding
          }
        }
      }
    }));
  };

  const updateKeyAppearance = (kid: KeyId, patch: Partial<KeyControlConfig['appearance']>) => {
    updateActiveLayer(layer => ({
      ...layer,
      keys: {
        ...layer.keys,
        [kid]: {
          ...layer.keys[kid],
          appearance: {
            ...layer.keys[kid].appearance,
            ...patch
          }
        }
      }
    }));
  };

  const updateKeyAdvanced = (kid: KeyId, patch: Partial<KeyControlConfig['advanced']>) => {
    updateActiveLayer(layer => ({
      ...layer,
      keys: {
        ...layer.keys,
        [kid]: {
          ...layer.keys[kid],
          advanced: {
            ...layer.keys[kid].advanced,
            ...patch
          }
        }
      }
    }));
  };

  const resetKey = (kid: KeyId) => {
    const idx = ALL_KEY_IDS.indexOf(kid) + 1;
    updateActiveLayer(layer => ({
      ...layer,
      keys: {
        ...layer.keys,
        [kid]: makeKey(kid, `Key ${idx}`, 'none', emptyAction())
      }
    }));
    onToast(`Cleared Key ${idx}`);
  };

  const updateEncoder = (nextEncoder: EncoderControlConfig) => {
    updateActiveLayer(layer => ({
      ...layer,
      encoder: nextEncoder
    }));
  };

  const cycleEncoderMode = () => {
    const modes = activeLayer.encoder.modes;
    if (modes.length <= 1) return;
    const currentIdx = modes.findIndex(m => m.id === activeLayer.encoder.activeModeId);
    const nextMode = modes[(currentIdx + 1) % modes.length];
    updateEncoder({
      ...activeLayer.encoder,
      activeModeId: nextMode.id
    });
  };

  const applyTemplateToActiveProfile = (templateProfile: StudioProfile) => {
    const normalized = normalizeProfile(templateProfile);
    updateActiveProfile(p => ({
      ...p,
      layers: JSON.parse(JSON.stringify(normalized.layers)),
      activeLayerIndex: 0
    }));
    onToast(`Applied "${templateProfile.name}" layout to ${activeProfile.name}`);
  };

  const saveUserPreset = (name: string) => {
    const entry: UserPreset = {
      id: `up-${Date.now()}`,
      name,
      createdAt: new Date().toLocaleDateString(),
      profile: JSON.parse(JSON.stringify(activeProfile))
    };
    setUserPresets(prev => [entry, ...prev]);
    onToast(`Saved "${name}" to My Presets`);
  };

  const deleteUserPreset = (id: string) => {
    setUserPresets(prev => prev.filter(item => item.id !== id));
  };

  const importProfileJson = (prof: StudioProfile) => {
    const safeProf = normalizeProfile(prof);
    commitChange(prev => ({
      ...prev,
      profiles: [...prev.profiles, safeProf],
      activeProfileId: safeProf.id
    }));
    onToast(`Imported profile "${safeProf.name}"`);
  };

  const exportFullBackup = () => {
    const full = {
      schema: 'studio-pad-workspace-v3-5key',
      exportedAt: new Date().toISOString(),
      ...snapshot,
      userPresets,
      settings
    };
    const blob = new Blob([JSON.stringify(full, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'studio-pad-full-backup.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    onToast('Downloaded full workspace backup');
  };

  const importFullBackup = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!Array.isArray(parsed.profiles) || parsed.profiles.length === 0) {
          onToast('Invalid backup file');
          return;
        }
        const safeProfiles = parsed.profiles.map(normalizeProfile);
        setSnapshot({
          profiles: safeProfiles,
          activeProfileId: parsed.activeProfileId || safeProfiles[0].id,
          macros: parsed.macros || DEFAULT_MACROS,
          macroFolders: parsed.macroFolders || DEFAULT_MACRO_FOLDERS
        });
        if (Array.isArray(parsed.userPresets)) {
          setUserPresets(
            parsed.userPresets.map((up: any) => ({
              ...up,
              profile: normalizeProfile(up.profile)
            }))
          );
        }
        if (parsed.settings) {
          const safePlacement = parsed.settings.encoderPlacement === 'top' ? 'top' : 'grid';
          setSettings({ ...DEFAULT_SETTINGS, ...parsed.settings, encoderPlacement: safePlacement });
        }
        setPast([]);
        setFuture([]);
        setHasUnsavedChanges(true);
        onToast('Restored workspace backup');
      } catch (_) {
        onToast('Failed to read backup JSON');
      }
    };
    reader.readAsText(file);
  };

  const factoryReset = () => {
    const starters = buildStarterProfiles();
    setSnapshot({
      profiles: starters,
      activeProfileId: starters[0].id,
      macros: DEFAULT_MACROS,
      macroFolders: DEFAULT_MACRO_FOLDERS
    });
    setUserPresets([]);
    setSettings(DEFAULT_SETTINGS);
    setPast([]);
    setFuture([]);
    setHasUnsavedChanges(false);
    localStorage.removeItem(STORAGE_KEY);
    onToast('Restored factory defaults');
  };

  const syncHardwareBindings = useCallback((targetProfileName: string, map: { b1?: string; b2?: string; b3?: string; b4?: string; dial?: string }) => {
    commitChange(prev => ({
      ...prev,
      profiles: prev.profiles.map(p => {
        if (p.name.toUpperCase().includes(targetProfileName.toUpperCase()) || p.id.toUpperCase().includes(targetProfileName.toUpperCase())) {
          const nextLayers = [...p.layers] as StudioProfile['layers'];
          const l0 = { ...nextLayers[0], keys: { ...nextLayers[0].keys } };
          if (map.b1) l0.keys.k1 = { ...l0.keys.k1, triggers: { ...l0.keys.k1.triggers, tap: actionStrToBinding(map.b1) } };
          if (map.b2) l0.keys.k2 = { ...l0.keys.k2, triggers: { ...l0.keys.k2.triggers, tap: actionStrToBinding(map.b2) } };
          if (map.b3) l0.keys.k3 = { ...l0.keys.k3, triggers: { ...l0.keys.k3.triggers, tap: actionStrToBinding(map.b3) } };
          if (map.b4) l0.keys.k4 = { ...l0.keys.k4, triggers: { ...l0.keys.k4.triggers, tap: actionStrToBinding(map.b4) } };
          if (map.dial) {
            const activeMode = l0.encoder.modes.find(m => m.id === l0.encoder.activeModeId) || l0.encoder.modes[0];
            activeMode.press.tap = actionStrToBinding(map.dial);
          }
          nextLayers[0] = l0;
          return { ...p, layers: nextLayers };
        }
        return p;
      })
    }), false);
  }, [commitChange]);

  return {
    profiles: snapshot.profiles,
    activeProfile,
    activeLayer,
    macros: snapshot.macros,
    macroFolders: snapshot.macroFolders,
    userPresets,
    settings,
    conflicts,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    undo,
    redo,
    selectProfile,
    createProfile,
    renameProfile,
    duplicateProfile,
    deleteProfile,
    selectLayer,
    updateLayerMeta,
    updateKeyTrigger,
    updateKeyAppearance,
    updateKeyAdvanced,
    resetKey,
    updateEncoder,
    cycleEncoderMode,
    updateMacros: (nextMacros: MacroItem[]) =>
      commitChange(prev => ({ ...prev, macros: nextMacros })),
    updateMacroFolders: (nextFolders: MacroFolder[]) =>
      commitChange(prev => ({ ...prev, macroFolders: nextFolders }), false),
    updateSettings: (patch: Partial<StudioSettings>) =>
      setSettings(prev => ({ ...prev, ...patch })),
    applyTemplateToActiveProfile,
    saveUserPreset,
    deleteUserPreset,
    importProfileJson,
    exportFullBackup,
    importFullBackup,
    factoryReset,
    syncHardwareBindings
  };
}
