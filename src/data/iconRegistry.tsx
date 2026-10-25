import React from 'react';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  Volume1,
  VolumeX,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Camera,
  Scissors,
  Copy,
  ClipboardPaste,
  Undo2,
  Redo2,
  Save,
  Search,
  Terminal,
  Code2,
  GitBranch,
  GitCommitHorizontal,
  Bug,
  PlayCircle,
  Columns2,
  Layers,
  Palette,
  Pipette,
  Brush,
  Crop,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Move,
  Wand2,
  PenTool,
  LayoutGrid,
  Radio,
  Tv,
  Monitor,
  MonitorUp,
  Clapperboard,
  Bookmark,
  Sparkles,
  Sun,
  Moon,
  Lock,
  Power,
  Globe,
  FolderOpen,
  FileText,
  Webhook,
  Zap,
  MousePointerClick,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Hand,
  MessageSquare,
  Heart,
  Shuffle,
  Repeat,
  PhoneOff,
  Command,
  Sliders,
  CheckSquare,
  CircleOff
} from 'lucide-react';
import { ActionBinding, CustomMacroItem } from '../types/studio';
import { bindingToFirmwareAction, describeFirmwareAction } from './firmwareCatalog';

export interface IconEntry {
  id: string;
  label: string;
  category: string;
  keywords: string[];
  component: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}

export const ICON_LIBRARY: IconEntry[] = [
  // Media & Audio
  { id: 'play', label: 'Play / Start', category: 'Media', keywords: ['play', 'play_arrow', 'start', 'resume', 'music'], component: Play },
  { id: 'pause', label: 'Pause', category: 'Media', keywords: ['pause', 'stop', 'wait'], component: Pause },
  { id: 'skip-forward', label: 'Next Track', category: 'Media', keywords: ['next', 'skip', 'forward', 'skip_next'], component: SkipForward },
  { id: 'skip-back', label: 'Prev Track', category: 'Media', keywords: ['prev', 'previous', 'back', 'rewind', 'skip_previous'], component: SkipBack },
  { id: 'volume-2', label: 'Volume Up', category: 'Media', keywords: ['volume', 'volume_up', 'loud', 'speaker', 'audio'], component: Volume2 },
  { id: 'volume-1', label: 'Volume Down', category: 'Media', keywords: ['volume', 'volume_down', 'quiet', 'audio'], component: Volume1 },
  { id: 'volume-x', label: 'Mute Speaker', category: 'Media', keywords: ['mute', 'volume_off', 'silent', 'volume'], component: VolumeX },
  { id: 'heart', label: 'Like / Favorite', category: 'Media', keywords: ['like', 'favorite', 'heart', 'spotify', 'save', 'star'], component: Heart },
  { id: 'shuffle', label: 'Shuffle', category: 'Media', keywords: ['shuffle', 'random'], component: Shuffle },
  { id: 'repeat', label: 'Repeat', category: 'Media', keywords: ['repeat', 'loop'], component: Repeat },

  // Meetings & Stream
  { id: 'mic', label: 'Mic On', category: 'Stream & Calls', keywords: ['mic', 'microphone', 'voice', 'audio'], component: Mic },
  { id: 'mic-off', label: 'Mic Mute', category: 'Stream & Calls', keywords: ['mute', 'mic_off', 'zoom', 'obs'], component: MicOff },
  { id: 'video', label: 'Camera / Video', category: 'Stream & Calls', keywords: ['video', 'videocam', 'camera', 'youtube', 'stream'], component: Video },
  { id: 'video-off', label: 'Camera Off', category: 'Stream & Calls', keywords: ['video_off', 'hide', 'webcam'], component: VideoOff },
  { id: 'radio', label: 'Go Live / Stream', category: 'Stream & Calls', keywords: ['live', 'broadcast', 'obs', 'stream', 'rss'], component: Radio },
  { id: 'monitor-up', label: 'Input / Share', category: 'Stream & Calls', keywords: ['share', 'screen', 'hdmi', 'input', 'cast'], component: MonitorUp },
  { id: 'clapperboard', label: 'Cinema / App', category: 'Stream & Calls', keywords: ['scene', 'movie', 'tv', 'clip', 'local_movies'], component: Clapperboard },
  { id: 'hand', label: 'Raise Hand', category: 'Stream & Calls', keywords: ['hand', 'zoom', 'question', 'front_hand'], component: Hand },
  { id: 'message-square', label: 'Captions / Chat', category: 'Stream & Calls', keywords: ['chat', 'cc', 'captions', 'forum', 'comment'], component: MessageSquare },
  { id: 'phone-off', label: 'Close / Exit', category: 'Stream & Calls', keywords: ['leave', 'exit', 'close', 'stop', 'call_end'], component: PhoneOff },

  // Creative & Video Editing
  { id: 'scissors', label: 'Cut / Blade', category: 'Creative', keywords: ['cut', 'razor', 'blade', 'split', 'trim', 'content_cut'], component: Scissors },
  { id: 'brush', label: 'Brush', category: 'Creative', keywords: ['brush', 'paint', 'photoshop', 'brush'], component: Brush },
  { id: 'pipette', label: 'Eyedropper', category: 'Creative', keywords: ['eyedropper', 'color', 'sample', 'picker', 'colorize'], component: Pipette },
  { id: 'pen-tool', label: 'Pen / Vector', category: 'Creative', keywords: ['pen', 'bezier', 'figma', 'illustrator', 'edit'], component: PenTool },
  { id: 'wand', label: 'Select / Magic', category: 'Creative', keywords: ['wand', 'auto_fix', 'lasso', 'select', 'grade'], component: Wand2 },
  { id: 'crop', label: 'Crop / Frame', category: 'Creative', keywords: ['crop', 'frame', 'figma', 'slice'], component: Crop },
  { id: 'palette', label: 'Color Grade', category: 'Creative', keywords: ['color', 'palette', 'davinci', 'lut'], component: Palette },
  { id: 'layers', label: 'Mode / Switch', category: 'Creative', keywords: ['layer', 'layers', 'mode', 'profile', 'switch'], component: Layers },
  { id: 'zoom-in', label: 'Zoom In', category: 'Creative', keywords: ['zoom', 'magnify', 'zoom_in', 'plus'], component: ZoomIn },
  { id: 'zoom-out', label: 'Zoom Out', category: 'Creative', keywords: ['zoom', 'zoom_out', 'minus', 'fit'], component: ZoomOut },
  { id: 'bookmark', label: 'Marker', category: 'Creative', keywords: ['marker', 'flag', 'timeline', 'bookmark'], component: Bookmark },
  { id: 'move', label: 'Transform / Move', category: 'Creative', keywords: ['move', 'transform', 'pan', 'open_with'], component: Move },
  { id: 'sliders', label: 'Settings / Menu', category: 'Creative', keywords: ['mixer', 'adjust', 'menu', 'settings', 'tune'], component: Sliders },

  // Code & Development
  { id: 'terminal', label: 'Terminal / Task', category: 'Code', keywords: ['terminal', 'shell', 'task', 'cli', 'computer'], component: Terminal },
  { id: 'code', label: 'Code / Format', category: 'Code', keywords: ['code', 'format', 'vscode', 'editor', 'integration'], component: Code2 },
  { id: 'git-branch', label: 'Git Branch', category: 'Code', keywords: ['git', 'branch', 'checkout', 'call_split'], component: GitBranch },
  { id: 'git-commit', label: 'Git Commit', category: 'Code', keywords: ['git', 'commit', 'push', 'data_object'], component: GitCommitHorizontal },
  { id: 'bug', label: 'Debug', category: 'Code', keywords: ['debug', 'breakpoint', 'inspect', 'bug_report'], component: Bug },
  { id: 'play-circle', label: 'Run / Launch', category: 'Code', keywords: ['run', 'launch', 'prime', 'play_circle'], component: PlayCircle },
  { id: 'columns', label: 'Split Editor', category: 'Code', keywords: ['split', 'pane', 'columns', 'view_column'], component: Columns2 },

  // Productivity & System
  { id: 'copy', label: 'Copy', category: 'System', keywords: ['copy', 'duplicate', 'content_copy'], component: Copy },
  { id: 'paste', label: 'Paste', category: 'System', keywords: ['paste', 'clipboard', 'content_paste'], component: ClipboardPaste },
  { id: 'undo', label: 'Undo / Back', category: 'System', keywords: ['undo', 'back', 'revert', 'history'], component: Undo2 },
  { id: 'redo', label: 'Redo', category: 'System', keywords: ['redo', 'forward', 'update'], component: Redo2 },
  { id: 'save', label: 'Save', category: 'System', keywords: ['save', 'export', 'disk', 'save_alt'], component: Save },
  { id: 'search', label: 'Search / Spotlight', category: 'System', keywords: ['search', 'find', 'spotlight', 'palette', 'zoom_in'], component: Search },
  { id: 'command', label: 'Shortcut / Key', category: 'System', keywords: ['command', 'shortcut', 'macro', 'key', 'keyboard'], component: Command },
  { id: 'camera', label: 'Screenshot / Snip', category: 'System', keywords: ['screenshot', 'capture', 'snip', 'photo_camera'], component: Camera },
  { id: 'maximize', label: 'Fullscreen', category: 'System', keywords: ['fullscreen', 'window', 'zen', 'maximize', 'fullscreen'], component: Maximize2 },
  { id: 'layout-grid', label: 'Guide / Grid', category: 'System', keywords: ['apps', 'guide', 'grid', 'windows', 'grid_view'], component: LayoutGrid },
  { id: 'sun', label: 'Brightness Up', category: 'System', keywords: ['brightness', 'light', 'sun', 'wb_sunny'], component: Sun },
  { id: 'moon', label: 'Sleep / Night', category: 'System', keywords: ['sleep', 'dark', 'moon', 'dnd', 'nightlight'], component: Moon },
  { id: 'lock', label: 'Lock Screen', category: 'System', keywords: ['lock', 'security', 'password', 'lock'], component: Lock },
  { id: 'power', label: 'Power', category: 'System', keywords: ['power', 'tv', 'shutdown', 'toggle', 'power_settings_new'], component: Power },
  { id: 'globe', label: 'Browser Tab', category: 'System', keywords: ['web', 'browser', 'tab', 'link', 'language'], component: Globe },
  { id: 'folder', label: 'File Explorer', category: 'System', keywords: ['folder', 'file', 'finder', 'explorer', 'folder_open'], component: FolderOpen },
  { id: 'file-text', label: 'Text Macro', category: 'System', keywords: ['text', 'snippet', 'note', 'paste', 'description'], component: FileText },
  { id: 'webhook', label: 'Network', category: 'System', keywords: ['network', 'http', 'api', 'webhook'], component: Webhook },
  { id: 'zap', label: 'Macro', category: 'System', keywords: ['macro', 'multi', 'sequence', 'automation', 'bolt'], component: Zap },
  { id: 'mouse', label: 'Click', category: 'System', keywords: ['mouse', 'click', 'select', 'ads_click'], component: MousePointerClick },
  { id: 'monitor', label: 'Desktop / Display', category: 'System', keywords: ['monitor', 'display', 'desktop', 'tv', 'desktop_windows'], component: Monitor },
  { id: 'tv', label: 'Smart TV', category: 'System', keywords: ['tv', 'remote', 'hdmi', 'netflix', 'live_tv'], component: Tv },
  { id: 'check-square', label: 'OK / Select All', category: 'System', keywords: ['ok', 'select', 'check', 'check_box'], component: CheckSquare },
  { id: 'sparkles', label: 'Info / Streaming', category: 'System', keywords: ['disney', 'info', 'effect', 'auto_awesome'], component: Sparkles },

  // Navigation
  { id: 'arrow-up', label: 'Up', category: 'Navigation', keywords: ['up', 'arrow', 'channel', 'keyboard_arrow_up'], component: ArrowUp },
  { id: 'arrow-down', label: 'Down', category: 'Navigation', keywords: ['down', 'arrow', 'channel', 'keyboard_arrow_down'], component: ArrowDown },
  { id: 'arrow-left', label: 'Left', category: 'Navigation', keywords: ['left', 'arrow', 'step', 'keyboard_arrow_left'], component: ArrowLeft },
  { id: 'arrow-right', label: 'Right', category: 'Navigation', keywords: ['right', 'arrow', 'step', 'keyboard_arrow_right'], component: ArrowRight },
  { id: 'none', label: 'Unassigned', category: 'Navigation', keywords: ['none', 'empty', 'off', 'block'], component: CircleOff }
];

export const KeycapIcon: React.FC<{
  icon: string;
  className?: string;
  style?: React.CSSProperties;
}> = ({ icon, className = 'w-5 h-5', style }) => {
  if (!icon) {
    return <Command className={className} style={style} />;
  }
  if (icon.startsWith('data:image/')) {
    return (
      <img
        src={icon}
        alt="Custom keycap icon"
        referrerPolicy="no-referrer"
        className={`${className} object-contain rounded-sm`}
        style={style}
      />
    );
  }
  const found = ICON_LIBRARY.find(entry => entry.id === icon);
  const IconComp = found ? found.component : Command;
  return <IconComp className={className} style={style} />;
};

export function summarizeAction(binding: ActionBinding, customMacros: CustomMacroItem[] = []): string {
  const raw = bindingToFirmwareAction(binding);
  if (!raw) return 'Unassigned (Sync USB or choose action)';
  if (binding.repeatConfig) {
    return describeFirmwareAction(raw, binding.repeatConfig).fullLabel;
  }
  const matchedMacro = customMacros.find(m => m.action === raw);
  if (matchedMacro) {
    return `${matchedMacro.name} (${raw.replace(/\n/g, '\\n')})`;
  }
  const info = describeFirmwareAction(raw);
  return `${info.fullLabel}`;
}
