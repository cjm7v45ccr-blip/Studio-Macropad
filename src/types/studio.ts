export type KeyId = 'k1' | 'k2' | 'k3' | 'k4' | 'k5' | 'k6' | 'k7' | 'k8' | 'k9';
export type EncoderSubControlId = 'dial' | 'enc_cw' | 'enc_ccw';
export type ControlId = KeyId | 'encoder' | EncoderSubControlId;

export type BleHostSlot = 1 | 2 | 3;

export type HardwareProfileId = 'HOST1' | 'HOST2' | 'HOST3' | 'TV';
export type FirmwareWireProfileId = HardwareProfileId | 'MAC' | 'H1' | 'H2' | 'H3';

export const HARDWARE_PROFILE_IDS: readonly HardwareProfileId[] = [
  'HOST1',
  'HOST2',
  'HOST3',
  'TV'
] as const;

export function isBleHostProfile(
  id: HardwareProfileId
): id is 'HOST1' | 'HOST2' | 'HOST3' {
  return id === 'HOST1' || id === 'HOST2' || id === 'HOST3';
}

export function bleSlotToProfileId(slot: BleHostSlot): 'HOST1' | 'HOST2' | 'HOST3' {
  if (slot === 2) return 'HOST2';
  if (slot === 3) return 'HOST3';
  return 'HOST1';
}

export function profileIdToBleSlot(id: HardwareProfileId): BleHostSlot | null {
  if (id === 'HOST1') return 1;
  if (id === 'HOST2') return 2;
  if (id === 'HOST3') return 3;
  return null;
}

export function profileShortTag(id: HardwareProfileId): string {
  if (id === 'HOST1') return 'H1';
  if (id === 'HOST2') return 'H2';
  if (id === 'HOST3') return 'H3';
  return 'TV';
}

export function defaultProfileAlias(id: HardwareProfileId): string {
  if (id === 'HOST1') return 'Device 1';
  if (id === 'HOST2') return 'Device 2';
  if (id === 'HOST3') return 'Device 3';
  return 'TV';
}

export function normalizeHardwareProfileId(
  raw?: string | null,
  fallbackBleSlot: BleHostSlot = 1
): HardwareProfileId {
  const upper = (raw || '').trim().toUpperCase();
  if (upper === 'TV') return 'TV';
  if (upper === 'HOST1' || upper === 'H1') return 'HOST1';
  if (upper === 'HOST2' || upper === 'H2') return 'HOST2';
  if (upper === 'HOST3' || upper === 'H3') return 'HOST3';
  return bleSlotToProfileId(fallbackBleSlot);
}

export type HardwareSlotId =
  | 'b1'
  | 'b2'
  | 'b3'
  | 'b4'
  | 'b5'
  | 'b6'
  | 'b7'
  | 'b8'
  | 'dial'
  | 'enc_cw'
  | 'enc_ccw';
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
  | 'ble'
  | 'shortcut'
  | 'text'
  | 'tv'
  | 'tv_app'
  | 'none';

export type MacroStepActionType =
  | 'shortcut'
  | 'text'
  | 'key'
  | 'media'
  | 'os_action'
  | 'ble'
  | 'tv'
  | 'delay';

export interface MacroStepConfig {
  id: string;
  label: string;
  actionType: MacroStepActionType;
  value: string;
  delayMs: number;
  repeatCount: number;
}

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
  /** Optional individual steps with per-step repeat intervals and delays */
  steps?: MacroStepConfig[];
}

export interface ActiveRepeatJob {
  id: string;
  slotKey?: string;
  label: string;
  currentIteration: number;
  totalIterations: number | null; // null when looping until stopped
  delayMs: number;
  activeStepIndex?: number;
  activeStepPhase?: 'action' | 'delay';
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
  slot?: 'b1' | 'b2' | 'b3' | 'b4' | 'b5' | 'b6' | 'b7' | 'b8';
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
  h1_name: string;
  h2_name: string;
  h3_name: string;
  tv_name: string;
  h1: Record<HardwareSlotId, string>;
  h2: Record<HardwareSlotId, string>;
  h3: Record<HardwareSlotId, string>;
  tv: Record<HardwareSlotId, string>;
  /** Optional legacy v1 fields for smooth localStorage migration */
  mac_name?: string;
  mac?: Record<HardwareSlotId, string>;
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
  event: 'press' | 'turn' | 'profile' | 'connection' | 'config' | 'ble_host' | 'setup' | 'mode' | string;
  mode?: string;
  setup_mode?: boolean;
  setup_done?: boolean;
  slot?: string;
  dir?: string;
  action?: string;
  active?: FirmwareWireProfileId;
  profile?: FirmwareWireProfileId;
  ble?: boolean;
  ble_slot?: number;
  wifi?: boolean;
  ip?: string;
  rev?: number;
  profiles?: {
    active?: FirmwareWireProfileId;
    items?: {
      id: FirmwareWireProfileId;
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
  version: 1 | 2;
  tv_name: string;
  h1_name?: string;
  h2_name?: string;
  h3_name?: string;
  h1_b1?: string;
  h1_b2?: string;
  h1_b3?: string;
  h1_b4?: string;
  h1_b5?: string;
  h1_b6?: string;
  h1_b7?: string;
  h1_b8?: string;
  h1_dial?: string;
  h1_enc_cw?: string;
  h1_enc_ccw?: string;
  h2_b1?: string;
  h2_b2?: string;
  h2_b3?: string;
  h2_b4?: string;
  h2_b5?: string;
  h2_b6?: string;
  h2_b7?: string;
  h2_b8?: string;
  h2_dial?: string;
  h2_enc_cw?: string;
  h2_enc_ccw?: string;
  h3_b1?: string;
  h3_b2?: string;
  h3_b3?: string;
  h3_b4?: string;
  h3_b5?: string;
  h3_b6?: string;
  h3_b7?: string;
  h3_b8?: string;
  h3_dial?: string;
  h3_enc_cw?: string;
  h3_enc_ccw?: string;
  mac_name?: string;
  mac_b1?: string;
  mac_b2?: string;
  mac_b3?: string;
  mac_b4?: string;
  mac_b5?: string;
  mac_b6?: string;
  mac_b7?: string;
  mac_b8?: string;
  mac_dial?: string;
  mac_enc_cw?: string;
  mac_enc_ccw?: string;
  tv_b1: string;
  tv_b2: string;
  tv_b3: string;
  tv_b4: string;
  tv_b5?: string;
  tv_b6?: string;
  tv_b7?: string;
  tv_b8?: string;
  tv_dial: string;
  tv_enc_cw?: string;
  tv_enc_ccw?: string;
  [key: string]: any;
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
  autoCheckFirmwareUpdates: boolean;
  firmwareRepo: string;
}

export interface FirmwareReleaseAsset {
  name: string;
  sizeBytes: number;
  downloadUrl: string;
}

export interface FirmwareReleaseInfo {
  version: string;
  rawTag: string;
  title: string;
  notes: string;
  publishedAt: string | null;
  htmlUrl: string;
  source: 'release' | 'tag' | 'branch_source';
  repoSlug: string;
  assets: FirmwareReleaseAsset[];
}

export type FirmwareUpdateStatus =
  | 'idle'
  | 'checking'
  | 'update_available'
  | 'up_to_date'
  | 'ahead'
  | 'no_version_found'
  | 'error';

export interface FirmwareUpdateState {
  status: FirmwareUpdateStatus;
  installedVersion: string | null;
  latestRelease: FirmwareReleaseInfo | null;
  checkedAt: string | null;
  repoSlug: string;
  error: string | null;
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
  setupMode: boolean;
  activeProfile: HardwareProfileId;
  wifiConnected: boolean;
  ip: string;
  ssid: string;
  bleConnected: boolean;
  bleActiveHost: BleHostSlot;
  bleMaxHosts: number;
  bleDeviceName: string;
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
