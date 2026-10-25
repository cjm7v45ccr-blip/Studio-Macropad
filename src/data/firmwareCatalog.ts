import {
  ActionBinding,
  ActionType,
  DeviceConnectionInfo,
  HardwareProfileId,
  HardwareSlotId,
  KeyAppearance,
  KeyboardLayoutId,
  TextMacroRepeatConfig
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
  b1: { short: 'Key 1', full: 'Key 1 (B1)', pin: 'GPIO 26' },
  b2: { short: 'Key 2', full: 'Key 2 (B2)', pin: 'GPIO 27' },
  b3: { short: 'Key 3', full: 'Key 3 (B3)', pin: 'GPIO 14' },
  b4: { short: 'Key 4', full: 'Key 4 (B4)', pin: 'GPIO 16' },
  dial: { short: 'Knob Press', full: 'Knob Press (Dial)', pin: 'GPIO 25' },
  enc_cw: { short: 'Turn Right', full: 'Turn Right (CW)', pin: 'GPIO 33/32' },
  enc_ccw: { short: 'Turn Left', full: 'Turn Left (CCW)', pin: 'GPIO 33/32' }
};

export const FACTORY_DEFAULT_SLOTS: Record<
  HardwareProfileId,
  Record<HardwareSlotId, string>
> = {
  MAC: {
    b1: 'MEDIA:PLAY_PAUSE',
    b2: 'KEY:F13',
    b3: 'KEY:F14',
    b4: 'KEY:F15',
    dial: 'MEDIA:MUTE',
    enc_cw: 'MEDIA:VOL_UP',
    enc_ccw: 'MEDIA:VOL_DOWN'
  },
  TV: {
    b1: 'TV:POWER',
    b2: 'APP:YOUTUBE',
    b3: 'APP:DISNEY',
    b4: 'APP:TUBI',
    dial: 'TV:MUTE',
    enc_cw: 'TV:VOL_UP',
    enc_ccw: 'TV:VOL_DOWN'
  }
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
  { action: 'WIN:SEARCH', label: 'Win Search (Win+S)', shortLabel: 'Win Search', description: 'Windows + S search bar', category: 'win_macro', icon: 'search', color: '#38BDF8' },
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
  'enter', 'tab', 'space', 'esc', 'backspace', 'delete',
  'up', 'down', 'left', 'right', 'home', 'end', 'pageup', 'pagedown', 'insert', 'capslock',
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12',
  'f13', 'f14', 'f15', 'f16', 'f17', 'f18', 'f19', 'f20', 'f21', 'f22', 'f23', 'f24',
  '-', '=', '[', ']', '\\', ';', '\'', ',', '.', '/', '`'
];

const SUPPORTED_KEYS_SET = new Set<string>(FIRMWARE_SUPPORTED_KEYS);
const SUPPORTED_MODS_SET = new Set<string>(['cmd', 'gui', 'win', 'ctrl', 'alt', 'opt', 'shift']);

export function isSupportedFirmwareKey(key: string): boolean {
  return SUPPORTED_KEYS_SET.has((key || '').trim().toLowerCase());
}

export const DEFAULT_TEXT_REPEAT_CONFIG: TextMacroRepeatConfig = {
  text: '',
  followUpKey: '',
  keyDelayMs: 0,
  repeatCount: 1,
  loopUntilStopped: false,
  repeatDelayMs: 500
};

/**
 * Validates raw text snippet input for firmware 2.1.0:
 * - Maximum 123 characters (or 122 if native trailing Enter is appended)
 * - Rejects quotes (`"`), backslashes (`\`), and non-ASCII (`< 0x20` or `> 0x7E`)
 */
export function validateTextMacroInput(
  raw: string,
  maxChars = 123
): { valid: boolean; error: string | null } {
  if (raw.length > maxChars) {
    return {
      valid: false,
      error: `Text snippet stops at ${maxChars} characters.`
    };
  }
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const code = raw.charCodeAt(i);
    if (ch === '"' || ch === '“' || ch === '”') {
      return {
        valid: false,
        error: 'Quotes (") are not allowed in firmware text snippets.'
      };
    }
    if (ch === '\\') {
      return {
        valid: false,
        error: 'Backslashes (\\) are not allowed in firmware text snippets.'
      };
    }
    if (code < 0x20 || code > 0x7e) {
      return {
        valid: false,
        error:
          code === 10 || code === 13
            ? 'Line breaks are not allowed in text — choose ENTER in the Button / Key menu instead.'
            : 'Non-ASCII characters are not supported by BLE HID text snippets.'
      };
    }
  }
  return { valid: true, error: null };
}

export function isValidFirmwareAction(action: string): boolean {
  if (!action || action.length < 3 || action.length > 128) return false;
  if (STATIC_MAP.has(action)) return true;

  if (action.startsWith('SHORTCUT:')) {
    const firstColon = action.indexOf(':');
    const secondColon = action.indexOf(':', firstColon + 1);
    if (secondColon <= firstColon || action.length <= secondColon + 1) return false;
    const rawMods = action.slice(firstColon + 1, secondColon).trim();
    const key = action.slice(secondColon + 1).trim().toLowerCase();
    if (!isSupportedFirmwareKey(key)) return false;
    if (rawMods) {
      const mods = rawMods.split(',').map(m => m.trim().toLowerCase());
      if (mods.some(m => !SUPPORTED_MODS_SET.has(m))) return false;
    }
    return true;
  }
  if (action.startsWith('TVKEY:')) {
    const parts = action.split(':');
    if (parts.length !== 3) return false;
    const cs = Number(parts[1]);
    const cd = Number(parts[2]);
    return Number.isInteger(cs) && cs >= 0 && Number.isInteger(cd) && cd >= 0;
  }
  if (action.startsWith('TVAPP:')) {
    const firstColon = action.indexOf(':');
    const secondColon = action.indexOf(':', firstColon + 1);
    return secondColon > firstColon && action.length > secondColon + 1;
  }
  if (action.startsWith('TEXT:') && action.length > 5) {
    const body = action.slice(5);
    const strippedTrailingNewline = body.endsWith('\n') ? body.slice(0, -1) : body;
    if (body.length > 123) return false;
    const check = validateTextMacroInput(strippedTrailingNewline, 123);
    return check.valid;
  }
  return false;
}

export function validateFirmwareAlias(name: string): { valid: boolean; error: string | null } {
  if (!name || name.trim().length < 1) {
    return { valid: false, error: 'Profile name cannot be empty.' };
  }
  if (name.length > 20) {
    return { valid: false, error: 'Profile name must be 20 characters or fewer.' };
  }
  if (name.startsWith(' ') || name.endsWith(' ')) {
    return { valid: false, error: 'Profile name cannot start or end with a space.' };
  }
  if (!/^[A-Za-z0-9 _-]+$/.test(name)) {
    return {
      valid: false,
      error: 'Only letters, numbers, spaces, hyphens (-), and underscores (_) are allowed.'
    };
  }
  return { valid: true, error: null };
}

export function isValidFirmwareAlias(name: string): boolean {
  return validateFirmwareAlias(name).valid;
}

export function sanitizeFirmwareAlias(raw: string, fallback: HardwareProfileId = 'MAC'): string {
  const cleaned = raw.replace(/[^A-Za-z0-9 _-]/g, '').trim().slice(0, 20).trim();
  return cleaned || (fallback === 'MAC' ? 'Mac' : 'TV');
}

export function sanitizeSerialString(str: string, maxLen = 123): string {
  let out = '';
  for (let i = 0; i < str.length && out.length < maxLen; i++) {
    const ch = str[i];
    const code = str.charCodeAt(i);
    if (ch === '"' || ch === '\\') continue;
    if (code >= 0x20 && code <= 0x7e) {
      out += ch;
    }
  }
  return out;
}

export function isTvFirmwareAction(action: string): boolean {
  return (
    action.startsWith('TV:') ||
    action.startsWith('APP:') ||
    action.startsWith('TVKEY:') ||
    action.startsWith('TVAPP:')
  );
}

/**
 * Checks whether an action can currently be tested live on the pad,
 * and returns a clear human-readable explanation if Bluetooth or TV link is down.
 */
export function getActionTestAvailability(
  actionStr: string,
  connection: DeviceConnectionInfo
): { canTest: boolean; reason: string | null } {
  if (!actionStr || !isValidFirmwareAction(actionStr)) {
    return { canTest: false, reason: 'Choose a valid action first.' };
  }
  if (!connection.connected) {
    return { canTest: false, reason: 'Connect the USB pad (or start demo mode) to test.' };
  }
  const tel = connection.telemetry;
  if (!tel) {
    return { canTest: true, reason: null };
  }

  if (isTvFirmwareAction(actionStr)) {
    if (!tel.wifiConnected) {
      return {
        canTest: false,
        reason: 'TV link down: Pad is not connected to Wi-Fi.'
      };
    }
    if (!tel.tvConfigured && !tel.tvPaired) {
      return {
        canTest: false,
        reason: 'TV link down: No Vizio TV paired in Settings.'
      };
    }
    if (!tel.tvPaired) {
      return {
        canTest: false,
        reason: 'TV link down: Vizio TV pairing is incomplete in Settings.'
      };
    }
    return { canTest: true, reason: null };
  }

  // Otherwise BLE HID action (MEDIA:, KEY:, MACRO:, WIN:, SHORTCUT:, TEXT:)
  if (!tel.bleConnected) {
    return {
      canTest: false,
      reason: 'Bluetooth is disconnected — pair your computer with "Studio Pad".'
    };
  }
  return { canTest: true, reason: null };
}

const CODE_PUNCTUATION_MAP: Record<string, string> = {
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  IntlBackslash: '\\',
  Semicolon: ';',
  Quote: '\'',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`'
};

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

  // Map physical letter & number codes first so Shift+4 ('$') records as '4', Option+key records cleanly, etc.
  if (/^Key([A-Z])$/.test(code)) {
    return code.slice(3).toLowerCase();
  }
  if (/^Digit([0-9])$/.test(code)) {
    return code.slice(5);
  }
  if (CODE_PUNCTUATION_MAP[code]) {
    return CODE_PUNCTUATION_MAP[code];
  }
  if (/^F([1-9]|1[0-9]|2[0-4])$/i.test(code)) {
    return code.toLowerCase();
  }

  const lower = (key || '').toLowerCase();
  if (code === 'Space' || key === ' ' || lower === 'spacebar' || lower === 'space') return 'space';
  if (code === 'ArrowUp' || lower === 'arrowup') return 'up';
  if (code === 'ArrowDown' || lower === 'arrowdown') return 'down';
  if (code === 'ArrowLeft' || lower === 'arrowleft') return 'left';
  if (code === 'ArrowRight' || lower === 'arrowright') return 'right';
  if (code === 'Escape' || lower === 'escape' || lower === 'esc') return 'esc';
  if (code === 'Enter' || lower === 'enter' || lower === 'return') return 'enter';
  if (code === 'Backspace' || lower === 'backspace') return 'backspace';
  if (code === 'Delete' || lower === 'delete' || lower === 'del') return 'delete';
  if (code === 'Tab' || lower === 'tab') return 'tab';
  if (code === 'Insert' || lower === 'insert') return 'insert';
  if (code === 'Home' || lower === 'home') return 'home';
  if (code === 'End' || lower === 'end') return 'end';
  if (code === 'PageUp' || lower === 'pageup') return 'pageup';
  if (code === 'PageDown' || lower === 'pagedown') return 'pagedown';
  if (code === 'CapsLock' || lower === 'capslock') return 'capslock';
  if (/^f([1-9]|1[0-9]|2[0-4])$/.test(lower)) return lower;
  if (key && key.length === 1 && SUPPORTED_KEYS_SET.has(lower)) return lower;
  return lower || code.toLowerCase();
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

/**
 * Build the base single-step ESP32 firmware action for a Text/Button Repeat configuration.
 * - If text + Enter with 0ms key delay -> `TEXT:<text>\n` (executes natively on ESP32!)
 * - If text + other key or custom key delay -> `TEXT:<text>` (follow-up key & repeats run over USB)
 * - If button-only (empty text + followUpKey) -> `SHORTCUT::<key>` or `KEY:F13..16`
 */
export function buildFirmwareActionFromTextConfig(cfg: TextMacroRepeatConfig): string {
  const hasNativeTrailingNewline =
    cfg.text.length > 0 && cfg.followUpKey === 'enter' && cfg.keyDelayMs <= 0;
  const maxTextChars = hasNativeTrailingNewline ? 122 : 123;
  const check = validateTextMacroInput(cfg.text, maxTextChars);
  if (!check.valid) return '';

  if (cfg.text.length > 0) {
    return hasNativeTrailingNewline ? `TEXT:${cfg.text}\n` : `TEXT:${cfg.text}`;
  }

  if (cfg.followUpKey && isSupportedFirmwareKey(cfg.followUpKey)) {
    return buildFirmwareShortcut([], cfg.followUpKey);
  }

  return '';
}

/**
 * Reconstruct a TextMacroRepeatConfig from an existing `TEXT:...` action and optional saved metadata
 */
export function parseTextConfigFromFirmwareAction(
  action: string,
  savedConfig?: TextMacroRepeatConfig
): TextMacroRepeatConfig {
  if (savedConfig) {
    return { ...savedConfig };
  }
  if (action.startsWith('TEXT:')) {
    const rawBody = action.slice(5);
    if (rawBody.endsWith('\n') && rawBody.length > 1) {
      return {
        ...DEFAULT_TEXT_REPEAT_CONFIG,
        text: rawBody.slice(0, -1),
        followUpKey: 'enter'
      };
    }
    return {
      ...DEFAULT_TEXT_REPEAT_CONFIG,
      text: rawBody
    };
  }
  if (action.startsWith('SHORTCUT::') || action.startsWith('KEY:F')) {
    const parsed = parseFirmwareShortcut(action);
    if (parsed.mods.length === 0) {
      return {
        ...DEFAULT_TEXT_REPEAT_CONFIG,
        text: '',
        followUpKey: parsed.key
      };
    }
  }
  return { ...DEFAULT_TEXT_REPEAT_CONFIG };
}

/**
 * Returns true if the config requires USB follow-up actions beyond the ESP32's single base action
 */
export function requiresUsbSequenceExecution(cfg?: TextMacroRepeatConfig): boolean {
  if (!cfg) return false;
  if (cfg.loopUntilStopped || cfg.repeatCount > 1) return true;
  if (cfg.text.length > 0 && cfg.followUpKey) {
    if (cfg.followUpKey !== 'enter' || cfg.keyDelayMs > 0) {
      return true;
    }
  }
  return false;
}

export function formatTextRepeatSummary(cfg: TextMacroRepeatConfig): {
  shortLabel: string;
  fullLabel: string;
} {
  const cleanPreview = cfg.text.replace(/\s+/g, ' ').trim();
  const keyBadge = cfg.followUpKey ? cfg.followUpKey.toUpperCase() : '';
  const repeatPart = cfg.loopUntilStopped
    ? `Loop @ ${cfg.repeatDelayMs}ms`
    : cfg.repeatCount > 1
    ? `${cfg.repeatCount}× @ ${cfg.repeatDelayMs}ms`
    : cfg.keyDelayMs > 0 && keyBadge
    ? `+${cfg.keyDelayMs}ms`
    : '';

  const baseShort = cleanPreview
    ? keyBadge
      ? `"${cleanPreview.slice(0, 6)}"+${keyBadge}`
      : `"${cleanPreview.slice(0, 9)}"`
    : keyBadge || 'Text';

  const shortLabel =
    cfg.loopUntilStopped
      ? `∞ ${baseShort}`.slice(0, 12)
      : cfg.repeatCount > 1
      ? `${cfg.repeatCount}× ${baseShort}`.slice(0, 12)
      : baseShort.slice(0, 12);

  const pieces: string[] = [];
  if (cleanPreview) {
    pieces.push(`"${cleanPreview.slice(0, 22)}${cleanPreview.length > 22 ? '…' : ''}"`);
  }
  if (keyBadge) {
    pieces.push(cfg.keyDelayMs > 0 ? `(${cfg.keyDelayMs}ms → ${keyBadge})` : `+ ${keyBadge}`);
  }
  if (repeatPart && (cfg.loopUntilStopped || cfg.repeatCount > 1)) {
    pieces.push(`[${repeatPart}]`);
  }

  return {
    shortLabel,
    fullLabel: pieces.join(' ') || 'Text Macro'
  };
}

export function firmwareActionToBinding(
  actionStr: string | undefined | null,
  repeatConfig?: TextMacroRepeatConfig
): ActionBinding {
  const raw = actionStr || '';
  const trimmed = raw.startsWith('TEXT:') ? raw.replace(/^\s+/, '') : raw.trim();
  if (!trimmed || trimmed === 'TEXT:') {
    return { type: 'none', value: '' };
  }

  if (repeatConfig) {
    return {
      type: 'text',
      value: trimmed,
      repeatConfig
    };
  }

  const staticSpec = STATIC_MAP.get(trimmed);
  if (staticSpec) {
    return {
      type: staticSpec.category,
      value: staticSpec.action
    };
  }

  if (trimmed.startsWith('TEXT:')) {
    const parsedCfg = parseTextConfigFromFirmwareAction(trimmed);
    return {
      type: 'text',
      value: trimmed,
      repeatConfig: parsedCfg.followUpKey ? parsedCfg : undefined
    };
  }
  if (trimmed.startsWith('SHORTCUT:')) {
    return { type: 'shortcut', value: trimmed };
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
  if (binding.value.startsWith('TEXT:')) {
    return binding.value;
  }
  return binding.value.trim();
}

export function describeFirmwareAction(
  actionStr: string | undefined | null,
  repeatConfig?: TextMacroRepeatConfig
): {
  shortLabel: string;
  fullLabel: string;
  description: string;
  icon: string;
  color: string;
} {
  const raw = actionStr || '';
  const trimmed = raw.startsWith('TEXT:') ? raw : raw.trim();
  if (!trimmed) {
    return {
      shortLabel: 'Unassigned',
      fullLabel: 'Not Synced / Unassigned',
      description: 'Connect USB to load from device or choose an action',
      icon: 'none',
      color: '#6B7280'
    };
  }

  if (repeatConfig && (repeatConfig.text || repeatConfig.followUpKey)) {
    const summary = formatTextRepeatSummary(repeatConfig);
    return {
      shortLabel: summary.shortLabel,
      fullLabel: summary.fullLabel,
      description: trimmed.replace(/\n/g, '\\n'),
      icon: repeatConfig.loopUntilStopped || repeatConfig.repeatCount > 1 ? 'repeat' : 'file-text',
      color: '#34D399'
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
    const parsed = parseTextConfigFromFirmwareAction(trimmed);
    const summary = formatTextRepeatSummary(parsed);
    return {
      shortLabel: summary.shortLabel,
      fullLabel: summary.fullLabel,
      description: `BLE Typed Text (${trimmed.slice(5).length} chars)`,
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
  existing?: KeyAppearance,
  repeatConfig?: TextMacroRepeatConfig
): KeyAppearance {
  const info = describeFirmwareAction(actionStr, repeatConfig);
  return {
    label: existing?.customLabel ? existing.label : info.shortLabel,
    icon: existing?.customIcon ? existing.icon : info.icon,
    labelColor: existing?.customIcon || existing?.customLabel ? existing.labelColor : info.color,
    customLabel: existing?.customLabel,
    customIcon: existing?.customIcon
  };
}
