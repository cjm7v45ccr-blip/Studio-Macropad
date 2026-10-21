/**
 * Flagship Curated Profile Packs for Commercial MacroPad Buyers
 */

export interface ProfilePreset {
  id: string;
  title: string;
  subtitle: string;
  mode: 'MAC' | 'TV';
  description: string;
  bindings: {
    b1: string;
    b2: string;
    b3: string;
    b4: string;
    dial: string;
  };
}

export const CURATED_PRESETS: ProfilePreset[] = [
  {
    id: 'mac-pro-editor',
    title: 'Video Editor & Premiere',
    subtitle: 'macOS Cut & Scrubbing',
    mode: 'MAC',
    description: 'Razor cut tool, ripple delete, play/pause, and fast timeline scrubbing on the rotary dial.',
    bindings: {
      b1: 'MACRO:CUT',
      b2: 'KEY:F13',
      b3: 'MACRO:SAVE',
      b4: 'MEDIA:PLAY_PAUSE',
      dial: 'MEDIA:MUTE'
    }
  },
  {
    id: 'mac-dev-terminal',
    title: 'Developer & Terminal',
    subtitle: 'Code Navigation & Git',
    mode: 'MAC',
    description: 'Instant clipboard pipeline, tab switching, and code save with quick access to spotlight.',
    bindings: {
      b1: 'MACRO:COPY',
      b2: 'MACRO:PASTE',
      b3: 'MACRO:SAVE',
      b4: 'MACRO:SPOTLIGHT',
      dial: 'MEDIA:MUTE'
    }
  },
  {
    id: 'win-stream-gaming',
    title: 'Windows Stream & Discord',
    subtitle: 'Content Creator Setup',
    mode: 'MAC',
    description: 'Snipping tool, screen lock, task manager, and master audio control at your fingertips.',
    bindings: {
      b1: 'WIN:SNIP',
      b2: 'WIN:TASK_MGR',
      b3: 'WIN:DESKTOP',
      b4: 'MEDIA:PLAY_PAUSE',
      dial: 'MEDIA:MUTE'
    }
  },
  {
    id: 'tv-cinema-lounge',
    title: 'Living Room SmartCast',
    subtitle: 'Streaming & Home Theater',
    mode: 'TV',
    description: 'Instant power on, YouTube, Netflix, Disney+ app switching with TV mute dial.',
    bindings: {
      b1: 'TV:POWER',
      b2: 'APP:YOUTUBE',
      b3: 'APP:NETFLIX',
      b4: 'APP:DISNEY',
      dial: 'TV:MUTE'
    }
  },
  {
    id: 'tv-sports-cable',
    title: 'Cable & Sports Fan',
    subtitle: 'Guide & Channel Surfer',
    mode: 'TV',
    description: 'Channel surfing, sports info banner, program guide, and closed caption toggle.',
    bindings: {
      b1: 'TV:GUIDE',
      b2: 'TV:CH_UP',
      b3: 'TV:CH_DOWN',
      b4: 'TV:PREV_CH',
      dial: 'TV:MUTE'
    }
  }
];
