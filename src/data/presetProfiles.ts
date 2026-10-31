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
    id: 'universal-multi-host',
    title: 'Universal Multi-Device',
    subtitle: 'OS-Neutral Media & Host Cycle',
    mode: 'HOST1',
    description:
      'OS-neutral consumer media transport, F13–F15 macro triggers, 1-tap Next BLE Host switching, plus dual knobs for volume and track skip.',
    bindings: {
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
    }
  },
  {
    id: 'mac-everyday-media',
    title: 'Everyday Mac & Audio',
    subtitle: 'Media, Clipboard & Spotlight',
    mode: 'HOST1',
    description:
      'Play/pause, track transport, Spotlight search, copy/paste/undo, Mac lock, speaker volume on Knob 1, and tab cycling on Knob 2.',
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
      enc_ccw: 'MEDIA:VOL_DOWN',
      dial2: 'MACRO:NEW_TAB',
      e2_cw: 'SHORTCUT:cmd,shift:]',
      e2_ccw: 'SHORTCUT:cmd,shift:['
    }
  },
  {
    id: 'win-creator-desk',
    title: 'Windows Creator Desk',
    subtitle: 'Snip, Explorer & Dual Audio',
    mode: 'HOST2',
    description:
      'Screen snip, File Explorer, Task Manager, desktop toggle, Windows copy/paste/undo, PC lock, track skip on Knob 1, and volume on Knob 2.',
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
      enc_ccw: 'MEDIA:PREV',
      dial2: 'MEDIA:MUTE',
      e2_cw: 'MEDIA:VOL_UP',
      e2_ccw: 'MEDIA:VOL_DOWN'
    }
  },
  {
    id: 'mac-pro-editor',
    title: 'Video & Timeline Editor',
    subtitle: 'Cut, Scrub & Monitor Volume',
    mode: 'HOST1',
    description:
      'Cut, copy, paste, select all, undo/redo, marker F13, quick save, frame scrubbing on Knob 1, and monitor volume on Knob 2.',
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
      enc_ccw: 'SHORTCUT::left',
      dial2: 'MEDIA:MUTE',
      e2_cw: 'MEDIA:VOL_UP',
      e2_ccw: 'MEDIA:VOL_DOWN'
    }
  },
  {
    id: 'mac-dev-browser',
    title: 'Developer & Browser Tabs',
    subtitle: 'Code, Snip & Tab Cycling',
    mode: 'HOST3',
    description:
      'Copy/paste, open/close tabs, undo/redo, Spotlight, screenshot snip, tab cycling on Knob 1, and history/audio control on Knob 2.',
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
      enc_ccw: 'SHORTCUT:cmd,shift:[',
      dial2: 'MEDIA:MUTE',
      e2_cw: 'MACRO:REDO',
      e2_ccw: 'MACRO:UNDO'
    }
  },
  {
    id: 'design-zoom-display',
    title: 'Canvas Zoom & Display',
    subtitle: 'Zoom, Brightness & Creative',
    mode: 'HOST1',
    description:
      'Zoom in/out/100% on keys and Knob 1, screen brightness up/down on Knob 2, plus screenshot, undo/redo, and save.',
    bindings: {
      b1: 'SHORTCUT:cmd:=',
      b2: 'SHORTCUT:cmd:-',
      b3: 'SHORTCUT:cmd:0',
      b4: 'SHORTCUT:cmd,shift:4',
      b5: 'MEDIA:BRIGHT_UP',
      b6: 'MEDIA:BRIGHT_DOWN',
      b7: 'MACRO:UNDO',
      b8: 'MACRO:SAVE',
      dial: 'SHORTCUT:cmd:0',
      enc_cw: 'SHORTCUT:cmd:=',
      enc_ccw: 'SHORTCUT:cmd:-',
      dial2: 'MEDIA:MUTE',
      e2_cw: 'MEDIA:BRIGHT_UP',
      e2_ccw: 'MEDIA:BRIGHT_DOWN'
    }
  },
  {
    id: 'tv-cinema-lounge',
    title: 'SmartCast Streaming Lounge',
    subtitle: '6 Apps, Volume & Channels',
    mode: 'TV',
    description:
      'TV power toggle, YouTube, Netflix, Disney+, Prime Video, Apple TV+, Home, and Back with TV volume on Knob 1 and channels on Knob 2.',
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
      enc_ccw: 'TV:VOL_DOWN',
      dial2: 'TV:OK',
      e2_cw: 'TV:CH_UP',
      e2_ccw: 'TV:CH_DOWN'
    }
  },
  {
    id: 'tv-sports-cable',
    title: 'Live TV & Channel Surfer',
    subtitle: 'Guide, Channels & Volume',
    mode: 'TV',
    description:
      'Power, program guide, HDMI input cycle, last channel, closed captions, info banner, OK, Exit, channel surf on Knob 1, and volume on Knob 2.',
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
      enc_ccw: 'TV:CH_DOWN',
      dial2: 'TV:INPUT',
      e2_cw: 'TV:VOL_UP',
      e2_ccw: 'TV:VOL_DOWN'
    }
  }
];

