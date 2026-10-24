import {
  ActionBinding,
  EncoderControlConfig,
  EncoderModeConfig,
  KeyControlConfig,
  KeyId,
  LayerConfig,
  LightingConfig,
  MacroFolder,
  MacroItem,
  PresetTemplate,
  StudioProfile
} from '../types/studio';

export const ALL_KEY_IDS: KeyId[] = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9'];

export const LAYER_DEFAULT_COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B'];

export function emptyAction(): ActionBinding {
  return { type: 'none', value: '' };
}

export function makeKey(
  id: KeyId,
  label: string,
  icon: string,
  tap: ActionBinding,
  opts?: {
    hold?: ActionBinding;
    double_tap?: ActionBinding;
    tap_hold?: ActionBinding;
    labelColor?: string;
  }
): KeyControlConfig {
  return {
    id,
    triggers: {
      tap,
      hold: opts?.hold || emptyAction(),
      double_tap: opts?.double_tap || emptyAction(),
      tap_hold: opts?.tap_hold || emptyAction()
    },
    appearance: {
      label,
      icon,
      labelColor: opts?.labelColor || '#F3F4F6'
    },
    advanced: {
      debounceOverrideMs: 0,
      repeatWhileHeld: false,
      repeatRateMs: 120,
      delayBeforeFiringMs: 0
    }
  };
}

export function buildDefaultEncoderModes(): EncoderModeConfig[] {
  return [
    {
      id: 'mode-volume',
      name: 'Volume',
      color: '#3B82F6',
      cw: { type: 'media', value: 'Volume Up' },
      ccw: { type: 'media', value: 'Volume Down' },
      press: {
        tap: { type: 'media', value: 'Mute' },
        hold: { type: 'media', value: 'Play / Pause' },
        double_tap: { type: 'media', value: 'Next Track' }
      },
      pressRotate: {
        cw: { type: 'media', value: 'Next Track' },
        ccw: { type: 'media', value: 'Previous Track' }
      }
    },
    {
      id: 'mode-scroll',
      name: 'Scroll',
      color: '#10B981',
      cw: { type: 'mouse', value: 'scroll_down', meta: { mouseAction: 'scroll_down', mouseAmount: 3 } },
      ccw: { type: 'mouse', value: 'scroll_up', meta: { mouseAction: 'scroll_up', mouseAmount: 3 } },
      press: {
        tap: { type: 'mouse', value: 'middle_click', meta: { mouseAction: 'middle_click' } },
        hold: emptyAction(),
        double_tap: emptyAction()
      },
      pressRotate: {
        cw: { type: 'mouse', value: 'scroll_right', meta: { mouseAction: 'scroll_right', mouseAmount: 3 } },
        ccw: { type: 'mouse', value: 'scroll_left', meta: { mouseAction: 'scroll_left', mouseAmount: 3 } }
      }
    },
    {
      id: 'mode-zoom',
      name: 'Zoom',
      color: '#8B5CF6',
      cw: { type: 'shortcut', value: 'Cmd+=' },
      ccw: { type: 'shortcut', value: 'Cmd+-' },
      press: {
        tap: { type: 'shortcut', value: 'Cmd+0' },
        hold: { type: 'shortcut', value: 'Cmd+1' },
        double_tap: emptyAction()
      },
      pressRotate: {
        cw: { type: 'shortcut', value: 'Alt+]' },
        ccw: { type: 'shortcut', value: 'Alt+[' }
      }
    },
    {
      id: 'mode-timeline',
      name: 'Timeline',
      color: '#F59E0B',
      cw: { type: 'shortcut', value: 'ArrowRight' },
      ccw: { type: 'shortcut', value: 'ArrowLeft' },
      press: {
        tap: { type: 'shortcut', value: 'Space' },
        hold: { type: 'shortcut', value: 'M' },
        double_tap: { type: 'shortcut', value: 'Home' }
      },
      pressRotate: {
        cw: { type: 'shortcut', value: 'Shift+ArrowRight' },
        ccw: { type: 'shortcut', value: 'Shift+ArrowLeft' }
      }
    }
  ];
}

export function buildDefaultEncoder(primaryModeOverride?: Partial<EncoderModeConfig>): EncoderControlConfig {
  const modes = buildDefaultEncoderModes();
  if (primaryModeOverride) {
    modes[0] = { ...modes[0], ...primaryModeOverride };
  }
  return {
    activeModeId: modes[0].id,
    clickCyclesModes: true,
    modes,
    feel: {
      sensitivity: 2,
      acceleration: true,
      invertDirection: false
    }
  };
}

export function buildSecondaryLayer(index: number, name: string, color: string): LayerConfig {
  const keys = {} as Record<KeyId, KeyControlConfig>;
  ALL_KEY_IDS.forEach((kid, idx) => {
    if (idx === 8) {
      keys[kid] = makeKey(kid, 'Layer 1', 'layers', {
        type: 'layer',
        value: '0',
        meta: { layerSwitchMode: 'toggle', targetLayerIndex: 0 }
      });
    } else {
      keys[kid] = makeKey(kid, `F${13 + idx}`, 'command', {
        type: 'shortcut',
        value: `F${13 + idx}`
      });
    }
  });
  return {
    id: `layer-${index + 1}`,
    name,
    color,
    keys,
    encoder: buildDefaultEncoder()
  };
}

export function buildLighting(baseColor: string, keyPalette?: Partial<Record<KeyId, string>>): LightingConfig {
  const perKeyColors: Record<KeyId, string> = {
    k1: baseColor,
    k2: baseColor,
    k3: baseColor,
    k4: baseColor,
    k5: baseColor,
    k6: baseColor,
    k7: baseColor,
    k8: baseColor,
    k9: baseColor,
    ...keyPalette
  };
  return {
    effect: 'reactive',
    brightness: 82,
    speed: 48,
    useLayerColor: false,
    perKeyColors,
    encoderRingColor: baseColor
  };
}

function makeProfileFromKeys(
  id: string,
  name: string,
  appHint: string,
  accent: string,
  layer1Name: string,
  keys: Record<KeyId, KeyControlConfig>,
  encoderOverride?: Partial<EncoderModeConfig>,
  keyColors?: Partial<Record<KeyId, string>>
): StudioProfile {
  const l1: LayerConfig = {
    id: 'layer-1',
    name: layer1Name,
    color: accent,
    keys,
    encoder: buildDefaultEncoder(encoderOverride)
  };
  const l2 = buildSecondaryLayer(1, 'Media & Audio', '#8B5CF6');
  l3MediaPopulate(l2);
  const l3 = buildSecondaryLayer(2, 'Navigation', '#10B981');
  const l4 = buildSecondaryLayer(3, 'Macros & Fn', '#F59E0B');

  return {
    id,
    name,
    appHint,
    activeLayerIndex: 0,
    layers: [l1, l2, l3, l4],
    lighting: buildLighting(accent, keyColors)
  };
}

function l3MediaPopulate(layer: LayerConfig) {
  layer.keys.k1 = makeKey('k1', 'Prev', 'skip-back', { type: 'media', value: 'Previous Track' });
  layer.keys.k2 = makeKey('k2', 'Play/Pause', 'play', { type: 'media', value: 'Play / Pause' });
  layer.keys.k3 = makeKey('k3', 'Next', 'skip-forward', { type: 'media', value: 'Next Track' });
  layer.keys.k4 = makeKey('k4', 'Vol Down', 'volume-1', { type: 'media', value: 'Volume Down' });
  layer.keys.k5 = makeKey('k5', 'Mute', 'volume-x', { type: 'media', value: 'Mute' });
  layer.keys.k6 = makeKey('k6', 'Vol Up', 'volume-2', { type: 'media', value: 'Volume Up' });
  layer.keys.k7 = makeKey('k7', 'Bright -', 'moon', { type: 'system', value: 'Brightness Down' });
  layer.keys.k8 = makeKey('k8', 'Bright +', 'sun', { type: 'system', value: 'Brightness Up' });
  layer.keys.k9 = makeKey('k9', 'Main Layer', 'layers', {
    type: 'layer',
    value: '0',
    meta: { layerSwitchMode: 'toggle', targetLayerIndex: 0 }
  });
}

export const PRESET_TEMPLATES: PresetTemplate[] = [
  {
    id: 'preset-productivity',
    name: 'General Productivity',
    category: 'Productivity',
    description: 'Essential daily shortcuts: Spotlight launcher, clipboard power tools, window snapping, screenshot, and media.',
    accentColor: '#3B82F6',
    icon: 'layout-grid',
    buildProfile: (nameOverride?: string) =>
      makeProfileFromKeys(
        `prof-${Date.now()}-prod`,
        nameOverride || 'General Productivity',
        'Desktop / macOS / Windows',
        '#3B82F6',
        'Core Actions',
        {
          k1: makeKey('k1', 'Launcher', 'search', { type: 'shortcut', value: 'Cmd+Space' }, {
            hold: { type: 'open', value: 'https://google.com', meta: { openTargetType: 'url' } }
          }),
          k2: makeKey('k2', 'Copy', 'copy', { type: 'shortcut', value: 'Cmd+C' }),
          k3: makeKey('k3', 'Paste', 'paste', { type: 'shortcut', value: 'Cmd+V' }, {
            hold: { type: 'shortcut', value: 'Cmd+Shift+V' }
          }),
          k4: makeKey('k4', 'Undo', 'undo', { type: 'shortcut', value: 'Cmd+Z' }),
          k5: makeKey('k5', 'Redo', 'redo', { type: 'shortcut', value: 'Cmd+Shift+Z' }),
          k6: makeKey('k6', 'Capture', 'camera', { type: 'system', value: 'Screenshot' }),
          k7: makeKey('k7', 'Play/Pause', 'play', { type: 'media', value: 'Play / Pause' }),
          k8: makeKey('k8', 'Lock OS', 'lock', { type: 'system', value: 'Lock Screen' }),
          k9: makeKey('k9', 'Layer 2', 'layers', {
            type: 'layer',
            value: '1',
            meta: { layerSwitchMode: 'momentary', targetLayerIndex: 1 }
          })
        }
      )
  },
  {
    id: 'preset-vscode',
    name: 'VS Code',
    category: 'Code',
    description: 'Command palette, integrated terminal, split pane, quick search, git commit macro, and step debugger.',
    accentColor: '#0EA5E9',
    icon: 'code',
    buildProfile: (nameOverride?: string) =>
      makeProfileFromKeys(
        `prof-${Date.now()}-code`,
        nameOverride || 'VS Code',
        'Code.app / code.exe',
        '#0EA5E9',
        'Editor & Git',
        {
          k1: makeKey('k1', 'Palette', 'command', { type: 'shortcut', value: 'Cmd+Shift+P' }),
          k2: makeKey('k2', 'Find File', 'search', { type: 'shortcut', value: 'Cmd+P' }),
          k3: makeKey('k3', 'Terminal', 'terminal', { type: 'shortcut', value: 'Ctrl+`' }),
          k4: makeKey('k4', 'Split Pane', 'columns', { type: 'shortcut', value: 'Cmd+\\' }),
          k5: makeKey('k5', 'Format', 'code', { type: 'shortcut', value: 'Shift+Alt+F' }),
          k6: makeKey('k6', 'Git Push', 'git-commit', { type: 'macro', value: 'macro-git-sync' }),
          k7: makeKey('k7', 'Debug', 'bug', { type: 'shortcut', value: 'F5' }),
          k8: makeKey('k8', 'Comment', 'file-text', { type: 'shortcut', value: 'Cmd+/' }),
          k9: makeKey('k9', 'Zen Mode', 'maximize', { type: 'shortcut', value: 'Cmd+K' })
        },
        {
          name: 'Tab / Scroll',
          color: '#0EA5E9',
          cw: { type: 'mouse', value: 'scroll_down', meta: { mouseAction: 'scroll_down', mouseAmount: 4 } },
          ccw: { type: 'mouse', value: 'scroll_up', meta: { mouseAction: 'scroll_up', mouseAmount: 4 } },
          pressRotate: {
            cw: { type: 'shortcut', value: 'Alt+Cmd+ArrowRight' },
            ccw: { type: 'shortcut', value: 'Alt+Cmd+ArrowLeft' }
          }
        }
      )
  },
  {
    id: 'preset-photoshop',
    name: 'Photoshop',
    category: 'Creative',
    description: 'Brush size rotary dial, Eyedropper, Lasso, Undo/Redo history, Transform, New Layer, and Export.',
    accentColor: '#2563EB',
    icon: 'brush',
    buildProfile: (nameOverride?: string) =>
      makeProfileFromKeys(
        `prof-${Date.now()}-ps`,
        nameOverride || 'Adobe Photoshop',
        'Adobe Photoshop 2026',
        '#2563EB',
        'Retouch & Brush',
        {
          k1: makeKey('k1', 'Brush', 'brush', { type: 'shortcut', value: 'B' }),
          k2: makeKey('k2', 'Sample', 'pipette', { type: 'shortcut', value: 'I' }),
          k3: makeKey('k3', 'Lasso', 'wand', { type: 'shortcut', value: 'L' }),
          k4: makeKey('k4', 'Undo', 'undo', { type: 'shortcut', value: 'Cmd+Z' }),
          k5: makeKey('k5', 'Transform', 'move', { type: 'shortcut', value: 'Cmd+T' }),
          k6: makeKey('k6', 'New Layer', 'layers', { type: 'shortcut', value: 'Cmd+Shift+N' }),
          k7: makeKey('k7', 'Fit View', 'maximize', { type: 'shortcut', value: 'Cmd+0' }),
          k8: makeKey('k8', 'Deselect', 'crop', { type: 'shortcut', value: 'Cmd+D' }),
          k9: makeKey('k9', 'Export', 'save', { type: 'shortcut', value: 'Cmd+Alt+Shift+W' })
        },
        {
          name: 'Brush Size',
          color: '#2563EB',
          cw: { type: 'shortcut', value: ']' },
          ccw: { type: 'shortcut', value: '[' },
          pressRotate: {
            cw: { type: 'shortcut', value: 'Shift+]' },
            ccw: { type: 'shortcut', value: 'Shift+[' }
          }
        }
      )
  },
  {
    id: 'preset-premiere',
    name: 'Premiere Pro',
    category: 'Creative',
    description: 'Frame-accurate jog dial, Razor blade, Ripple delete, In/Out markers, timeline zoom, and quick export.',
    accentColor: '#8B5CF6',
    icon: 'clapperboard',
    buildProfile: (nameOverride?: string) =>
      makeProfileFromKeys(
        `prof-${Date.now()}-pr`,
        nameOverride || 'Premiere Pro',
        'Adobe Premiere Pro',
        '#8B5CF6',
        'Timeline Edit',
        {
          k1: makeKey('k1', 'Mark In', 'bookmark', { type: 'shortcut', value: 'I' }),
          k2: makeKey('k2', 'Razor Cut', 'scissors', { type: 'shortcut', value: 'C' }),
          k3: makeKey('k3', 'Mark Out', 'bookmark', { type: 'shortcut', value: 'O' }),
          k4: makeKey('k4', 'Ripple Del', 'wand', { type: 'shortcut', value: 'Shift+Delete' }),
          k5: makeKey('k5', 'Play/Stop', 'play', { type: 'shortcut', value: 'Space' }),
          k6: makeKey('k6', 'Add Marker', 'sparkles', { type: 'shortcut', value: 'M' }),
          k7: makeKey('k7', 'Undo', 'undo', { type: 'shortcut', value: 'Cmd+Z' }),
          k8: makeKey('k8', 'Zoom Fit', 'zoom-in', { type: 'shortcut', value: '\\' }),
          k9: makeKey('k9', 'Export', 'save', { type: 'shortcut', value: 'Cmd+M' })
        },
        {
          name: 'Jog Frame',
          color: '#8B5CF6',
          cw: { type: 'shortcut', value: 'ArrowRight' },
          ccw: { type: 'shortcut', value: 'ArrowLeft' },
          pressRotate: {
            cw: { type: 'shortcut', value: '=' },
            ccw: { type: 'shortcut', value: '-' }
          }
        }
      )
  },
  {
    id: 'preset-davinci',
    name: 'DaVinci Resolve',
    category: 'Creative',
    description: 'Color grading nodes, Blade edit, bypass grade preview, still grab, and jog/shuttle control.',
    accentColor: '#F43F5E',
    icon: 'palette',
    buildProfile: (nameOverride?: string) =>
      makeProfileFromKeys(
        `prof-${Date.now()}-dr`,
        nameOverride || 'DaVinci Resolve',
        'DaVinci Resolve Studio',
        '#F43F5E',
        'Edit & Color',
        {
          k1: makeKey('k1', 'Split Clip', 'scissors', { type: 'shortcut', value: 'Cmd+\\' }),
          k2: makeKey('k2', 'Blade Mode', 'wand', { type: 'shortcut', value: 'B' }),
          k3: makeKey('k3', 'Select', 'mouse', { type: 'shortcut', value: 'A' }),
          k4: makeKey('k4', 'Serial Node', 'layers', { type: 'shortcut', value: 'Alt+S' }),
          k5: makeKey('k5', 'Bypass LUT', 'palette', { type: 'shortcut', value: 'Shift+D' }),
          k6: makeKey('k6', 'Grab Still', 'camera', { type: 'shortcut', value: 'Cmd+Alt+G' }),
          k7: makeKey('k7', 'Prev Clip', 'skip-back', { type: 'shortcut', value: 'ArrowUp' }),
          k8: makeKey('k8', 'Next Clip', 'skip-forward', { type: 'shortcut', value: 'ArrowDown' }),
          k9: makeKey('k9', 'Cinema', 'maximize', { type: 'shortcut', value: 'Cmd+F' })
        },
        {
          name: 'Scrub Clip',
          color: '#F43F5E',
          cw: { type: 'shortcut', value: 'ArrowRight' },
          ccw: { type: 'shortcut', value: 'ArrowLeft' }
        }
      )
  },
  {
    id: 'preset-obs',
    name: 'OBS / Streaming',
    category: 'Streaming',
    description: 'Instant scene switching, mic mute indicator, replay buffer save, stream webhook trigger, and audio fader.',
    accentColor: '#10B981',
    icon: 'radio',
    buildProfile: (nameOverride?: string) =>
      makeProfileFromKeys(
        `prof-${Date.now()}-obs`,
        nameOverride || 'OBS Studio Live',
        'OBS Studio / Streamlabs',
        '#10B981',
        'Live Broadcast',
        {
          k1: makeKey('k1', 'Main Cam', 'video', { type: 'shortcut', value: 'Ctrl+Shift+F1' }, { labelColor: '#6EE7B7' }),
          k2: makeKey('k2', 'Desktop', 'monitor-up', { type: 'shortcut', value: 'Ctrl+Shift+F2' }),
          k3: makeKey('k3', 'BRB Slate', 'clapperboard', { type: 'shortcut', value: 'Ctrl+Shift+F3' }),
          k4: makeKey('k4', 'Mute Mic', 'mic-off', { type: 'shortcut', value: 'Ctrl+Shift+M' }, { labelColor: '#FCA5A5' }),
          k5: makeKey('k5', 'Save Clip', 'bookmark', { type: 'shortcut', value: 'Ctrl+Shift+R' }),
          k6: makeKey('k6', 'Studio UI', 'columns', { type: 'shortcut', value: 'Ctrl+Shift+T' }),
          k7: makeKey('k7', 'SFX Horn', 'volume-2', { type: 'webhook', value: 'http://localhost:4455/api/sfx/airhorn', meta: { webhookMethod: 'POST' } }),
          k8: makeKey('k8', 'Key Light', 'sun', { type: 'webhook', value: 'http://homeassistant.local:8123/api/webhook/keylight', meta: { webhookMethod: 'POST' } }),
          k9: makeKey('k9', 'Go Live', 'radio', { type: 'macro', value: 'macro-obs-live' }, { labelColor: '#FDE68A' })
        },
        undefined,
        {
          k1: '#10B981',
          k4: '#EF4444',
          k9: '#F59E0B'
        }
      )
  },
  {
    id: 'preset-figma',
    name: 'Figma',
    category: 'Creative',
    description: 'Auto-layout, component creation, frame tool, color picker, UI hide, and smooth canvas zoom.',
    accentColor: '#A855F7',
    icon: 'pen-tool',
    buildProfile: (nameOverride?: string) =>
      makeProfileFromKeys(
        `prof-${Date.now()}-figma`,
        nameOverride || 'Figma Design',
        'Figma.app',
        '#A855F7',
        'Canvas & Layout',
        {
          k1: makeKey('k1', 'Frame', 'crop', { type: 'shortcut', value: 'F' }),
          k2: makeKey('k2', 'Auto Layout', 'layout-grid', { type: 'shortcut', value: 'Shift+A' }),
          k3: makeKey('k3', 'Component', 'layers', { type: 'shortcut', value: 'Alt+Cmd+K' }),
          k4: makeKey('k4', 'Pen Tool', 'pen-tool', { type: 'shortcut', value: 'P' }),
          k5: makeKey('k5', 'Color Pick', 'pipette', { type: 'shortcut', value: 'Ctrl+C' }),
          k6: makeKey('k6', 'Quick Run', 'command', { type: 'shortcut', value: 'Cmd+/' }),
          k7: makeKey('k7', 'Hide UI', 'maximize', { type: 'shortcut', value: 'Cmd+\\' }),
          k8: makeKey('k8', 'Present', 'play', { type: 'shortcut', value: 'Alt+Cmd+Enter' }),
          k9: makeKey('k9', 'Export PNG', 'save', { type: 'shortcut', value: 'Cmd+Shift+E' })
        },
        {
          name: 'Canvas Zoom',
          color: '#A855F7',
          cw: { type: 'shortcut', value: 'Cmd+=' },
          ccw: { type: 'shortcut', value: 'Cmd+-' }
        }
      )
  },
  {
    id: 'preset-spotify',
    name: 'Spotify',
    category: 'Media & Comms',
    description: 'Dedicated tactile music deck: Play/Pause, Track Skip, Like Song, Shuffle, Repeat, and precision Volume.',
    accentColor: '#22C55E',
    icon: 'play',
    buildProfile: (nameOverride?: string) =>
      makeProfileFromKeys(
        `prof-${Date.now()}-spot`,
        nameOverride || 'Spotify Controller',
        'Spotify.app',
        '#22C55E',
        'Playback Deck',
        {
          k1: makeKey('k1', 'Prev', 'skip-back', { type: 'media', value: 'Previous Track' }),
          k2: makeKey('k2', 'Play/Pause', 'play', { type: 'media', value: 'Play / Pause' }),
          k3: makeKey('k3', 'Next', 'skip-forward', { type: 'media', value: 'Next Track' }),
          k4: makeKey('k4', 'Like Song', 'heart', { type: 'shortcut', value: 'Alt+Shift+B' }),
          k5: makeKey('k5', 'Shuffle', 'shuffle', { type: 'shortcut', value: 'Cmd+S' }),
          k6: makeKey('k6', 'Repeat', 'repeat', { type: 'shortcut', value: 'Cmd+R' }),
          k7: makeKey('k7', 'Search', 'search', { type: 'shortcut', value: 'Cmd+L' }),
          k8: makeKey('k8', 'Mute', 'volume-x', { type: 'media', value: 'Mute' }),
          k9: makeKey('k9', 'Open App', 'globe', { type: 'open', value: 'Spotify', meta: { openTargetType: 'app' } })
        }
      )
  },
  {
    id: 'preset-zoom',
    name: 'Zoom Meetings',
    category: 'Media & Comms',
    description: 'Zero-fumble conference controls: Mic Mute, Video Toggle, Share Screen, Raise Hand, Record, and Leave Call.',
    accentColor: '#38BDF8',
    icon: 'video',
    buildProfile: (nameOverride?: string) =>
      makeProfileFromKeys(
        `prof-${Date.now()}-zoom`,
        nameOverride || 'Zoom Meetings',
        'zoom.us.app',
        '#38BDF8',
        'Call Controls',
        {
          k1: makeKey('k1', 'Mute Mic', 'mic-off', { type: 'shortcut', value: 'Cmd+Shift+A' }, { labelColor: '#FCA5A5' }),
          k2: makeKey('k2', 'Camera', 'video', { type: 'shortcut', value: 'Cmd+Shift+V' }),
          k3: makeKey('k3', 'Share', 'monitor-up', { type: 'shortcut', value: 'Cmd+Shift+S' }, { labelColor: '#86EFAC' }),
          k4: makeKey('k4', 'Raise Hand', 'hand', { type: 'shortcut', value: 'Alt+Y' }),
          k5: makeKey('k5', 'Chat', 'message-square', { type: 'shortcut', value: 'Cmd+Shift+H' }),
          k6: makeKey('k6', 'Gallery', 'layout-grid', { type: 'shortcut', value: 'Cmd+Shift+W' }),
          k7: makeKey('k7', 'Record', 'radio', { type: 'shortcut', value: 'Cmd+Shift+R' }),
          k8: makeKey('k8', 'Fullscreen', 'maximize', { type: 'shortcut', value: 'Cmd+Shift+F' }),
          k9: makeKey('k9', 'Leave Call', 'phone-off', { type: 'shortcut', value: 'Cmd+W' }, { labelColor: '#FDA4AF' })
        },
        undefined,
        {
          k1: '#EF4444',
          k3: '#22C55E',
          k9: '#F43F5E'
        }
      )
  }
];

export const DEFAULT_MACRO_FOLDERS: MacroFolder[] = [
  { id: 'folder-dev', name: 'Development' },
  { id: 'folder-stream', name: 'Streaming & OBS' },
  { id: 'folder-edit', name: 'Video & Creative' },
  { id: 'folder-prod', name: 'Productivity' }
];

export const DEFAULT_MACROS: MacroItem[] = [
  {
    id: 'macro-git-sync',
    name: 'Git Stage & Commit Prompt',
    folderId: 'folder-dev',
    repeatMode: 'once',
    repeatCount: 1,
    steps: [
      { id: 's1', type: 'key_down', value: 'Ctrl' },
      { id: 's2', type: 'key_down', value: '`' },
      { id: 's3', type: 'delay', value: '45', delayMs: 45 },
      { id: 's4', type: 'key_up', value: '`' },
      { id: 's5', type: 'key_up', value: 'Ctrl' },
      { id: 's6', type: 'delay', value: '120', delayMs: 120 },
      { id: 's7', type: 'text', value: 'git add -A && git status\n' }
    ]
  },
  {
    id: 'macro-obs-live',
    name: 'OBS Intro Scene + Unmute',
    folderId: 'folder-stream',
    repeatMode: 'once',
    repeatCount: 1,
    steps: [
      { id: 'o1', type: 'key_down', value: 'Ctrl' },
      { id: 'o2', type: 'key_down', value: 'Shift' },
      { id: 'o3', type: 'key_down', value: 'F1' },
      { id: 'o4', type: 'delay', value: '40', delayMs: 40 },
      { id: 'o5', type: 'key_up', value: 'F1' },
      { id: 'o6', type: 'delay', value: '350', delayMs: 350 },
      { id: 'o7', type: 'key_down', value: 'M' },
      { id: 'o8', type: 'delay', value: '35', delayMs: 35 },
      { id: 'o9', type: 'key_up', value: 'M' },
      { id: 'o10', type: 'key_up', value: 'Shift' },
      { id: 'o11', type: 'key_up', value: 'Ctrl' }
    ]
  },
  {
    id: 'macro-ripple-cut',
    name: 'Cut & Ripple Trim Left',
    folderId: 'folder-edit',
    repeatMode: 'once',
    repeatCount: 1,
    steps: [
      { id: 'r1', type: 'key_down', value: 'C' },
      { id: 'r2', type: 'delay', value: '30', delayMs: 30 },
      { id: 'r3', type: 'key_up', value: 'C' },
      { id: 'r4', type: 'mouse', value: 'left_click' },
      { id: 'r5', type: 'delay', value: '60', delayMs: 60 },
      { id: 'r6', type: 'key_down', value: 'Q' },
      { id: 'r7', type: 'delay', value: '30', delayMs: 30 },
      { id: 'r8', type: 'key_up', value: 'Q' }
    ]
  },
  {
    id: 'macro-signature',
    name: 'Sign-off Snippet',
    folderId: 'folder-prod',
    repeatMode: 'once',
    repeatCount: 1,
    steps: [
      { id: 'm1', type: 'text', value: 'Best regards,\nStudio Engineering Team' }
    ]
  }
];
