export type KeyId = 'k1' | 'k2' | 'k3' | 'k4' | 'k5' | 'k6' | 'k7' | 'k8' | 'k9';
export type ControlId = KeyId | 'encoder';

export type SidebarSection = 'device' | 'macros' | 'lighting' | 'library' | 'settings';
export type CanvasViewMode = 'edit' | 'test';
export type EncoderPlacement = 'top' | 'side';

export type TriggerType = 'tap' | 'hold' | 'double_tap' | 'tap_hold';

export type ActionType =
  | 'shortcut'
  | 'text'
  | 'macro'
  | 'media'
  | 'system'
  | 'open'
  | 'mouse'
  | 'layer'
  | 'webhook'
  | 'multi'
  | 'none';

export interface MultiStepAction {
  id: string;
  type: Exclude<ActionType, 'multi' | 'none'>;
  value: string;
  label: string;
  delayAfterMs: number;
}

export interface ActionBinding {
  type: ActionType;
  /** Shortcut combo e.g. "Cmd+Shift+P", or media code, or text snippet, or macro ID, etc. */
  value: string;
  /** Secondary metadata depending on type */
  meta?: {
    openTargetType?: 'app' | 'file' | 'url';
    mouseAction?: 'left_click' | 'right_click' | 'middle_click' | 'double_click' | 'scroll_up' | 'scroll_down' | 'scroll_left' | 'scroll_right' | 'move_xy';
    mouseAmount?: number;
    mouseY?: number;
    layerSwitchMode?: 'momentary' | 'toggle' | 'profile';
    targetLayerIndex?: number;
    targetProfileId?: string;
    webhookMethod?: 'POST' | 'GET' | 'PUT';
    webhookPayload?: string;
    multiSteps?: MultiStepAction[];
  };
}

export interface KeyAppearance {
  label: string;
  icon: string; // Icon registry key OR data:image/... custom upload URL
  labelColor: string;
}

export interface KeyAdvancedConfig {
  debounceOverrideMs: number; // 0 = use global
  repeatWhileHeld: boolean;
  repeatRateMs: number;
  delayBeforeFiringMs: number;
}

export interface KeyControlConfig {
  id: KeyId;
  triggers: Record<TriggerType, ActionBinding>;
  appearance: KeyAppearance;
  advanced: KeyAdvancedConfig;
}

export interface EncoderModeConfig {
  id: string;
  name: string;
  color: string;
  cw: ActionBinding;
  ccw: ActionBinding;
  press: {
    tap: ActionBinding;
    hold: ActionBinding;
    double_tap: ActionBinding;
  };
  pressRotate: {
    cw: ActionBinding;
    ccw: ActionBinding;
  };
}

export interface EncoderFeelConfig {
  sensitivity: number; // 1..8 steps per action
  acceleration: boolean;
  invertDirection: boolean;
}

export interface EncoderControlConfig {
  activeModeId: string;
  clickCyclesModes: boolean;
  modes: EncoderModeConfig[];
  feel: EncoderFeelConfig;
}

export type LightingEffect = 'solid' | 'breathing' | 'rainbow' | 'reactive' | 'ripple';

export interface LightingConfig {
  effect: LightingEffect;
  brightness: number; // 0..100
  speed: number; // 0..100
  useLayerColor: boolean;
  perKeyColors: Record<KeyId, string>;
  encoderRingColor: string;
}

export interface LayerConfig {
  id: string;
  name: string;
  color: string;
  keys: Record<KeyId, KeyControlConfig>;
  encoder: EncoderControlConfig;
}

export interface StudioProfile {
  id: string;
  name: string;
  appHint?: string;
  activeLayerIndex: number; // 0..3
  layers: [LayerConfig, LayerConfig, LayerConfig, LayerConfig];
  lighting: LightingConfig;
}

export type MacroStepType = 'key_down' | 'key_up' | 'delay' | 'text' | 'mouse';
export type MacroRepeatMode = 'once' | 'count' | 'while_held';

export interface MacroStep {
  id: string;
  type: MacroStepType;
  value: string; // key code, text content, or mouse button
  delayMs?: number; // used when type === 'delay'
}

export interface MacroItem {
  id: string;
  name: string;
  folderId: string;
  repeatMode: MacroRepeatMode;
  repeatCount: number;
  steps: MacroStep[];
}

export interface MacroFolder {
  id: string;
  name: string;
}

export interface PresetTemplate {
  id: string;
  name: string;
  category: 'Creative' | 'Code' | 'Streaming' | 'Media & Comms' | 'Productivity';
  description: string;
  accentColor: string;
  icon: string;
  buildProfile: (nameOverride?: string) => StudioProfile;
}

export interface UserPreset {
  id: string;
  name: string;
  createdAt: string;
  profile: StudioProfile;
}

export type KeyboardLayoutId =
  | 'us_qwerty'
  | 'uk_qwerty'
  | 'de_qwertz'
  | 'fr_azerty'
  | 'es_iso'
  | 'nordic_iso'
  | 'jp_jis';

export type ThemeMode = 'dark' | 'light';

export interface StudioSettings {
  theme: ThemeMode;
  accentColor: string;
  keyboardLayout: KeyboardLayoutId;
  pollingRateHz: 125 | 250 | 500 | 1000;
  globalDebounceMs: number;
  encoderPlacement: EncoderPlacement;
  soundEnabled: boolean;
}

export interface ConflictWarning {
  controlA: ControlId;
  controlB: ControlId;
  summary: string;
}

export interface LiveInputEvent {
  id: string;
  timestamp: string;
  controlLabel: string;
  triggerLabel: string;
  actionSummary: string;
}

export type UsbTransport = 'webhid' | 'webserial' | 'disconnected';

export interface DeviceConnectionInfo {
  connected: boolean;
  transport: UsbTransport;
  deviceName: string;
  firmwareVersion: string;
  vendorProduct?: string;
}
