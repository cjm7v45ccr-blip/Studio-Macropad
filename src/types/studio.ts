export type KeyId = 'k1' | 'k2' | 'k3' | 'k4' | 'k5';
export type EncoderSubControlId = 'dial' | 'enc_cw' | 'enc_ccw';
export type ControlId = KeyId | 'encoder' | EncoderSubControlId;

export type HardwareProfileId = 'MAC' | 'TV';
export type HardwareSlotId = 'b1' | 'b2' | 'b3' | 'b4' | 'dial' | 'enc_cw' | 'enc_ccw';
export type HardwareFlashSlot = HardwareSlotId | 'mode';

export type SyncStatusPill = 'Synced' | 'Saving' | 'Out of sync' | 'Disconnected';

export type SidebarSection = 'device' | 'macros' | 'library' | 'settings';
export type CanvasViewMode = 'edit' | 'test';
export type EncoderPlacement = 'grid' | 'top';

export type TriggerType = 'tap';

export type ActionType =
  | 'mac_macro'
  | 'win_macro'
  | 'media'
  | 'shortcut'
  | 'text'
  | 'tv'
  | 'tv_app'
  | 'none';

export interface TextMacroRepeatConfig {
  /** Text string typed on each cycle (can be empty if repeating only a button/key) */
  text: string;
  /** Optional button/key pressed after text ('' for none, or firmware key token) */
  followUpKey: string;
  /** Custom delay in ms between typing text and pressing followUpKey */
  keyDelayMs: number;
  /** Number of times to execute (1 = once, 2..999 = repeat N times) */
  repeatCount: number;
  /** Keep repeating with repeatDelayMs until stopped or triggered again */
  loopUntilStopped: boolean;
  /** Custom delay in ms between each repeat iteration */
  repeatDelayMs: number;
}

export interface ActiveRepeatJob {
  id: string;
  slotKey?: string;
  label: string;
  currentIteration: number;
  totalIterations: number | null; // null when looping until stopped
  delayMs: number;
}

export interface ActionBinding {
  type: ActionType;
  /** Exact ESP32 firmware action string, e.g. "MEDIA:PLAY_PAUSE", "SHORTCUT:cmd,shift:4", "TEXT:...", or "" */
  value: string;
  /** Optional repeat, follow-up button, and custom delay configuration for text/button sequences */
  repeatConfig?: TextMacroRepeatConfig;
}

export interface KeyAppearance {
  label: string;
  icon: string; // Icon registry key OR data:image/... custom upload URL
  labelColor: string;
  customLabel?: boolean;
  customIcon?: boolean;
}

export interface KeyControlConfig {
  id: KeyId;
  slot?: 'b1' | 'b2' | 'b3' | 'b4';
  isModeSwitch?: boolean;
  triggers: {
    tap: ActionBinding;
  };
  appearance: KeyAppearance;
}

export interface EncoderControlConfig {
  dial: ActionBinding;
  cw: ActionBinding;
  ccw: ActionBinding;
  color: string;
}

export interface LayerConfig {
  id: string;
  name: string;
  color: string;
  keys: Record<KeyId, KeyControlConfig>;
  encoder: EncoderControlConfig;
}

export interface StudioProfile {
  id: HardwareProfileId;
  name: string;
  activeLayerIndex: 0;
  layers: [LayerConfig];
}

export type SlotRepeatMap = Partial<Record<string, TextMacroRepeatConfig>>;

export interface SerializedPadProfiles {
  active: HardwareProfileId;
  mac_name: string;
  tv_name: string;
  mac: Record<HardwareSlotId, string>;
  tv: Record<HardwareSlotId, string>;
}

export interface StoredPadRecord {
  rev: number;
  profiles: SerializedPadProfiles;
  dirty: boolean;
  repeatConfigs?: SlotRepeatMap;
}

export interface SyncConflictDiffItem {
  id: string;
  label: string;
  websiteValue: string;
  padValue: string;
}

export interface SyncConflictState {
  deviceId: string;
  deviceName: string;
  padRev: number;
  localRev: number;
  padProfiles: SerializedPadProfiles;
  websiteProfiles: SerializedPadProfiles;
  diffs: SyncConflictDiffItem[];
}

export interface HardwareEventPacket {
  event: 'press' | 'turn' | 'profile' | 'connection' | 'config' | string;
  slot?: string;
  dir?: string;
  action?: string;
  active?: HardwareProfileId;
  profile?: HardwareProfileId;
  ble?: boolean;
  wifi?: boolean;
  ip?: string;
  rev?: number;
  profiles?: {
    active?: HardwareProfileId;
    items?: {
      id: HardwareProfileId;
      name: string;
      controls: Record<HardwareSlotId, string>;
    }[];
  };
  [key: string]: any;
}

export interface CustomMacroItem {
  id: string;
  name: string;
  action: string;
  repeatConfig?: TextMacroRepeatConfig;
  createdAt: string;
  source?: 'device' | 'user';
}

export interface HardwareBackupPayload {
  schema: 'studio-pad-config';
  version: 1;
  mac_name: string;
  tv_name: string;
  mac_b1: string;
  mac_b2: string;
  mac_b3: string;
  mac_b4: string;
  mac_dial: string;
  mac_enc_cw?: string;
  mac_enc_ccw?: string;
  tv_b1: string;
  tv_b2: string;
  tv_b3: string;
  tv_b4: string;
  tv_dial: string;
  tv_enc_cw?: string;
  tv_enc_ccw?: string;
}

export interface UserPreset {
  id: string;
  name: string;
  createdAt: string;
  targetProfile?: HardwareProfileId;
  profileSlots?: Record<HardwareSlotId, string>;
  backup: HardwareBackupPayload;
  repeatConfigs?: SlotRepeatMap;
}

export type KeyboardLayoutId =
  | 'us_qwerty'
  | 'uk_qwerty'
  | 'de_qwertz'
  | 'fr_azerty'
  | 'es_iso'
  | 'nordic_iso'
  | 'jp_jis';

export type ThemeMode = 'system' | 'dark' | 'light';

export interface StudioSettings {
  theme: ThemeMode;
  accentColor: string;
  keyboardLayout: KeyboardLayoutId;
  encoderPlacement: EncoderPlacement;
  soundEnabled: boolean;
  liveEventsEnabled: boolean;
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
  source?: 'hardware' | 'usb-test' | 'sim';
}

export type UsbTransport = 'webserial' | 'demo' | 'disconnected';

export interface HardwareTelemetry {
  apiVersion: number;
  activeProfile: HardwareProfileId;
  wifiConnected: boolean;
  ip: string;
  ssid: string;
  bleConnected: boolean;
  freeHeap: number;
  httpApiEnabled: boolean;
  tvConfigured: boolean;
  tvPaired: boolean;
  tvHost: string;
  tvPort: number;
  connectionType: string;
}

export interface DeviceConnectionInfo {
  connected: boolean;
  connecting?: boolean;
  transport: UsbTransport;
  deviceId?: string;
  rev?: number;
  deviceName: string;
  firmwareVersion: string;
  vendorProduct?: string;
  lastSyncedAt?: string;
  telemetry?: HardwareTelemetry;
}

export interface DebugLogEntry {
  id: string;
  timestamp: string;
  direction: 'tx' | 'rx' | 'info' | 'error';
  line: string;
}
