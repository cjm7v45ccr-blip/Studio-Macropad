import {
  ActionBinding,
  ActionType,
  CustomMacroItem,
  DeviceConnectionInfo,
  HardwareProfileId,
  HardwareSlotId,
  HostOsType,
  KeyAppearance,
  KeyboardLayoutId,
  MacroStepActionType,
  MacroStepConfig,
  SlotRepeatMap,
  TextMacroRepeatConfig,
  defaultProfileAlias
} from '../types/studio';

export const HARDWARE_SLOTS: readonly HardwareSlotId[] = [
  'b1',
  'b2',
  'b3',
  'b4',
  'b5',
  'b6',
  'b7',
  'b8',
  'dial',
  'enc_cw',
  'enc_ccw',
  'dial2',
  'e2_cw',
  'e2_ccw'
] as const;

export const SLOT_LABELS: Record<HardwareSlotId, { short: string; full: string; pin: string }> = {
  b1: { short: 'Key 1', full: 'Key 1 (B1)', pin: '' },
  b2: { short: 'Key 2', full: 'Key 2 (B2)', pin: '' },
  b3: { short: 'Key 3', full: 'Key 3 (B3)', pin: '' },
  b4: { short: 'Key 4', full: 'Key 4 (B4)', pin: '' },
  b5: { short: 'Key 5', full: 'Key 5 (B5)', pin: '' },
  b6: { short: 'Key 6', full: 'Key 6 (B6)', pin: '' },
  b7: { short: 'Key 7', full: 'Key 7 (B7)', pin: '' },
  b8: { short: 'Key 8', full: 'Key 8 (B8)', pin: '' },
  dial: { short: 'K1 Press', full: 'Knob 1 Press (Dial 1)', pin: 'GPIO 25' },
  enc_cw: { short: 'K1 Right', full: 'Knob 1 Turn Right (CW)', pin: 'GPIO 32 / 33' },
  enc_ccw: { short: 'K1 Left', full: 'Knob 1 Turn Left (CCW)', pin: 'GPIO 32 / 33' },
  dial2: { short: 'K2 Press', full: 'Knob 2 Press (Dial 2)', pin: 'GPIO 15' },
  e2_cw: { short: 'K2 Right', full: 'Knob 2 Turn Right (CW)', pin: 'GPIO 34 / 35' },
  e2_ccw: { short: 'K2 Left', full: 'Knob 2 Turn Left (CCW)', pin: 'GPIO 34 / 35' }
};

export const UNIVERSAL_BLE_DEFAULT_SLOTS: Record<HardwareSlotId, string> = {
  b1: 'MEDIA:PLAY_PAUSE',
  b2: 'MEDIA:NEXT',
  b3: 'MEDIA:PREV',
  b4: 'MEDIA:MUTE',
  b5: 'KEY:F13',
  b6: 'KEY:F14',
  b7: 'KEY:F15',
  b8: 'BLE:NEXT_HOST',
  dial: 'MEDIA:MUTE',
  enc_cw: 'MEDIA:VOL_UP',
  enc_ccw: 'MEDIA:VOL_DOWN',
  dial2: 'MEDIA:PLAY_PAUSE',
  e2_cw: 'MEDIA:NEXT',
  e2_ccw: 'MEDIA:PREV'
};

export const FACTORY_DEFAULT_SLOTS: Record<
  HardwareProfileId,
  Record<HardwareSlotId, string>
> = {
  HOST1: { ...UNIVERSAL_BLE_DEFAULT_SLOTS },
  HOST2: { ...UNIVERSAL_BLE_DEFAULT_SLOTS },
  HOST3: { ...UNIVERSAL_BLE_DEFAULT_SLOTS },
  TV: {
    b1: 'TV:POWER',
    b2: 'APP:YOUTUBE',
    b3: 'APP:DISNEY',
    b4: 'APP:TUBI',
    b5: 'APP:NETFLIX',
    b6: 'APP:PRIME',
    b7: 'TV:INFO',
    b8: 'TV:HOME',
    dial: 'TV:MUTE',
    enc_cw: 'TV:VOL_UP',
    enc_ccw: 'TV:VOL_DOWN',
    dial2: 'TV:OK',
    e2_cw: 'TV:CH_UP',
    e2_ccw: 'TV:CH_DOWN'
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
  { action: 'KEY:F13', label: 'F13 Function Key', shortLabel: 'F13', description: 'BLE Aux function key F13', category: 'media', icon: 'zap', color: '#A78BFA' },
  { action: 'KEY:F14', label: 'F14 Function Key', shortLabel: 'F14', description: 'BLE Aux function key F14', category: 'media', icon: 'sparkles', color: '#38BDF8' },
  { action: 'KEY:F15', label: 'F15 Function Key', shortLabel: 'F15', description: 'BLE Aux function key F15', category: 'media', icon: 'sliders', color: '#34D399' },
  { action: 'KEY:F16', label: 'F16 Function Key', shortLabel: 'F16', description: 'BLE Aux function key F16', category: 'media', icon: 'layers', color: '#FBBF24' },

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
  { action: 'MACRO:CLOSE_TAB', label: 'Close Tab (⌘W)', shortLabel: 'Close Tab', description: 'macOS Command + W', category: 'mac_macro', icon: 'x', color: '#F87171' },

  // WIN:* Windows Built-ins (16)
  { action: 'WIN:COPY', label: 'Copy (Ctrl+C)', shortLabel: 'Copy', description: 'Windows Ctrl + C', category: 'win_macro', icon: 'copy', color: '#38BDF8' },
  { action: 'WIN:PASTE', label: 'Paste (Ctrl+V)', shortLabel: 'Paste', description: 'Windows Ctrl + V', category: 'win_macro', icon: 'paste', color: '#38BDF8' },
  { action: 'WIN:CUT', label: 'Cut (Ctrl+X)', shortLabel: 'Cut', description: 'Windows Ctrl + X', category: 'win_macro', icon: 'scissors', color: '#F472B6' },
  { action: 'WIN:UNDO', label: 'Undo (Ctrl+Z)', shortLabel: 'Undo', description: 'Windows Ctrl + Z', category: 'win_macro', icon: 'undo', color: '#FBBF24' },
  { action: 'WIN:REDO', label: 'Redo (Ctrl+Y)', shortLabel: 'Redo', description: 'Windows Ctrl + Y', category: 'win_macro', icon: 'redo', color: '#FBBF24' },
  { action: 'WIN:SELECT_ALL', label: 'Select All (Ctrl+A)', shortLabel: 'Select All', description: 'Windows Ctrl + A', category: 'win_macro', icon: 'check-square', color: '#A78BFA' },
  { action: 'WIN:SAVE', label: 'Save (Ctrl+S)', shortLabel: 'Save', description: 'Windows Ctrl + S', category: 'win_macro', icon: 'save', color: '#34D399' },
  { action: 'WIN:NEW_TAB', label: 'New Tab (Ctrl+T)', shortLabel: 'New Tab', description: 'Windows Ctrl + T', category: 'win_macro', icon: 'globe', color: '#34D399' },
  { action: 'WIN:CLOSE_TAB', label: 'Close Tab (Ctrl+W)', shortLabel: 'Close Tab', description: 'Windows Ctrl + W', category: 'win_macro', icon: 'x', color: '#F87171' },
  { action: 'WIN:LOCK', label: 'Lock Screen (Win+L)', shortLabel: 'Lock', description: 'Windows + L lock screen', category: 'win_macro', icon: 'lock', color: '#F87171' },
  { action: 'WIN:SEARCH', label: 'Search (Win+S)', shortLabel: 'Search', description: 'Windows + S search bar', category: 'win_macro', icon: 'search', color: '#38BDF8' },
  { action: 'WIN:EXPLORER', label: 'File Explorer (Win+E)', shortLabel: 'Explorer', description: 'Windows + E File Explorer', category: 'win_macro', icon: 'folder', color: '#FBBF24' },
  { action: 'WIN:TASK_MGR', label: 'Task Manager', shortLabel: 'Task Mgr', description: 'Ctrl + Shift + Esc', category: 'win_macro', icon: 'terminal', color: '#A78BFA' },
  { action: 'WIN:SNIP', label: 'Screenshot Snip', shortLabel: 'Snip', description: 'Win + Shift + S screen snip', category: 'win_macro', icon: 'camera', color: '#34D399' },
  { action: 'WIN:DESKTOP', label: 'Show Desktop (Win+D)', shortLabel: 'Desktop', description: 'Windows + D toggle desktop', category: 'win_macro', icon: 'monitor', color: '#60A5FA' },
  { action: 'WIN:RUN', label: 'Run Dialog (Win+R)', shortLabel: 'Run', description: 'Windows + R command prompt', category: 'win_macro', icon: 'play-circle', color: '#38BDF8' },

  // BLE:* Multi-Host Bluetooth Engine (4)
  { action: 'BLE:HOST1', label: 'Device 1 (Studio Pad 1)', shortLabel: 'Device 1', description: 'Switch to Device 1 virtual MAC (Studio Pad 1)', category: 'ble', icon: 'bluetooth', color: '#38BDF8' },
  { action: 'BLE:HOST2', label: 'Device 2 (Studio Pad 2)', shortLabel: 'Device 2', description: 'Switch to Device 2 virtual MAC (Studio Pad 2)', category: 'ble', icon: 'bluetooth', color: '#60A5FA' },
  { action: 'BLE:HOST3', label: 'Device 3 (Studio Pad 3)', shortLabel: 'Device 3', description: 'Switch to Device 3 virtual MAC (Studio Pad 3)', category: 'ble', icon: 'bluetooth', color: '#818CF8' },
  { action: 'BLE:NEXT_HOST', label: 'Next BLE Device (Cycle 1–3)', shortLabel: 'Next Host', description: 'Cycle active Bluetooth device (Studio Pad 1 → 2 → 3)', category: 'ble', icon: 'bluetooth', color: '#34D399' },

  // TV:* SmartCast Remote (25)
  { action: 'TV:POWER', label: 'TV Power', shortLabel: 'TV Power', description: 'SmartCast power toggle (11, 2)', category: 'tv', icon: 'power', color: '#F87171' },
  { action: 'TV:VOL_UP', label: 'TV Volume +', shortLabel: 'TV Vol +', description: 'Increase TV volume (5, 1)', category: 'tv', icon: 'volume-2', color: '#34D399' },
  { action: 'TV:VOL_DOWN', label: 'TV Volume -', shortLabel: 'TV Vol -', description: 'Decrease TV volume (5, 0)', category: 'tv', icon: 'volume-1', color: '#60A5FA' },
  { action: 'TV:MUTE', label: 'TV Mute', shortLabel: 'TV Mute', description: 'Mute TV audio (5, 4)', category: 'tv', icon: 'volume-x', color: '#FBBF24' },
  { action: 'TV:HOME', label: 'TV Home', shortLabel: 'TV Home', description: 'SmartCast Home screen (4, 3)', category: 'tv', icon: 'tv', color: '#38BDF8' },
  { action: 'TV:INPUT', label: 'TV Input', shortLabel: 'Input', description: 'Cycle HDMI / Input source (7, 1)', category: 'tv', icon: 'monitor-up', color: '#A78BFA' },
  { action: 'TV:OK', label: 'TV OK / Select', shortLabel: 'TV OK', description: 'Confirm selection (3, 2)', category: 'tv', icon: 'check-square', color: '#34D399' },
  { action: 'TV:BACK', label: 'TV Back', shortLabel: 'TV Back', description: 'Navigate back (4, 0)', category: 'tv', icon: 'undo', color: '#F3F4F6' },
  { action: 'TV:EXIT', label: 'TV Exit', shortLabel: 'TV Exit', description: 'Close TV overlay (9, 0)', category: 'tv', icon: 'x', color: '#F87171' },
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
  { action: 'TV:STOP', label: 'TV Stop', shortLabel: 'TV Stop', description: 'Stop TV stream (2, 9)', category: 'tv', icon: 'square', color: '#F87171' },
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

export interface UnifiedShortcutSpec {
  id: string;
  label: string;
  shortcutHint: string;
  action: string;
  icon: string;
  color: string;
  description: string;
}

const MAC_TO_WIN_ACTION_MAP: Record<string, string> = {
  'MACRO:COPY': 'WIN:COPY',
  'MACRO:PASTE': 'WIN:PASTE',
  'MACRO:CUT': 'WIN:CUT',
  'MACRO:UNDO': 'WIN:UNDO',
  'MACRO:REDO': 'WIN:REDO',
  'MACRO:SELECT_ALL': 'WIN:SELECT_ALL',
  'MACRO:SAVE': 'WIN:SAVE',
  'MACRO:NEW_TAB': 'WIN:NEW_TAB',
  'MACRO:CLOSE_TAB': 'WIN:CLOSE_TAB',
  'MACRO:SPOTLIGHT': 'WIN:SEARCH',
  'MACRO:LOCK': 'WIN:LOCK',
  'SHORTCUT:cmd,shift:4': 'WIN:SNIP',
  'SHORTCUT:cmd,shift:p': 'SHORTCUT:ctrl,shift:p',
  'SHORTCUT:cmd:r': 'SHORTCUT:ctrl:r',
  'SHORTCUT:cmd,shift:t': 'SHORTCUT:ctrl,shift:t',
  'SHORTCUT:cmd:tab': 'SHORTCUT:alt:tab'
};

const WIN_TO_MAC_ACTION_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(MAC_TO_WIN_ACTION_MAP).map(([m, w]) => [w, m])
);

export function getShortcutsForHostOs(os: HostOsType): UnifiedShortcutSpec[] {
  if (os === 'mac') {
    return [
      { id: 'copy', label: 'Copy', shortcutHint: '⌘C', action: 'MACRO:COPY', icon: 'copy', color: '#60A5FA', description: 'Copy selection to clipboard' },
      { id: 'paste', label: 'Paste', shortcutHint: '⌘V', action: 'MACRO:PASTE', icon: 'paste', color: '#60A5FA', description: 'Paste from clipboard' },
      { id: 'cut', label: 'Cut', shortcutHint: '⌘X', action: 'MACRO:CUT', icon: 'scissors', color: '#F472B6', description: 'Cut selection' },
      { id: 'undo', label: 'Undo', shortcutHint: '⌘Z', action: 'MACRO:UNDO', icon: 'undo', color: '#FBBF24', description: 'Undo last change' },
      { id: 'redo', label: 'Redo', shortcutHint: '⌘⇧Z', action: 'MACRO:REDO', icon: 'redo', color: '#FBBF24', description: 'Redo last change' },
      { id: 'select_all', label: 'Select All', shortcutHint: '⌘A', action: 'MACRO:SELECT_ALL', icon: 'check-square', color: '#A78BFA', description: 'Select all content' },
      { id: 'save', label: 'Save', shortcutHint: '⌘S', action: 'MACRO:SAVE', icon: 'save', color: '#34D399', description: 'Save current file' },
      { id: 'new_tab', label: 'New Tab', shortcutHint: '⌘T', action: 'MACRO:NEW_TAB', icon: 'globe', color: '#34D399', description: 'Open new browser or editor tab' },
      { id: 'close_tab', label: 'Close Tab', shortcutHint: '⌘W', action: 'MACRO:CLOSE_TAB', icon: 'x', color: '#F87171', description: 'Close active tab or window' },
      { id: 'search', label: 'Spotlight Search', shortcutHint: '⌘Space', action: 'MACRO:SPOTLIGHT', icon: 'search', color: '#38BDF8', description: 'Open macOS Spotlight search' },
      { id: 'screenshot', label: 'Screenshot', shortcutHint: '⌘⇧4', action: 'SHORTCUT:cmd,shift:4', icon: 'camera', color: '#34D399', description: 'Capture screen region' },
      { id: 'lock', label: 'Lock Screen', shortcutHint: '⌃⌘Q', action: 'MACRO:LOCK', icon: 'lock', color: '#F87171', description: 'Lock Mac immediately' },
      { id: 'cmd_palette', label: 'Command Palette', shortcutHint: '⌘⇧P', action: 'SHORTCUT:cmd,shift:p', icon: 'code', color: '#A78BFA', description: 'Open IDE command palette' },
      { id: 'switch_app', label: 'Switch App', shortcutHint: '⌘Tab', action: 'SHORTCUT:cmd:tab', icon: 'layers', color: '#60A5FA', description: 'Switch to previous application' },
      { id: 'reopen_tab', label: 'Reopen Closed Tab', shortcutHint: '⌘⇧T', action: 'SHORTCUT:cmd,shift:t', icon: 'redo', color: '#34D399', description: 'Restore closed browser tab' },
      { id: 'reload', label: 'Reload Page', shortcutHint: '⌘R', action: 'SHORTCUT:cmd:r', icon: 'repeat', color: '#38BDF8', description: 'Refresh active page' }
    ];
  }

  const superLabel = os === 'linux' ? 'Super' : 'Win';
  return [
    { id: 'copy', label: 'Copy', shortcutHint: 'Ctrl+C', action: 'WIN:COPY', icon: 'copy', color: '#38BDF8', description: 'Copy selection to clipboard' },
    { id: 'paste', label: 'Paste', shortcutHint: 'Ctrl+V', action: 'WIN:PASTE', icon: 'paste', color: '#38BDF8', description: 'Paste from clipboard' },
    { id: 'cut', label: 'Cut', shortcutHint: 'Ctrl+X', action: 'WIN:CUT', icon: 'scissors', color: '#F472B6', description: 'Cut selection' },
    { id: 'undo', label: 'Undo', shortcutHint: 'Ctrl+Z', action: 'WIN:UNDO', icon: 'undo', color: '#FBBF24', description: 'Undo last change' },
    { id: 'redo', label: 'Redo', shortcutHint: 'Ctrl+Y', action: 'WIN:REDO', icon: 'redo', color: '#FBBF24', description: 'Redo last change' },
    { id: 'select_all', label: 'Select All', shortcutHint: 'Ctrl+A', action: 'WIN:SELECT_ALL', icon: 'check-square', color: '#A78BFA', description: 'Select all content' },
    { id: 'save', label: 'Save', shortcutHint: 'Ctrl+S', action: 'WIN:SAVE', icon: 'save', color: '#34D399', description: 'Save current file' },
    { id: 'new_tab', label: 'New Tab', shortcutHint: 'Ctrl+T', action: 'WIN:NEW_TAB', icon: 'globe', color: '#34D399', description: 'Open new browser or editor tab' },
    { id: 'close_tab', label: 'Close Tab', shortcutHint: 'Ctrl+W', action: 'WIN:CLOSE_TAB', icon: 'x', color: '#F87171', description: 'Close active tab' },
    { id: 'search', label: 'Search', shortcutHint: `${superLabel}+S`, action: 'WIN:SEARCH', icon: 'search', color: '#38BDF8', description: 'Open system search' },
    { id: 'screenshot', label: 'Screenshot Snip', shortcutHint: `${superLabel}+Shift+S`, action: 'WIN:SNIP', icon: 'camera', color: '#34D399', description: 'Capture screen region' },
    { id: 'lock', label: 'Lock Screen', shortcutHint: `${superLabel}+L`, action: 'WIN:LOCK', icon: 'lock', color: '#F87171', description: 'Lock workstation immediately' },
    { id: 'explorer', label: 'File Explorer', shortcutHint: `${superLabel}+E`, action: 'WIN:EXPLORER', icon: 'folder', color: '#FBBF24', description: 'Open File Explorer' },
    { id: 'task_mgr', label: 'Task Manager', shortcutHint: 'Ctrl+Shift+Esc', action: 'WIN:TASK_MGR', icon: 'terminal', color: '#A78BFA', description: 'Open Task Manager' },
    { id: 'desktop', label: 'Show Desktop', shortcutHint: `${superLabel}+D`, action: 'WIN:DESKTOP', icon: 'monitor', color: '#60A5FA', description: 'Minimize all windows' },
    { id: 'run', label: 'Run Dialog', shortcutHint: `${superLabel}+R`, action: 'WIN:RUN', icon: 'play-circle', color: '#38BDF8', description: 'Open Run command prompt' }
  ];
}

export function remapActionForHostOs(action: string, targetOs: HostOsType): string {
  if (!action) return action;
  if (action.includes('||')) {
    return action
      .split('||')
      .map(part => (part.startsWith('TEXT:') ? part : remapActionForHostOs(part.trim(), targetOs)))
      .join('||');
  }
  const canon = canonicalizeFirmwareAction(action);
  if (targetOs === 'mac') {
    return WIN_TO_MAC_ACTION_MAP[canon] || action;
  }
  return MAC_TO_WIN_ACTION_MAP[canon] || action;
}

export function inferHostOsFromSlots(
  slots: Partial<Record<HardwareSlotId, string>>,
  fallback: HostOsType
): HostOsType {
  let macCount = 0;
  let winCount = 0;
  for (const val of Object.values(slots)) {
    if (!val) continue;
    if (val.includes('MACRO:') || val.includes('SHORTCUT:cmd')) macCount += 1;
    if (val.includes('WIN:') || val.includes('SHORTCUT:win')) winCount += 1;
  }
  if (winCount > macCount) return 'windows';
  if (macCount > winCount) return 'mac';
  return fallback;
}

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

export const MAX_NVS_ACTION_BYTES = 512;
export const MAX_SERIAL_SINGLE_SLOT_ACTION_BYTES = 128;
export const STANDALONE_TICK_MS = 50;
export const MAX_FIRMWARE_DELAY_STEP_MS = 10000;

export function parseFirmwareSemver(fw?: string | null): [number, number, number] | null {
  if (!fw) return null;
  const m = String(fw)
    .trim()
    .match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  return [Number(m[1]) || 0, Number(m[2]) || 0, Number(m[3]) || 0];
}

export function isFirmwareAtLeast(
  fw: string | null | undefined,
  major: number,
  minor: number,
  patch = 0
): boolean {
  const parsed = parseFirmwareSemver(fw);
  if (!parsed) return false;
  const [maj, min, pat] = parsed;
  if (maj !== major) return maj > major;
  if (min !== minor) return min > minor;
  return pat >= patch;
}

/** True when connected firmware supports native `DELAY:<1..10000>` tokens in NVS (v4.5.0+ C++ engine) */
export function firmwareSupportsNativeDelay(
  fwOrConn?: string | DeviceConnectionInfo | null
): boolean {
  if (!fwOrConn) return false;
  if (typeof fwOrConn === 'object') {
    if (typeof fwOrConn.telemetry?.supportsNativeDelay === 'boolean') {
      return fwOrConn.telemetry.supportsNativeDelay;
    }
    const raw = fwOrConn.telemetry?.reportedFirmwareVersion || fwOrConn.firmwareVersion;
    return isFirmwareAtLeast(raw, 4, 5, 0);
  }
  return isFirmwareAtLeast(fwOrConn, 4, 5, 0);
}

/** True when connected firmware supports 512-byte `/api/customizer/save` single-slot saves (v4.5.0+ C++ engine) */
export function firmwareSupports512ByteSlotSave(
  fwOrConn?: string | DeviceConnectionInfo | null
): boolean {
  if (!fwOrConn) return false;
  if (typeof fwOrConn === 'object') {
    if (typeof fwOrConn.telemetry?.supports512ByteSlotSave === 'boolean') {
      return fwOrConn.telemetry.supports512ByteSlotSave;
    }
    const raw = fwOrConn.telemetry?.reportedFirmwareVersion || fwOrConn.firmwareVersion;
    return isFirmwareAtLeast(raw, 4, 5, 0);
  }
  return isFirmwareAtLeast(fwOrConn, 4, 5, 0);
}

export function isValidDelayActionToken(action: string): boolean {
  if (!action || !action.startsWith('DELAY:') || action.length <= 6) return false;
  const rawMs = action.slice(6).trim();
  if (!/^\d+$/.test(rawMs)) return false;
  const ms = Number(rawMs);
  return Number.isInteger(ms) && ms >= 1 && ms <= MAX_FIRMWARE_DELAY_STEP_MS;
}

export function isValidFirmwareAction(action: string): boolean {
  if (!action || action.length < 3 || action.length > MAX_NVS_ACTION_BYTES) return false;
  if (action.includes('||')) {
    const parts = action
      .split('||')
      .map(p => (p.startsWith('TEXT:') ? p : p.trim()))
      .filter(Boolean);
    if (parts.length === 0) return false;
    let hasRealAction = false;
    for (const p of parts) {
      if (p === 'NONE' || isValidDelayActionToken(p)) continue;
      if (p.includes('||') || !isValidFirmwareAction(p)) return false;
      hasRealAction = true;
    }
    return hasRealAction;
  }
  if (isValidDelayActionToken(action)) return true;
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

/**
 * Validates any hardware slot value, allowing unassigned (`""` or `"NONE"`)
 * in addition to any valid firmware action string.
 */
export function isValidSlotAssignment(action: string | undefined | null): boolean {
  if (action === '' || action === 'NONE') return true;
  if (!action) return false;
  return isValidFirmwareAction(action);
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

export function sanitizeFirmwareAlias(
  raw: string,
  fallback: HardwareProfileId = 'HOST1'
): string {
  const cleaned = (raw || '').replace(/[^A-Za-z0-9 _-]/g, '').trim().slice(0, 20).trim();
  return cleaned || defaultProfileAlias(fallback);
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
  if (action.includes('||')) {
    return action
      .split('||')
      .map(p => p.trim())
      .some(p => p && p !== 'NONE' && !p.startsWith('DELAY:') && isTvFirmwareAction(p));
  }
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

  const realParts = actionStr.includes('||')
    ? actionStr
        .split('||')
        .map(p => (p.startsWith('TEXT:') ? p : p.trim()))
        .filter(p => p && p !== 'NONE' && !p.startsWith('DELAY:'))
    : actionStr.startsWith('DELAY:')
    ? []
    : [actionStr];

  const needsTv = realParts.some(p => isTvFirmwareAction(p));
  const needsBleHid = realParts.some(p => !isTvFirmwareAction(p) && !p.startsWith('BLE:'));

  if (needsTv) {
    if (tel.tvEnabled === false) {
      return {
        canTest: true,
        reason: 'TV mode is turned off on the pad.'
      };
    }
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
  }

  if (needsBleHid && !tel.bleConnected) {
    const hostName = tel.bleDeviceName || `Studio Pad ${tel.bleActiveHost || 1}`;
    return {
      canTest: false,
      reason: `Bluetooth is disconnected — pair your computer with "${hostName}" (Host ${tel.bleActiveHost || 1}).`
    };
  }

  return { canTest: true, reason: null };
}

export function actionContainsTvSteps(
  actionStr?: string | null,
  repeatConfig?: TextMacroRepeatConfig
): boolean {
  if (repeatConfig?.steps && repeatConfig.steps.length > 0) {
    if (
      repeatConfig.steps.some(
        s => s.actionType === 'tv' || isTvFirmwareAction(stepToFirmwareAction(s))
      )
    ) {
      return true;
    }
  }
  if (!actionStr) return false;
  const parts = actionStr.includes('||')
    ? actionStr.split('||').map(p => (p.startsWith('TEXT:') ? p : p.trim()))
    : [actionStr];
  return parts.some(
    p =>
      Boolean(p) &&
      p !== 'NONE' &&
      !p.startsWith('DELAY:') &&
      !p.startsWith('REPEAT:') &&
      p !== 'END' &&
      isTvFirmwareAction(p)
  );
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

const CANONICAL_MOD_ORDER = ['cmd', 'ctrl', 'alt', 'shift', 'win'] as const;

function normalizeModToken(rawMod: string): string {
  const clean = rawMod.trim().toLowerCase();
  if (clean === 'gui') return 'cmd';
  if (clean === 'opt') return 'alt';
  return clean;
}

export function buildFirmwareShortcut(mods: string[], key: string): string {
  const cleanKey = (key || 'c').trim().toLowerCase();
  const normalizedSet = new Set<string>();
  for (const m of mods) {
    const norm = normalizeModToken(m);
    if (['cmd', 'ctrl', 'alt', 'shift', 'win'].includes(norm)) {
      normalizedSet.add(norm);
    }
  }
  const cleanMods = CANONICAL_MOD_ORDER.filter(m => normalizedSet.has(m));

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
/**
 * Converts an individual MacroStepConfig into its underlying firmware action string.
 * Returns '' for pure 'delay' steps or incomplete inputs.
 */
export function stepToFirmwareAction(step: MacroStepConfig): string {
  if (!step || step.actionType === 'delay') return '';
  if (step.actionType === 'text') {
    const check = validateTextMacroInput(step.value, 123);
    if (!check.valid || !step.value) return '';
    return `TEXT:${step.value}`;
  }
  if (step.actionType === 'key') {
    if (!step.value || !isSupportedFirmwareKey(step.value)) return '';
    return buildFirmwareShortcut([], step.value);
  }
  if (
    step.actionType === 'shortcut' ||
    step.actionType === 'media' ||
    step.actionType === 'os_action' ||
    step.actionType === 'ble' ||
    step.actionType === 'tv'
  ) {
    return isValidFirmwareAction(step.value) ? step.value : '';
  }
  return '';
}

export function describeMacroStep(step: MacroStepConfig): {
  shortLabel: string;
  fullLabel: string;
} {
  if (step.actionType === 'delay') {
    const ms = Math.max(0, step.delayMs || 0);
    return {
      shortLabel: `Wait ${ms} ms`,
      fullLabel: `Wait ${ms} ms`
    };
  }
  if (step.actionType === 'text') {
    const preview = step.value.replace(/\s+/g, ' ').trim();
    if (!preview) return { shortLabel: 'Type Text', fullLabel: 'Type Text (empty)' };
    return {
      shortLabel: `"${preview.slice(0, 10)}"`,
      fullLabel: `Type "${preview.slice(0, 28)}${preview.length > 28 ? '…' : ''}"`
    };
  }
  if (step.actionType === 'key') {
    const keyLabel = (step.value || 'enter').toUpperCase();
    return {
      shortLabel: keyLabel,
      fullLabel: `Press ${keyLabel}`
    };
  }
  const fw = stepToFirmwareAction(step);
  if (!fw) {
    return {
      shortLabel: step.label || 'Step',
      fullLabel: step.label || 'Incomplete Action'
    };
  }
  const desc = describeFirmwareAction(fw);
  return {
    shortLabel: desc.shortLabel,
    fullLabel: desc.fullLabel
  };
}

export function formatDurationCompact(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  if (safe < 1000) return `${safe} ms`;
  const sec = safe / 1000;
  return Number.isInteger(sec) ? `${sec} s` : `${sec.toFixed(sec < 10 ? 2 : 1).replace(/\.?0+$/, '')} s`;
}

/**
 * Calculates sequential delay AND estimated hardware run time across all steps in a single cycle.
 * Firmware adds a 50ms (`STANDALONE_TICK_MS`) pause after every executed step, so
 * "350 ms total wait" across 3 steps runs in ~500 ms (`350 + 3 * 50`).
 */
export function calculateStepsTiming(steps: MacroStepConfig[]): {
  totalDelayMs: number;
  actionStepCount: number;
  stepPauseCount: number;
  firmwareOverheadMs: number;
  estimatedRunMs: number;
} {
  let totalDelayMs = 0;
  let actionStepCount = 0;
  let stepPauseCount = 0;

  steps.forEach((step, idx) => {
    const repeats = Math.max(1, step.repeatCount || 1);
    const delay = Math.max(0, step.delayMs || 0);
    const isLast = idx === steps.length - 1;

    if (step.actionType === 'delay') {
      const waitSum = delay * repeats;
      totalDelayMs += waitSum;
      const chainedChunks = Math.max(1, Math.ceil(waitSum / MAX_FIRMWARE_DELAY_STEP_MS));
      stepPauseCount += chainedChunks;
    } else {
      actionStepCount += 1;
      stepPauseCount += repeats;
      if (repeats > 1) {
        totalDelayMs += (repeats - 1) * delay;
      }
      if (!isLast) {
        totalDelayMs += delay;
      }
    }
  });

  const firmwareOverheadMs = stepPauseCount * STANDALONE_TICK_MS;
  const estimatedRunMs = totalDelayMs + firmwareOverheadMs;

  return {
    totalDelayMs,
    actionStepCount,
    stepPauseCount,
    firmwareOverheadMs,
    estimatedRunMs
  };
}

export function stripStandaloneDelayTicks(action: string | undefined | null): string {
  if (!action) return '';
  if (!action.includes('||')) {
    return action.startsWith('DELAY:') ? '' : canonicalizeFirmwareAction(action);
  }
  return action
    .split('||')
    .map(p => (p.startsWith('TEXT:') ? p : p.trim()))
    .filter(p => p && p !== 'NONE' && !p.startsWith('DELAY:'))
    .map(p => canonicalizeFirmwareAction(p))
    .filter(Boolean)
    .join('||');
}

/**
 * Converts any stored firmware action + optional repeatConfig into visual MacroStepConfig items
 * so opening any slot or saved macro in MacroEditorView populates the step list cleanly
 * (including reconstructing 50ms hardware NONE ticks and v4.5.0 native DELAY:<ms> tokens).
 */
export function actionToMacroSteps(
  action: string,
  repeatConfig?: TextMacroRepeatConfig
): MacroStepConfig[] {
  if (repeatConfig?.steps && repeatConfig.steps.length > 0) {
    return repeatConfig.steps.map((s, idx) => ({
      ...s,
      id: s.id || `step-${Date.now()}-${idx}`
    }));
  }

  const stamp = Date.now();
  if (action && action.includes('||')) {
    const rawParts = action
      .split('||')
      .map(a => (a.startsWith('TEXT:') ? a : a.trim()))
      .filter(Boolean);
    const steps: MacroStepConfig[] = [];
    let leadingWaitMs = 0;

    for (let i = 0; i < rawParts.length; i++) {
      const part = rawParts[i];
      if (part === 'NONE') {
        if (steps.length === 0) {
          leadingWaitMs += STANDALONE_TICK_MS;
        } else {
          const prev = steps[steps.length - 1];
          // First NONE tick after an action adds to the built-in 50ms || gap -> (1 + count) * 50ms
          prev.delayMs =
            prev.delayMs === 0
              ? STANDALONE_TICK_MS * 2
              : prev.delayMs + STANDALONE_TICK_MS;
        }
        continue;
      }

      if (part.startsWith('DELAY:')) {
        const delayVal = Math.max(0, parseInt(part.slice(6).trim(), 10) || 0);
        const hasMoreAfter = i < rawParts.length - 1;
        if (steps.length === 0) {
          leadingWaitMs += delayVal + (hasMoreAfter ? STANDALONE_TICK_MS : 0);
        } else {
          const prev = steps[steps.length - 1];
          const surroundGap = hasMoreAfter ? STANDALONE_TICK_MS * 2 : STANDALONE_TICK_MS;
          prev.delayMs =
            prev.delayMs === 0
              ? delayVal + surroundGap
              : prev.delayMs + delayVal + (hasMoreAfter ? STANDALONE_TICK_MS : 0);
        }
        continue;
      }

      if (leadingWaitMs > 0 && steps.length === 0) {
        steps.push({
          id: `step-${stamp}-lead`,
          label: 'Wait / Delay',
          actionType: 'delay',
          value: '',
          delayMs: leadingWaitMs,
          repeatCount: 1
        });
        leadingWaitMs = 0;
      }

      const singleSteps = actionToMacroSteps(part);
      singleSteps.forEach((st, sIdx) => {
        steps.push({
          ...st,
          id: `step-${stamp}-${steps.length + sIdx + 1}`,
          delayMs: 0
        });
      });
    }

    if (steps.length > 0) return steps;
  }

  if (repeatConfig || action.startsWith('TEXT:')) {
    const cfg = parseTextConfigFromFirmwareAction(action, repeatConfig);
    const built: MacroStepConfig[] = [];
    if (cfg.text.length > 0) {
      built.push({
        id: `step-${stamp}-1`,
        label: 'Type Text',
        actionType: 'text',
        value: cfg.text,
        delayMs: cfg.followUpKey ? Math.max(0, cfg.keyDelayMs) : 0,
        repeatCount: 1
      });
    }
    if (cfg.followUpKey) {
      built.push({
        id: `step-${stamp}-2`,
        label: 'Press Key',
        actionType: 'key',
        value: cfg.followUpKey,
        delayMs: 0,
        repeatCount: 1
      });
    }
    if (built.length > 0) return built;
  }

  if (!action || action === 'NONE') return [];

  if (action.startsWith('DELAY:')) {
    const ms = Math.max(10, parseInt(action.slice(6).trim(), 10) || 500);
    return [
      {
        id: `step-${stamp}-1`,
        label: 'Wait / Delay',
        actionType: 'delay',
        value: '',
        delayMs: ms,
        repeatCount: 1
      }
    ];
  }

  if (action.startsWith('SHORTCUT:')) {
    const parsed = parseFirmwareShortcut(action);
    if (parsed.mods.length === 0) {
      return [
        {
          id: `step-${stamp}-1`,
          label: 'Press Key',
          actionType: 'key',
          value: parsed.key,
          delayMs: 0,
          repeatCount: 1
        }
      ];
    }
    return [
      {
        id: `step-${stamp}-1`,
        label: 'Keyboard Shortcut',
        actionType: 'shortcut',
        value: action,
        delayMs: 0,
        repeatCount: 1
      }
    ];
  }

  if (action.startsWith('MEDIA:') || action.startsWith('KEY:')) {
    return [
      {
        id: `step-${stamp}-1`,
        label: 'Media & Function',
        actionType: 'media',
        value: action,
        delayMs: 0,
        repeatCount: 1
      }
    ];
  }

  if (action.startsWith('MACRO:') || action.startsWith('WIN:')) {
    return [
      {
        id: `step-${stamp}-1`,
        label: 'System Action',
        actionType: 'os_action',
        value: action,
        delayMs: 0,
        repeatCount: 1
      }
    ];
  }

  if (action.startsWith('BLE:')) {
    return [
      {
        id: `step-${stamp}-1`,
        label: 'BLE Host Switch',
        actionType: 'ble',
        value: action,
        delayMs: 0,
        repeatCount: 1
      }
    ];
  }

  if (
    action.startsWith('TV:') ||
    action.startsWith('APP:') ||
    action.startsWith('TVKEY:') ||
    action.startsWith('TVAPP:')
  ) {
    return [
      {
        id: `step-${stamp}-1`,
        label: 'TV Action',
        actionType: 'tv',
        value: action,
        delayMs: 0,
        repeatCount: 1
      }
    ];
  }

  return [];
}

export interface CompiledHardwareMacro {
  /** Action string stored in MacroPad NVS (always <= 512 bytes when valid) */
  firmwareAction: string;
  /** UTF-8 byte length of firmwareAction */
  byteLength: number;
  /** True when 100% of steps, delays, and repeat cycles run standalone on the MacroPad without USB */
  standaloneComplete: boolean;
  /** True when 1 full cycle is stored in NVS (used when repeatCount > 1 or loopUntilStopped streams remaining cycles over USB) */
  singleCycleStandalone: boolean;
  /** Human-readable explanation when live USB streaming is required beyond onboard NVS */
  usbRequiredReason: string | null;
  /** Estimated byte length if all steps + delays were encoded standalone under the active mode */
  fullStandaloneByteEstimate: number;
  /** Byte length when compiled using Firmware v4.5.0 native `DELAY:<ms>` tokens */
  nativeDelayByteEstimate: number;
}

interface FlattenedCycleAction {
  stepType: MacroStepActionType;
  rawText?: string;
  action: string;
  waitAfterMs: number;
}

function appendNativeDelayChunks(segments: string[], totalDelayTokenMs: number) {
  let rem = Math.max(1, Math.round(totalDelayTokenMs));
  while (rem > 0) {
    // Firmware v4.5.0 caps each DELAY:<ms> token at 10000 ms (422 if > 10000); chain multiple DELAY tokens seamlessly
    const chunk = Math.min(MAX_FIRMWARE_DELAY_STEP_MS, rem);
    segments.push(`DELAY:${chunk}`);
    rem -= chunk;
    if (rem > 0) {
      // Account for the 50ms inter-segment pause between consecutive DELAY chunks
      rem = Math.max(0, rem - STANDALONE_TICK_MS);
    }
  }
}

function encodeTimedMacroCycles(
  steps: MacroStepConfig[],
  cycles: number,
  repeatDelayMs: number,
  mergeTextEnter: boolean,
  useNativeDelay = false
): { serialized: string; byteLength: number; firstAction: string } {
  let leadingWaitMs = 0;
  const rawItems: FlattenedCycleAction[] = [];

  for (let i = 0; i < steps.length; i++) {
    const st = steps[i];
    const reps = Math.max(1, st.repeatCount || 1);
    const delay = Math.max(0, st.delayMs || 0);

    if (st.actionType === 'delay') {
      const waitTotal = delay * reps;
      if (rawItems.length === 0) {
        leadingWaitMs += waitTotal;
      } else {
        rawItems[rawItems.length - 1].waitAfterMs += waitTotal;
      }
      continue;
    }

    const fw = canonicalizeFirmwareAction(stepToFirmwareAction(st));
    for (let r = 0; r < reps; r++) {
      rawItems.push({
        stepType: st.actionType,
        rawText: st.actionType === 'text' ? st.value : undefined,
        action: fw,
        waitAfterMs: delay
      });
    }
  }

  if (rawItems.length === 0) {
    return { serialized: '', byteLength: 0, firstAction: '' };
  }

  // Optional compaction: merge [TEXT:<t> (wait <= 50ms), SHORTCUT::enter] -> TEXT:<t>\n (saves 16 bytes)
  const items: FlattenedCycleAction[] = [];
  if (mergeTextEnter) {
    for (let i = 0; i < rawItems.length; i++) {
      const cur = rawItems[i];
      const nxt = rawItems[i + 1];
      if (
        cur.stepType === 'text' &&
        cur.rawText !== undefined &&
        cur.waitAfterMs <= STANDALONE_TICK_MS &&
        nxt &&
        nxt.action === 'SHORTCUT::enter' &&
        validateTextMacroInput(cur.rawText, 122).valid
      ) {
        items.push({
          stepType: 'text',
          action: `TEXT:${cur.rawText}\n`,
          waitAfterMs: nxt.waitAfterMs
        });
        i += 1;
      } else {
        items.push(cur);
      }
    }
  } else {
    items.push(...rawItems);
  }

  const segments: string[] = [];
  if (leadingWaitMs >= 25) {
    if (useNativeDelay && leadingWaitMs > STANDALONE_TICK_MS * 2) {
      // Firmware sleeps 50ms after the leading DELAY segment before executing Step 1
      appendNativeDelayChunks(segments, leadingWaitMs - STANDALONE_TICK_MS);
    } else {
      const leadTicks = Math.max(1, Math.round(leadingWaitMs / STANDALONE_TICK_MS));
      for (let t = 0; t < leadTicks; t++) segments.push('NONE');
    }
  }

  const safeCycles = Math.max(1, cycles);
  const interCycleGap = Math.max(0, repeatDelayMs || 0);

  for (let c = 0; c < safeCycles; c++) {
    for (let idx = 0; idx < items.length; idx++) {
      segments.push(items[idx].action);
      const isVeryLast = c === safeCycles - 1 && idx === items.length - 1;
      if (!isVeryLast) {
        const desiredWait =
          idx < items.length - 1
            ? items[idx].waitAfterMs
            : interCycleGap + leadingWaitMs;
        if (useNativeDelay && desiredWait > STANDALONE_TICK_MS * 2) {
          // Firmware sleeps 50ms after action + X ms inside DELAY:X + 50ms after DELAY:X = X + 100ms
          appendNativeDelayChunks(segments, desiredWait - STANDALONE_TICK_MS * 2);
        } else {
          // ESP32 firmware already sleeps 50ms after every || segment
          const extraWait = Math.max(0, desiredWait - STANDALONE_TICK_MS);
          const noneTicks = Math.round(extraWait / STANDALONE_TICK_MS);
          for (let t = 0; t < noneTicks; t++) {
            segments.push('NONE');
          }
        }
      }
    }
  }

  const serialized = segments.length === 1 ? segments[0] : segments.join('||');
  const byteLength = new TextEncoder().encode(serialized).length;
  return { serialized, byteLength, firstAction: items[0].action };
}

/**
 * Compiles a TextMacroRepeatConfig into an onboard ESP32 NVS payload (up to 512 bytes):
 * - On Firmware v4.5.0+ (`opts.nativeDelay = true`), compiles waits using compact `DELAY:<ms>`
 *   tokens so multi-screen login + 2FA macros up to 60s fit in <80 bytes and run 100% unplugged.
 * - On Firmware < 4.5.0 / offline (`opts.nativeDelay = false`), uses 50ms `NONE` ticks so
 *   legacy firmware never rejects saves while still running waits up to ~3.5s unplugged.
 */
export function compileMacroConfigForHardware(
  cfg: TextMacroRepeatConfig,
  opts?: { nativeDelay?: boolean }
): CompiledHardwareMacro {
  const useNativeDelay = Boolean(opts?.nativeDelay);
  let effectiveSteps: MacroStepConfig[] = [];

  if (cfg.steps && cfg.steps.length > 0) {
    effectiveSteps = cfg.steps;
  } else {
    if (cfg.text.length > 0) {
      if (!validateTextMacroInput(cfg.text, 123).valid) {
        return {
          firmwareAction: '',
          byteLength: 0,
          standaloneComplete: false,
          singleCycleStandalone: false,
          usbRequiredReason: null,
          fullStandaloneByteEstimate: 0,
          nativeDelayByteEstimate: 0
        };
      }
      effectiveSteps.push({
        id: 'legacy-1',
        label: 'Type Text',
        actionType: 'text',
        value: cfg.text,
        delayMs: cfg.followUpKey ? Math.max(0, cfg.keyDelayMs || 0) : 0,
        repeatCount: 1
      });
    }
    if (cfg.followUpKey && isSupportedFirmwareKey(cfg.followUpKey)) {
      effectiveSteps.push({
        id: 'legacy-2',
        label: 'Press Key',
        actionType: 'key',
        value: cfg.followUpKey,
        delayMs: 0,
        repeatCount: 1
      });
    }
  }

  const nonDelaySteps = effectiveSteps.filter(s => s.actionType !== 'delay');
  if (nonDelaySteps.length === 0) {
    return {
      firmwareAction: '',
      byteLength: 0,
      standaloneComplete: false,
      singleCycleStandalone: false,
      usbRequiredReason: null,
      fullStandaloneByteEstimate: 0,
      nativeDelayByteEstimate: 0
    };
  }

  for (const st of nonDelaySteps) {
    if (!stepToFirmwareAction(st)) {
      return {
        firmwareAction: '',
        byteLength: 0,
        standaloneComplete: false,
        singleCycleStandalone: false,
        usbRequiredReason: null,
        fullStandaloneByteEstimate: 0,
        nativeDelayByteEstimate: 0
      };
    }
  }

  const loop = Boolean(cfg.loopUntilStopped);
  const totalCycles = loop ? 1 : Math.max(1, cfg.repeatCount || 1);

  // Native single-cycle optimizations
  if (!loop && totalCycles === 1) {
    if (
      effectiveSteps.length === 1 &&
      effectiveSteps[0].actionType !== 'delay' &&
      Math.max(1, effectiveSteps[0].repeatCount || 1) === 1
    ) {
      const single = canonicalizeFirmwareAction(stepToFirmwareAction(effectiveSteps[0]));
      const len = new TextEncoder().encode(single).length;
      return {
        firmwareAction: single,
        byteLength: len,
        standaloneComplete: len <= MAX_NVS_ACTION_BYTES,
        singleCycleStandalone: len <= MAX_NVS_ACTION_BYTES,
        usbRequiredReason: null,
        fullStandaloneByteEstimate: len,
        nativeDelayByteEstimate: len
      };
    }

    if (
      effectiveSteps.length === 2 &&
      effectiveSteps[0].actionType === 'text' &&
      Math.max(0, effectiveSteps[0].delayMs || 0) <= 0 &&
      Math.max(1, effectiveSteps[0].repeatCount || 1) === 1 &&
      effectiveSteps[1].actionType === 'key' &&
      effectiveSteps[1].value.trim().toLowerCase() === 'enter' &&
      Math.max(1, effectiveSteps[1].repeatCount || 1) === 1 &&
      validateTextMacroInput(effectiveSteps[0].value, 122).valid
    ) {
      const nativeTextEnter = `TEXT:${effectiveSteps[0].value}\n`;
      const len = new TextEncoder().encode(nativeTextEnter).length;
      return {
        firmwareAction: nativeTextEnter,
        byteLength: len,
        standaloneComplete: true,
        singleCycleStandalone: true,
        usbRequiredReason: null,
        fullStandaloneByteEstimate: len,
        nativeDelayByteEstimate: len
      };
    }
  }

  // Always compute Firmware v4.5.0 native DELAY size so UI can show exact compression savings
  const nativeFullUnmerged = encodeTimedMacroCycles(
    effectiveSteps,
    totalCycles,
    cfg.repeatDelayMs,
    false,
    true
  );
  const nativeBestFull =
    nativeFullUnmerged.byteLength <= MAX_NVS_ACTION_BYTES
      ? nativeFullUnmerged
      : encodeTimedMacroCycles(effectiveSteps, totalCycles, cfg.repeatDelayMs, true, true);

  // Encode for the target firmware capability
  const unmergedFull = useNativeDelay
    ? nativeFullUnmerged
    : encodeTimedMacroCycles(effectiveSteps, totalCycles, cfg.repeatDelayMs, false, false);
  const bestFull = useNativeDelay
    ? nativeBestFull
    : unmergedFull.byteLength <= MAX_NVS_ACTION_BYTES
    ? unmergedFull
    : encodeTimedMacroCycles(effectiveSteps, totalCycles, cfg.repeatDelayMs, true, false);

  if (!loop && bestFull.byteLength <= MAX_NVS_ACTION_BYTES) {
    return {
      firmwareAction: bestFull.serialized,
      byteLength: bestFull.byteLength,
      standaloneComplete: true,
      singleCycleStandalone: true,
      usbRequiredReason: null,
      fullStandaloneByteEstimate: bestFull.byteLength,
      nativeDelayByteEstimate: nativeBestFull.byteLength
    };
  }

  // Check if 1 single timed cycle fits in 512 bytes (for loopUntilStopped or multi-cycle repeats)
  const unmergedOne =
    totalCycles === 1
      ? unmergedFull
      : encodeTimedMacroCycles(effectiveSteps, 1, cfg.repeatDelayMs, false, useNativeDelay);
  const bestOne =
    unmergedOne.byteLength <= MAX_NVS_ACTION_BYTES
      ? unmergedOne
      : totalCycles === 1
      ? bestFull
      : encodeTimedMacroCycles(effectiveSteps, 1, cfg.repeatDelayMs, true, useNativeDelay);

  if (bestOne.byteLength <= MAX_NVS_ACTION_BYTES) {
    return {
      firmwareAction: bestOne.serialized,
      byteLength: bestOne.byteLength,
      standaloneComplete: false,
      singleCycleStandalone: true,
      usbRequiredReason: loop
        ? 'Pass 1 runs standalone on the MacroPad; keep Studio MacroPad open over USB for continuous looping.'
        : `Pass 1 runs standalone on the MacroPad; passes 2–${totalCycles} stream over USB (${bestFull.byteLength}/${MAX_NVS_ACTION_BYTES} B).`,
      fullStandaloneByteEstimate: bestFull.byteLength,
      nativeDelayByteEstimate: nativeBestFull.byteLength
    };
  }

  // Even 1 cycle exceeds 512B under current encoding:
  // Store Step 01 in NVS so USB streaming runs Step 02..N cleanly without double-typing
  const firstOnly = bestOne.firstAction;
  const firstBytes = new TextEncoder().encode(firstOnly).length;
  const fitsOnV45 = nativeBestFull.byteLength <= MAX_NVS_ACTION_BYTES;
  return {
    firmwareAction: firstOnly,
    byteLength: firstBytes,
    standaloneComplete: false,
    singleCycleStandalone: false,
    usbRequiredReason: fitsOnV45
      ? `Total wait needs ${bestOne.byteLength} B on legacy firmware (${nativeBestFull.byteLength} B with Firmware v4.5.0 native DELAY). Flash Firmware v4.5.0 in Settings to run unplugged, or keep USB connected.`
      : `Total wait/steps need ${bestOne.byteLength} B (max ${MAX_NVS_ACTION_BYTES} B standalone). Shorten text/steps to run unplugged, or keep Studio MacroPad open via USB.`,
    fullStandaloneByteEstimate: bestFull.byteLength,
    nativeDelayByteEstimate: nativeBestFull.byteLength
  };
}

/**
 * Build the ESP32 NVS firmware action for a Text/Button Repeat or Multi-Step configuration.
 */
export function buildFirmwareActionFromTextConfig(
  cfg: TextMacroRepeatConfig,
  opts?: { nativeDelay?: boolean }
): string {
  return compileMacroConfigForHardware(cfg, opts).firmwareAction;
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
 * Returns true ONLY when the macro cannot run 100% standalone on the MacroPad
 * (e.g. continuous `loopUntilStopped` or waits/cycles exceeding 512 bytes) and
 * therefore needs `repeatMacroRunner` over USB to complete remaining steps/cycles.
 */
export function requiresUsbSequenceExecution(
  cfg?: TextMacroRepeatConfig,
  opts?: { nativeDelay?: boolean }
): boolean {
  if (!cfg) return false;
  return !compileMacroConfigForHardware(cfg, opts).standaloneComplete;
}

/**
 * Returns true when an action/config represents a multi-step, delayed, or repeated macro
 * (whether it runs standalone on NVS or via USB), used for library discovery and UI badges.
 */
export function isMultiStepOrTimedMacro(
  action?: string | null,
  cfg?: TextMacroRepeatConfig
): boolean {
  if (action && action.includes('||')) return true;
  if (!cfg) return false;
  if (cfg.loopUntilStopped || (cfg.repeatCount || 1) > 1) return true;
  if (cfg.steps && cfg.steps.length > 0) {
    if (cfg.steps.length > 1) return true;
    const only = cfg.steps[0];
    if ((only.repeatCount || 1) > 1 || only.actionType === 'delay') return true;
    return false;
  }
  if (cfg.text.length > 0 && cfg.followUpKey) {
    return cfg.followUpKey !== 'enter' || (cfg.keyDelayMs || 0) > 0;
  }
  return false;
}

export function formatTextRepeatSummary(
  cfg: TextMacroRepeatConfig,
  customName?: string
): {
  shortLabel: string;
  fullLabel: string;
} {
  if (cfg.steps && cfg.steps.length > 0) {
    const { estimatedRunMs } = calculateStepsTiming(cfg.steps);
    const stepCount = cfg.steps.length;
    const firstNonDelay = cfg.steps.find(s => s.actionType !== 'delay') || cfg.steps[0];
    const firstDesc = describeMacroStep(firstNonDelay);

    if (
      !customName &&
      stepCount === 1 &&
      !cfg.loopUntilStopped &&
      (cfg.repeatCount || 1) <= 1 &&
      (firstNonDelay.repeatCount || 1) <= 1
    ) {
      return firstDesc;
    }

    const baseName = (customName || '').trim() || suggestSmartMacroName(cfg.steps, cfg);
    const prefix =
      cfg.loopUntilStopped && !baseName.startsWith('∞') && !/^loop\b/i.test(baseName)
        ? '∞ '
        : (cfg.repeatCount || 1) > 1 && !baseName.includes('×')
        ? `${cfg.repeatCount}× `
        : '';
    const shortLabel = `${prefix}${baseName}`.slice(0, 14);
    const estPart = estimatedRunMs > 0 ? ` · ~${formatDurationCompact(estimatedRunMs)}` : '';
    const cyclePart = cfg.loopUntilStopped
      ? ` · Loop`
      : (cfg.repeatCount || 1) > 1
      ? ` · ${cfg.repeatCount}×`
      : '';
    const fullLabel = `${baseName} (${stepCount} ${stepCount === 1 ? 'step' : 'steps'}${estPart}${cyclePart})`;
    return { shortLabel, fullLabel };
  }

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

  if (trimmed.includes('||')) {
    const reconstructedSteps = actionToMacroSteps(trimmed);
    return {
      type: 'text',
      value: trimmed,
      repeatConfig:
        reconstructedSteps.length > 0
          ? { ...DEFAULT_TEXT_REPEAT_CONFIG, steps: reconstructedSteps }
          : undefined
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
  if (trimmed.startsWith('BLE:')) {
    return { type: 'ble', value: trimmed };
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

export function formatFriendlyActionLabel(action: string): string {
  const upper = (action || '').trim().toUpperCase();
  const spec = STATIC_MAP.get(upper);
  if (spec) return spec.label;

  if (upper.startsWith('MEDIA:')) {
    const sub = upper.slice(6).replace(/_/g, ' ');
    if (sub === 'PLAY PAUSE') return 'Play / Pause';
    return sub.charAt(0) + sub.slice(1).toLowerCase();
  }
  if (upper.startsWith('TV:')) {
    const sub = upper.slice(3).replace(/_/g, ' ');
    return `TV ${sub.charAt(0) + sub.slice(1).toLowerCase()}`;
  }
  if (upper.startsWith('APP:')) {
    const sub = upper.slice(4).replace(/_/g, ' ');
    return sub.charAt(0) + sub.slice(1).toLowerCase();
  }
  if (upper.startsWith('MACRO:')) {
    const sub = upper.slice(6).replace(/_/g, ' ');
    return sub.charAt(0) + sub.slice(1).toLowerCase();
  }
  if (upper.startsWith('WIN:')) {
    const sub = upper.slice(4).replace(/_/g, ' ');
    return `Win ${sub.charAt(0) + sub.slice(1).toLowerCase()}`;
  }
  if (upper.startsWith('BLE:')) {
    const sub = upper.slice(4).replace(/_/g, ' ');
    return sub.charAt(0) + sub.slice(1).toLowerCase();
  }
  if (upper.startsWith('KEY:')) {
    return upper.slice(4);
  }
  return action;
}

export function describeFirmwareAction(
  actionStr: string | undefined | null,
  repeatConfig?: TextMacroRepeatConfig,
  customMacros?: CustomMacroItem[]
): {
  shortLabel: string;
  fullLabel: string;
  description: string;
  icon: string;
  color: string;
} {
  const raw = actionStr || '';
  const trimmed = raw.startsWith('TEXT:') ? raw : raw.trim();
  if (!trimmed || trimmed === 'NONE') {
    return {
      shortLabel: 'Unassigned',
      fullLabel: 'Unassigned',
      description: 'No action assigned to this control',
      icon: 'none',
      color: '#6B7280'
    };
  }

  let matchedCustomName: string | undefined;
  if (customMacros && customMacros.length > 0) {
    const sig = getMacroCanonicalSignature(trimmed, repeatConfig);
    const canon = canonicalizeFirmwareAction(trimmed);
    const found = customMacros.find(
      m =>
        (sig && getMacroCanonicalSignature(m.action, m.repeatConfig) === sig) ||
        canonicalizeFirmwareAction(m.action) === canon
    );
    if (found) {
      matchedCustomName = found.name;
    }
  }

  if (trimmed.startsWith('DELAY:')) {
    const ms = Math.max(0, parseInt(trimmed.slice(6).trim(), 10) || 0);
    const label = ms >= 1000 && ms % 1000 === 0 ? `Wait ${ms / 1000}s` : `Wait ${ms} ms`;
    return {
      shortLabel: label.slice(0, 12),
      fullLabel: label,
      description: `Hardware timed pause (${ms} ms)`,
      icon: 'pause',
      color: '#FBBF24'
    };
  }

  if (
    repeatConfig &&
    (repeatConfig.text ||
      repeatConfig.followUpKey ||
      (repeatConfig.steps && repeatConfig.steps.length > 0))
  ) {
    const summary = formatTextRepeatSummary(repeatConfig, matchedCustomName);
    return {
      shortLabel: summary.shortLabel,
      fullLabel: matchedCustomName || summary.fullLabel,
      description: summary.fullLabel,
      icon:
        repeatConfig.loopUntilStopped ||
        repeatConfig.repeatCount > 1 ||
        (repeatConfig.steps && repeatConfig.steps.length > 1)
          ? 'zap'
          : 'file-text',
      color: '#34D399'
    };
  }

  if (trimmed.includes('||')) {
    const reconstructedSteps = actionToMacroSteps(trimmed);
    if (reconstructedSteps.length > 0) {
      const summary = formatTextRepeatSummary(
        {
          ...DEFAULT_TEXT_REPEAT_CONFIG,
          steps: reconstructedSteps
        },
        matchedCustomName
      );
      return {
        shortLabel: summary.shortLabel,
        fullLabel: matchedCustomName || summary.fullLabel,
        description: summary.fullLabel,
        icon: 'zap',
        color: '#34D399'
      };
    }
  }

  const staticSpec = STATIC_MAP.get(trimmed) || STATIC_MAP.get(trimmed.toUpperCase());
  if (staticSpec) {
    return {
      shortLabel: staticSpec.shortLabel,
      fullLabel: staticSpec.label,
      description: staticSpec.description,
      icon: staticSpec.icon,
      color: staticSpec.color
    };
  }

  const friendly = formatFriendlyActionLabel(trimmed);
  if (friendly !== trimmed) {
    return {
      shortLabel: friendly.slice(0, 12),
      fullLabel: friendly,
      description: friendly,
      icon: 'zap',
      color: '#38BDF8'
    };
  }

  if (trimmed.startsWith('SHORTCUT:')) {
    const pretty = formatShortcutPretty(trimmed);
    return {
      shortLabel: pretty.slice(0, 12),
      fullLabel: pretty,
      description: `BLE Keyboard Shortcut (${pretty})`,
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
      shortLabel: `${parts[1]}:${parts[2]}`,
      fullLabel: `SmartCast Key (${parts[1]}, ${parts[2]})`,
      description: `SmartCast Remote Codeset ${parts[1]}, Code ${parts[2]}`,
      icon: 'tv',
      color: '#A78BFA'
    };
  }

  if (trimmed.startsWith('TVAPP:')) {
    const parts = trimmed.split(':');
    return {
      shortLabel: `App #${parts[1]}`,
      fullLabel: `SmartCast App ID ${parts[1]}`,
      description: `SmartCast App ID ${parts[1]} (Namespace ${parts[2] || '4'})`,
      icon: 'clapperboard',
      color: '#FBBF24'
    };
  }

  const fallbackIdx = trimmed.indexOf(':');
  const strippedFallback =
    fallbackIdx > 0 ? trimmed.slice(fallbackIdx + 1) : trimmed;

  return {
    shortLabel: strippedFallback.slice(0, 12),
    fullLabel: strippedFallback,
    description: strippedFallback,
    icon: 'zap',
    color: '#F3F4F6'
  };
}

export function deriveAppearanceForAction(
  actionStr: string,
  existing?: KeyAppearance,
  repeatConfig?: TextMacroRepeatConfig,
  customMacros?: CustomMacroItem[]
): KeyAppearance {
  const info = describeFirmwareAction(actionStr, repeatConfig, customMacros);
  let matchedMacroName: string | undefined;
  if (customMacros && customMacros.length > 0 && actionStr) {
    const sig = getMacroCanonicalSignature(actionStr, repeatConfig);
    const canon = canonicalizeFirmwareAction(actionStr);
    const found = customMacros.find(
      m =>
        (sig && getMacroCanonicalSignature(m.action, m.repeatConfig) === sig) ||
        canonicalizeFirmwareAction(m.action) === canon
    );
    if (found && (isMultiStepOrTimedMacro(actionStr, repeatConfig) || actionStr.startsWith('TEXT:') || actionStr.startsWith('SHORTCUT:'))) {
      matchedMacroName = found.name.slice(0, 14);
    }
  }
  return {
    label: existing?.customLabel ? existing.label : matchedMacroName || info.shortLabel,
    icon: existing?.customIcon ? existing.icon : info.icon,
    labelColor: existing?.customIcon || existing?.customLabel ? existing.labelColor : info.color,
    customLabel: existing?.customLabel,
    customIcon: existing?.customIcon
  };
}

// ===========================================================================
// Deterministic Macro Intelligence: Canonical Signatures, Native Equivalence,
// Smart Auto-Naming, Completeness Validation & Sequence Optimization
// ===========================================================================

const EQUIVALENT_BUILTIN_SHORTCUT_MAP: Record<string, string> = {
  'SHORTCUT:cmd:c': 'MACRO:COPY',
  'SHORTCUT:cmd:v': 'MACRO:PASTE',
  'SHORTCUT:cmd:x': 'MACRO:CUT',
  'SHORTCUT:cmd:z': 'MACRO:UNDO',
  'SHORTCUT:cmd,shift:z': 'MACRO:REDO',
  'SHORTCUT:cmd:a': 'MACRO:SELECT_ALL',
  'SHORTCUT:cmd:s': 'MACRO:SAVE',
  'SHORTCUT:cmd:space': 'MACRO:SPOTLIGHT',
  'SHORTCUT:cmd,ctrl:q': 'MACRO:LOCK',
  'SHORTCUT:cmd:t': 'MACRO:NEW_TAB',
  'SHORTCUT:cmd:w': 'MACRO:CLOSE_TAB',
  'SHORTCUT:ctrl:c': 'WIN:COPY',
  'SHORTCUT:ctrl:v': 'WIN:PASTE',
  'SHORTCUT:ctrl:x': 'WIN:CUT',
  'SHORTCUT:ctrl:z': 'WIN:UNDO',
  'SHORTCUT:ctrl:y': 'WIN:REDO',
  'SHORTCUT:ctrl:a': 'WIN:SELECT_ALL',
  'SHORTCUT:ctrl:s': 'WIN:SAVE',
  'SHORTCUT:ctrl:t': 'WIN:NEW_TAB',
  'SHORTCUT:ctrl:w': 'WIN:CLOSE_TAB',
  'SHORTCUT::f13': 'KEY:F13',
  'SHORTCUT::f14': 'KEY:F14',
  'SHORTCUT::f15': 'KEY:F15',
  'SHORTCUT::f16': 'KEY:F16',
  'SHORTCUT:win:l': 'WIN:LOCK',
  'SHORTCUT:win:s': 'WIN:SEARCH',
  'SHORTCUT:win:e': 'WIN:EXPLORER',
  'SHORTCUT:ctrl,shift:esc': 'WIN:TASK_MGR',
  'SHORTCUT:shift,win:s': 'WIN:SNIP',
  'SHORTCUT:win:d': 'WIN:DESKTOP',
  'SHORTCUT:win:r': 'WIN:RUN'
};

/**
 * Normalizes a single or compound firmware action string so equivalent modifier orders
 * (`SHORTCUT:shift,cmd:4` vs `SHORTCUT:cmd,shift:4`) produce an identical wire string.
 */
export function canonicalizeFirmwareAction(action: string | undefined | null): string {
  const raw = action || '';
  if (!raw) return '';
  if (raw.startsWith('TEXT:')) {
    return raw;
  }
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.includes('||')) {
    return trimmed
      .split('||')
      .map(part => canonicalizeFirmwareAction(part))
      .filter(Boolean)
      .join('||');
  }
  if (trimmed.startsWith('SHORTCUT:') || trimmed.startsWith('KEY:F')) {
    const parsed = parseFirmwareShortcut(trimmed);
    return buildFirmwareShortcut(parsed.mods, parsed.key);
  }
  return trimmed;
}

/**
 * Checks if a custom `SHORTCUT:...` action is 100% identical to a native firmware built-in
 * (`MACRO:*`, `WIN:*`, or `KEY:F13..F16`). Returns the built-in spec when matched.
 */
export function findEquivalentBuiltInSpec(
  action: string | undefined | null
): FirmwareActionSpec | null {
  const canon = canonicalizeFirmwareAction(action);
  if (!canon) return null;
  if (STATIC_MAP.has(canon)) {
    return STATIC_MAP.get(canon) || null;
  }
  const mapped = EQUIVALENT_BUILTIN_SHORTCUT_MAP[canon];
  if (mapped && STATIC_MAP.has(mapped)) {
    return STATIC_MAP.get(mapped) || null;
  }
  return null;
}

/**
 * Computes a deterministic, ID-agnostic canonical signature for any macro action + repeatConfig.
 * - Ignores ephemeral `step.id` and `step.label`
 * - Maps equivalent native shortcuts (`SHORTCUT:cmd:c` === `MACRO:COPY`)
 * - Normalizes 2-step `[text(0ms,1x), enter(1x)]` === `TEXT:...\n`
 * - Strips no-op trailing wait on final step when running once (`repeatCount === 1` and not looping)
 */
export function getMacroCanonicalSignature(
  action: string | undefined | null,
  repeatConfig?: TextMacroRepeatConfig
): string {
  const rawSteps =
    repeatConfig?.steps && repeatConfig.steps.length > 0
      ? repeatConfig.steps
      : actionToMacroSteps(action || '', repeatConfig);

  const loop = Boolean(repeatConfig?.loopUntilStopped);
  const cycleCount = loop ? 0 : Math.max(1, repeatConfig?.repeatCount || 1);
  const cycleDelay = loop || cycleCount > 1 ? Math.max(0, repeatConfig?.repeatDelayMs || 0) : 0;

  if (rawSteps.length === 0) {
    const canonAct = canonicalizeFirmwareAction(action);
    if (!canonAct) return '';
    const eq = findEquivalentBuiltInSpec(canonAct);
    return `SINGLE:${eq ? eq.action : canonAct}`;
  }

  // Normalize [text(0ms, 1x), key=enter(1x)] when single-cycle
  if (
    !loop &&
    cycleCount === 1 &&
    rawSteps.length === 2 &&
    rawSteps[0].actionType === 'text' &&
    Math.max(0, rawSteps[0].delayMs || 0) === 0 &&
    Math.max(1, rawSteps[0].repeatCount || 1) === 1 &&
    rawSteps[1].actionType === 'key' &&
    rawSteps[1].value.trim().toLowerCase() === 'enter' &&
    Math.max(1, rawSteps[1].repeatCount || 1) === 1
  ) {
    return `SINGLE:TEXT:${rawSteps[0].value}\n`;
  }

  // Single step, single cycle, 1x repeat -> pure single action signature
  if (
    !loop &&
    cycleCount === 1 &&
    rawSteps.length === 1 &&
    rawSteps[0].actionType !== 'delay' &&
    Math.max(1, rawSteps[0].repeatCount || 1) === 1
  ) {
    const stepAct = canonicalizeFirmwareAction(stepToFirmwareAction(rawSteps[0]));
    if (!stepAct) return '';
    const eq = findEquivalentBuiltInSpec(stepAct);
    return `SINGLE:${eq ? eq.action : stepAct}`;
  }

  const normalizedPartList = rawSteps.map((st, idx) => {
    const reps = Math.max(1, st.repeatCount || 1);
    const isLast = idx === rawSteps.length - 1;
    const rawDelay = Math.max(0, st.delayMs || 0);
    // Final action step delay is unused when reps === 1 and macro runs once
    const effectiveDelay =
      st.actionType === 'delay'
        ? rawDelay
        : isLast && !loop && cycleCount === 1 && reps === 1
        ? 0
        : rawDelay;

    if (st.actionType === 'delay') {
      return `WAIT:${effectiveDelay * reps}`;
    }
    const fw = canonicalizeFirmwareAction(stepToFirmwareAction(st));
    const eq = findEquivalentBuiltInSpec(fw);
    const token = eq ? eq.action : fw || `${st.actionType}:${st.value}`;
    return `ACT:${token}@d${effectiveDelay}x${reps}`;
  });

  return `SEQ:${loop ? 'LOOP' : `R${cycleCount}`}@${cycleDelay}|${normalizedPartList.join('->')}`;
}

/**
 * Computes a canonical 14-slot layout signature for a profile so duplicate presets are detected.
 */
export function getProfilePresetSignature(
  slots: Record<HardwareSlotId, string>,
  repeatConfigs?: SlotRepeatMap,
  profileId: HardwareProfileId = 'HOST1'
): string {
  return HARDWARE_SLOTS.map(slot => {
    const rc =
      repeatConfigs?.[`${profileId}:${slot}`] ||
      (profileId === 'HOST1' ? repeatConfigs?.[`MAC:${slot}`] : undefined);
    const sig = getMacroCanonicalSignature(slots[slot] || '', rc);
    return `${slot}=${sig}`;
  }).join('&');
}

const GENERIC_NAME_PATTERNS: RegExp[] = [
  /^untitled(\s+macro)?$/i,
  /^new\s+macro(\s*\d*)?$/i,
  /^set\s+macros?$/i,
  /^custom\s+macro(\s*\d*)?$/i,
  /^macro(\s*\d+)?$/i,
  /^my\s+macro(\s*\d*)?$/i,
  /^(∞\s*|\d+×\s*)?\d+\s+steps?(\b.*)?$/i,
  /^shortcut:\s*/i,
  /^text\s+macro$/i,
  /^slot\s+b\d+/i,
  /^key\s+\d+\s+macro$/i,
  /^knob\s+.*\s+macro$/i
];

/**
 * Returns true when a macro name is empty or a generic placeholder like "Untitled Macro", "Set Macro", or "3 Steps".
 */
export function isGenericMacroName(name: string | undefined | null): boolean {
  const clean = (name || '').trim();
  if (!clean) return true;
  return GENERIC_NAME_PATTERNS.some(re => re.test(clean));
}

function toTitleWords(raw: string): string {
  return raw
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const WELL_KNOWN_SHORTCUT_NAMES: Record<string, string> = {
  'SHORTCUT:cmd,shift:4': 'Screenshot Region (⌘⇧4)',
  'SHORTCUT:cmd,shift:3': 'Full Screenshot (⌘⇧3)',
  'SHORTCUT:cmd,shift:5': 'Screen Capture Bar (⌘⇧5)',
  'SHORTCUT:cmd,opt:esc': 'Force Quit (⌘⌥Esc)',
  'SHORTCUT:cmd,alt:esc': 'Force Quit (⌘⌥Esc)',
  'SHORTCUT:cmd,shift:p': 'Command Palette (⌘⇧P)',
  'SHORTCUT:ctrl,shift:p': 'Command Palette (⌃⇧P)',
  'SHORTCUT:cmd,shift:m': 'Toggle Mic Mute (⌘⇧M)',
  'SHORTCUT:ctrl,shift:m': 'Toggle Mic Mute (⌃⇧M)',
  'SHORTCUT:cmd,shift:v': 'Toggle Video (⌘⇧V)',
  'SHORTCUT:cmd:k': 'Quick Switcher (⌘K)',
  'SHORTCUT:ctrl:k': 'Quick Switcher (⌃K)',
  'SHORTCUT:cmd:/': 'Toggle Comment (⌘/)',
  'SHORTCUT:ctrl:/': 'Toggle Comment (⌃/)',
  'SHORTCUT:cmd:b': 'Toggle Sidebar (⌘B)',
  'SHORTCUT:ctrl:`': 'Toggle Terminal (⌃`)',
  'SHORTCUT:cmd,shift:t': 'Reopen Closed Tab (⌘⇧T)',
  'SHORTCUT:ctrl,shift:t': 'Reopen Closed Tab (⌃⇧T)',
  'SHORTCUT:cmd:r': 'Reload Page (⌘R)',
  'SHORTCUT:ctrl:r': 'Reload Page (⌃R)',
  'SHORTCUT:alt:tab': 'Switch Window (Alt+Tab)',
  'SHORTCUT:cmd:tab': 'Switch App (⌘Tab)'
};

/**
 * Synthesizes a clean, human-readable studio name from the actual steps and cycle behavior.
 */
export function suggestSmartMacroName(
  steps: MacroStepConfig[],
  repeatConfig?: Partial<TextMacroRepeatConfig>
): string {
  const actionSteps = steps.filter(s => s.actionType !== 'delay');
  if (actionSteps.length === 0) {
    return 'Timed Wait';
  }

  const loop = Boolean(repeatConfig?.loopUntilStopped);
  const cycleCount = Math.max(1, repeatConfig?.repeatCount || 1);
  const cycleMs = Math.max(25, repeatConfig?.repeatDelayMs || 500);

  // Spotlight / Win Search / Run launcher pattern: [Spotlight/Search -> Text -> Enter]
  if (actionSteps.length >= 2) {
    const firstFw = canonicalizeFirmwareAction(stepToFirmwareAction(actionSteps[0]));
    const second = actionSteps[1];
    if (
      (firstFw === 'MACRO:SPOTLIGHT' ||
        firstFw === 'WIN:SEARCH' ||
        firstFw === 'WIN:RUN' ||
        firstFw === 'SHORTCUT:cmd:space' ||
        firstFw === 'SHORTCUT:win:r') &&
      second.actionType === 'text' &&
      second.value.trim()
    ) {
      const target = toTitleWords(second.value.trim().slice(0, 20));
      return `Launch ${target}`;
    }
  }

  // Copy -> Paste workflow
  if (actionSteps.length === 2) {
    const a0 = canonicalizeFirmwareAction(stepToFirmwareAction(actionSteps[0]));
    const a1 = canonicalizeFirmwareAction(stepToFirmwareAction(actionSteps[1]));
    if (
      (a0 === 'MACRO:PASTE' || a0 === 'WIN:PASTE' || a0 === 'SHORTCUT:cmd:v' || a0 === 'SHORTCUT:ctrl:v') &&
      actionSteps[1].actionType === 'key' &&
      actionSteps[1].value.toLowerCase() === 'enter'
    ) {
      return 'Paste & Submit';
    }
    if (
      actionSteps[0].actionType === 'text' &&
      actionSteps[0].value.trim() &&
      actionSteps[1].actionType === 'key' &&
      actionSteps[1].value.toLowerCase() === 'enter'
    ) {
      const snippet = actionSteps[0].value.trim();
      if (/^git\s+/i.test(snippet)) {
        return `Run ${snippet.slice(0, 22)}`;
      }
      if (/^npm\s+|^pnpm\s+|^yarn\s+/i.test(snippet)) {
        return `Run ${snippet.slice(0, 22)}`;
      }
      return `Send "${snippet.slice(0, 18)}${snippet.length > 18 ? '…' : ''}"`;
    }
  }

  // Single action step
  if (actionSteps.length === 1) {
    const only = actionSteps[0];
    const fw = canonicalizeFirmwareAction(stepToFirmwareAction(only));
    const stepReps = Math.max(1, only.repeatCount || 1);

    let base = '';
    if (only.actionType === 'text') {
      const snippet = only.value.trim();
      base = snippet
        ? `Type "${snippet.slice(0, 18)}${snippet.length > 18 ? '…' : ''}"`
        : 'Type Snippet';
    } else if (only.actionType === 'key') {
      base = `Press ${(only.value || 'Enter').toUpperCase()}`;
    } else if (fw && WELL_KNOWN_SHORTCUT_NAMES[fw]) {
      base = WELL_KNOWN_SHORTCUT_NAMES[fw];
    } else if (fw) {
      const eq = findEquivalentBuiltInSpec(fw);
      if (eq) {
        base = eq.label;
      } else if (fw.startsWith('SHORTCUT:')) {
        base = `Shortcut ${formatShortcutPretty(fw)}`;
      } else {
        base = describeFirmwareAction(fw).fullLabel;
      }
    } else {
      base = describeMacroStep(only).fullLabel;
    }

    if (loop) {
      return `Loop ${base.replace(/^Press\s+/i, '')} · ${cycleMs} ms`.slice(0, 40);
    }
    if (cycleCount > 1) {
      return `${base} (${cycleCount}×)`.slice(0, 40);
    }
    if (stepReps > 1) {
      return `${base} (${stepReps}×)`.slice(0, 40);
    }
    return base.slice(0, 40);
  }

  // General multi-step sequence: combine first & last meaningful action labels
  const firstDesc = describeMacroStep(actionSteps[0]).shortLabel;
  const lastDesc = describeMacroStep(actionSteps[actionSteps.length - 1]).shortLabel;
  const chainLabel =
    actionSteps.length === 2
      ? `${firstDesc} → ${lastDesc}`
      : `${firstDesc} → ${lastDesc} (${actionSteps.length} steps)`;

  if (loop) {
    return `Loop ${firstDesc} → ${lastDesc}`.slice(0, 40);
  }
  if (cycleCount > 1) {
    return `${firstDesc} → ${lastDesc} (${cycleCount}×)`.slice(0, 40);
  }
  return chainLabel.slice(0, 40);
}

export interface MacroSequenceValidationIssue {
  stepId?: string;
  stepIndex?: number;
  message: string;
}

export interface MacroSequenceValidationResult {
  valid: boolean;
  builtAction: string;
  byteLength: number;
  maxBytes: number;
  standaloneComplete: boolean;
  usbRequiredReason: string | null;
  fullStandaloneByteEstimate: number;
  nativeDelayByteEstimate: number;
  issues: MacroSequenceValidationIssue[];
}

/**
 * Strictly validates every step, delay, text snippet, TV payload, and total 512-byte NVS wire budget
 * so incomplete or half-configured macros can never be saved or assigned.
 */
export function validateMacroSequenceDraft(
  steps: MacroStepConfig[],
  repeatConfig?: Partial<TextMacroRepeatConfig>,
  opts?: { nativeDelay?: boolean }
): MacroSequenceValidationResult {
  const MAX_BYTES = MAX_NVS_ACTION_BYTES;
  const issues: MacroSequenceValidationIssue[] = [];

  if (!steps || steps.length === 0) {
    issues.push({
      message: 'Add at least one action step before saving.'
    });
    return {
      valid: false,
      builtAction: '',
      byteLength: 0,
      maxBytes: MAX_BYTES,
      standaloneComplete: false,
      usbRequiredReason: null,
      fullStandaloneByteEstimate: 0,
      nativeDelayByteEstimate: 0,
      issues
    };
  }

  const nonDelaySteps = steps.filter(s => s.actionType !== 'delay');
  if (nonDelaySteps.length === 0) {
    issues.push({
      message: 'A macro cannot contain only Wait steps — add at least one action step.'
    });
  }

  steps.forEach((step, idx) => {
    const stepNum = idx + 1;
    if (step.actionType === 'delay') {
      if ((step.delayMs || 0) < 10) {
        issues.push({
          stepId: step.id,
          stepIndex: idx,
          message: `Step ${stepNum}: Set wait duration to at least 10 ms (or remove the 0 ms wait step).`
        });
      }
      return;
    }

    if (step.actionType === 'text') {
      if (!step.value || step.value.length === 0) {
        issues.push({
          stepId: step.id,
          stepIndex: idx,
          message: `Step ${stepNum}: Enter text to type.`
        });
        return;
      }
      const check = validateTextMacroInput(step.value, 123);
      if (!check.valid) {
        issues.push({
          stepId: step.id,
          stepIndex: idx,
          message: `Step ${stepNum}: ${check.error || 'Invalid text snippet.'}`
        });
      }
      return;
    }

    if (step.actionType === 'key') {
      if (!step.value || !isSupportedFirmwareKey(step.value)) {
        issues.push({
          stepId: step.id,
          stepIndex: idx,
          message: `Step ${stepNum}: Choose a valid keyboard key.`
        });
      }
      return;
    }

    if (step.actionType === 'tv') {
      if (!step.value) {
        issues.push({
          stepId: step.id,
          stepIndex: idx,
          message: `Step ${stepNum}: Select a Smart TV command or streaming app.`
        });
        return;
      }
      if (step.value.startsWith('TVAPP:')) {
        const parts = step.value.split(':');
        if (parts.length < 3 || !parts[1]?.trim() || !parts[2]?.trim()) {
          issues.push({
            stepId: step.id,
            stepIndex: idx,
            message: `Step ${stepNum}: Enter both a SmartCast App ID and Namespace.`
          });
          return;
        }
      }
      if (step.value.startsWith('TVKEY:')) {
        const parts = step.value.split(':');
        const cs = Number(parts[1]);
        const cd = Number(parts[2]);
        if (
          parts.length !== 3 ||
          parts[1] === '' ||
          parts[2] === '' ||
          !Number.isInteger(cs) ||
          cs < 0 ||
          !Number.isInteger(cd) ||
          cd < 0
        ) {
          issues.push({
            stepId: step.id,
            stepIndex: idx,
            message: `Step ${stepNum}: Enter valid non-negative SmartCast Codeset and Code integers.`
          });
          return;
        }
      }
    }

    const fw = stepToFirmwareAction(step);
    if (!fw || !isValidFirmwareAction(fw)) {
      issues.push({
        stepId: step.id,
        stepIndex: idx,
        message: `Step ${stepNum}: Complete the action configuration.`
      });
    }
  });

  const fullCfg: TextMacroRepeatConfig = {
    text: repeatConfig?.text ?? '',
    followUpKey: repeatConfig?.followUpKey ?? '',
    keyDelayMs: repeatConfig?.keyDelayMs ?? 0,
    repeatCount: Math.max(1, repeatConfig?.repeatCount ?? 1),
    loopUntilStopped: Boolean(repeatConfig?.loopUntilStopped),
    repeatDelayMs: Math.max(25, repeatConfig?.repeatDelayMs ?? 500),
    steps
  };

  const compiled =
    issues.length === 0
      ? compileMacroConfigForHardware(fullCfg, opts)
      : {
          firmwareAction: '',
          byteLength: 0,
          standaloneComplete: false,
          singleCycleStandalone: false,
          usbRequiredReason: null,
          fullStandaloneByteEstimate: 0,
          nativeDelayByteEstimate: 0
        };

  const builtAction = compiled.firmwareAction
    ? canonicalizeFirmwareAction(compiled.firmwareAction)
    : '';
  const byteLength = builtAction ? new TextEncoder().encode(builtAction).length : 0;

  if (issues.length === 0 && !builtAction) {
    issues.push({
      message: 'Sequence could not compile into a valid firmware command.'
    });
  } else if (byteLength > MAX_BYTES) {
    issues.push({
      message: `Compiled payload is ${byteLength} bytes, exceeding the ${MAX_BYTES}-byte ESP32 NVS slot limit. Shorten text or reduce steps.`
    });
  }

  return {
    valid: issues.length === 0 && Boolean(builtAction) && byteLength <= MAX_BYTES,
    builtAction,
    byteLength,
    maxBytes: MAX_BYTES,
    standaloneComplete: compiled.standaloneComplete,
    usbRequiredReason: compiled.usbRequiredReason,
    fullStandaloneByteEstimate: compiled.fullStandaloneByteEstimate,
    nativeDelayByteEstimate: compiled.nativeDelayByteEstimate,
    issues
  };
}

export interface MacroOptimizationReport {
  canOptimize: boolean;
  reasons: string[];
  optimizedSteps: MacroStepConfig[];
}

/**
 * Inspects a step sequence for redundant constructs:
 * 1. Consecutive Wait steps -> merged into a single Wait step
 * 2. Adjacent identical action steps with matching delay -> collapsed into `repeatCount`
 * 3. Canonical shortcut normalization (`SHORTCUT:shift,cmd:4` -> `SHORTCUT:cmd,shift:4`)
 * 4. Unused trailing post-step wait on the final step when running once (`repeatCount === 1` & not looping)
 */
export function analyzeMacroOptimizations(
  steps: MacroStepConfig[],
  repeatConfig?: Partial<TextMacroRepeatConfig>
): MacroOptimizationReport {
  if (!steps || steps.length === 0) {
    return { canOptimize: false, reasons: [], optimizedSteps: steps };
  }

  const reasons: string[] = [];
  const next: MacroStepConfig[] = [];
  const loop = Boolean(repeatConfig?.loopUntilStopped);
  const cycleCount = Math.max(1, repeatConfig?.repeatCount || 1);

  for (const rawStep of steps) {
    const step: MacroStepConfig = {
      ...rawStep,
      value:
        rawStep.actionType === 'shortcut'
          ? canonicalizeFirmwareAction(rawStep.value)
          : rawStep.value,
      repeatCount: Math.max(1, rawStep.repeatCount || 1),
      delayMs: Math.max(0, rawStep.delayMs || 0)
    };

    const prev = next[next.length - 1];

    // 1. Merge consecutive delay steps (up to 10,000ms firmware per-step cap)
    if (prev && prev.actionType === 'delay' && step.actionType === 'delay') {
      const mergedMs =
        prev.delayMs * Math.max(1, prev.repeatCount || 1) +
        step.delayMs * Math.max(1, step.repeatCount || 1);
      if (mergedMs <= MAX_FIRMWARE_DELAY_STEP_MS) {
        next[next.length - 1] = {
          ...prev,
          delayMs: mergedMs,
          repeatCount: 1,
          label: 'Wait / Delay'
        };
        if (!reasons.includes('Merge consecutive Wait steps')) {
          reasons.push('Merge consecutive Wait steps');
        }
        continue;
      }
    }

    // 2. Collapse consecutive identical action steps when transition delays match
    if (
      prev &&
      prev.actionType !== 'delay' &&
      step.actionType === prev.actionType &&
      canonicalizeFirmwareAction(stepToFirmwareAction(prev)) !== '' &&
      canonicalizeFirmwareAction(stepToFirmwareAction(prev)) ===
        canonicalizeFirmwareAction(stepToFirmwareAction(step)) &&
      prev.delayMs === step.delayMs
    ) {
      next[next.length - 1] = {
        ...prev,
        repeatCount: Math.max(1, prev.repeatCount || 1) + Math.max(1, step.repeatCount || 1)
      };
      if (!reasons.includes('Collapse repeated identical steps into step repeat count')) {
        reasons.push('Collapse repeated identical steps into step repeat count');
      }
      continue;
    }

    // 3. Fold standalone Wait step directly into preceding action step's post-step wait when preceding action has 0ms wait and 1x repeat
    if (
      prev &&
      prev.actionType !== 'delay' &&
      step.actionType === 'delay' &&
      prev.repeatCount === 1 &&
      prev.delayMs === 0
    ) {
      const waitTotal = step.delayMs * step.repeatCount;
      if (waitTotal > 0 && waitTotal <= MAX_FIRMWARE_DELAY_STEP_MS) {
        next[next.length - 1] = {
          ...prev,
          delayMs: waitTotal
        };
        if (!reasons.includes('Fold standalone Wait into preceding step transition delay')) {
          reasons.push('Fold standalone Wait into preceding step transition delay');
        }
        continue;
      }
    }

    next.push(step);
  }

  // 4. Strip trailing post-step wait on final action step when macro runs once and final step has 1x repeat
  if (next.length > 0 && !loop && cycleCount === 1) {
    const last = next[next.length - 1];
    if (last.actionType !== 'delay' && last.repeatCount === 1 && last.delayMs > 0) {
      next[next.length - 1] = {
        ...last,
        delayMs: 0
      };
      if (!reasons.includes('Clear unused trailing delay after final step')) {
        reasons.push('Clear unused trailing delay after final step');
      }
    }
  }

  return {
    canOptimize: reasons.length > 0,
    reasons,
    optimizedSteps: next
  };
}

export function optimizeMacroSteps(
  steps: MacroStepConfig[],
  repeatConfig?: Partial<TextMacroRepeatConfig>
): MacroStepConfig[] {
  return analyzeMacroOptimizations(steps, repeatConfig).optimizedSteps;
}

// ===========================================================================
// Universal 'KEY:VALUE' Display Parser & Smart Keystroke Coalescing Helpers
// ===========================================================================

export interface ParsedActionToken {
  prefix: string | null;
  value: string;
  prettyValue: string;
  rawAction: string;
}

export interface ParsedActionDisplay {
  isUnassigned: boolean;
  isMultiStep: boolean;
  prefix: string | null;
  value: string;
  prettyLabel: string;
  tokens: ParsedActionToken[];
  repeatBadge: string | null;
}

const KEY_VALUE_PREFIX_RE = /^([A-Za-z][A-Za-z0-9_]*):([\s\S]*)$/;

/**
 * Parses a single 'KEY:VALUE' firmware action token (e.g. 'MEDIA:PLAY_PAUSE', 'KEY:F15',
 * 'WIN:SNIP', 'SHORTCUT:cmd,shift:4', 'TEXT:hello').
 * Strips the 'KEY:' prefix completely from `value` and extracts `KEY` as `prefix`.
 */
export function parseSingleActionKeyValue(rawToken: string): ParsedActionToken {
  const raw = rawToken ?? '';
  const trimmed = raw.startsWith('TEXT:') || raw.startsWith('text:') ? raw : raw.trim();
  if (!trimmed) {
    return {
      prefix: null,
      value: 'Unassigned',
      prettyValue: 'Unassigned',
      rawAction: ''
    };
  }

  const match = KEY_VALUE_PREFIX_RE.exec(trimmed);
  if (!match) {
    return {
      prefix: null,
      value: trimmed,
      prettyValue: trimmed,
      rawAction: trimmed
    };
  }

  const upperPrefix = match[1].toUpperCase();
  const rest = match[2];

  // Single key encoded via SHORTCUT::<key> (empty modifiers) -> treat prefix as KEY
  if (upperPrefix === 'SHORTCUT') {
    if (rest.startsWith(':')) {
      const singleKey = rest.slice(1).trim().toUpperCase() || 'KEY';
      return {
        prefix: 'KEY',
        value: singleKey,
        prettyValue: singleKey,
        rawAction: trimmed
      };
    }
    const prettyCombo = formatShortcutPretty(trimmed);
    const strippedShortcut = rest.replace(/^:+/, '');
    return {
      prefix: 'SHORTCUT',
      value: prettyCombo || strippedShortcut,
      prettyValue: prettyCombo || strippedShortcut,
      rawAction: trimmed
    };
  }

  if (upperPrefix === 'TEXT') {
    const cleanText = rest.replace(/\r?\n/g, ' ↵');
    return {
      prefix: 'TEXT',
      value: cleanText || '…',
      prettyValue: cleanText ? `"${cleanText}"` : 'Empty text',
      rawAction: trimmed
    };
  }

  if (upperPrefix === 'WAIT' || upperPrefix === 'DELAY') {
    const ms = parseInt(rest.trim(), 10);
    const formattedWait = !Number.isNaN(ms)
      ? ms >= 1000 && ms % 1000 === 0
        ? `${ms / 1000}s`
        : `${ms}ms`
      : rest.trim();
    return {
      prefix: upperPrefix,
      value: formattedWait,
      prettyValue: `Wait ${formattedWait}`,
      rawAction: trimmed
    };
  }

  const staticSpec = STATIC_MAP.get(trimmed) || STATIC_MAP.get(trimmed.toUpperCase());
  const strippedOriginalValue = rest.trim();
  const friendly = staticSpec ? staticSpec.label : formatFriendlyActionLabel(trimmed);

  return {
    prefix: upperPrefix,
    value: strippedOriginalValue,
    prettyValue: friendly !== trimmed ? friendly : strippedOriginalValue,
    rawAction: trimmed
  };
}

/**
 * Converts a MacroStepConfig directly into a ParsedActionToken so every step row
 * displays a stylized colored [PREFIX] tag alongside a clean stripped value.
 */
export function parseMacroStepTag(step: MacroStepConfig): ParsedActionToken {
  switch (step.actionType) {
    case 'delay': {
      const totalMs = Math.max(0, step.delayMs || 0) * Math.max(1, step.repeatCount || 1);
      const val =
        totalMs >= 1000 && totalMs % 1000 === 0 ? `${totalMs / 1000}s` : `${totalMs} ms`;
      return {
        prefix: 'WAIT',
        value: val,
        prettyValue: `Wait ${val}`,
        rawAction: `WAIT:${totalMs}`
      };
    }
    case 'key': {
      const k = (step.value || '').trim().toUpperCase();
      return {
        prefix: 'KEY',
        value: k || 'KEY',
        prettyValue: k || 'Choose key',
        rawAction: k ? `SHORTCUT::${k.toLowerCase()}` : ''
      };
    }
    case 'text': {
      const txt = step.value || '';
      return {
        prefix: 'TEXT',
        value: txt || '…',
        prettyValue: txt ? `"${txt}"` : 'Enter text…',
        rawAction: `TEXT:${txt}`
      };
    }
    case 'shortcut': {
      const parsed = parseSingleActionKeyValue(step.value || 'SHORTCUT:cmd:c');
      return {
        ...parsed,
        prefix: 'SHORTCUT'
      };
    }
    default: {
      return parseSingleActionKeyValue(step.value);
    }
  }
}

/**
 * Parses any firmware action string (single 'KEY:VALUE', '||' sequence, or TextMacroRepeatConfig)
 * into structured colored-tag tokens with all raw 'PREFIX:' substrings removed from display labels.
 */
export function parseActionKeyValue(
  actionStr: string | undefined | null,
  repeatConfig?: TextMacroRepeatConfig
): ParsedActionDisplay {
  const raw = actionStr ?? '';
  const trimmed = raw.startsWith('TEXT:') ? raw : raw.trim();

  const repeatBadge = repeatConfig?.loopUntilStopped
    ? '∞ Loop'
    : repeatConfig && repeatConfig.repeatCount > 1
    ? `${repeatConfig.repeatCount}×`
    : null;

  if (repeatConfig?.steps && repeatConfig.steps.length > 0) {
    const tokens = repeatConfig.steps.map(parseMacroStepTag);
    if (tokens.length === 1) {
      return {
        isUnassigned: false,
        isMultiStep: false,
        prefix: tokens[0].prefix,
        value: tokens[0].value,
        prettyLabel: tokens[0].prettyValue,
        tokens,
        repeatBadge
      };
    }
    return {
      isUnassigned: false,
      isMultiStep: true,
      prefix: 'SEQ',
      value: tokens.map(t => t.value).join(' → '),
      prettyLabel: describeFirmwareAction(trimmed, repeatConfig).fullLabel,
      tokens,
      repeatBadge
    };
  }

  if (
    repeatConfig &&
    (repeatConfig.text || repeatConfig.followUpKey)
  ) {
    const steps = actionToMacroSteps(trimmed, repeatConfig);
    if (steps.length > 0) {
      const tokens = steps.map(parseMacroStepTag);
      return {
        isUnassigned: false,
        isMultiStep: tokens.length > 1,
        prefix: tokens.length > 1 ? 'SEQ' : tokens[0].prefix,
        value: tokens.map(t => t.value).join(' → '),
        prettyLabel: describeFirmwareAction(trimmed, repeatConfig).fullLabel,
        tokens,
        repeatBadge
      };
    }
  }

  if (!trimmed || trimmed === '—' || trimmed.toUpperCase().includes('UNASSIGNED')) {
    return {
      isUnassigned: true,
      isMultiStep: false,
      prefix: null,
      value: 'Unassigned',
      prettyLabel: 'Unassigned',
      tokens: [],
      repeatBadge: null
    };
  }

  if (trimmed.includes('||')) {
    const parts = trimmed
      .split('||')
      .map(p => p.trim())
      .filter(Boolean);
    const tokens = parts.map(parseSingleActionKeyValue);
    return {
      isUnassigned: false,
      isMultiStep: tokens.length > 1,
      prefix: tokens.length > 1 ? 'SEQ' : tokens[0]?.prefix ?? null,
      value: tokens.map(t => t.value).join(' → '),
      prettyLabel: describeFirmwareAction(trimmed).fullLabel,
      tokens,
      repeatBadge
    };
  }

  const single = parseSingleActionKeyValue(trimmed);
  return {
    isUnassigned: false,
    isMultiStep: false,
    prefix: single.prefix,
    value: single.value,
    prettyLabel: single.prettyValue,
    tokens: [single],
    repeatBadge
  };
}

const SHIFTED_PUNCTUATION_MAP: Record<string, string> = {
  '1': '!',
  '2': '@',
  '3': '#',
  '4': '$',
  '5': '%',
  '6': '^',
  '7': '&',
  '8': '*',
  '9': '(',
  '0': ')',
  '-': '_',
  '=': '+',
  '[': '{',
  ']': '}',
  ';': ':',
  ',': '<',
  '.': '>',
  '/': '?',
  '`': '~'
};

/**
 * Converts a normalized firmware key into a printable ASCII character suitable for a `TEXT:` step
 * when no Ctrl/Cmd/Alt/Win modifiers are held. Excludes `"` and `\` (disallowed by firmware JSON).
 */
export function fwKeyToPrintableAscii(
  fwKey: string,
  shiftHeld: boolean
): string | null {
  const k = (fwKey || '').toLowerCase();
  if (k === 'space') return ' ';
  if (/^[a-z]$/.test(k)) {
    return shiftHeld ? k.toUpperCase() : k;
  }
  if (/^[0-9]$/.test(k)) {
    return shiftHeld ? SHIFTED_PUNCTUATION_MAP[k] ?? null : k;
  }
  if (['-', '=', '[', ']', ';', "'", ',', '.', '/', '`'].includes(k)) {
    if (shiftHeld) {
      // Shift + ' produces " which firmware text macro rejects
      if (k === "'") return null;
      return SHIFTED_PUNCTUATION_MAP[k] ?? null;
    }
    return k;
  }
  return null;
}


