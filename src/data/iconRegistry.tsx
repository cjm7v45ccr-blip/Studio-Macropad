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
  { id: 'play', label: 'Play', category: 'Media', keywords: ['play', 'start', 'resume', 'music'], component: Play },
  { id: 'pause', label: 'Pause', category: 'Media', keywords: ['pause', 'stop', 'wait'], component: Pause },
  { id: 'skip-forward', label: 'Next Track', category: 'Media', keywords: ['next', 'skip', 'forward'], component: SkipForward },
  { id: 'skip-back', label: 'Prev Track', category: 'Media', keywords: ['prev', 'previous', 'back', 'rewind'], component: SkipBack },
  { id: 'volume-2', label: 'Volume Up', category: 'Media', keywords: ['volume', 'loud', 'speaker', 'audio'], component: Volume2 },
  { id: 'volume-1', label: 'Volume Down', category: 'Media', keywords: ['volume', 'quiet', 'audio'], component: Volume1 },
  { id: 'volume-x', label: 'Mute Speaker', category: 'Media', keywords: ['mute', 'silent', 'volume'], component: VolumeX },
  { id: 'heart', label: 'Like / Favorite', category: 'Media', keywords: ['like', 'heart', 'spotify', 'save'], component: Heart },
  { id: 'shuffle', label: 'Shuffle', category: 'Media', keywords: ['shuffle', 'random'], component: Shuffle },
  { id: 'repeat', label: 'Repeat', category: 'Media', keywords: ['repeat', 'loop'], component: Repeat },

  // Meetings & Stream
  { id: 'mic', label: 'Mic On', category: 'Stream & Calls', keywords: ['mic', 'microphone', 'voice', 'audio'], component: Mic },
  { id: 'mic-off', label: 'Mic Mute', category: 'Stream & Calls', keywords: ['mute', 'mic', 'zoom', 'obs'], component: MicOff },
  { id: 'video', label: 'Camera / Video', category: 'Stream & Calls', keywords: ['video', 'camera', 'youtube', 'stream'], component: Video },
  { id: 'video-off', label: 'Camera Off', category: 'Stream & Calls', keywords: ['video', 'hide', 'webcam'], component: VideoOff },
  { id: 'radio', label: 'Go Live / Stream', category: 'Stream & Calls', keywords: ['live', 'broadcast', 'obs', 'stream'], component: Radio },
  { id: 'monitor-up', label: 'Input / Share', category: 'Stream & Calls', keywords: ['share', 'screen', 'hdmi', 'input'], component: MonitorUp },
  { id: 'clapperboard', label: 'Cinema / App', category: 'Stream & Calls', keywords: ['scene', 'movie', 'tv', 'clip'], component: Clapperboard },
  { id: 'hand', label: 'Raise Hand', category: 'Stream & Calls', keywords: ['hand', 'zoom', 'question'], component: Hand },
  { id: 'message-square', label: 'Captions / Chat', category: 'Stream & Calls', keywords: ['chat', 'cc', 'captions'], component: MessageSquare },
  { id: 'phone-off', label: 'Close / Exit', category: 'Stream & Calls', keywords: ['leave', 'exit', 'close', 'stop'], component: PhoneOff },

  // Creative & Video Editing
  { id: 'scissors', label: 'Cut / Blade', category: 'Creative', keywords: ['cut', 'razor', 'blade', 'split', 'trim'], component: Scissors },
  { id: 'brush', label: 'Brush', category: 'Creative', keywords: ['brush', 'paint', 'photoshop'], component: Brush },
  { id: 'pipette', label: 'Eyedropper', category: 'Creative', keywords: ['eyedropper', 'color', 'sample', 'picker'], component: Pipette },
  { id: 'pen-tool', label: 'Pen / Vector', category: 'Creative', keywords: ['pen', 'bezier', 'figma', 'illustrator'], component: PenTool },
  { id: 'wand', label: 'Select / Magic', category: 'Creative', keywords: ['wand', 'lasso', 'select', 'grade'], component: Wand2 },
  { id: 'crop', label: 'Crop / Frame', category: 'Creative', keywords: ['crop', 'frame', 'figma', 'slice'], component: Crop },
  { id: 'palette', label: 'Color Grade', category: 'Creative', keywords: ['color', 'davinci', 'lut', 'palette'], component: Palette },
  { id: 'layers', label: 'Mode / Switch', category: 'Creative', keywords: ['layer', 'mode', 'profile', 'switch'], component: Layers },
  { id: 'zoom-in', label: 'Zoom In', category: 'Creative', keywords: ['zoom', 'magnify', 'plus'], component: ZoomIn },
  { id: 'zoom-out', label: 'Zoom Out', category: 'Creative', keywords: ['zoom', 'minus', 'fit'], component: ZoomOut },
  { id: 'bookmark', label: 'Marker', category: 'Creative', keywords: ['marker', 'flag', 'timeline', 'in', 'out'], component: Bookmark },
  { id: 'move', label: 'Transform / Move', category: 'Creative', keywords: ['move', 'transform', 'pan'], component: Move },
  { id: 'sliders', label: 'Settings / Menu', category: 'Creative', keywords: ['mixer', 'adjust', 'menu', 'settings'], component: Sliders },

  // Code & Development
  { id: 'terminal', label: 'Terminal / Task', category: 'Code', keywords: ['terminal', 'shell', 'task', 'cli'], component: Terminal },
  { id: 'code', label: 'Code / Format', category: 'Code', keywords: ['code', 'format', 'vscode', 'editor'], component: Code2 },
  { id: 'git-branch', label: 'Git Branch', category: 'Code', keywords: ['git', 'branch', 'checkout'], component: GitBranch },
  { id: 'git-commit', label: 'Git Commit', category: 'Code', keywords: ['git', 'commit', 'push'], component: GitCommitHorizontal },
  { id: 'bug', label: 'Debug', category: 'Code', keywords: ['debug', 'breakpoint', 'inspect'], component: Bug },
  { id: 'play-circle', label: 'Run / Launch', category: 'Code', keywords: ['run', 'launch', 'prime', 'app'], component: PlayCircle },
  { id: 'columns', label: 'Split Editor', category: 'Code', keywords: ['split', 'pane', 'columns'], component: Columns2 },

  // Productivity & System
  { id: 'copy', label: 'Copy', category: 'System', keywords: ['copy', 'duplicate'], component: Copy },
  { id: 'paste', label: 'Paste', category: 'System', keywords: ['paste', 'clipboard'], component: ClipboardPaste },
  { id: 'undo', label: 'Undo / Back', category: 'System', keywords: ['undo', 'back', 'revert'], component: Undo2 },
  { id: 'redo', label: 'Redo', category: 'System', keywords: ['redo', 'forward'], component: Redo2 },
  { id: 'save', label: 'Save', category: 'System', keywords: ['save', 'export', 'disk'], component: Save },
  { id: 'search', label: 'Search / Spotlight', category: 'System', keywords: ['search', 'find', 'spotlight', 'palette'], component: Search },
  { id: 'command', label: 'Shortcut / Key', category: 'System', keywords: ['command', 'shortcut', 'macro', 'key'], component: Command },
  { id: 'camera', label: 'Screenshot / Snip', category: 'System', keywords: ['screenshot', 'capture', 'snip'], component: Camera },
  { id: 'maximize', label: 'Fullscreen', category: 'System', keywords: ['fullscreen', 'window', 'zen', 'maximize'], component: Maximize2 },
  { id: 'layout-grid', label: 'Guide / Grid', category: 'System', keywords: ['apps', 'guide', 'grid', 'windows'], component: LayoutGrid },
  { id: 'sun', label: 'Brightness Up', category: 'System', keywords: ['brightness', 'light', 'sun'], component: Sun },
  { id: 'moon', label: 'Sleep / Night', category: 'System', keywords: ['sleep', 'dark', 'moon', 'dnd'], component: Moon },
  { id: 'lock', label: 'Lock Screen', category: 'System', keywords: ['lock', 'security', 'password'], component: Lock },
  { id: 'power', label: 'Power', category: 'System', keywords: ['power', 'tv', 'shutdown', 'toggle'], component: Power },
  { id: 'globe', label: 'Browser Tab', category: 'System', keywords: ['web', 'browser', 'tab', 'link'], component: Globe },
  { id: 'folder', label: 'File Explorer', category: 'System', keywords: ['folder', 'file', 'finder', 'explorer'], component: FolderOpen },
  { id: 'file-text', label: 'Text Macro', category: 'System', keywords: ['text', 'snippet', 'note', 'paste'], component: FileText },
  { id: 'webhook', label: 'Network', category: 'System', keywords: ['network', 'http', 'api'], component: Webhook },
  { id: 'zap', label: 'Macro', category: 'System', keywords: ['macro', 'multi', 'sequence', 'automation'], component: Zap },
  { id: 'mouse', label: 'Click', category: 'System', keywords: ['mouse', 'click', 'select'], component: MousePointerClick },
  { id: 'monitor', label: 'Desktop / Display', category: 'System', keywords: ['monitor', 'display', 'desktop', 'appletv'], component: Monitor },
  { id: 'tv', label: 'Smart TV', category: 'System', keywords: ['tv', 'remote', 'hdmi', 'netflix'], component: Tv },
  { id: 'check-square', label: 'OK / Select All', category: 'System', keywords: ['ok', 'select', 'check'], component: CheckSquare },
  { id: 'sparkles', label: 'Info / Streaming', category: 'System', keywords: ['disney', 'info', 'effect'], component: Sparkles },

  // Navigation
  { id: 'arrow-up', label: 'Up', category: 'Navigation', keywords: ['up', 'arrow', 'channel'], component: ArrowUp },
  { id: 'arrow-down', label: 'Down', category: 'Navigation', keywords: ['down', 'arrow', 'channel'], component: ArrowDown },
  { id: 'arrow-left', label: 'Left', category: 'Navigation', keywords: ['left', 'arrow', 'step'], component: ArrowLeft },
  { id: 'arrow-right', label: 'Right', category: 'Navigation', keywords: ['right', 'arrow', 'step'], component: ArrowRight },
  { id: 'none', label: 'Unassigned', category: 'Navigation', keywords: ['none', 'empty', 'off'], component: CircleOff }
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
