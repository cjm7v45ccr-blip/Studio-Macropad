import { ActionInfo } from '../types/macropod';

export const FIRMWARE_ACTIONS: ActionInfo[] = [
  // ==========================================
  // MULTI-KEY MACRO SEQUENCES (MAC & PC)
  // ==========================================
  { id: 'SHORTCUT:gui,shift:4', name: 'Capture Region', description: '⌘⇧4 Screenshot area', category: 'mac' },
  { id: 'SHORTCUT:gui,shift:3', name: 'Capture Screen', description: '⌘⇧3 Full screenshot', category: 'mac' },
  { id: 'SHORTCUT:gui,shift:5', name: 'Screen Recorder', description: '⌘⇧5 Recording utility', category: 'mac' },
  { id: 'SHORTCUT:gui,alt:escape', name: 'Force Quit Menu', description: '⌘⌥Esc Kill apps', category: 'mac' },
  { id: 'SHORTCUT:gui,ctrl:f', name: 'Full Screen', description: '⌘⌃F Toggle full window', category: 'mac' },
  { id: 'SHORTCUT:gui,shift:t', name: 'Reopen Closed Tab', description: '⌘⇧T Restore tab', category: 'mac' },
  { id: 'SHORTCUT:gui,shift:z', name: 'Redo Action', description: '⌘⇧Z Redo edits', category: 'mac' },
  { id: 'SHORTCUT:gui,alt:d', name: 'Toggle Dock', description: '⌘⌥D Hide/show dock', category: 'mac' },

  // Windows Multi-Key Macros
  { id: 'SHORTCUT:win,shift:s', name: 'Snipping Tool', description: 'Win+Shift+S Area snip', category: 'win' },
  { id: 'SHORTCUT:ctrl,shift:escape', name: 'Task Manager', description: 'Ctrl+Shift+Esc Direct', category: 'win' },
  { id: 'SHORTCUT:ctrl,alt:delete', name: 'Security Screen', description: 'Ctrl+Alt+Del Lock/switch', category: 'win' },
  { id: 'SHORTCUT:ctrl,shift:t', name: 'Reopen Closed Tab', description: 'Ctrl+Shift+T Restore tab', category: 'win' },
  { id: 'SHORTCUT:win,ctrl,shift:b', name: 'Restart GPU Driver', description: 'Win+Ctrl+Shift+B Video reset', category: 'win' },

  // Standard macOS Productivity
  { id: 'MACRO:COPY', name: 'Copy', description: '⌘C', category: 'mac' },
  { id: 'MACRO:PASTE', name: 'Paste', description: '⌘V', category: 'mac' },
  { id: 'MACRO:CUT', name: 'Cut', description: '⌘X', category: 'mac' },
  { id: 'MACRO:UNDO', name: 'Undo', description: '⌘Z', category: 'mac' },
  { id: 'MACRO:SELECT_ALL', name: 'Select All', description: '⌘A', category: 'mac' },
  { id: 'MACRO:SAVE', name: 'Save File', description: '⌘S', category: 'mac' },
  { id: 'MACRO:SPOTLIGHT', name: 'Spotlight Search', description: '⌘Space', category: 'mac' },
  { id: 'MACRO:LOCK', name: 'Lock Screen', description: '⌃⌘Q', category: 'mac' },
  { id: 'MACRO:NEW_TAB', name: 'New Browser Tab', description: '⌘T', category: 'mac' },
  { id: 'MACRO:CLOSE_TAB', name: 'Close Browser Tab', description: '⌘W', category: 'mac' },

  // Standard Windows Productivity
  { id: 'WIN:COPY', name: 'Copy', description: 'Ctrl+C', category: 'win' },
  { id: 'WIN:PASTE', name: 'Paste', description: 'Ctrl+V', category: 'win' },
  { id: 'WIN:CUT', name: 'Cut', description: 'Ctrl+X', category: 'win' },
  { id: 'WIN:UNDO', name: 'Undo', description: 'Ctrl+Z', category: 'win' },
  { id: 'WIN:REDO', name: 'Redo', description: 'Ctrl+Y', category: 'win' },
  { id: 'WIN:SELECT_ALL', name: 'Select All', description: 'Ctrl+A', category: 'win' },
  { id: 'WIN:SAVE', name: 'Save File', description: 'Ctrl+S', category: 'win' },
  { id: 'WIN:NEW_TAB', name: 'New Tab', description: 'Ctrl+T', category: 'win' },
  { id: 'WIN:CLOSE_TAB', name: 'Close Tab', description: 'Ctrl+W', category: 'win' },
  { id: 'WIN:LOCK', name: 'Lock Workstation', description: 'Win+L', category: 'win' },
  { id: 'WIN:SEARCH', name: 'Windows Search', description: 'Win+S', category: 'win' },
  { id: 'WIN:EXPLORER', name: 'File Explorer', description: 'Win+E', category: 'win' },
  { id: 'WIN:DESKTOP', name: 'Show Desktop', description: 'Win+D', category: 'win' },
  { id: 'WIN:RUN', name: 'Run Dialog', description: 'Win+R', category: 'win' },

  // PC / Mac Media & Function Keys
  { id: 'MEDIA:PLAY_PAUSE', name: 'Play / Pause', description: 'Toggle media playback', category: 'media' },
  { id: 'MEDIA:MUTE', name: 'Mute Audio', description: 'Toggle speaker mute', category: 'media' },
  { id: 'MEDIA:VOL_UP', name: 'Volume Up', description: 'Master volume up', category: 'media' },
  { id: 'MEDIA:VOL_DOWN', name: 'Volume Down', description: 'Master volume down', category: 'media' },
  { id: 'MEDIA:NEXT', name: 'Next Track', description: 'Skip forward', category: 'media' },
  { id: 'MEDIA:PREV', name: 'Previous Track', description: 'Skip backward', category: 'media' },
  { id: 'KEY:F13', name: 'F13 Key', description: 'Aux function key F13', category: 'media' },
  { id: 'KEY:F14', name: 'F14 Key', description: 'Aux function key F14', category: 'media' },
  { id: 'KEY:F15', name: 'F15 Key', description: 'Aux function key F15', category: 'media' },
  { id: 'KEY:F16', name: 'F16 Key', description: 'Aux function key F16', category: 'media' },

  // ==========================================
  // TV COMMANDS (SMARTCAST & SMART TV)
  // ==========================================
  { id: 'TV:POWER', name: 'TV Power', description: 'Power toggle', category: 'tv' },
  { id: 'TV:HOME', name: 'Home Screen', description: 'SmartCast menu', category: 'tv' },
  { id: 'TV:INPUT', name: 'Input Source', description: 'HDMI / Input picker', category: 'tv' },
  { id: 'TV:OK', name: 'OK / Select', description: 'Confirm selection', category: 'tv' },
  { id: 'TV:BACK', name: 'Back', description: 'Return to previous screen', category: 'tv' },
  { id: 'TV:EXIT', name: 'Exit Menu', description: 'Dismiss on-screen menu', category: 'tv' },
  { id: 'TV:MENU', name: 'TV Settings', description: 'Picture & TV settings menu', category: 'tv' },
  { id: 'TV:INFO', name: 'Info Banner', description: 'Current program info', category: 'tv' },
  { id: 'TV:GUIDE', name: 'TV Guide', description: 'Channel and schedule guide', category: 'tv' },
  { id: 'TV:CC', name: 'Captions (CC)', description: 'Toggle subtitles', category: 'tv' },
  { id: 'TV:UP', name: 'D-Pad Up', description: 'Navigate cursor up', category: 'tv' },
  { id: 'TV:DOWN', name: 'D-Pad Down', description: 'Navigate cursor down', category: 'tv' },
  { id: 'TV:LEFT', name: 'D-Pad Left', description: 'Navigate cursor left', category: 'tv' },
  { id: 'TV:RIGHT', name: 'D-Pad Right', description: 'Navigate cursor right', category: 'tv' },
  { id: 'TV:VOL_UP', name: 'TV Vol +', description: 'Increase TV speaker volume', category: 'tv' },
  { id: 'TV:VOL_DOWN', name: 'TV Vol -', description: 'Decrease TV speaker volume', category: 'tv' },
  { id: 'TV:MUTE', name: 'TV Mute', description: 'Mute TV audio', category: 'tv' },
  { id: 'TV:CH_UP', name: 'Channel Up', description: 'Next TV channel', category: 'tv' },
  { id: 'TV:CH_DOWN', name: 'Channel Down', description: 'Previous TV channel', category: 'tv' },
  { id: 'TV:PREV_CH', name: 'Last Channel', description: 'Jump to previous channel', category: 'tv' },
  { id: 'TV:PLAY', name: 'TV Play', description: 'Resume TV playback', category: 'tv' },
  { id: 'TV:PAUSE', name: 'TV Pause', description: 'Pause TV playback', category: 'tv' },
  { id: 'TV:STOP', name: 'TV Stop', description: 'Stop video stream', category: 'tv' },
  { id: 'TV:REWIND', name: 'TV Rewind', description: 'Rewind stream', category: 'tv' },
  { id: 'TV:FFWD', name: 'TV Fast Forward', description: 'Fast forward stream', category: 'tv' },

  // TV Streaming Apps
  { id: 'APP:YOUTUBE', name: 'YouTube', description: 'Launch YouTube app', category: 'app' },
  { id: 'APP:NETFLIX', name: 'Netflix', description: 'Launch Netflix app', category: 'app' },
  { id: 'APP:DISNEY', name: 'Disney+', description: 'Launch Disney+ app', category: 'app' },
  { id: 'APP:PRIME', name: 'Prime Video', description: 'Launch Prime Video app', category: 'app' },
  { id: 'APP:TUBI', name: 'Tubi', description: 'Launch Tubi TV app', category: 'app' },
  { id: 'APP:APPLETV', name: 'Apple TV+', description: 'Launch Apple TV+ app', category: 'app' }
];

export function getActionDetails(id: string): ActionInfo {
  if (!id) return { id: '', name: 'Unassigned', description: 'No action assigned', category: 'custom' };
  
  const found = FIRMWARE_ACTIONS.find(a => a.id === id);
  if (found) return found;

  if (id.startsWith('SEQUENCE:')) {
    const subParts = id.slice(9).split('|');
    return {
      id,
      name: `Macro Sequence (${subParts.length} steps)`,
      description: `Chained: ${subParts.map(s => getActionDetails(s).name).join(' → ')}`,
      category: 'custom'
    };
  }

  if (id.startsWith('DELAY:')) {
    const ms = id.slice(6);
    return { id, name: `Delay ${ms}ms`, description: `Pause for ${ms} milliseconds`, category: 'custom' };
  }

  if (id.startsWith('HOLD:')) {
    const ms = id.slice(5);
    return { id, name: `Hold Key (${ms}ms)`, description: `Hold down for ${ms}ms`, category: 'custom' };
  }

  if (id.startsWith('SHORTCUT:')) {
    const parts = id.split(':');
    const mods = parts[1] ? parts[1].split(',') : [];
    const key = parts[2] || '';
    
    // Sort modifiers for standard display: Cmd, Shift, Opt, Ctrl
    const glyphMap: Record<string, string> = {
      gui: '⌘',
      cmd: '⌘',
      win: '⊞',
      shift: '⇧',
      alt: '⌥',
      opt: '⌥',
      ctrl: '⌃'
    };

    const formattedMods = mods.map(m => glyphMap[m.toLowerCase()] || m.toUpperCase());
    
    // Format key name nicely
    let keyLabel = key.toUpperCase();
    if (key.toLowerCase() === 'escape' || key.toLowerCase() === 'esc') keyLabel = 'Esc';
    if (key.toLowerCase() === 'space') keyLabel = 'Space';
    if (key.toLowerCase() === 'enter' || key.toLowerCase() === 'return') keyLabel = '↵';
    if (key.toLowerCase() === 'backspace') keyLabel = '⌫';
    if (key.toLowerCase() === 'delete' || key.toLowerCase() === 'del') keyLabel = 'Del';

    const name = [...formattedMods, keyLabel].join('');
    const description = `Multi-key macro (${[...formattedMods, keyLabel].join(' + ')})`;
    return { id, name, description, category: 'custom' };
  }

  if (id.startsWith('TEXT:')) {
    const text = id.slice(5);
    return { id, name: `Type "${text}"`, description: `Types text string`, category: 'text' };
  }

  if (id.startsWith('TVKEY:')) {
    const parts = id.split(':');
    return { id, name: `TV Key (${parts[1]}, ${parts[2]})`, description: `Codeset ${parts[1]}, Code ${parts[2]}`, category: 'tv' };
  }

  if (id.startsWith('TVAPP:')) {
    const parts = id.split(':');
    return { id, name: `App ${parts[1]}`, description: parts[3] || 'SmartCast App', category: 'app' };
  }

  return { id, name: id, description: id, category: 'custom' };
}
