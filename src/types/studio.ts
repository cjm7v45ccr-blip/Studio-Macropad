export type KeyId = 'k1' | 'k2' | 'k3' | 'k4' | 'k5';
export type ControlId = KeyId | 'encoder';

export type HardwareProfileId = 'MAC' | 'TV';
export type HardwareSlotId = 'b1' | 'b2' | 'b3' | 'b4' | 'dial' | 'enc_cw' | 'enc_ccw';

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

export interface ActionBinding {
  type: ActionType;
  /** Exact ESP32 firmware action string, e.g. "MEDIA:PLAY_PAUSE", "SHORTCUT:cmd,shift:4", "TV:POWER", or "" when unassigned */
  value: string;
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

export interface CustomMacroItem {
  id: string;
  name: string;
  action: string; // Valid ESP32 firmware action string (SHORTCUT:..., TEXT:..., TVKEY:..., TVAPP:..., etc.)
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
  mac_enc_cw: string;
  mac_enc_ccw: string;
  tv_b1: string;
  tv_b2: string;
  tv_b3: string;
  tv_b4: string;
  tv_dial: string;
  tv_enc_cw: string;
  tv_enc_ccw: string;
}

export interface UserPreset {
  id: string;
  name: string;
  createdAt: string;
  backup: HardwareBackupPayload;
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
  encoderPlacement: EncoderPlacement;
  soundEnabled: boolean;
  autoSyncOnEdit: boolean;
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
  dispatchedHardware?: boolean;
}

export type UsbTransport = 'webserial' | 'disconnected';

export interface HardwareTelemetry {
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
  transport: UsbTransport;
  deviceName: string;
  firmwareVersion: string;
  vendorProduct?: string;
  lastSyncedAt?: string;
  telemetry?: HardwareTelemetry;
}
