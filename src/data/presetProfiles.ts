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
    subtitle: 'Media, Clipboard & Spotlight',
    mode: 'MAC',
    description:
      'Play/pause, track transport, Spotlight search, copy/paste/undo, Mac lock, and smooth speaker volume on the knob.',
    bindings: {
      b1: 'MEDIA:PLAY_PAUSE',
      b2: 'MEDIA:PREV',
      b3: 'MEDIA:NEXT',
      b4: 'MACRO:SPOTLIGHT',
      b5: 'MACRO:COPY',
      b6: 'MACRO:PASTE',
      b7: 'MACRO:UNDO',
      b8: 'MACRO:LOCK',
      dial: 'MEDIA:MUTE',
      enc_cw: 'MEDIA:VOL_UP',
      enc_ccw: 'MEDIA:VOL_DOWN'
    }
  },
  {
    id: 'mac-pro-editor',
    title: 'Video & Timeline Editor',
    subtitle: 'Cut, Edit & Frame Scrubbing',
    mode: 'MAC',
    description:
      'Cut, copy, paste, select all, undo/redo, marker F13, quick save, and left/right arrow frame stepping on the rotary knob.',
    bindings: {
      b1: 'MACRO:CUT',
      b2: 'MACRO:COPY',
      b3: 'MACRO:PASTE',
      b4: 'MACRO:SELECT_ALL',
      b5: 'MACRO:UNDO',
      b6: 'MACRO:REDO',
      b7: 'KEY:F13',
      b8: 'MACRO:SAVE',
      dial: 'MEDIA:PLAY_PAUSE',
      enc_cw: 'SHORTCUT::right',
      enc_ccw: 'SHORTCUT::left'
    }
  },
  {
    id: 'mac-dev-browser',
    title: 'Developer & Browser Tabs',
    subtitle: 'Code, Snip & Tab Cycling',
    mode: 'MAC',
    description:
      'Copy/paste, open/close tabs, undo/redo, Spotlight, screenshot snip, save on knob press, and tab cycling on knob turns.',
    bindings: {
      b1: 'MACRO:COPY',
      b2: 'MACRO:PASTE',
      b3: 'MACRO:NEW_TAB',
      b4: 'MACRO:CLOSE_TAB',
      b5: 'MACRO:UNDO',
      b6: 'MACRO:REDO',
      b7: 'MACRO:SPOTLIGHT',
      b8: 'SHORTCUT:cmd,shift:4',
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
    description:
      'Screen snip, File Explorer, Task Manager, desktop toggle, Windows copy/paste/undo, PC lock, and media track skipping.',
    bindings: {
      b1: 'WIN:SNIP',
      b2: 'WIN:EXPLORER',
      b3: 'WIN:TASK_MGR',
      b4: 'WIN:DESKTOP',
      b5: 'WIN:COPY',
      b6: 'WIN:PASTE',
      b7: 'WIN:UNDO',
      b8: 'WIN:LOCK',
      dial: 'MEDIA:PLAY_PAUSE',
      enc_cw: 'MEDIA:NEXT',
      enc_ccw: 'MEDIA:PREV'
    }
  },
  {
    id: 'tv-cinema-lounge',
    title: 'SmartCast Streaming Lounge',
    subtitle: '6 Apps, Navigation & Volume',
    mode: 'TV',
    description:
      'TV power toggle, YouTube, Netflix, Disney+, Prime Video, Apple TV+, Home, and Back with TV mute and volume knob.',
    bindings: {
      b1: 'TV:POWER',
      b2: 'APP:YOUTUBE',
      b3: 'APP:NETFLIX',
      b4: 'APP:DISNEY',
      b5: 'APP:PRIME',
      b6: 'APP:APPLETV',
      b7: 'TV:HOME',
      b8: 'TV:BACK',
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
    description:
      'Power, program guide, HDMI input cycle, last channel, closed captions, info banner, OK, Exit, and rotary channel surfing.',
    bindings: {
      b1: 'TV:POWER',
      b2: 'TV:GUIDE',
      b3: 'TV:INPUT',
      b4: 'TV:PREV_CH',
      b5: 'TV:CC',
      b6: 'TV:INFO',
      b7: 'TV:OK',
      b8: 'TV:EXIT',
      dial: 'TV:MUTE',
      enc_cw: 'TV:CH_UP',
      enc_ccw: 'TV:CH_DOWN'
    }
  }
];

