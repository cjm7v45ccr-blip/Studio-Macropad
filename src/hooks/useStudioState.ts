import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ActionBinding,
  ConflictWarning,
  EncoderControlConfig,
  KeyControlConfig,
  KeyId,
  LayerConfig,
  LightingConfig,
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
  emptyAction
} from '../data/presetTemplates';
import { soundEngine } from '../services/soundEffects';

const STORAGE_KEY = 'studio_macropad_workspace_v2';

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
  encoderPlacement: 'top',
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

export function useStudioState(onToast: (msg: string) => void) {
  const initialData = useMemo((): PersistedWorkspace => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.profiles) && parsed.profiles.length > 0) {
          return {
            profiles: parsed.profiles,
            activeProfileId: parsed.activeProfileId || parsed.profiles[0].id,
            macros: parsed.macros || DEFAULT_MACROS,
            macroFolders: parsed.macroFolders || DEFAULT_MACRO_FOLDERS,
            userPresets: parsed.userPresets || [],
            settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) }
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
        if (decoded && Array.isArray(decoded.layers) && decoded.layers.length === 4) {
          const imported: StudioProfile = {
            ...decoded,
            id: `prof-${Date.now()}`,
            name: `${decoded.name || 'Shared'} (Imported)`
          };
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
      const tap = activeLayer.keys[kid].triggers.tap;
      if (tap.type === 'none' || !tap.value) continue;
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

  const updateLighting = (nextLighting: LightingConfig) => {
    updateActiveProfile(p => ({
      ...p,
      lighting: nextLighting
    }));
  };

  const applyTemplateToActiveProfile = (templateProfile: StudioProfile) => {
    updateActiveProfile(p => ({
      ...p,
      layers: JSON.parse(JSON.stringify(templateProfile.layers)),
      lighting: JSON.parse(JSON.stringify(templateProfile.lighting)),
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
    commitChange(prev => ({
      ...prev,
      profiles: [...prev.profiles, prof],
      activeProfileId: prof.id
    }));
    onToast(`Imported profile "${prof.name}"`);
  };

  const exportFullBackup = () => {
    const full = {
      schema: 'studio-pad-workspace-v2',
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
        setSnapshot({
          profiles: parsed.profiles,
          activeProfileId: parsed.activeProfileId || parsed.profiles[0].id,
          macros: parsed.macros || DEFAULT_MACROS,
          macroFolders: parsed.macroFolders || DEFAULT_MACRO_FOLDERS
        });
        if (Array.isArray(parsed.userPresets)) setUserPresets(parsed.userPresets);
        if (parsed.settings) setSettings({ ...DEFAULT_SETTINGS, ...parsed.settings });
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
    updateLighting,
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
    factoryReset
  };
}
