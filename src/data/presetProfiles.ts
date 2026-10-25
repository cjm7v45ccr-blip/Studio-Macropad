import { HardwareProfileId, HardwareSlotId } from '../types/studio';

export interface ProfilePreset {
  id: string;
  title: string;
  subtitle: string;
  mode: HardwareProfileId;
  description: string;
  bindings: Record<HardwareSlotId, string>;
}

export const CURATED_PRESETS: ProfilePreset[] = [
  {
    id: 'mac-everyday-media',
    title: 'Everyday Mac & Audio',
    subtitle: 'Clipboard, Spotlight & Volume',
    mode: 'MAC',
    description: 'Play/pause, copy, paste, Spotlight search, and smooth speaker volume on the knob.',
    bindings: {
      b1: 'MEDIA:PLAY_PAUSE',
      b2: 'MACRO:COPY',
      b3: 'MACRO:PASTE',
      b4: 'MACRO:SPOTLIGHT',
      dial: 'MEDIA:MUTE',
      enc_cw: 'MEDIA:VOL_UP',
      enc_ccw: 'MEDIA:VOL_DOWN'
    }
  },
  {
    id: 'mac-pro-editor',
    title: 'Video & Timeline Editor',
    subtitle: 'Cut, Undo & Frame Scrubbing',
    mode: 'MAC',
    description: 'Razor cut, undo/redo, quick save, and left/right arrow frame stepping on the rotary knob.',
    bindings: {
      b1: 'MACRO:CUT',
      b2: 'MACRO:UNDO',
      b3: 'MACRO:REDO',
      b4: 'MACRO:SAVE',
      dial: 'MEDIA:PLAY_PAUSE',
      enc_cw: 'SHORTCUT::right',
      enc_ccw: 'SHORTCUT::left'
    }
  },
  {
    id: 'mac-dev-browser',
    title: 'Developer & Browser Tabs',
    subtitle: 'Code & Tab Cycling',
    mode: 'MAC',
    description: 'Copy/paste, open/close browser tabs, save on knob press, and cycle tabs with knob turns.',
    bindings: {
      b1: 'MACRO:COPY',
      b2: 'MACRO:PASTE',
      b3: 'MACRO:NEW_TAB',
      b4: 'MACRO:CLOSE_TAB',
      dial: 'MACRO:SAVE',
      enc_cw: 'SHORTCUT:cmd,shift:]',
      enc_ccw: 'SHORTCUT:cmd,shift:['
    }
  },
  {
    id: 'win-creator-desk',
    title: 'Windows Creator Desk',
    subtitle: 'Snip, Explorer & Track Skip',
    mode: 'MAC',
    description: 'Screen snip, File Explorer, Task Manager, desktop toggle, and media track skipping.',
    bindings: {
      b1: 'WIN:SNIP',
      b2: 'WIN:EXPLORER',
      b3: 'WIN:TASK_MGR',
      b4: 'WIN:DESKTOP',
      dial: 'MEDIA:PLAY_PAUSE',
      enc_cw: 'MEDIA:NEXT',
      enc_ccw: 'MEDIA:PREV'
    }
  },
  {
    id: 'tv-cinema-lounge',
    title: 'SmartCast Streaming Lounge',
    subtitle: 'Apps & TV Volume',
    mode: 'TV',
    description: 'TV power toggle, YouTube, Netflix, and Disney+ launchers with TV mute and volume knob.',
    bindings: {
      b1: 'TV:POWER',
      b2: 'APP:YOUTUBE',
      b3: 'APP:NETFLIX',
      b4: 'APP:DISNEY',
      dial: 'TV:MUTE',
      enc_cw: 'TV:VOL_UP',
      enc_ccw: 'TV:VOL_DOWN'
    }
  },
  {
    id: 'tv-sports-cable',
    title: 'Live TV & Channel Surfer',
    subtitle: 'Guide, Captions & Channels',
    mode: 'TV',
    description: 'Program guide, HDMI input cycle, closed captions, last channel, and rotary channel surfing.',
    bindings: {
      b1: 'TV:GUIDE',
      b2: 'TV:INPUT',
      b3: 'TV:CC',
      b4: 'TV:PREV_CH',
      dial: 'TV:MUTE',
      enc_cw: 'TV:CH_UP',
      enc_ccw: 'TV:CH_DOWN'
    }
  }
];

