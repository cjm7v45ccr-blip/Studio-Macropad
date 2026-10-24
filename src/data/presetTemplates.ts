import {
  ActionBinding,
  EncoderControlConfig,
  EncoderModeConfig,
  KeyControlConfig,
  KeyId,
  LayerConfig,
  MacroFolder,
  MacroItem,
  PresetTemplate,
  StudioProfile
} from '../types/studio';

export const ALL_KEY_IDS: KeyId[] = ['k1', 'k2', 'k3', 'k4', 'k5'];

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
    if (idx === 4) {
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

function makeProfileFromKeys(
  id: string,
  name: string,
  appHint: string,
  accent: string,
  layer1Name: string,
  keys: Record<KeyId, KeyControlConfig>,
  encoderOverride?: Partial<EncoderModeConfig>
): StudioProfile {
  const l1: LayerConfig = {
    id: 'layer-1',
    name: layer1Name,
    color: accent,
    keys,
    encoder: buildDefaultEncoder(encoderOverride)
  };
  const l2 = buildSecondaryLayer(1, 'Media & Audio', '#8B5CF6');
  populateMediaLayer(l2);
  const l3 = buildSecondaryLayer(2, 'Navigation', '#10B981');
  const l4 = buildSecondaryLayer(3, 'Macros & Fn', '#F59E0B');

  return {
    id,
    name,
    appHint,
    activeLayerIndex: 0,
    layers: [l1, l2, l3, l4]
  };
}

function populateMediaLayer(layer: LayerConfig) {
  layer.keys.k1 = makeKey('k1', 'Prev', 'skip-back', { type: 'media', value: 'Previous Track' });
  layer.keys.k2 = makeKey('k2', 'Play/Pause', 'play', { type: 'media', value: 'Play / Pause' });
  layer.keys.k3 = makeKey('k3', 'Next', 'skip-forward', { type: 'media', value: 'Next Track' });
  layer.keys.k4 = makeKey('k4', 'Mute', 'volume-x', { type: 'media', value: 'Mute' });
  layer.keys.k5 = makeKey('k5', 'Main Layer', 'layers', {
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
    description: 'Essential 5-key daily deck: Spotlight launcher, Copy/Paste with plain-paste hold, Undo/Redo, Screenshot, and Layer shift.',
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
            hold: { type: 'system', value: 'Lock Screen' }
          }),
          k2: makeKey('k2', 'Capture', 'camera', { type: 'system', value: 'Screenshot' }),
          k3: makeKey('k3', 'Copy', 'copy', { type: 'shortcut', value: 'Cmd+C' }, {
            double_tap: { type: 'shortcut', value: 'Cmd+X' }
          }),
          k4: makeKey('k4', 'Paste', 'paste', { type: 'shortcut', value: 'Cmd+V' }, {
            hold: { type: 'shortcut', value: 'Cmd+Shift+V' }
          }),
          k5: makeKey('k5', 'Undo', 'undo', { type: 'shortcut', value: 'Cmd+Z' }, {
            hold: { type: 'layer', value: '1', meta: { layerSwitchMode: 'momentary', targetLayerIndex: 1 } },
            double_tap: { type: 'shortcut', value: 'Cmd+Shift+Z' }
          })
        }
      )
  },
  {
    id: 'preset-vscode',
    name: 'VS Code',
    category: 'Code',
    description: 'Command palette, quick file search, integrated terminal, git stage macro, and step debugger with rotary scroll.',
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
          k4: makeKey('k4', 'Git Sync', 'git-commit', { type: 'macro', value: 'macro-git-sync' }),
          k5: makeKey('k5', 'Debug', 'bug', { type: 'shortcut', value: 'F5' }, {
            hold: { type: 'shortcut', value: 'Shift+Alt+F' }
          })
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
    description: 'Brush size rotary dial, Brush/Eraser tap-hold, Eyedropper sample, Lasso, Undo/Redo, and Free Transform.',
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
          k1: makeKey('k1', 'Brush', 'brush', { type: 'shortcut', value: 'B' }, {
            hold: { type: 'shortcut', value: 'E' }
          }),
          k2: makeKey('k2', 'Sample', 'pipette', { type: 'shortcut', value: 'I' }),
          k3: makeKey('k3', 'Lasso', 'wand', { type: 'shortcut', value: 'L' }),
          k4: makeKey('k4', 'Transform', 'move', { type: 'shortcut', value: 'Cmd+T' }, {
            hold: { type: 'shortcut', value: 'Cmd+Shift+N' }
          }),
          k5: makeKey('k5', 'Undo', 'undo', { type: 'shortcut', value: 'Cmd+Z' }, {
            double_tap: { type: 'shortcut', value: 'Cmd+Shift+Z' }
          })
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
    description: 'Frame-accurate jog dial, Razor blade, Ripple delete, In/Out markers, and Play/Stop transport.',
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
          k1: makeKey('k1', 'Mark In', 'bookmark', { type: 'shortcut', value: 'I' }, {
            hold: { type: 'shortcut', value: 'M' }
          }),
          k2: makeKey('k2', 'Mark Out', 'bookmark', { type: 'shortcut', value: 'O' }),
          k3: makeKey('k3', 'Razor Cut', 'scissors', { type: 'shortcut', value: 'C' }),
          k4: makeKey('k4', 'Ripple Del', 'wand', { type: 'shortcut', value: 'Shift+Delete' }),
          k5: makeKey('k5', 'Play/Stop', 'play', { type: 'shortcut', value: 'Space' }, {
            hold: { type: 'shortcut', value: 'Cmd+M' }
          })
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
    description: 'Split clip, Blade mode, Serial color node, Bypass LUT preview, Grab Still, and rotary clip scrub.',
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
          k2: makeKey('k2', 'Blade Mode', 'wand', { type: 'shortcut', value: 'B' }, {
            hold: { type: 'shortcut', value: 'A' }
          }),
          k3: makeKey('k3', 'Serial Node', 'layers', { type: 'shortcut', value: 'Alt+S' }),
          k4: makeKey('k4', 'Bypass LUT', 'palette', { type: 'shortcut', value: 'Shift+D' }),
          k5: makeKey('k5', 'Grab Still', 'camera', { type: 'shortcut', value: 'Cmd+Alt+G' })
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
    description: 'Instant scene switching, mic mute toggle, replay buffer save, Go Live macro, and rotary audio fader.',
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
          k2: makeKey('k2', 'Desktop', 'monitor-up', { type: 'shortcut', value: 'Ctrl+Shift+F2' }, {
            hold: { type: 'shortcut', value: 'Ctrl+Shift+F3' }
          }),
          k3: makeKey('k3', 'Mute Mic', 'mic-off', { type: 'shortcut', value: 'Ctrl+Shift+M' }, { labelColor: '#FCA5A5' }),
          k4: makeKey('k4', 'Save Clip', 'bookmark', { type: 'shortcut', value: 'Ctrl+Shift+R' }),
          k5: makeKey('k5', 'Go Live', 'radio', { type: 'macro', value: 'macro-obs-live' }, { labelColor: '#FDE68A' })
        }
      )
  },
  {
    id: 'preset-figma',
    name: 'Figma',
    category: 'Creative',
    description: 'Frame tool, Auto-layout, Create Component, Color Eyedropper, Quick Actions, and smooth rotary canvas zoom.',
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
          k4: makeKey('k4', 'Color Pick', 'pipette', { type: 'shortcut', value: 'Ctrl+C' }),
          k5: makeKey('k5', 'Quick Run', 'command', { type: 'shortcut', value: 'Cmd+/' }, {
            hold: { type: 'shortcut', value: 'Cmd+Shift+E' }
          })
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
    description: 'Dedicated 5-key tactile music deck: Previous, Play/Pause, Next Track, Like Song, Shuffle, and precision rotary Volume.',
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
          k5: makeKey('k5', 'Shuffle', 'shuffle', { type: 'shortcut', value: 'Cmd+S' }, {
            hold: { type: 'open', value: 'Spotify', meta: { openTargetType: 'app' } }
          })
        }
      )
  },
  {
    id: 'preset-zoom',
    name: 'Zoom Meetings',
    category: 'Media & Comms',
    description: 'Zero-fumble conference controls: Mic Mute, Camera Toggle, Share Screen, Raise Hand, and Leave Call.',
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
          k4: makeKey('k4', 'Raise Hand', 'hand', { type: 'shortcut', value: 'Alt+Y' }, {
            hold: { type: 'shortcut', value: 'Cmd+Shift+H' }
          }),
          k5: makeKey('k5', 'Leave Call', 'phone-off', { type: 'shortcut', value: 'Cmd+W' }, { labelColor: '#FDA4AF' })
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
