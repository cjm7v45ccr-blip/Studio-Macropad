import {
  ActionBinding,
  ActionType,
  HardwareProfileId,
  HardwareSlotId,
  KeyAppearance,
  KeyboardLayoutId
} from '../types/studio';

export const HARDWARE_SLOTS: readonly HardwareSlotId[] = [
  'b1',
  'b2',
  'b3',
  'b4',
  'dial',
  'enc_cw',
  'enc_ccw'
] as const;

export const SLOT_LABELS: Record<HardwareSlotId, { short: string; full: string; pin: string }> = {
  b1: { short: 'B1', full: 'Button 1 (B1)', pin: 'GPIO 26' },
  b2: { short: 'B2', full: 'Button 2 (B2)', pin: 'GPIO 27' },
  b3: { short: 'B3', full: 'Button 3 (B3)', pin: 'GPIO 14' },
  b4: { short: 'B4', full: 'Button 4 (B4)', pin: 'GPIO 16' },
  dial: { short: 'Dial Press', full: 'Encoder Push (Dial)', pin: 'GPIO 25' },
  enc_cw: { short: 'Turn CW', full: 'Rotate Clockwise (CW)', pin: 'GPIO 33/32' },
  enc_ccw: { short: 'Turn CCW', full: 'Rotate Counter-Clockwise (CCW)', pin: 'GPIO 33/32' }
};

export interface FirmwareActionSpec {
  action: string;
  label: string;
  shortLabel: string;
  description: string;
  category: Exclude<ActionType, 'none'>;
  icon: string;
  color: string;
}

/**
 * Exact 1:1 match of SUPPORTED_ACTIONS[] in the ESP32 firmware (v3.2-PRO)
 */
export const FIRMWARE_STATIC_CATALOG: FirmwareActionSpec[] = [
  // MEDIA:* (6)
  { action: 'MEDIA:PLAY_PAUSE', label: 'Play / Pause', shortLabel: 'Play/Pause', description: 'BLE Media Play / Pause toggle', category: 'media', icon: 'play', color: '#38BDF8' },
  { action: 'MEDIA:MUTE', label: 'Mute Audio', shortLabel: 'Mute', description: 'BLE Master speaker mute toggle', category: 'media', icon: 'volume-x', color: '#F87171' },
  { action: 'MEDIA:VOL_UP', label: 'Volume Up', shortLabel: 'Vol +', description: 'BLE Master volume up', category: 'media', icon: 'volume-2', color: '#34D399' },
  { action: 'MEDIA:VOL_DOWN', label: 'Volume Down', shortLabel: 'Vol -', description: 'BLE Master volume down', category: 'media', icon: 'volume-1', color: '#60A5FA' },
  { action: 'MEDIA:NEXT', label: 'Next Track', shortLabel: 'Next', description: 'BLE Skip to next track', category: 'media', icon: 'skip-forward', color: '#A78BFA' },
  { action: 'MEDIA:PREV', label: 'Previous Track', shortLabel: 'Prev', description: 'BLE Return to previous track', category: 'media', icon: 'skip-back', color: '#A78BFA' },

  // KEY:F13..F16 (4)
  { action: 'KEY:F13', label: 'F13 Function Key', shortLabel: 'F13', description: 'BLE Aux function key F13', category: 'media', icon: 'command', color: '#F3F4F6' },
  { action: 'KEY:F14', label: 'F14 Function Key', shortLabel: 'F14', description: 'BLE Aux function key F14', category: 'media', icon: 'command', color: '#F3F4F6' },
  { action: 'KEY:F15', label: 'F15 Function Key', shortLabel: 'F15', description: 'BLE Aux function key F15', category: 'media', icon: 'command', color: '#F3F4F6' },
  { action: 'KEY:F16', label: 'F16 Function Key', shortLabel: 'F16', description: 'BLE Aux function key F16', category: 'media', icon: 'command', color: '#F3F4F6' },

  // MACRO:* macOS Built-ins (11)
  { action: 'MACRO:COPY', label: 'Copy (⌘C)', shortLabel: 'Copy', description: 'macOS Command + C', category: 'mac_macro', icon: 'copy', color: '#60A5FA' },
  { action: 'MACRO:PASTE', label: 'Paste (⌘V)', shortLabel: 'Paste', description: 'macOS Command + V', category: 'mac_macro', icon: 'paste', color: '#60A5FA' },
  { action: 'MACRO:CUT', label: 'Cut (⌘X)', shortLabel: 'Cut', description: 'macOS Command + X', category: 'mac_macro', icon: 'scissors', color: '#F472B6' },
  { action: 'MACRO:UNDO', label: 'Undo (⌘Z)', shortLabel: 'Undo', description: 'macOS Command + Z', category: 'mac_macro', icon: 'undo', color: '#FBBF24' },
  { action: 'MACRO:REDO', label: 'Redo (⌘⇧Z)', shortLabel: 'Redo', description: 'macOS Command + Shift + Z', category: 'mac_macro', icon: 'redo', color: '#FBBF24' },
  { action: 'MACRO:SELECT_ALL', label: 'Select All (⌘A)', shortLabel: 'Select All', description: 'macOS Command + A', category: 'mac_macro', icon: 'check-square', color: '#A78BFA' },
  { action: 'MACRO:SAVE', label: 'Save (⌘S)', shortLabel: 'Save', description: 'macOS Command + S', category: 'mac_macro', icon: 'save', color: '#34D399' },
  { action: 'MACRO:SPOTLIGHT', label: 'Spotlight (⌘Space)', shortLabel: 'Spotlight', description: 'macOS Command + Space search', category: 'mac_macro', icon: 'search', color: '#38BDF8' },
  { action: 'MACRO:LOCK', label: 'Lock Mac (⌃⌘Q)', shortLabel: 'Lock Mac', description: 'macOS Control + Command + Q', category: 'mac_macro', icon: 'lock', color: '#F87171' },
  { action: 'MACRO:NEW_TAB', label: 'New Tab (⌘T)', shortLabel: 'New Tab', description: 'macOS Command + T', category: 'mac_macro', icon: 'globe', color: '#34D399' },
  { action: 'MACRO:CLOSE_TAB', label: 'Close Tab (⌘W)', shortLabel: 'Close Tab', description: 'macOS Command + W', category: 'mac_macro', icon: 'phone-off', color: '#F87171' },

  // WIN:* Windows Built-ins (16)
  { action: 'WIN:COPY', label: 'Copy (Ctrl+C)', shortLabel: 'Win Copy', description: 'Windows Ctrl + C', category: 'win_macro', icon: 'copy', color: '#38BDF8' },
  { action: 'WIN:PASTE', label: 'Paste (Ctrl+V)', shortLabel: 'Win Paste', description: 'Windows Ctrl + V', category: 'win_macro', icon: 'paste', color: '#38BDF8' },
  { action: 'WIN:CUT', label: 'Cut (Ctrl+X)', shortLabel: 'Win Cut', description: 'Windows Ctrl + X', category: 'win_macro', icon: 'scissors', color: '#F472B6' },
  { action: 'WIN:UNDO', label: 'Undo (Ctrl+Z)', shortLabel: 'Win Undo', description: 'Windows Ctrl + Z', category: 'win_macro', icon: 'undo', color: '#FBBF24' },
  { action: 'WIN:REDO', label: 'Redo (Ctrl+Y)', shortLabel: 'Win Redo', description: 'Windows Ctrl + Y', category: 'win_macro', icon: 'redo', color: '#FBBF24' },
  { action: 'WIN:SELECT_ALL', label: 'Select All (Ctrl+A)', shortLabel: 'Select All', description: 'Windows Ctrl + A', category: 'win_macro', icon: 'check-square', color: '#A78BFA' },
  { action: 'WIN:SAVE', label: 'Save (Ctrl+S)', shortLabel: 'Win Save', description: 'Windows Ctrl + S', category: 'win_macro', icon: 'save', color: '#34D399' },
  { action: 'WIN:NEW_TAB', label: 'New Tab (Ctrl+T)', shortLabel: 'New Tab', description: 'Windows Ctrl + T', category: 'win_macro', icon: 'globe', color: '#34D399' },
  { action: 'WIN:CLOSE_TAB', label: 'Close Tab (Ctrl+W)', shortLabel: 'Close Tab', description: 'Windows Ctrl + W', category: 'win_macro', icon: 'phone-off', color: '#F87171' },
  { action: 'WIN:LOCK', label: 'Lock PC (Win+L)', shortLabel: 'Lock PC', description: 'Windows + L lock screen', category: 'win_macro', icon: 'lock', color: '#F87171' },
  { action: 'WIN:SEARCH', label: 'Win Search (Win+S)', shortLabel: 'Search', description: 'Windows + S search bar', category: 'win_macro', icon: 'search', color: '#38BDF8' },
  { action: 'WIN:EXPLORER', label: 'File Explorer (Win+E)', shortLabel: 'Explorer', description: 'Windows + E File Explorer', category: 'win_macro', icon: 'folder', color: '#FBBF24' },
  { action: 'WIN:TASK_MGR', label: 'Task Manager', shortLabel: 'Task Mgr', description: 'Ctrl + Shift + Esc', category: 'win_macro', icon: 'terminal', color: '#A78BFA' },
  { action: 'WIN:SNIP', label: 'Snipping Tool', shortLabel: 'Snip', description: 'Win + Shift + S screen snip', category: 'win_macro', icon: 'camera', color: '#34D399' },
  { action: 'WIN:DESKTOP', label: 'Show Desktop (Win+D)', shortLabel: 'Desktop', description: 'Windows + D toggle desktop', category: 'win_macro', icon: 'monitor', color: '#60A5FA' },
  { action: 'WIN:RUN', label: 'Run Dialog (Win+R)', shortLabel: 'Run', description: 'Windows + R command prompt', category: 'win_macro', icon: 'play-circle', color: '#38BDF8' },

  // TV:* SmartCast Remote (25)
  { action: 'TV:POWER', label: 'TV Power', shortLabel: 'TV Power', description: 'SmartCast power toggle (11, 2)', category: 'tv', icon: 'power', color: '#F87171' },
  { action: 'TV:VOL_UP', label: 'TV Volume +', shortLabel: 'TV Vol +', description: 'Increase TV volume (5, 1)', category: 'tv', icon: 'volume-2', color: '#34D399' },
  { action: 'TV:VOL_DOWN', label: 'TV Volume -', shortLabel: 'TV Vol -', description: 'Decrease TV volume (5, 0)', category: 'tv', icon: 'volume-1', color: '#60A5FA' },
  { action: 'TV:MUTE', label: 'TV Mute', shortLabel: 'TV Mute', description: 'Mute TV audio (5, 4)', category: 'tv', icon: 'volume-x', color: '#FBBF24' },
  { action: 'TV:HOME', label: 'TV Home', shortLabel: 'TV Home', description: 'SmartCast Home screen (4, 3)', category: 'tv', icon: 'tv', color: '#38BDF8' },
  { action: 'TV:INPUT', label: 'TV Input', shortLabel: 'Input', description: 'Cycle HDMI / Input source (7, 1)', category: 'tv', icon: 'monitor-up', color: '#A78BFA' },
  { action: 'TV:OK', label: 'TV OK / Select', shortLabel: 'TV OK', description: 'Confirm selection (3, 2)', category: 'tv', icon: 'check-square', color: '#34D399' },
  { action: 'TV:BACK', label: 'TV Back', shortLabel: 'TV Back', description: 'Navigate back (4, 0)', category: 'tv', icon: 'undo', color: '#F3F4F6' },
  { action: 'TV:EXIT', label: 'TV Exit', shortLabel: 'TV Exit', description: 'Close TV overlay (9, 0)', category: 'tv', icon: 'phone-off', color: '#F87171' },
  { action: 'TV:UP', label: 'D-Pad Up', shortLabel: 'TV Up', description: 'Navigate up (3, 8)', category: 'tv', icon: 'arrow-up', color: '#F3F4F6' },
  { action: 'TV:DOWN', label: 'D-Pad Down', shortLabel: 'TV Down', description: 'Navigate down (3, 0)', category: 'tv', icon: 'arrow-down', color: '#F3F4F6' },
  { action: 'TV:LEFT', label: 'D-Pad Left', shortLabel: 'TV Left', description: 'Navigate left (3, 1)', category: 'tv', icon: 'arrow-left', color: '#F3F4F6' },
  { action: 'TV:RIGHT', label: 'D-Pad Right', shortLabel: 'TV Right', description: 'Navigate right (3, 7)', category: 'tv', icon: 'arrow-right', color: '#F3F4F6' },
  { action: 'TV:MENU', label: 'TV Settings Menu', shortLabel: 'TV Menu', description: 'Open TV settings (4, 8)', category: 'tv', icon: 'sliders', color: '#60A5FA' },
  { action: 'TV:INFO', label: 'TV Info', shortLabel: 'TV Info', description: 'Display channel/input banner (4, 15)', category: 'tv', icon: 'sparkles', color: '#38BDF8' },
  { action: 'TV:GUIDE', label: 'TV Guide', shortLabel: 'Guide', description: 'Open program guide (4, 12)', category: 'tv', icon: 'layout-grid', color: '#A78BFA' },
  { action: 'TV:CC', label: 'Closed Captions', shortLabel: 'CC', description: 'Toggle subtitles (4, 4)', category: 'tv', icon: 'message-square', color: '#FBBF24' },
  { action: 'TV:CH_UP', label: 'Channel Up', shortLabel: 'Ch +', description: 'Next channel (8, 1)', category: 'tv', icon: 'arrow-up', color: '#34D399' },
  { action: 'TV:CH_DOWN', label: 'Channel Down', shortLabel: 'Ch -', description: 'Previous channel (8, 0)', category: 'tv', icon: 'arrow-down', color: '#60A5FA' },
  { action: 'TV:PREV_CH', label: 'Last Channel', shortLabel: 'Prev Ch', description: 'Return to previous channel (8, 2)', category: 'tv', icon: 'repeat', color: '#A78BFA' },
  { action: 'TV:PLAY', label: 'TV Play', shortLabel: 'TV Play', description: 'Resume TV playback (2, 3)', category: 'tv', icon: 'play', color: '#34D399' },
  { action: 'TV:PAUSE', label: 'TV Pause', shortLabel: 'TV Pause', description: 'Pause TV playback (2, 2)', category: 'tv', icon: 'pause', color: '#FBBF24' },
  { action: 'TV:STOP', label: 'TV Stop', shortLabel: 'TV Stop', description: 'Stop TV stream (2, 9)', category: 'tv', icon: 'phone-off', color: '#F87171' },
  { action: 'TV:REWIND', label: 'TV Rewind', shortLabel: 'Rewind', description: 'Rewind media (2, 1)', category: 'tv', icon: 'skip-back', color: '#60A5FA' },
  { action: 'TV:FFWD', label: 'TV Fast Forward', shortLabel: 'Fast Fwd', description: 'Fast forward media (2, 0)', category: 'tv', icon: 'skip-forward', color: '#60A5FA' },

  // APP:* SmartCast Streaming Apps (6)
  { action: 'APP:YOUTUBE', label: 'YouTube', shortLabel: 'YouTube', description: 'Launch YouTube on Smart TV', category: 'tv_app', icon: 'video', color: '#F87171' },
  { action: 'APP:DISNEY', label: 'Disney+', shortLabel: 'Disney+', description: 'Launch Disney+ on Smart TV', category: 'tv_app', icon: 'sparkles', color: '#60A5FA' },
  { action: 'APP:TUBI', label: 'Tubi', shortLabel: 'Tubi', description: 'Launch Tubi on Smart TV', category: 'tv_app', icon: 'clapperboard', color: '#FBBF24' },
  { action: 'APP:NETFLIX', label: 'Netflix', shortLabel: 'Netflix', description: 'Launch Netflix on Smart TV', category: 'tv_app', icon: 'tv', color: '#F87171' },
  { action: 'APP:PRIME', label: 'Prime Video', shortLabel: 'Prime', description: 'Launch Prime Video on Smart TV', category: 'tv_app', icon: 'play-circle', color: '#38BDF8' },
  { action: 'APP:APPLETV', label: 'Apple TV+', shortLabel: 'Apple TV+', description: 'Launch Apple TV+ on Smart TV', category: 'tv_app', icon: 'monitor', color: '#F3F4F6' }
];

const STATIC_MAP = new Map<string, FirmwareActionSpec>(
  FIRMWARE_STATIC_CATALOG.map(spec => [spec.action, spec])
);

export const FIRMWARE_SUPPORTED_KEYS = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'space', 'enter', 'esc', 'tab', 'backspace', 'delete', 'insert',
  'home', 'end', 'pageup', 'pagedown', 'up', 'down', 'left', 'right', 'capslock',
  'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12',
  'f13', 'f14', 'f15', 'f16', 'f17', 'f18', 'f19', 'f20', 'f21', 'f22', 'f23', 'f24',
  '-', '=', '[', ']', '\\', ';', '\'', ',', '.', '/', '`'
];

/**
 * Exact TypeScript equivalent of C++ isSupportedAction(const String& action)
 */
export function isValidFirmwareAction(action: string): boolean {
  if (!action || action.length < 3 || action.length > 128) return false;
  if (STATIC_MAP.has(action)) return true;

  if (action.startsWith('SHORTCUT:')) {
    const firstColon = action.indexOf(':');
    const secondColon = action.indexOf(':', firstColon + 1);
    return secondColon > firstColon && action.length > secondColon + 1;
  }
  if (action.startsWith('TVKEY:')) {
    const firstColon = action.indexOf(':');
    const secondColon = action.indexOf(':', firstColon + 1);
    return secondColon > firstColon && action.length > secondColon + 1;
  }
  if (action.startsWith('TVAPP:')) {
    const firstColon = action.indexOf(':');
    const secondColon = action.indexOf(':', firstColon + 1);
    return secondColon > firstColon && action.length > secondColon + 1;
  }
  if (action.startsWith('TEXT:') && action.length > 5) {
    return true;
  }
  return false;
}

/**
 * Exact TypeScript equivalent of C++ validAlias(const String& value)
 */
export function isValidFirmwareAlias(name: string): boolean {
  if (!name || name.length < 1 || name.length > 20) return false;
  if (name.startsWith(' ') || name.endsWith(' ')) return false;
  return /^[A-Za-z0-9 _-]+$/.test(name);
}

export function sanitizeFirmwareAlias(raw: string, fallback: HardwareProfileId = 'MAC'): string {
  const cleaned = raw.replace(/[^A-Za-z0-9 _-]/g, '').trim().slice(0, 20).trim();
  return cleaned || (fallback === 'MAC' ? 'Mac' : 'TV');
}

/**
 * Strip control characters (< 0x20 except \n, \r, \t) so ESP32 jsonString() never rejects escape sequences
 */
export function sanitizeSerialString(str: string, maxLen = 123): string {
  let out = '';
  for (let i = 0; i < str.length && out.length < maxLen; i++) {
    const code = str.charCodeAt(i);
    if (code === 10 || code === 13 || code === 9 || (code >= 0x20 && code <= 0x7e)) {
      out += str[i];
    }
  }
  return out;
}

export function normalizeBrowserKeyToFirmware(
  code: string,
  key: string,
  layout: KeyboardLayoutId = 'us_qwerty'
): string {
  if (layout === 'de_qwertz') {
    if (code === 'KeyY') return 'z';
    if (code === 'KeyZ') return 'y';
  }
  if (layout === 'fr_azerty') {
    if (code === 'KeyQ') return 'a';
    if (code === 'KeyA') return 'q';
    if (code === 'KeyW') return 'z';
    if (code === 'KeyZ') return 'w';
  }

  const lower = key.toLowerCase();
  if (key === ' ' || lower === 'spacebar' || lower === 'space') return 'space';
  if (lower === 'arrowup') return 'up';
  if (lower === 'arrowdown') return 'down';
  if (lower === 'arrowleft') return 'left';
  if (lower === 'arrowright') return 'right';
  if (lower === 'escape' || lower === 'esc') return 'esc';
  if (lower === 'enter' || lower === 'return') return 'enter';
  if (lower === 'backspace') return 'backspace';
  if (lower === 'delete' || lower === 'del') return 'delete';
  if (lower === 'tab') return 'tab';
  if (lower === 'insert') return 'insert';
  if (lower === 'home') return 'home';
  if (lower === 'end') return 'end';
  if (lower === 'pageup') return 'pageup';
  if (lower === 'pagedown') return 'pagedown';
  if (lower === 'capslock') return 'capslock';
  if (/^f([1-9]|1[0-9]|2[0-4])$/.test(lower)) return lower;
  if (key.length === 1) return key.toLowerCase();
  return lower;
}

export function buildFirmwareShortcut(mods: string[], key: string): string {
  const cleanKey = (key || 'c').trim().toLowerCase();
  const cleanMods = mods
    .map(m => m.trim().toLowerCase())
    .filter(m => ['cmd', 'gui', 'win', 'ctrl', 'alt', 'opt', 'shift'].includes(m));

  if (cleanMods.length === 0) {
    const upperKey = cleanKey.toUpperCase();
    if (['F13', 'F14', 'F15', 'F16'].includes(upperKey)) {
      return `KEY:${upperKey}`;
    }
    // Firmware requires secondColon > firstColon -> "SHORTCUT:none:key" or "SHORTCUT::key"
    // Note: in C++: firstColon = 8, secondColon = 9 (9 > 8 is true), mods = "" (no modifier pressed), key = cleanKey!
    return `SHORTCUT::${cleanKey}`;
  }

  return `SHORTCUT:${cleanMods.join(',')}:${cleanKey}`;
}

export function parseFirmwareShortcut(action: string): { mods: string[]; key: string } {
  if (action.startsWith('KEY:F')) {
    return { mods: [], key: action.slice(4).toLowerCase() };
  }
  if (!action.startsWith('SHORTCUT:')) {
    return { mods: ['cmd'], key: 'c' };
  }
  const firstColon = action.indexOf(':');
  const secondColon = action.indexOf(':', firstColon + 1);
  if (secondColon < 0) return { mods: ['cmd'], key: 'c' };
  const rawMods = action.slice(firstColon + 1, secondColon).trim();
  const key = action.slice(secondColon + 1).trim().toLowerCase() || 'c';
  const mods = rawMods
    ? rawMods
        .split(',')
        .map(m => m.trim().toLowerCase())
        .filter(Boolean)
    : [];
  return { mods, key };
}

export function formatShortcutPretty(action: string): string {
  const { mods, key } = parseFirmwareShortcut(action);
  const glyphMap: Record<string, string> = {
    cmd: '⌘',
    gui: '⌘',
    win: 'Win+',
    ctrl: '⌃',
    alt: '⌥',
    opt: '⌥',
    shift: '⇧'
  };
  const modPart = mods.map(m => glyphMap[m] || `${m.toUpperCase()}+`).join('');
  const specialLabels: Record<string, string> = {
    space: 'Space',
    enter: '↵',
    return: '↵',
    esc: 'Esc',
    escape: 'Esc',
    backspace: '⌫',
    delete: 'Del',
    del: 'Del',
    tab: 'Tab',
    up: '↑',
    down: '↓',
    left: '←',
    right: '→',
    pageup: 'PgUp',
    pagedown: 'PgDn',
    home: 'Home',
    end: 'End',
    capslock: 'Caps'
  };
  const keyPart = specialLabels[key] || key.toUpperCase();
  return `${modPart}${keyPart}`;
}

export function firmwareActionToBinding(actionStr: string | undefined | null): ActionBinding {
  const trimmed = (actionStr || '').trim();
  if (!trimmed) {
    return { type: 'none', value: '' };
  }

  const staticSpec = STATIC_MAP.get(trimmed);
  if (staticSpec) {
    return {
      type: staticSpec.category,
      value: staticSpec.action
    };
  }

  if (trimmed.startsWith('SHORTCUT:')) {
    return { type: 'shortcut', value: trimmed };
  }
  if (trimmed.startsWith('TEXT:')) {
    return { type: 'text', value: trimmed };
  }
  if (trimmed.startsWith('TVKEY:') || trimmed.startsWith('TV:')) {
    return { type: 'tv', value: trimmed };
  }
  if (trimmed.startsWith('TVAPP:') || trimmed.startsWith('APP:')) {
    return { type: 'tv_app', value: trimmed };
  }
  if (trimmed.startsWith('MACRO:')) {
    return { type: 'mac_macro', value: trimmed };
  }
  if (trimmed.startsWith('WIN:')) {
    return { type: 'win_macro', value: trimmed };
  }
  if (trimmed.startsWith('MEDIA:') || trimmed.startsWith('KEY:')) {
    return { type: 'media', value: trimmed };
  }

  return { type: 'none', value: '' };
}

export function bindingToFirmwareAction(binding: ActionBinding | undefined | null): string {
  if (!binding || binding.type === 'none' || !binding.value) {
    return '';
  }
  return binding.value.trim();
}

export function describeFirmwareAction(actionStr: string | undefined | null): {
  shortLabel: string;
  fullLabel: string;
  description: string;
  icon: string;
  color: string;
} {
  const trimmed = (actionStr || '').trim();
  if (!trimmed) {
    return {
      shortLabel: 'Unassigned',
      fullLabel: 'Not Synced / Unassigned',
      description: 'Connect USB to load from device or choose an action',
      icon: 'none',
      color: '#6B7280'
    };
  }

  const staticSpec = STATIC_MAP.get(trimmed);
  if (staticSpec) {
    return {
      shortLabel: staticSpec.shortLabel,
      fullLabel: staticSpec.label,
      description: `${staticSpec.description} (${staticSpec.action})`,
      icon: staticSpec.icon,
      color: staticSpec.color
    };
  }

  if (trimmed.startsWith('SHORTCUT:')) {
    const pretty = formatShortcutPretty(trimmed);
    return {
      shortLabel: pretty.slice(0, 12),
      fullLabel: `Shortcut: ${pretty}`,
      description: trimmed,
      icon: 'command',
      color: '#38BDF8'
    };
  }

  if (trimmed.startsWith('TEXT:')) {
    const snippet = trimmed.slice(5);
    const cleanPreview = snippet.replace(/\s+/g, ' ').trim();
    return {
      shortLabel: cleanPreview ? `"${cleanPreview.slice(0, 9)}"` : 'Text',
      fullLabel: `Text: "${cleanPreview.slice(0, 26)}${cleanPreview.length > 26 ? '…' : ''}"`,
      description: `BLE Typed Text (${snippet.length} chars)`,
      icon: 'file-text',
      color: '#34D399'
    };
  }

  if (trimmed.startsWith('TVKEY:')) {
    const parts = trimmed.split(':');
    return {
      shortLabel: `TV ${parts[1]}:${parts[2]}`,
      fullLabel: `SmartCast Key (${parts[1]}, ${parts[2]})`,
      description: trimmed,
      icon: 'tv',
      color: '#A78BFA'
    };
  }

  if (trimmed.startsWith('TVAPP:')) {
    const parts = trimmed.split(':');
    return {
      shortLabel: `App #${parts[1]}`,
      fullLabel: `SmartCast App ID ${parts[1]}`,
      description: trimmed,
      icon: 'clapperboard',
      color: '#FBBF24'
    };
  }

  return {
    shortLabel: trimmed.slice(0, 12),
    fullLabel: trimmed,
    description: trimmed,
    icon: 'zap',
    color: '#F3F4F6'
  };
}

export function deriveAppearanceForAction(
  actionStr: string,
  existing?: KeyAppearance
): KeyAppearance {
  const info = describeFirmwareAction(actionStr);
  return {
    label: existing?.customLabel ? existing.label : info.shortLabel,
    icon: existing?.customIcon ? existing.icon : info.icon,
    labelColor: existing?.customIcon || existing?.customLabel ? existing.labelColor : info.color,
    customLabel: existing?.customLabel,
    customIcon: existing?.customIcon
  };
}
