import {
  BleHostSlot,
  DebugLogEntry,
  DeviceConnectionInfo,
  FirmwareWireProfileId,
  HardwareBackupPayload,
  HardwareEventPacket,
  HardwareFlashSlot,
  HardwareProfileId,
  HardwareSlotId,
  HardwareTelemetry,
  bleSlotToProfileId,
  defaultProfileAlias,
  normalizeHardwareProfileId
} from '../types/studio';
import {
  FACTORY_DEFAULT_SLOTS,
  HARDWARE_SLOTS,
  MAX_SERIAL_SINGLE_SLOT_ACTION_BYTES,
  STANDALONE_TICK_MS,
  isTvFirmwareAction,
  isValidFirmwareAction,
  isValidFirmwareAlias,
  isValidSlotAssignment,
  sanitizeFirmwareAlias,
  sanitizeSerialString
} from '../data/firmwareCatalog';
import { ESPLoader, Transport, type IEspLoaderTerminal } from 'esptool-js';
import {
  formatBytesCompact,
  resolveEsp32FlashTarget
} from './firmwareUpdateService';
import {
  inspectFirmwareBinaryCapabilities,
  resolveDeviceFirmwareInfo,
  writeFlashedLedger
} from './firmwareLedger';

export interface FirmwareStatusPacket {
  ok?: boolean;
  api_version?: number;
  rev?: number;
  mode?: string;
  setup_mode?: boolean | number;
  setup_complete?: boolean | number;
  setup_done?: boolean | number;
  device: {
    id: string;
    name: string;
    firmware: string;
    connection_type?: string;
    setup_mode?: boolean;
  };
  connection?: {
    wifi_connected: boolean;
    ip: string;
    ble_connected: boolean;
  };
  ble?: {
    active_host: number;
    max_hosts: number;
    device_name: string;
  };
  diagnostics?: {
    free_heap: number;
    http_api_enabled?: boolean;
    events_enabled?: boolean;
    setup_mode?: boolean;
  };
  capabilities?: string[];
  tv?: {
    configured: boolean;
    paired: boolean;
    host: string;
    port: number;
    enabled?: boolean;
  };
  profiles: {
    active: FirmwareWireProfileId;
    items: {
      id: FirmwareWireProfileId;
      name: string;
      controls: Record<HardwareSlotId, string>;
    }[];
  };
  ble_slot?: number;
  wifi_connected?: boolean;
  ip?: string;
  heap?: number;
  ssid?: string;
  tv_ip?: string;
  tv_port?: number;
  has_auth?: boolean;
  mac_b1?: string;
  mac_b2?: string;
  mac_b3?: string;
  mac_b4?: string;
  mac_b5?: string;
  mac_b6?: string;
  mac_b7?: string;
  mac_b8?: string;
  mac_dial?: string;
  tv_b1?: string;
  tv_b2?: string;
  tv_b3?: string;
  tv_b4?: string;
  tv_b5?: string;
  tv_b6?: string;
  tv_b7?: string;
  tv_b8?: string;
  tv_dial?: string;
}

export interface SetupModeSignal {
  active: boolean;
  source: 'status' | 'event' | 'beacon' | 'demo';
  deviceId: string;
}

type ConnectionListener = (info: DeviceConnectionInfo) => void;
type ConnectStatusListener = (status: FirmwareStatusPacket) => void;
type HardwareEventListener = (event: HardwareEventPacket) => void;
type SetupModeListener = (signal: SetupModeSignal) => void;
type OtaEventListener = (event: HardwareEventPacket) => void;
type DebugLogListener = (logs: DebugLogEntry[]) => void;

function extractSetupModeFlag(pkt: any): boolean {
  if (!pkt || typeof pkt !== 'object') return false;
  if (String(pkt.mode || '').trim().toLowerCase() === 'setup') return true;
  if (pkt.setup_mode === true || pkt.setup_mode === 1) return true;
  if (pkt.device?.setup_mode === true) return true;
  if (pkt.diagnostics?.setup_mode === true) return true;
  if (pkt.setup_complete === false || pkt.setup_complete === 0) return true;
  if (pkt.setup_done === false || pkt.setup_done === 0) return true;
  return false;
}

function extractSetupClearedFlag(pkt: any): boolean {
  if (!pkt || typeof pkt !== 'object') return false;
  const modeLower = String(pkt.mode || '').trim().toLowerCase();
  if (modeLower === 'ready' || modeLower === 'normal') return true;
  if (pkt.setup_mode === false || pkt.setup_mode === 0) return true;
  if (pkt.setup_complete === true || pkt.setup_complete === 1) return true;
  if (pkt.setup_done === true || pkt.setup_done === 1) return true;
  return false;
}

interface VirtualDemoPadState {
  rev: number;
  firmware: string;
  setupMode: boolean;
  mode: 'MAC' | 'TV';
  h1Name: string;
  h2Name: string;
  h3Name: string;
  tvName: string;
  h1: Record<HardwareSlotId, string>;
  h2: Record<HardwareSlotId, string>;
  h3: Record<HardwareSlotId, string>;
  tv: Record<HardwareSlotId, string>;
  bleConnected: boolean;
  bleSlot: BleHostSlot;
  wifiConnected: boolean;
  ip: string;
  ssid: string;
  tvConfigured: boolean;
  tvPaired: boolean;
  tvHost: string;
  tvPort: number;
  tvEnabled: boolean;
  httpApiEnabled: boolean;
  eventsEnabled: boolean;
  pairingPendingHost: string;
  pairingPendingPort: number;
}

const MAX_DEBUG_LOGS = 250;

/**
 * Scrub Wi-Fi passwords (`pass`) and TV/HTTP tokens (`token`) so secrets NEVER appear in logs.
 */
export function redactSerialLineSecrets(rawLine: string): string {
  try {
    const parsed = JSON.parse(rawLine);
    if (parsed && typeof parsed === 'object') {
      const clone: Record<string, any> = { ...parsed };
      if (typeof clone.pass === 'string' && clone.pass.length > 0) {
        clone.pass = '[REDACTED]';
      }
      if (typeof clone.token === 'string' && clone.token.length > 0) {
        clone.token = '[REDACTED]';
      }
      if (clone.path === '/api/ota/chunk' && typeof clone.data === 'string') {
        clone.data = `[${clone.data.length}b base64]`;
      }
      return JSON.stringify(clone);
    }
  } catch {
    return rawLine
      .replace(/("pass"\s*:\s*)"[^"]*"/g, '$1"[REDACTED]"')
      .replace(/("token"\s*:\s*)"[^"]*"/g, '$1"[REDACTED]"');
  }
  return rawLine;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function translateSerialOpenError(err: any): Error {
  const msg = String(err?.message || err || '');
  const lower = msg.toLowerCase();
  if (
    err?.name === 'NetworkError' ||
    err?.name === 'InvalidStateError' ||
    lower.includes('failed to open') ||
    lower.includes('busy') ||
    lower.includes('in use') ||
    lower.includes('access is denied') ||
    lower.includes('permission')
  ) {
    return new Error(
      'Port is busy — close the Arduino Serial Monitor or any other serial tool holding this USB port, then try again.'
    );
  }
  return err instanceof Error
    ? err
    : new Error('Failed to open the USB Serial port.');
}

interface ParsedEspPartitionEntry {
  type: number;
  subtype: number;
  offset: number;
  size: number;
  label: string;
}

function inspectBoardPartitionTable(ptBytes: Uint8Array): {
  primaryApp: ParsedEspPartitionEntry | null;
  otaData: ParsedEspPartitionEntry | null;
  hasOta1: boolean;
} {
  const entries: ParsedEspPartitionEntry[] = [];
  const maxEntries = Math.floor(ptBytes.byteLength / 32);

  for (let i = 0; i < maxEntries; i++) {
    const base = i * 32;
    const m0 = ptBytes[base];
    const m1 = ptBytes[base + 1];
    if (m0 === 0xeb && m1 === 0xeb) break;
    if (m0 !== 0xaa || m1 !== 0x50) break;

    const type = ptBytes[base + 2];
    const subtype = ptBytes[base + 3];
    const offset =
      (ptBytes[base + 4] |
        (ptBytes[base + 5] << 8) |
        (ptBytes[base + 6] << 16) |
        (ptBytes[base + 7] << 24)) >>>
      0;
    const size =
      (ptBytes[base + 8] |
        (ptBytes[base + 9] << 8) |
        (ptBytes[base + 10] << 16) |
        (ptBytes[base + 11] << 24)) >>>
      0;

    const rawLabel = ptBytes.subarray(base + 12, base + 28);
    const nulIdx = rawLabel.indexOf(0);
    const label = new TextDecoder('utf-8', { fatal: false })
      .decode(nulIdx >= 0 ? rawLabel.subarray(0, nulIdx) : rawLabel)
      .trim();

    entries.push({ type, subtype, offset, size, label });
  }

  const primaryApp =
    entries.find(e => e.type === 0x00 && e.subtype === 0x10) ||
    entries.find(e => e.type === 0x00 && e.subtype === 0x00) ||
    entries.find(e => e.type === 0x00) ||
    null;

  const otaData = entries.find(e => e.type === 0x01 && e.subtype === 0x00) || null;
  const hasOta1 = entries.some(e => e.type === 0x00 && e.subtype === 0x11);

  return { primaryApp, otaData, hasOta1 };
}

/**
 * PadLink WebSerial + Demo Mode Transport
 * - Sends strictly one request at a time via a Promise queue
 * - Separates asynchronous hardware events (`msg.event`) from command replies
 * - Ignores ESP32 boot noise lines (anything not starting with `{`)
 * - Waits 2000ms on open for ESP32 auto-reset, enables `/api/events/set`, and reads `/api/status`
 * - Reconnects automatically via `navigator.serial.getPorts()` without showing the port picker
 * - Supports full virtual Demo Mode (`demo-pad`, firmware 2.1.0, API version 2) with zero hardware attached
 */
class PadLinkService {
  private port: any = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private reader: ReadableStreamDefaultReader<string> | null = null;
  private pipeClosedPromise: Promise<void> | null = null;

  private demoModeActive = false;
  private demoPad: VirtualDemoPadState | null = null;

  private queue: Promise<void> = Promise.resolve();
  private pending: ((msg: any) => void) | null = null;
  private pendingReject: ((err: Error) => void) | null = null;
  private pendingSilentLog = false;
  private buf = '';

  private isOpening = false;
  private isFlashingOta = false;
  private otaRebootExpected = false;
  private manualDisconnect = false;
  private desiredEventsEnabled = true;
  private rebootResyncTimer: number | null = null;
  private liveTelemetryTimer: number | null = null;
  private pendingBootSetupBeacon = false;
  private rxCharsSinceOpen = 0;
  private sawRomDownloadBoot = false;

  private debugLogs: DebugLogEntry[] = [];

  private connectionInfo: DeviceConnectionInfo = {
    connected: false,
    connecting: false,
    transport: 'disconnected',
    deviceName: 'Studio MacroPad',
    firmwareVersion: '—'
  };

  private connListeners = new Set<ConnectionListener>();
  private connectStatusListeners = new Set<ConnectStatusListener>();
  private eventListeners = new Set<HardwareEventListener>();
  private setupModeListeners = new Set<SetupModeListener>();
  private otaListeners = new Set<OtaEventListener>();
  private debugListeners = new Set<DebugLogListener>();

  constructor() {
    if (typeof window !== 'undefined') {
      this.setupSerialWatchers();
    }
  }

  public get browserSupportsWebSerial(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      'serial' in navigator &&
      window.isSecureContext !== false
    );
  }

  public get info(): DeviceConnectionInfo {
    return this.connectionInfo;
  }

  public getDebugLogs(): DebugLogEntry[] {
    return this.debugLogs;
  }

  public clearDebugLogs() {
    this.debugLogs = [];
    this.emitDebugLogs();
  }

  public onDebugLogsChange(fn: DebugLogListener) {
    this.debugListeners.add(fn);
    return () => {
      this.debugListeners.delete(fn);
    };
  }

  private emitDebugLogs() {
    const copy = [...this.debugLogs];
    this.debugListeners.forEach(fn => fn(copy));
  }

  private logSerial(direction: DebugLogEntry['direction'], rawLine: string) {
    const safeLine = redactSerialLineSecrets(rawLine.trim());
    const now = new Date();
    const timestamp =
      now.toTimeString().slice(0, 8) +
      '.' +
      String(now.getMilliseconds()).padStart(3, '0');
    this.debugLogs = [
      ...this.debugLogs.slice(-(MAX_DEBUG_LOGS - 1)),
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp,
        direction,
        line: safeLine
      }
    ];
    this.emitDebugLogs();
  }

  public onConnectionChange(fn: ConnectionListener) {
    this.connListeners.add(fn);
    return () => {
      this.connListeners.delete(fn);
    };
  }

  public onConnectStatus(fn: ConnectStatusListener) {
    this.connectStatusListeners.add(fn);
    return () => {
      this.connectStatusListeners.delete(fn);
    };
  }

  public onHardwareEvent(fn: HardwareEventListener) {
    this.eventListeners.add(fn);
    return () => {
      this.eventListeners.delete(fn);
    };
  }

  public onSetupModeDetected(fn: SetupModeListener) {
    this.setupModeListeners.add(fn);
    return () => {
      this.setupModeListeners.delete(fn);
    };
  }

  public onOtaEvent(fn: OtaEventListener) {
    this.otaListeners.add(fn);
    return () => {
      this.otaListeners.delete(fn);
    };
  }

  private emitSetupMode(active: boolean, source: SetupModeSignal['source'], deviceId?: string) {
    const resolvedId = deviceId || this.connectionInfo.deviceId || 'studio-pad';
    const signal: SetupModeSignal = { active, source, deviceId: resolvedId };
    this.setupModeListeners.forEach(fn => fn(signal));
  }

  private emitConnection() {
    const snap: DeviceConnectionInfo = {
      ...this.connectionInfo,
      telemetry: this.connectionInfo.telemetry
        ? { ...this.connectionInfo.telemetry }
        : undefined
    };
    this.connListeners.forEach(fn => fn(snap));
  }

  private setupSerialWatchers() {
    const navSerial = (navigator as any).serial;
    if (!navSerial) return;

    navSerial.addEventListener('connect', async (e: any) => {
      this.manualDisconnect = false;
      if (this.port || this.isOpening || this.isFlashingOta || this.demoModeActive) return;
      const targetPort = e?.target;
      if (targetPort) {
        await this.openAuthorizedPort(targetPort).catch(() => {});
      } else {
        await this.tryAutoConnectSerial();
      }
    });

    navSerial.addEventListener('disconnect', async (e: any) => {
      if (this.isFlashingOta) return;
      if (this.port && (!e?.target || e.target === this.port)) {
        this.logSerial('info', 'USB serial cable unplugged');
        await this.cleanupPort();
        this.markDisconnected();
      }
    });

    // Auto-connect on window focus or visibility change
    window.addEventListener('focus', () => {
      if (!this.port && !this.isOpening && !this.isFlashingOta && !this.demoModeActive) {
        this.manualDisconnect = false;
        this.tryAutoConnectSerial();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (
        !this.port &&
        !this.isOpening &&
        !this.isFlashingOta &&
        !this.demoModeActive
      ) {
        this.manualDisconnect = false;
        this.tryAutoConnectSerial();
      } else if (
        this.port &&
        this.connectionInfo.connected &&
        !this.demoModeActive &&
        !this.isOpening &&
        !this.isFlashingOta &&
        !this.pending
      ) {
        this.pollLiveStatusOnce();
      }
    });

    // Global user interaction listener to trigger auto-connect if port is authorized
    const handleUserGesture = () => {
      if (!this.port && !this.isOpening && !this.isFlashingOta && !this.demoModeActive) {
        this.manualDisconnect = false;
        this.tryAutoConnectSerial();
      }
    };
    window.addEventListener('pointerdown', handleUserGesture, { once: true });

    // Reconnect automatically on refresh using previously approved ports without showing the port picker
    this.tryAutoConnectSerial();
  }

  private startLiveTelemetryPolling() {
    this.stopLiveTelemetryPolling();
    if (typeof window === 'undefined' || this.demoModeActive) return;
    this.liveTelemetryTimer = window.setInterval(() => {
      this.pollLiveStatusOnce();
    }, 4000);
  }

  private stopLiveTelemetryPolling() {
    if (this.liveTelemetryTimer !== null) {
      window.clearInterval(this.liveTelemetryTimer);
      this.liveTelemetryTimer = null;
    }
  }

  private pollLiveStatusOnce() {
    if (
      !this.port ||
      !this.connectionInfo.connected ||
      this.demoModeActive ||
      this.isOpening ||
      this.isFlashingOta ||
      this.pending ||
      this.rebootResyncTimer !== null ||
      (typeof document !== 'undefined' && document.visibilityState === 'hidden')
    ) {
      return;
    }
    const prevRev = this.connectionInfo.rev;
    this.call<FirmwareStatusPacket>({ path: '/api/status' }, 2000, { silentLog: true })
      .then(pkt => {
        if (
          pkt &&
          typeof pkt.rev === 'number' &&
          typeof prevRev === 'number' &&
          pkt.rev !== prevRev
        ) {
          this.handleHardwareEvent({
            event: 'config',
            rev: pkt.rev
          });
        }
      })
      .catch(() => {});
  }

  private markDisconnected() {
    this.demoModeActive = false;
    this.stopLiveTelemetryPolling();
    if (this.rebootResyncTimer !== null) {
      window.clearTimeout(this.rebootResyncTimer);
      this.rebootResyncTimer = null;
    }
    if (this.pendingReject) {
      const rej = this.pendingReject;
      this.pending = null;
      this.pendingReject = null;
      this.pendingSilentLog = false;
      rej(new Error('MacroPad USB disconnected'));
    }

    this.connectionInfo = {
      connected: false,
      connecting: false,
      transport: 'disconnected',
      deviceName: 'Studio MacroPad',
      firmwareVersion: '—',
      telemetry: undefined
    };
    this.emitConnection();
  }

  public async tryAutoConnectSerial(): Promise<boolean> {
    if (
      !this.browserSupportsWebSerial ||
      this.port ||
      this.isOpening ||
      this.isFlashingOta ||
      this.manualDisconnect ||
      this.demoModeActive
    ) {
      return Boolean(this.port && this.connectionInfo.connected);
    }

    try {
      const ports: any[] = await (navigator as any).serial.getPorts();
      if (!ports || ports.length === 0) return false;

      const sorted = [...ports].sort((a, b) => {
        const aUsb = a.getInfo?.()?.usbVendorId ? 1 : 0;
        const bUsb = b.getInfo?.()?.usbVendorId ? 1 : 0;
        return bUsb - aUsb;
      });

      for (const candidate of sorted) {
        const ok = await this.openAuthorizedPort(candidate, false);
        if (ok) return true;
      }
    } catch (_) {}
    return false;
  }

  /**
   * Prompt user with browser Web Serial port picker and run handshake
   */
  public async connectWebSerial(): Promise<FirmwareStatusPacket | null> {
    if (!this.browserSupportsWebSerial) {
      throw new Error(
        'Unsupported browser — open this site in Chrome or Edge on desktop over HTTPS, or try demo mode.'
      );
    }

    this.manualDisconnect = false;
    let selectedPort: any;
    try {
      selectedPort = await (navigator as any).serial.requestPort();
    } catch (err: any) {
      if (err?.name === 'NotFoundError' || err?.name === 'AbortError') return null;
      throw err;
    }

    if (!selectedPort) return null;
    await this.disconnect(false);
    this.manualDisconnect = false;
    return await this.openAuthorizedPort(selectedPort, true);
  }

  private getDemoProfileSlots(
    d: VirtualDemoPadState,
    prof: HardwareProfileId
  ): Record<HardwareSlotId, string> {
    if (prof === 'TV') return d.tv;
    if (prof === 'HOST2') return d.h2;
    if (prof === 'HOST3') return d.h3;
    return d.h1;
  }

  private setDemoProfileSlots(
    d: VirtualDemoPadState,
    prof: HardwareProfileId,
    slots: Record<HardwareSlotId, string>
  ) {
    if (prof === 'TV') d.tv = slots;
    else if (prof === 'HOST2') d.h2 = slots;
    else if (prof === 'HOST3') d.h3 = slots;
    else d.h1 = slots;
  }

  private getDemoProfileName(d: VirtualDemoPadState, prof: HardwareProfileId): string {
    if (prof === 'TV') return d.tvName;
    if (prof === 'HOST2') return d.h2Name;
    if (prof === 'HOST3') return d.h3Name;
    return d.h1Name;
  }

  private setDemoProfileName(
    d: VirtualDemoPadState,
    prof: HardwareProfileId,
    name: string
  ) {
    if (prof === 'TV') d.tvName = name;
    else if (prof === 'HOST2') d.h2Name = name;
    else if (prof === 'HOST3') d.h3Name = name;
    else d.h1Name = name;
  }

  /**
   * Start full interactive Demo Mode with no physical pad attached
   */
  public async connectDemoMode(opts?: { setupMode?: boolean }): Promise<FirmwareStatusPacket> {
    await this.disconnect(false);
    this.manualDisconnect = false;
    this.demoModeActive = true;

    if (!this.demoPad) {
      let initialH1 = { ...FACTORY_DEFAULT_SLOTS.HOST1 };
      let initialH2 = { ...FACTORY_DEFAULT_SLOTS.HOST2 };
      let initialH3 = { ...FACTORY_DEFAULT_SLOTS.HOST3 };
      let initialTv = { ...FACTORY_DEFAULT_SLOTS.TV };
      let h1Name = 'Host 1';
      let h2Name = 'Host 2';
      let h3Name = 'Host 3';
      let tvName = 'TV';
      let mode: 'MAC' | 'TV' = 'MAC';
      let bleSlot: BleHostSlot = 1;
      let rev = 1;

      try {
        const raw = localStorage.getItem('pad:demo-pad');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && !parsed.dirty && parsed.profiles) {
            rev = typeof parsed.rev === 'number' ? parsed.rev : 1;
            const p = parsed.profiles;
            if (p.active === 'TV') {
              mode = 'TV';
            } else if (p.active === 'HOST2') {
              mode = 'MAC';
              bleSlot = 2;
            } else if (p.active === 'HOST3') {
              mode = 'MAC';
              bleSlot = 3;
            } else {
              mode = 'MAC';
              bleSlot = 1;
            }
            h1Name = p.h1_name || p.mac_name || 'Host 1';
            h2Name = p.h2_name || 'Host 2';
            h3Name = p.h3_name || 'Host 3';
            tvName = p.tv_name || 'TV';
            initialH1 = { ...initialH1, ...(p.h1 || p.mac || {}) };
            initialH2 = { ...initialH2, ...(p.h2 || {}) };
            initialH3 = { ...initialH3, ...(p.h3 || {}) };
            initialTv = { ...initialTv, ...(p.tv || {}) };
          }
        }
      } catch {}

      this.demoPad = {
        rev,
        firmware: '4.5.0',
        setupMode: Boolean(opts?.setupMode),
        mode,
        h1Name,
        h2Name,
        h3Name,
        tvName,
        h1: initialH1,
        h2: initialH2,
        h3: initialH3,
        tv: initialTv,
        bleConnected: !opts?.setupMode,
        bleSlot,
        wifiConnected: !opts?.setupMode,
        ip: opts?.setupMode ? '' : '192.168.1.42',
        ssid: opts?.setupMode ? '' : 'Studio-WiFi',
        tvConfigured: !opts?.setupMode,
        tvPaired: !opts?.setupMode,
        tvHost: opts?.setupMode ? '' : '192.168.1.50',
        tvPort: 7345,
        tvEnabled: true,
        httpApiEnabled: false,
        eventsEnabled: this.desiredEventsEnabled,
        pairingPendingHost: '',
        pairingPendingPort: 7345
      };
    } else if (typeof opts?.setupMode === 'boolean') {
      this.demoPad.setupMode = opts.setupMode;
    }

    this.logSerial(
      'info',
      `Started Demo Mode (virtual Studio Pad · firmware ${this.demoPad.firmware}${
        this.demoPad.setupMode ? ' · Setup Mode active' : ' · 3 BLE Hosts + TV'
      })`
    );
    if (this.demoPad.setupMode) {
      this.logSerial('rx', JSON.stringify({ event: 'setup', mode: 'setup', setup_mode: true }));
    }
    await this.call({ path: '/api/events/set', enabled: this.desiredEventsEnabled ? 1 : 0 });
    const status = await this.call<FirmwareStatusPacket>({ path: '/api/status' });
    this.applyTelemetryFromStatus(status, 'DEMO:3200');
    this.connectStatusListeners.forEach(fn => fn(status));
    if (this.demoPad.setupMode) {
      this.emitSetupMode(true, 'demo', 'demo-pad');
    }
    return status;
  }

  public setDemoLinkState(patch: {
    bleConnected?: boolean;
    wifiConnected?: boolean;
    tvPaired?: boolean;
    firmwareVersion?: string;
    setupMode?: boolean;
  }) {
    if (!this.demoModeActive || !this.demoPad) return;
    if (typeof patch.bleConnected === 'boolean') {
      this.demoPad.bleConnected = patch.bleConnected;
    }
    if (typeof patch.wifiConnected === 'boolean') {
      this.demoPad.wifiConnected = patch.wifiConnected;
      if (!patch.wifiConnected) this.demoPad.ip = '';
      else if (!this.demoPad.ip) this.demoPad.ip = '192.168.1.42';
    }
    if (typeof patch.tvPaired === 'boolean') {
      this.demoPad.tvPaired = patch.tvPaired;
      this.demoPad.tvConfigured = patch.tvPaired || Boolean(this.demoPad.tvHost);
    }
    if (typeof patch.firmwareVersion === 'string' && patch.firmwareVersion.trim()) {
      this.demoPad.firmware = patch.firmwareVersion.trim();
    }
    const prevSetup = this.demoPad.setupMode;
    if (typeof patch.setupMode === 'boolean') {
      this.demoPad.setupMode = patch.setupMode;
    }
    const status = this.buildDemoStatusPacket();
    this.applyTelemetryFromStatus(status, 'DEMO:3200');
    if (typeof patch.setupMode === 'boolean' && patch.setupMode !== prevSetup) {
      const setupEvt: HardwareEventPacket = {
        event: 'setup',
        mode: patch.setupMode ? 'setup' : 'ready',
        setup_mode: patch.setupMode
      };
      this.logSerial('rx', JSON.stringify(setupEvt));
      this.handleHardwareEvent(setupEvt);
      return;
    }
    if (this.demoPad.eventsEnabled) {
      const evt: HardwareEventPacket = {
        event: 'connection',
        ble: this.demoPad.bleConnected,
        wifi: this.demoPad.wifiConnected,
        ip: this.demoPad.ip
      };
      this.logSerial('rx', JSON.stringify(evt));
      this.handleHardwareEvent(evt);
    }
  }

  public simulateDemoHostCycle(delta: 1 | -1 = 1): BleHostSlot {
    if (!this.demoModeActive || !this.demoPad) return 1;
    const nextIdx = (this.demoPad.bleSlot - 1 + (delta > 0 ? 1 : 2)) % 3;
    const nextSlot = (nextIdx + 1) as BleHostSlot;
    this.demoPad.bleSlot = nextSlot;
    this.applyTelemetryFromStatus(this.buildDemoStatusPacket(), 'DEMO:3200');
    if (this.demoPad.eventsEnabled) {
      const evt: HardwareEventPacket = {
        event: 'ble_host',
        ble_slot: nextSlot,
        active: this.demoPad.mode === 'TV' ? 'TV' : bleSlotToProfileId(nextSlot)
      };
      this.logSerial('rx', JSON.stringify(evt));
      this.handleHardwareEvent(evt);
    }
    return nextSlot;
  }

  private applyDemoBleActionSideEffect(action: string): boolean {
    if (!this.demoPad) return false;
    if (action === 'BLE:HOST1') {
      this.demoPad.bleSlot = 1;
    } else if (action === 'BLE:HOST2') {
      this.demoPad.bleSlot = 2;
    } else if (action === 'BLE:HOST3') {
      this.demoPad.bleSlot = 3;
    } else if (action === 'BLE:NEXT_HOST') {
      this.demoPad.bleSlot = (((this.demoPad.bleSlot % 3) + 1) as BleHostSlot);
    } else {
      return false;
    }
    this.applyTelemetryFromStatus(this.buildDemoStatusPacket(), 'DEMO:3200');
    if (this.demoPad.eventsEnabled) {
      const evt: HardwareEventPacket = {
        event: 'ble_host',
        ble_slot: this.demoPad.bleSlot,
        active:
          this.demoPad.mode === 'TV'
            ? 'TV'
            : bleSlotToProfileId(this.demoPad.bleSlot)
      };
      this.logSerial('rx', JSON.stringify(evt));
      this.handleHardwareEvent(evt);
    }
    return true;
  }

  public simulateDemoPadInput(slot: HardwareFlashSlot) {
    if (!this.demoModeActive || !this.demoPad) return;
    if (slot === 'mode') {
      this.demoPad.mode = this.demoPad.mode === 'MAC' ? 'TV' : 'MAC';
      const activeProf: HardwareProfileId =
        this.demoPad.mode === 'TV' ? 'TV' : bleSlotToProfileId(this.demoPad.bleSlot);
      this.applyTelemetryFromStatus(this.buildDemoStatusPacket(), 'DEMO:3200');
      if (this.demoPad.eventsEnabled) {
        const pressEvt: HardwareEventPacket = { event: 'press', slot: 'mode' };
        const profEvt: HardwareEventPacket = {
          event: 'profile',
          active: activeProf
        };
        this.logSerial('rx', JSON.stringify(pressEvt));
        this.handleHardwareEvent(pressEvt);
        this.logSerial('rx', JSON.stringify(profEvt));
        this.handleHardwareEvent(profEvt);
      }
      return;
    }

    const activeProf: HardwareProfileId =
      this.demoPad.mode === 'TV' ? 'TV' : bleSlotToProfileId(this.demoPad.bleSlot);
    const activeMap = this.getDemoProfileSlots(this.demoPad, activeProf);
    const action = activeMap[slot] || '';
    if (action.startsWith('BLE:')) {
      this.applyDemoBleActionSideEffect(action);
    }
    if (!this.demoPad.eventsEnabled) return;

    if (slot === 'enc_cw' || slot === 'enc_ccw') {
      const turnEvt: HardwareEventPacket = {
        event: 'turn',
        slot,
        dir: slot === 'enc_cw' ? 'cw' : 'ccw',
        action
      };
      this.logSerial('rx', JSON.stringify(turnEvt));
      this.handleHardwareEvent(turnEvt);
    } else {
      const pressEvt: HardwareEventPacket = {
        event: 'press',
        slot,
        action
      };
      this.logSerial('rx', JSON.stringify(pressEvt));
      this.handleHardwareEvent(pressEvt);
    }
  }

  private buildDemoStatusPacket(): FirmwareStatusPacket {
    const d = this.demoPad!;
    const activeHostProf = bleSlotToProfileId(d.bleSlot);
    const activeHostSlots = this.getDemoProfileSlots(d, activeHostProf);
    const activeProf: HardwareProfileId = d.mode === 'TV' ? 'TV' : activeHostProf;
    return {
      ok: true,
      api_version: 2,
      rev: d.rev,
      mode: d.setupMode ? 'setup' : 'ready',
      setup_mode: d.setupMode,
      ble_slot: d.bleSlot,
      ssid: d.ssid,
      device: {
        id: 'demo-pad',
        name: 'Studio MacroPad (Demo)',
        firmware: d.firmware || '4.5.0',
        connection_type: 'DEMO',
        setup_mode: d.setupMode
      },
      connection: {
        wifi_connected: d.wifiConnected,
        ip: d.wifiConnected ? d.ip : '',
        ble_connected: d.bleConnected
      },
      ble: {
        active_host: d.bleSlot,
        max_hosts: 3,
        device_name: `Studio Pad ${d.bleSlot}`
      },
      diagnostics: {
        free_heap: 184320,
        http_api_enabled: d.httpApiEnabled,
        events_enabled: d.eventsEnabled,
        setup_mode: d.setupMode
      },
      capabilities: ['delay', 'repeat', 'macro_abort', 'macro_trace', 'push_turn', 'encoder_accel', 'diagnostics', 'tv_toggle'],
      tv: {
        configured: d.tvConfigured,
        paired: d.tvPaired,
        host: d.tvHost,
        port: d.tvPort,
        enabled: d.tvEnabled
      },
      profiles: {
        active: activeProf,
        items: [
          {
            id: 'HOST1',
            name: d.h1Name,
            controls: { ...d.h1 }
          },
          {
            id: 'HOST2',
            name: d.h2Name,
            controls: { ...d.h2 }
          },
          {
            id: 'HOST3',
            name: d.h3Name,
            controls: { ...d.h3 }
          },
          {
            id: 'TV',
            name: d.tvName,
            controls: { ...d.tv }
          }
        ]
      },
      mac_b1: activeHostSlots.b1,
      mac_b2: activeHostSlots.b2,
      mac_b3: activeHostSlots.b3,
      mac_b4: activeHostSlots.b4,
      mac_b5: activeHostSlots.b5,
      mac_b6: activeHostSlots.b6,
      mac_b7: activeHostSlots.b7,
      mac_b8: activeHostSlots.b8,
      mac_dial: activeHostSlots.dial,
      tv_b1: d.tv.b1,
      tv_b2: d.tv.b2,
      tv_b3: d.tv.b3,
      tv_b4: d.tv.b4,
      tv_b5: d.tv.b5,
      tv_b6: d.tv.b6,
      tv_b7: d.tv.b7,
      tv_b8: d.tv.b8,
      tv_dial: d.tv.dial
    };
  }

  private async handleDemoCall(
    obj: Record<string, any>,
    silentLog = false
  ): Promise<any> {
    if (!silentLog) {
      this.logSerial('tx', JSON.stringify(obj));
    }
    await new Promise(r => setTimeout(r, silentLog ? 3 : 45));

    if (!this.demoPad) {
      throw new Error('Demo pad is disconnected.');
    }
    const d = this.demoPad;
    const path = String(obj.path || '');

    const reply = (payload: Record<string, any>) => {
      if (!silentLog) {
        this.logSerial('rx', JSON.stringify(payload));
      }
      return payload;
    };

    if (path === '/api/events/set') {
      d.eventsEnabled = Boolean(obj.enabled);
      return reply({ ok: true, enabled: d.eventsEnabled ? 1 : 0 });
    }

    if (path === '/api/status' || path === '/api/device') {
      return reply(this.buildDemoStatusPacket());
    }

    if (path === '/api/ble/switch') {
      const slot = Number(obj.slot);
      if (slot !== 1 && slot !== 2 && slot !== 3) {
        return reply({ ok: false, message: 'Invalid host slot.' });
      }
      d.bleSlot = slot as BleHostSlot;
      this.applyTelemetryFromStatus(this.buildDemoStatusPacket(), 'DEMO:3200');
      if (d.eventsEnabled) {
        const evt: HardwareEventPacket = {
          event: 'ble_host',
          ble_slot: slot,
          active: d.mode === 'TV' ? 'TV' : bleSlotToProfileId(slot as BleHostSlot)
        };
        this.logSerial('rx', JSON.stringify(evt));
        this.handleHardwareEvent(evt);
      }
      return reply({ ok: true, message: 'Switching BLE host...' });
    }

    if (path === '/api/tv/enable') {
      const nextEnabled = Boolean(obj.enabled ?? obj.tv_enabled ?? true);
      d.tvEnabled = nextEnabled;
      if (!nextEnabled && d.mode === 'TV') {
        d.mode = 'MAC';
      }
      d.rev += 1;
      this.applyTelemetryFromStatus(this.buildDemoStatusPacket(), 'DEMO:3200');
      const res = reply({ ok: true, enabled: nextEnabled, rev: d.rev });
      if (d.eventsEnabled) {
        const tvEvt: HardwareEventPacket = { event: 'tv', enabled: nextEnabled };
        this.logSerial('rx', JSON.stringify(tvEvt));
        this.handleHardwareEvent(tvEvt);
        if (!nextEnabled) {
          const profEvt: HardwareEventPacket = { event: 'profile', active: bleSlotToProfileId(d.bleSlot) };
          this.logSerial('rx', JSON.stringify(profEvt));
          this.handleHardwareEvent(profEvt);
        }
      }
      return res;
    }

    if (path === '/api/profile/activate') {
      const rawProf = String(obj.profile || '');
      const isTvTarget = rawProf.toUpperCase() === 'TV';
      if (isTvTarget && !d.tvEnabled) {
        return reply({ ok: false, error: 'tv_disabled', message: 'TV Mode is currently disabled' });
      }
      d.mode = isTvTarget ? 'TV' : 'MAC';
      const activeTarget: HardwareProfileId =
        d.mode === 'TV' ? 'TV' : bleSlotToProfileId(d.bleSlot);
      this.applyTelemetryFromStatus(this.buildDemoStatusPacket(), 'DEMO:3200');
      const res = reply({ ok: true, active: activeTarget, rev: d.rev });
      if (d.eventsEnabled) {
        const evt: HardwareEventPacket = { event: 'profile', active: activeTarget };
        this.logSerial('rx', JSON.stringify(evt));
        this.handleHardwareEvent(evt);
      }
      return res;
    }

    if (path === '/api/customizer/save') {
      const prof = normalizeHardwareProfileId(String(obj.profile || ''), d.bleSlot);
      const slot = obj.slot as HardwareSlotId;
      const action = String(obj.action ?? '');
      if (!HARDWARE_SLOTS.includes(slot) || !isValidSlotAssignment(action)) {
        return reply({ ok: false, message: `Pad rejected unsupported action: ${action}` });
      }
      const targetMap = this.getDemoProfileSlots(d, prof);
      targetMap[slot] = action;
      d.rev += 1;
      this.applyTelemetryFromStatus(this.buildDemoStatusPacket(), 'DEMO:3200');
      return reply({ ok: true, rev: d.rev });
    }

    if (path === '/api/profile/save') {
      const prof = normalizeHardwareProfileId(String(obj.profile || ''), d.bleSlot);
      for (const s of HARDWARE_SLOTS) {
        if (!isValidSlotAssignment(String(obj[s] ?? ''))) {
          return reply({
            ok: false,
            message: `Invalid action on ${prof} slot ${s.toUpperCase()}.`
          });
        }
      }
      const nextSlots: Record<HardwareSlotId, string> = {
        b1: String(obj.b1 ?? ''),
        b2: String(obj.b2 ?? ''),
        b3: String(obj.b3 ?? ''),
        b4: String(obj.b4 ?? ''),
        b5: String(obj.b5 ?? ''),
        b6: String(obj.b6 ?? ''),
        b7: String(obj.b7 ?? ''),
        b8: String(obj.b8 ?? ''),
        dial: String(obj.dial ?? ''),
        enc_cw: String(obj.enc_cw ?? ''),
        enc_ccw: String(obj.enc_ccw ?? '')
      };
      this.setDemoProfileSlots(d, prof, nextSlots);
      d.rev += 1;
      this.applyTelemetryFromStatus(this.buildDemoStatusPacket(), 'DEMO:3200');
      return reply({ ok: true, rev: d.rev });
    }

    if (path === '/api/profile/rename') {
      const prof = normalizeHardwareProfileId(String(obj.profile || ''), d.bleSlot);
      const rawName = String(obj.name || '');
      if (!isValidFirmwareAlias(rawName)) {
        return reply({
          ok: false,
          message: 'Profile name must be 1–20 letters, numbers, spaces, hyphens, or underscores.'
        });
      }
      this.setDemoProfileName(d, prof, rawName);
      d.rev += 1;
      this.applyTelemetryFromStatus(this.buildDemoStatusPacket(), 'DEMO:3200');
      return reply({ ok: true, rev: d.rev });
    }

    if (path === '/api/profile/copy') {
      const source = normalizeHardwareProfileId(String(obj.source || ''), d.bleSlot);
      const target = normalizeHardwareProfileId(String(obj.target || ''), d.bleSlot);
      if (source !== target) {
        const srcSlots = this.getDemoProfileSlots(d, source);
        this.setDemoProfileSlots(d, target, { ...srcSlots });
        d.rev += 1;
      }
      this.applyTelemetryFromStatus(this.buildDemoStatusPacket(), 'DEMO:3200');
      return reply({ ok: true, rev: d.rev });
    }

    if (path === '/api/config/export') {
      const activeHostProf = bleSlotToProfileId(d.bleSlot);
      const activeHostSlots = this.getDemoProfileSlots(d, activeHostProf);
      const activeHostName = this.getDemoProfileName(d, activeHostProf);
      const payload: HardwareBackupPayload = {
        schema: 'studio-pad-config',
        version: 2,
        tv_name: d.tvName,
        h1_name: d.h1Name,
        h2_name: d.h2Name,
        h3_name: d.h3Name,
        h1_b1: d.h1.b1,
        h1_b2: d.h1.b2,
        h1_b3: d.h1.b3,
        h1_b4: d.h1.b4,
        h1_b5: d.h1.b5,
        h1_b6: d.h1.b6,
        h1_b7: d.h1.b7,
        h1_b8: d.h1.b8,
        h1_dial: d.h1.dial,
        h1_enc_cw: d.h1.enc_cw,
        h1_enc_ccw: d.h1.enc_ccw,
        h2_b1: d.h2.b1,
        h2_b2: d.h2.b2,
        h2_b3: d.h2.b3,
        h2_b4: d.h2.b4,
        h2_b5: d.h2.b5,
        h2_b6: d.h2.b6,
        h2_b7: d.h2.b7,
        h2_b8: d.h2.b8,
        h2_dial: d.h2.dial,
        h2_enc_cw: d.h2.enc_cw,
        h2_enc_ccw: d.h2.enc_ccw,
        h3_b1: d.h3.b1,
        h3_b2: d.h3.b2,
        h3_b3: d.h3.b3,
        h3_b4: d.h3.b4,
        h3_b5: d.h3.b5,
        h3_b6: d.h3.b6,
        h3_b7: d.h3.b7,
        h3_b8: d.h3.b8,
        h3_dial: d.h3.dial,
        h3_enc_cw: d.h3.enc_cw,
        h3_enc_ccw: d.h3.enc_ccw,
        tv_b1: d.tv.b1,
        tv_b2: d.tv.b2,
        tv_b3: d.tv.b3,
        tv_b4: d.tv.b4,
        tv_b5: d.tv.b5,
        tv_b6: d.tv.b6,
        tv_b7: d.tv.b7,
        tv_b8: d.tv.b8,
        tv_dial: d.tv.dial,
        tv_enc_cw: d.tv.enc_cw,
        tv_enc_ccw: d.tv.enc_ccw,
        mac_name: activeHostName,
        mac_b1: activeHostSlots.b1,
        mac_b2: activeHostSlots.b2,
        mac_b3: activeHostSlots.b3,
        mac_b4: activeHostSlots.b4,
        mac_b5: activeHostSlots.b5,
        mac_b6: activeHostSlots.b6,
        mac_b7: activeHostSlots.b7,
        mac_b8: activeHostSlots.b8,
        mac_dial: activeHostSlots.dial,
        mac_enc_cw: activeHostSlots.enc_cw,
        mac_enc_ccw: activeHostSlots.enc_ccw
      };
      return reply(payload);
    }

    if (path === '/api/config/import') {
      d.tvName = sanitizeFirmwareAlias(String(obj.tv_name || d.tvName), 'TV');
      d.h1Name = sanitizeFirmwareAlias(
        String(obj.h1_name || obj.mac_name || d.h1Name),
        'HOST1'
      );
      d.h2Name = sanitizeFirmwareAlias(String(obj.h2_name || d.h2Name), 'HOST2');
      d.h3Name = sanitizeFirmwareAlias(String(obj.h3_name || d.h3Name), 'HOST3');

      for (const s of HARDWARE_SLOTS) {
        if (typeof obj[`h1_${s}`] === 'string' && isValidSlotAssignment(obj[`h1_${s}`])) {
          d.h1[s] = obj[`h1_${s}`];
        } else if (typeof obj[`mac_${s}`] === 'string' && isValidSlotAssignment(obj[`mac_${s}`])) {
          d.h1[s] = obj[`mac_${s}`];
        }

        if (typeof obj[`h2_${s}`] === 'string' && isValidSlotAssignment(obj[`h2_${s}`])) {
          d.h2[s] = obj[`h2_${s}`];
        }
        if (typeof obj[`h3_${s}`] === 'string' && isValidSlotAssignment(obj[`h3_${s}`])) {
          d.h3[s] = obj[`h3_${s}`];
        }
        if (typeof obj[`tv_${s}`] === 'string' && isValidSlotAssignment(obj[`tv_${s}`])) {
          d.tv[s] = obj[`tv_${s}`];
        }
      }
      d.rev += 1;
      this.applyTelemetryFromStatus(this.buildDemoStatusPacket(), 'DEMO:3200');
      return reply({ ok: true, rev: d.rev });
    }

    if (path === '/api/macro/cancel') {
      if (d.eventsEnabled) {
        const evt: HardwareEventPacket = { event: 'macro_cancel' };
        this.logSerial('rx', JSON.stringify(evt));
        this.handleHardwareEvent(evt);
      }
      return reply({ ok: true, cancelled: true });
    }

    if (path === '/api/test/action') {
      const act = String(obj.action || '');
      if (!isValidFirmwareAction(act)) {
        return reply({ ok: false, message: 'Unsupported action.' });
      }
      if (act.startsWith('DELAY:')) {
        return reply({ ok: true, message: `Demo pad paused (${act})` });
      }
      if (act.startsWith('BLE:')) {
        this.applyDemoBleActionSideEffect(act);
        return reply({
          ok: true,
          message: `Switched to Studio Pad ${d.bleSlot} (Host ${d.bleSlot})`
        });
      }
      const isTv = isTvFirmwareAction(act);
      if (isTv) {
        if (!d.tvEnabled) return reply({ ok: false, error: 'tv_disabled', message: 'TV Mode is currently disabled' });
        if (!d.wifiConnected) return reply({ ok: false, message: 'Pad Wi-Fi is disconnected.' });
        if (!d.tvPaired) return reply({ ok: false, message: 'Vizio TV is not paired.' });
      } else if (!d.bleConnected) {
        return reply({ ok: false, message: 'Bluetooth host is not connected.' });
      }
      return reply({ ok: true, message: `Demo pad fired ${act.replace(/\n/g, '\\n')}` });
    }

    if (path === '/api/wifi') {
      const ssid = String(obj.ssid || '').trim();
      const pass = String(obj.pass || '');
      if (!ssid) return reply({ ok: false, message: 'Enter a Wi-Fi network name (SSID).' });
      d.ssid = ssid;
      // Simulate failed connection if password is "wrong" or < 8 chars (when non-empty)
      if (pass.length > 0 && pass.length < 8) {
        d.wifiConnected = false;
        d.ip = '';
      } else {
        d.wifiConnected = true;
        d.ip = '192.168.1.42';
      }
      this.applyTelemetryFromStatus(this.buildDemoStatusPacket(), 'DEMO:2100');
      return reply({ ok: true, message: 'Wi-Fi saved. Connecting…' });
    }

    if (path === '/api/pair/start') {
      const host = String(obj.tv_ip || '').trim();
      const port = Number(obj.tv_port) || 7345;
      if (!host) return reply({ ok: false, message: 'Enter TV IP address.' });
      d.pairingPendingHost = host;
      d.pairingPendingPort = port;
      d.tvHost = host;
      d.tvPort = port;
      d.tvConfigured = true;
      this.applyTelemetryFromStatus(this.buildDemoStatusPacket(), 'DEMO:2100');
      return reply({
        ok: true,
        message: 'PIN displayed on Demo Vizio TV (enter any 4-digit PIN, e.g. 1234).'
      });
    }

    if (path === '/api/pair/submit') {
      const pin = String(obj.pin || '').trim();
      if (!/^\d{4}$/.test(pin)) {
        return reply({ ok: false, message: 'Enter the 4-digit numeric PIN shown on your TV.' });
      }
      d.tvPaired = true;
      d.tvConfigured = true;
      if (d.pairingPendingHost) {
        d.tvHost = d.pairingPendingHost;
        d.tvPort = d.pairingPendingPort;
      }
      this.applyTelemetryFromStatus(this.buildDemoStatusPacket(), 'DEMO:2100');
      return reply({ ok: true, message: 'SmartCast TV paired and token stored on pad.' });
    }

    if (path === '/api/token/save') {
      const host = String(obj.tv_ip || '').trim();
      const port = Number(obj.tv_port) || 7345;
      const token = String(obj.token || '').trim();
      if (!host || !token) {
        return reply({ ok: false, message: 'Both TV IP and auth token are required.' });
      }
      d.tvHost = host;
      d.tvPort = port;
      d.tvConfigured = true;
      d.tvPaired = true;
      this.applyTelemetryFromStatus(this.buildDemoStatusPacket(), 'DEMO:2100');
      return reply({ ok: true, message: 'Saved SmartCast host & auth token to pad.' });
    }

    if (path === '/api/tv/test') {
      if (!d.wifiConnected) {
        return reply({ ok: false, message: 'Pad is offline — connect Wi-Fi first.' });
      }
      if (!d.tvPaired || !d.tvHost) {
        return reply({ ok: false, message: 'No paired Vizio TV configured on pad.' });
      }
      return reply({
        ok: true,
        message: `Connected to Vizio SmartCast TV at ${d.tvHost}:${d.tvPort}.`
      });
    }

    if (path === '/api/tv/forget') {
      if (obj.confirm !== 'FORGET') {
        return reply({ ok: false, message: 'Type FORGET to confirm.' });
      }
      d.tvHost = '';
      d.tvPort = 7345;
      d.tvConfigured = false;
      d.tvPaired = false;
      this.applyTelemetryFromStatus(this.buildDemoStatusPacket(), 'DEMO:2100');
      return reply({ ok: true, message: 'Removed saved TV host and auth token from pad.' });
    }

    if (path === '/api/device/reset-settings') {
      if (obj.confirm !== 'RESET') {
        return reply({ ok: false, message: 'Type RESET to confirm.' });
      }
      d.h1Name = defaultProfileAlias('HOST1');
      d.h2Name = defaultProfileAlias('HOST2');
      d.h3Name = defaultProfileAlias('HOST3');
      d.tvName = defaultProfileAlias('TV');
      d.h1 = { ...FACTORY_DEFAULT_SLOTS.HOST1 };
      d.h2 = { ...FACTORY_DEFAULT_SLOTS.HOST2 };
      d.h3 = { ...FACTORY_DEFAULT_SLOTS.HOST3 };
      d.tv = { ...FACTORY_DEFAULT_SLOTS.TV };
      d.rev += 1;
      this.applyTelemetryFromStatus(this.buildDemoStatusPacket(), 'DEMO:3200');
      return reply({
        ok: true,
        rev: d.rev,
        message: 'All host profiles and TV restored to universal defaults.'
      });
    }

    if (path === '/api/auth/set') {
      const tok = String(obj.token || '').trim();
      if (tok.length > 0 && (tok.length < 8 || tok.length > 64)) {
        return reply({
          ok: false,
          message: 'Token must be 8–64 characters, or empty to disable.'
        });
      }
      d.httpApiEnabled = tok.length >= 8;
      this.applyTelemetryFromStatus(this.buildDemoStatusPacket(), 'DEMO:2100');
      return reply({
        ok: true,
        message: d.httpApiEnabled ? 'HTTP API token updated.' : 'HTTP API disabled.'
      });
    }

    if (path === '/api/setup/complete') {
      d.setupMode = false;
      this.applyTelemetryFromStatus(this.buildDemoStatusPacket(), 'DEMO:3200');
      return reply({
        ok: true,
        mode: 'ready',
        setup_mode: false,
        message: 'Setup completed and stored in MacroPad NVS.'
      });
    }

    if (path === '/api/setup/enter') {
      d.setupMode = true;
      this.applyTelemetryFromStatus(this.buildDemoStatusPacket(), 'DEMO:3200');
      if (d.eventsEnabled) {
        const evt: HardwareEventPacket = {
          event: 'setup',
          mode: 'setup',
          setup_mode: true
        };
        this.logSerial('rx', JSON.stringify(evt));
        this.handleHardwareEvent(evt);
      }
      return reply({
        ok: true,
        mode: 'setup',
        setup_mode: true,
        message: 'MacroPad entered Setup Mode.'
      });
    }

    if (path === '/api/ota/start') {
      if (!d.wifiConnected) {
        return reply({
          ok: false,
          message:
            'MacroPad Wi-Fi is offline. Connect Wi-Fi first or use USB Serial Stream / Local .bin Flash.'
        });
      }
      const nextVersion = String(obj.version || d.firmware || '4.5.0').replace(/^[vV]/, '');
      window.setTimeout(() => {
        if (!this.demoModeActive || !this.demoPad) return;
        const stages: { phase: string; percent: number; message: string; delay: number }[] = [
          {
            phase: 'downloading',
            percent: 18,
            message: 'Downloading firmware update over Wi-Fi…',
            delay: 180
          },
          {
            phase: 'downloading',
            percent: 46,
            message: 'Streaming firmware binary to OTA partition…',
            delay: 420
          },
          {
            phase: 'flashing',
            percent: 78,
            message: 'Writing flash sectors & verifying SHA-256 digest…',
            delay: 720
          },
          {
            phase: 'rebooting',
            percent: 94,
            message: 'Switching boot partition & restarting ESP32…',
            delay: 1020
          },
          {
            phase: 'complete',
            percent: 100,
            message: `Booted into firmware v${nextVersion}`,
            delay: 1380
          }
        ];
        stages.forEach(s => {
          window.setTimeout(() => {
            if (!this.demoModeActive || !this.demoPad) return;
            if (s.phase === 'complete') {
              this.demoPad.firmware = nextVersion;
              this.applyTelemetryFromStatus(this.buildDemoStatusPacket(), 'DEMO:3200');
            }
            const otaEvt: HardwareEventPacket = {
              event: 'ota',
              phase: s.phase,
              percent: s.percent,
              message: s.message
            };
            this.logSerial('rx', JSON.stringify(otaEvt));
            this.handleHardwareEvent(otaEvt);
          }, s.delay);
        });
      }, 40);

      return reply({
        ok: true,
        message: `Started direct Wi-Fi OTA update to v${nextVersion}`
      });
    }

    if (path === '/api/ota/begin') {
      const totalSize = Number(obj.size || 0);
      if (!Number.isFinite(totalSize) || totalSize <= 0) {
        return reply({ ok: false, message: 'Invalid firmware image size.' });
      }
      return reply({
        ok: true,
        chunk_size: 512,
        message: 'OTA partition erased and ready for USB serial stream.'
      });
    }

    if (path === '/api/ota/chunk') {
      await new Promise(r => setTimeout(r, 28));
      return reply({ ok: true, seq: Number(obj.seq || 0) });
    }

    if (path === '/api/ota/end') {
      const nextVersion = String(obj.version || d.firmware || '4.5.0').replace(/^[vV]/, '');
      d.firmware = nextVersion;
      this.applyTelemetryFromStatus(this.buildDemoStatusPacket(), 'DEMO:3200');
      const doneEvt: HardwareEventPacket = {
        event: 'ota',
        phase: 'complete',
        percent: 100,
        message: `USB Serial OTA complete — running v${nextVersion}`
      };
      this.logSerial('rx', JSON.stringify(doneEvt));
      this.handleHardwareEvent(doneEvt);
      return reply({
        ok: true,
        firmware: nextVersion,
        message: `Verified image & booted v${nextVersion}`
      });
    }

    return reply({ ok: false, message: `Unknown endpoint: ${path}` });
  }

  private async sendLineSyncBreak(): Promise<void> {
    if (this.demoModeActive || !this.writer) return;
    try {
      await this.writer.write(new TextEncoder().encode('\n'));
    } catch {}
  }

  private async openAuthorizedPort(
    port: any,
    throwOnError = false
  ): Promise<FirmwareStatusPacket | null> {
    if (this.isOpening || !port) return null;
    this.isOpening = true;
    this.demoModeActive = false;

    const portInfo = port.getInfo?.() || {};
    const vid = portInfo.usbVendorId
      ? portInfo.usbVendorId.toString(16).padStart(4, '0').toUpperCase()
      : undefined;
    const pid = portInfo.usbProductId
      ? portInfo.usbProductId.toString(16).padStart(4, '0').toUpperCase()
      : undefined;
    const vendorProduct = vid && pid ? `${vid}:${pid}` : undefined;

    this.connectionInfo = {
      connected: false,
      connecting: true,
      transport: 'disconnected',
      deviceName: 'Studio MacroPad',
      firmwareVersion: 'Connecting…',
      vendorProduct
    };
    this.emitConnection();

    try {
      try {
        await port.open({ baudRate: 115200, bufferSize: 16384 });
      } catch (openErr: any) {
        const translated = translateSerialOpenError(openErr);
        this.logSerial('error', translated.message);
        throw translated;
      }

      // Release DTR & RTS so CP2102/CH340/CH9102 auto-reset circuits never hold EN or GPIO0 low
      try {
        await port.setSignals?.({
          dataTerminalReady: false,
          requestToSend: false
        });
      } catch {}

      this.port = port;
      this.buf = '';
      this.pendingBootSetupBeacon = false;
      this.rxCharsSinceOpen = 0;
      this.sawRomDownloadBoot = false;
      this.writer = port.writable.getWriter();

      const decoder = new TextDecoderStream();
      this.pipeClosedPromise = port.readable.pipeTo(decoder.writable).catch(() => {});
      this.reader = decoder.readable.getReader();

      this.logSerial(
        'info',
        `Opened USB serial port (${vendorProduct || '115200 baud'}) — waiting for MacroPad boot & handshake`
      );
      this.readLoop(port);

      // ESP32 boards often pulse EN on port open and spend ~2–4s initializing NimBLE, Wi-Fi, and OLED
      await new Promise(r => setTimeout(r, 1600));
      if (this.port !== port) return null;

      let rawStatus: FirmwareStatusPacket | null = null;
      let lastProbeErr: any = null;

      for (let attempt = 1; attempt <= 4; attempt++) {
        if (this.port !== port) return null;
        if (this.sawRomDownloadBoot) {
          throw new Error(
            'MacroPad is in ESP32 ROM Download Mode — unplug and reconnect the USB cable without holding any buttons, then connect again.'
          );
        }

        // Flush any partial boot ROM output so the JSON line starts cleanly with '{'
        await this.sendLineSyncBreak();
        await new Promise(r => setTimeout(r, 100));

        try {
          const candidate = await this.call<FirmwareStatusPacket>(
            { path: '/api/status' },
            2500
          );
          if (candidate && candidate.profiles) {
            rawStatus = candidate;
            break;
          }
        } catch (probeErr: any) {
          lastProbeErr = probeErr;
          if (attempt < 4 && this.port === port) {
            this.logSerial(
              'info',
              `Handshake attempt ${attempt}/4 timed out — retrying status probe…`
            );
            await new Promise(r => setTimeout(r, 400));
          }
        }
      }

      if (!rawStatus || !rawStatus.profiles) {
        if (this.sawRomDownloadBoot) {
          throw new Error(
            'MacroPad is in ESP32 ROM Download Mode — unplug and reconnect the USB cable without holding any buttons.'
          );
        }
        if (!vendorProduct && this.rxCharsSinceOpen === 0) {
          throw new Error(
            'No reply from that serial port — select your MacroPad USB port (such as CP2102, CH340, or usbserial) rather than Bluetooth-Incoming-Port, and close Arduino Serial Monitor.'
          );
        }
        throw (
          lastProbeErr ||
          new Error(
            `Timed out waiting for MacroPad reply over USB${
              vendorProduct ? ` (${vendorProduct})` : ''
            } — close Arduino Serial Monitor if open, unplug/replug USB, and try again.`
          )
        );
      }

      // Enable or sync real-time hardware events (`press`, `turn`, `profile`, `connection`, `config`, `setup`)
      const evVal = this.desiredEventsEnabled ? 1 : 0;
      await this.call({ path: '/api/events/set', enabled: evVal }, 2500).catch(() => {});

      const status = await this.enrichStatusWithAllProfiles(rawStatus, 3000);
      if (this.pendingBootSetupBeacon && !extractSetupClearedFlag(status)) {
        status.mode = 'setup';
        status.setup_mode = true;
      }
      this.pendingBootSetupBeacon = false;

      this.applyTelemetryFromStatus(status, vendorProduct);
      this.startLiveTelemetryPolling();
      this.connectStatusListeners.forEach(fn => fn(status));
      if (extractSetupModeFlag(status)) {
        this.emitSetupMode(true, 'status', status.device?.id || 'studio-pad');
      }
      return status;
    } catch (err: any) {
      await this.cleanupPort();
      this.markDisconnected();
      if (throwOnError) {
        throw err instanceof Error
          ? err
          : new Error('Failed to communicate with MacroPad over USB.');
      }
      return null;
    } finally {
      this.isOpening = false;
    }
  }

  private async enrichStatusWithAllProfiles(
    status: FirmwareStatusPacket,
    timeoutMs = 3000
  ): Promise<FirmwareStatusPacket> {
    const rawSlot = Number(status.ble?.active_host ?? status.ble_slot ?? 1);
    const activeHost: BleHostSlot = rawSlot === 2 ? 2 : rawSlot === 3 ? 3 : 1;
    const normalizedActive = normalizeHardwareProfileId(
      status.profiles?.active,
      activeHost
    );

    const existingItems = status.profiles?.items || [];
    const hasAllThreeHosts =
      existingItems.some(i => i.id === 'HOST1' || i.id === 'H1') &&
      existingItems.some(i => i.id === 'HOST2' || i.id === 'H2') &&
      existingItems.some(i => i.id === 'HOST3' || i.id === 'H3');

    if (hasAllThreeHosts) {
      return {
        ...status,
        profiles: {
          active: normalizedActive,
          items: existingItems.map(item => ({
            ...item,
            id: normalizeHardwareProfileId(item.id, activeHost)
          }))
        }
      };
    }

    try {
      const exp = await this.call<HardwareBackupPayload>(
        { path: '/api/config/export' },
        timeoutMs
      );
      if (exp && exp.schema === 'studio-pad-config' && (exp.version === 2 || exp.h1_b1)) {
        const extractPrefix = (
          prefix: 'h1' | 'h2' | 'h3' | 'tv',
          fallback: Record<HardwareSlotId, string>
        ): Record<HardwareSlotId, string> => {
          const out = { ...fallback };
          for (const slot of HARDWARE_SLOTS) {
            const val = exp[`${prefix}_${slot}`];
            if (typeof val === 'string' && val.length > 0) {
              out[slot] = val;
            }
          }
          return out;
        };

        return {
          ...status,
          profiles: {
            active: normalizedActive,
            items: [
              {
                id: 'HOST1',
                name: exp.h1_name || 'Host 1',
                controls: extractPrefix('h1', FACTORY_DEFAULT_SLOTS.HOST1)
              },
              {
                id: 'HOST2',
                name: exp.h2_name || 'Host 2',
                controls: extractPrefix('h2', FACTORY_DEFAULT_SLOTS.HOST2)
              },
              {
                id: 'HOST3',
                name: exp.h3_name || 'Host 3',
                controls: extractPrefix('h3', FACTORY_DEFAULT_SLOTS.HOST3)
              },
              {
                id: 'TV',
                name: exp.tv_name || 'TV',
                controls: extractPrefix('tv', FACTORY_DEFAULT_SLOTS.TV)
              }
            ]
          }
        };
      }
    } catch (_) {}

    return {
      ...status,
      profiles: {
        ...status.profiles,
        active: normalizedActive
      }
    };
  }

  private async readLoop(port: any) {
    try {
      for (;;) {
        if (!this.reader) break;
        const { value, done } = await this.reader.read();
        if (done) break;
        if (!value) continue;

        this.rxCharsSinceOpen += value.length;
        this.buf += value;
        if (this.buf.length > 32768) {
          this.buf = this.buf.slice(-8192);
        }

        let i: number;
        while ((i = this.buf.indexOf('\n')) >= 0) {
          const line = this.buf.slice(0, i).trim();
          this.buf = this.buf.slice(i + 1);
          if (!line.startsWith('{')) {
            if (line.includes('DOWNLOAD_BOOT') || line.includes('boot:0x0')) {
              this.sawRomDownloadBoot = true;
            }
            if (this.isOpening && line.length > 0) {
              this.logSerial('info', `[BOOT] ${line.slice(0, 140)}`);
            }
            if (
              this.isFlashingOta &&
              !this.otaRebootExpected &&
              (line.includes('rst:0x') ||
                line.includes('boot:0x') ||
                line.includes('Brownout') ||
                line.includes('Guru Meditation'))
            ) {
              const isBrownout = line.includes('Brownout');
              const resetMsg = isBrownout
                ? 'MacroPad reset due to USB power brownout during flash — plug directly into a computer USB port with a data/power cable and retry.'
                : 'MacroPad unexpectedly rebooted during USB firmware write — reconnect and retry.';
              this.logSerial('error', `${resetMsg} (${line.slice(0, 100)})`);
              if (this.pendingReject) {
                const rej = this.pendingReject;
                this.pending = null;
                this.pendingReject = null;
                rej(new Error(resetMsg));
              }
              continue;
            }
            // Detect physical ESP32 reboot (e.g. Mode+Dial BLE host switch) over UART bridge
            if (
              !this.isOpening &&
              !this.isFlashingOta &&
              this.connectionInfo.connected &&
              (line.includes('rst:0x') || line.includes('boot:0x'))
            ) {
              this.logSerial('info', 'Detected ESP32 hardware reboot — scheduling live resync');
              this.schedulePostRebootResync(port);
            }
            continue;
          }

          let msg: any;
          try {
            msg = JSON.parse(line);
          } catch {
            continue;
          }

          const shouldSilenceRx = Boolean(
            this.pending && this.pendingSilentLog && !msg.event
          );
          if (!shouldSilenceRx) {
            this.logSerial('rx', line);
          }

          if (msg.event) {
            if (this.isOpening && extractSetupModeFlag(msg)) {
              this.pendingBootSetupBeacon = true;
            }
            this.handleHardwareEvent(msg as HardwareEventPacket);
          } else if (
            !this.pending &&
            !msg.profiles &&
            (extractSetupModeFlag(msg) || extractSetupClearedFlag(msg))
          ) {
            // Unsolicited boot or loop setup beacon such as {"mode":"setup"}
            const active = extractSetupModeFlag(msg);
            if (this.isOpening && active) {
              this.pendingBootSetupBeacon = true;
            }
            if (this.connectionInfo.telemetry) {
              this.connectionInfo = {
                ...this.connectionInfo,
                telemetry: {
                  ...this.connectionInfo.telemetry,
                  setupMode: active
                }
              };
              this.emitConnection();
            }
            if (this.connectionInfo.connected) {
              this.emitSetupMode(active, 'beacon', this.connectionInfo.deviceId);
            }
          } else {
            if (msg.profiles && msg.device) {
              this.applyTelemetryFromStatus(
                msg as FirmwareStatusPacket,
                this.connectionInfo.vendorProduct
              );
            } else if (typeof msg.rev === 'number' && this.connectionInfo.connected) {
              this.connectionInfo = {
                ...this.connectionInfo,
                rev: msg.rev,
                lastSyncedAt: new Date().toLocaleTimeString()
              };
              this.emitConnection();
            }

            if (this.pending) {
              const resolveFn = this.pending;
              this.pending = null;
              this.pendingReject = null;
              this.pendingSilentLog = false;
              resolveFn(msg);
            }
          }
        }
      }
    } catch (_) {
    } finally {
      if (this.port === port && !this.isFlashingOta) {
        await this.cleanupPort();
        this.markDisconnected();
      }
    }
  }

  private handleHardwareEvent(e: HardwareEventPacket) {
    if (
      e.event === 'setup' ||
      e.event === 'mode' ||
      extractSetupModeFlag(e) ||
      extractSetupClearedFlag(e)
    ) {
      const nextSetup = extractSetupModeFlag(e) || (e.event === 'setup' && !extractSetupClearedFlag(e));
      if (this.connectionInfo.telemetry) {
        this.connectionInfo = {
          ...this.connectionInfo,
          telemetry: {
            ...this.connectionInfo.telemetry,
            setupMode: nextSetup
          }
        };
        this.emitConnection();
      }
      if (this.connectionInfo.connected) {
        this.emitSetupMode(
          nextSetup,
          this.demoModeActive ? 'demo' : 'event',
          this.connectionInfo.deviceId
        );
      }
    } else if (e.event === 'connection' && this.connectionInfo.telemetry) {
      this.connectionInfo = {
        ...this.connectionInfo,
        telemetry: {
          ...this.connectionInfo.telemetry,
          bleConnected:
            typeof e.ble === 'boolean'
              ? e.ble
              : this.connectionInfo.telemetry.bleConnected,
          wifiConnected:
            typeof e.wifi === 'boolean'
              ? e.wifi
              : this.connectionInfo.telemetry.wifiConnected,
          ip:
            typeof e.ip === 'string'
              ? e.ip
              : e.wifi === false
              ? ''
              : this.connectionInfo.telemetry.ip
        }
      };
      this.emitConnection();
    } else if (e.event === 'profile' && this.connectionInfo.telemetry) {
      const currentSlot = this.connectionInfo.telemetry.bleActiveHost ?? 1;
      const nextActive = normalizeHardwareProfileId(
        e.active || e.profile,
        currentSlot
      );
      this.connectionInfo = {
        ...this.connectionInfo,
        telemetry: {
          ...this.connectionInfo.telemetry,
          activeProfile: nextActive
        }
      };
      this.emitConnection();
    } else if (e.event === 'ble_host' && this.connectionInfo.telemetry) {
      const slotNum = Number(e.ble_slot);
      const nextSlot: BleHostSlot = slotNum === 2 ? 2 : slotNum === 3 ? 3 : 1;
      const wasTv = this.connectionInfo.telemetry.activeProfile === 'TV';
      this.connectionInfo = {
        ...this.connectionInfo,
        telemetry: {
          ...this.connectionInfo.telemetry,
          bleActiveHost: nextSlot,
          bleDeviceName: `Studio Pad ${nextSlot}`,
          activeProfile: wasTv ? 'TV' : bleSlotToProfileId(nextSlot)
        }
      };
      this.emitConnection();
    } else if (e.event === 'config' && typeof e.rev === 'number') {
      this.connectionInfo = {
        ...this.connectionInfo,
        rev: e.rev,
        lastSyncedAt: new Date().toLocaleTimeString()
      };
      this.emitConnection();
    } else if (e.event === 'tv' && this.connectionInfo.telemetry) {
      const nextTvEnabled = Boolean(e.enabled);
      const wasTv = this.connectionInfo.telemetry.activeProfile === 'TV';
      this.connectionInfo = {
        ...this.connectionInfo,
        telemetry: {
          ...this.connectionInfo.telemetry,
          tvEnabled: nextTvEnabled,
          activeProfile: !nextTvEnabled && wasTv ? bleSlotToProfileId(this.connectionInfo.telemetry.bleActiveHost) : this.connectionInfo.telemetry.activeProfile
        }
      };
      this.emitConnection();
    } else if (e.event === 'ota') {
      this.otaListeners.forEach(fn => fn(e));
    }

    this.eventListeners.forEach(fn => fn(e));
  }

  private applyTelemetryFromStatus(pkt: FirmwareStatusPacket, vendorProduct?: string) {
    const deviceId = pkt.device?.id || this.connectionInfo.deviceId || 'studio-pad';
    const rawFw = pkt.device?.firmware || '';
    const resolvedFw = resolveDeviceFirmwareInfo(deviceId, rawFw);
    const fw =
      resolvedFw.displayVersion ||
      (this.connectionInfo.firmwareVersion &&
      this.connectionInfo.firmwareVersion !== 'Connecting…'
        ? this.connectionInfo.firmwareVersion
        : '—');

    const rawSlot = Number(pkt.ble?.active_host ?? pkt.ble_slot ?? 1);
    const activeHost: BleHostSlot = rawSlot === 2 ? 2 : rawSlot === 3 ? 3 : 1;
    const maxHosts = Number(pkt.ble?.max_hosts ?? 3);
    const bleDeviceName = pkt.ble?.device_name || `Studio Pad ${activeHost}`;
    const activeProfile = normalizeHardwareProfileId(
      pkt.profiles?.active,
      activeHost
    );

    const hasExplicitSetupField =
      extractSetupModeFlag(pkt) || extractSetupClearedFlag(pkt);
    const setupMode = hasExplicitSetupField
      ? extractSetupModeFlag(pkt)
      : Boolean(this.connectionInfo.telemetry?.setupMode);

    const wifiConnected = Boolean(pkt.connection?.wifi_connected ?? pkt.wifi_connected);
    const rawIp = String(pkt.connection?.ip || pkt.ip || '').trim();
    const cleanIp =
      (wifiConnected || setupMode) && rawIp && rawIp !== '0.0.0.0' ? rawIp : '';
    const eventsEnabled =
      typeof pkt.diagnostics?.events_enabled === 'boolean'
        ? pkt.diagnostics.events_enabled
        : this.desiredEventsEnabled;

    const tvEnabled = pkt.tv?.enabled !== false;
    const capabilities = Array.isArray(pkt.capabilities)
      ? pkt.capabilities
      : ['delay', 'repeat', 'macro_abort', 'macro_trace', 'push_turn', 'encoder_accel', 'diagnostics', 'tv_toggle'];

    const telemetry: HardwareTelemetry = {
      apiVersion: Number(pkt.api_version ?? 1),
      reportedFirmwareVersion: resolvedFw.reportedVersion || undefined,
      eventsEnabled,
      supportsNativeDelay: resolvedFw.supportsV45Engine,
      supports512ByteSlotSave: resolvedFw.supportsV45Engine,
      setupMode,
      activeProfile,
      wifiConnected,
      ip: cleanIp,
      ssid: pkt.ssid || '',
      bleConnected: Boolean(pkt.connection?.ble_connected),
      bleActiveHost: activeHost,
      bleMaxHosts: maxHosts,
      bleDeviceName,
      freeHeap: Number(pkt.diagnostics?.free_heap ?? pkt.heap ?? 0),
      httpApiEnabled: Boolean(pkt.diagnostics?.http_api_enabled),
      tvConfigured: Boolean(pkt.tv?.configured),
      tvPaired: Boolean(pkt.tv?.paired ?? pkt.has_auth),
      tvHost: pkt.tv?.host ?? pkt.tv_ip ?? '',
      tvPort: Number(pkt.tv?.port ?? pkt.tv_port ?? 7345),
      tvEnabled,
      capabilities,
      connectionType: pkt.device?.connection_type || (this.demoModeActive ? 'DEMO' : 'USB')
    };

    this.connectionInfo = {
      connected: true,
      connecting: false,
      transport: this.demoModeActive ? 'demo' : 'webserial',
      deviceId,
      rev: typeof pkt.rev === 'number' ? pkt.rev : this.connectionInfo.rev ?? 0,
      deviceName:
        pkt.device?.name ||
        (this.demoModeActive ? 'Studio MacroPad (Demo)' : 'Studio MacroPad'),
      firmwareVersion: fw,
      vendorProduct: vendorProduct ?? this.connectionInfo.vendorProduct,
      lastSyncedAt: new Date().toLocaleTimeString(),
      telemetry
    };
    this.emitConnection();
  }

  /**
   * Serialized single-request-at-a-time JSON RPC over USB Serial (or virtual Demo Mode)
   */
  public call<T = any>(
    obj: Record<string, any>,
    timeoutMs = 3000,
    opts?: { silentLog?: boolean; allowDuringOta?: boolean }
  ): Promise<T> {
    const silentLog = Boolean(opts?.silentLog);
    const reqPath = String(obj.path || '');
    const isOtaRoute = reqPath.startsWith('/api/ota/');
    if (this.isFlashingOta && !isOtaRoute && !opts?.allowDuringOta) {
      return Promise.reject(
        new Error('MacroPad is currently writing a firmware update — wait for flashing to finish.')
      );
    }

    const run = () => {
      if (this.demoModeActive) {
        return this.handleDemoCall(obj, silentLog) as Promise<T>;
      }

      return new Promise<T>((resolve, reject) => {
        if (!this.writer || !this.port) {
          reject(new Error('MacroPad USB cable is disconnected.'));
          return;
        }

        const encodedLine = JSON.stringify(obj) + '\n';
        if (encodedLine.length > 1536) {
          reject(new Error('Serial JSON packet exceeds 1536-byte firmware limit.'));
          return;
        }

        if (!silentLog) {
          this.logSerial('tx', encodedLine);
        }

        const t = window.setTimeout(() => {
          if (this.pending === onReply) {
            this.pending = null;
            this.pendingReject = null;
            this.pendingSilentLog = false;
          }
          const err = new Error('Timed out waiting for MacroPad reply over USB.');
          if (!silentLog) {
            this.logSerial('error', err.message);
          }
          reject(err);
        }, timeoutMs);

        const onReply = (msg: any) => {
          window.clearTimeout(t);
          resolve(msg as T);
        };

        this.pending = onReply;
        this.pendingSilentLog = silentLog;
        this.pendingReject = (err: Error) => {
          window.clearTimeout(t);
          this.pendingSilentLog = false;
          reject(err);
        };

        this.writer.write(new TextEncoder().encode(encodedLine)).catch(err => {
          window.clearTimeout(t);
          if (this.pending === onReply) {
            this.pending = null;
            this.pendingReject = null;
            this.pendingSilentLog = false;
          }
          reject(
            err instanceof Error ? err : new Error('Failed to write to USB Serial port.')
          );
        });
      });
    };

    const next = this.queue.then(run, run);
    this.queue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  // ===========================================================================
  // Firmware API Wrappers
  // ===========================================================================

  public async setEventsEnabled(enabled: boolean): Promise<void> {
    this.desiredEventsEnabled = enabled;
    if (!this.connectionInfo.connected) return;
    await this.call({ path: '/api/events/set', enabled: enabled ? 1 : 0 }).catch(() => {});
  }

  public async fetchStatus(timeoutMs = 3000): Promise<FirmwareStatusPacket> {
    const rawRes = await this.call<FirmwareStatusPacket>({ path: '/api/status' }, timeoutMs);
    if (!rawRes || !rawRes.profiles) {
      throw new Error((rawRes as any)?.message || 'Unexpected status reply from MacroPad.');
    }
    const enriched = await this.enrichStatusWithAllProfiles(rawRes, timeoutMs);
    this.applyTelemetryFromStatus(enriched, this.connectionInfo.vendorProduct);
    return enriched;
  }

  public async activateProfile(
    profile: HardwareProfileId
  ): Promise<{ ok: boolean; rev?: number; active?: HardwareProfileId; message?: string }> {
    const wireProfile = profile === 'TV' ? 'TV' : 'MAC';
    const res = await this.call({
      path: '/api/profile/activate',
      profile: wireProfile
    });
    if (res?.ok && this.connectionInfo.telemetry) {
      const currentHost = this.connectionInfo.telemetry.bleActiveHost ?? 1;
      const effectiveActive: HardwareProfileId =
        profile === 'TV' ? 'TV' : bleSlotToProfileId(currentHost);
      this.connectionInfo = {
        ...this.connectionInfo,
        telemetry: {
          ...this.connectionInfo.telemetry,
          activeProfile: effectiveActive
        }
      };
      this.emitConnection();
    }
    return res;
  }

  public async saveSlotBinding(
    profile: HardwareProfileId,
    slot: HardwareSlotId,
    action: string
  ): Promise<{ ok: boolean; rev?: number; message?: string }> {
    if (!isValidSlotAssignment(action)) {
      throw new Error(`Unsupported firmware action: ${action}`);
    }
    const res = await this.call({
      path: '/api/customizer/save',
      profile,
      slot,
      action
    });
    if (!res?.ok) {
      throw new Error(res?.message || 'Device rejected slot assignment.');
    }
    return res;
  }

  public async saveFullProfile(
    profile: HardwareProfileId,
    slots: Record<HardwareSlotId, string>
  ): Promise<{ ok: boolean; rev?: number; message?: string }> {
    for (const slotId of HARDWARE_SLOTS) {
      if (!isValidSlotAssignment(slots[slotId])) {
        throw new Error(
          `Slot ${slotId.toUpperCase()} on ${profile} contains an invalid action.`
        );
      }
    }
    const reqObj = {
      path: '/api/profile/save',
      profile,
      b1: slots.b1,
      b2: slots.b2,
      b3: slots.b3,
      b4: slots.b4,
      b5: slots.b5,
      b6: slots.b6,
      b7: slots.b7,
      b8: slots.b8,
      dial: slots.dial,
      enc_cw: slots.enc_cw,
      enc_ccw: slots.enc_ccw
    };

    // ESP32 Serial RX line buffer accepts up to 4096 bytes, and /api/profile/save allows
    // up to 512 bytes per slot (whereas /api/customizer/save caps single-slot saves at 128 bytes).
    const serializedLen = JSON.stringify(reqObj).length + 1;
    if (!this.demoModeActive && serializedLen > 3900) {
      const hasLongSlot = HARDWARE_SLOTS.some(
        slotId => slots[slotId].length > MAX_SERIAL_SINGLE_SLOT_ACTION_BYTES
      );
      if (hasLongSlot) {
        throw new Error(
          `Profile ${profile} payload (${serializedLen} B) exceeds the 4 KB USB serial line buffer. Shorten one or more multi-step macros on this host.`
        );
      }
      let lastRes: { ok: boolean; rev?: number; message?: string } = { ok: true };
      for (const slotId of HARDWARE_SLOTS) {
        lastRes = await this.saveSlotBinding(profile, slotId, slots[slotId]);
      }
      return lastRes;
    }

    const res = await this.call(reqObj);
    if (!res?.ok) {
      throw new Error(res?.message || 'Device rejected profile payload.');
    }
    return res;
  }

  public async renameProfile(
    profile: HardwareProfileId,
    name: string
  ): Promise<{ ok: boolean; rev?: number; message?: string }> {
    if (!isValidFirmwareAlias(name)) {
      throw new Error(
        'Invalid profile name (1–20 letters, numbers, spaces, hyphens, or underscores).'
      );
    }
    const res = await this.call({
      path: '/api/profile/rename',
      profile,
      name
    });
    if (!res?.ok) {
      throw new Error(
        res?.message || 'Invalid profile name (1–20 letters, numbers, spaces, - or _).'
      );
    }
    return res;
  }

  public async copyProfile(
    source: HardwareProfileId,
    target: HardwareProfileId
  ): Promise<{ ok: boolean; rev?: number; message?: string }> {
    const res = await this.call({
      path: '/api/profile/copy',
      source,
      target
    });
    if (!res?.ok) {
      throw new Error(res?.message || 'Failed to copy profile on device.');
    }
    return res;
  }

  public async exportHardwareConfig(): Promise<HardwareBackupPayload> {
    const res = await this.call({ path: '/api/config/export' });
    if (res?.schema !== 'studio-pad-config') {
      throw new Error(res?.message || 'Failed to export configuration from MacroPad.');
    }
    return res as HardwareBackupPayload;
  }

  public async importHardwareConfig(
    backup: HardwareBackupPayload
  ): Promise<{ ok: boolean; rev?: number; message?: string }> {
    const h1Name = sanitizeFirmwareAlias(backup.h1_name || backup.mac_name || '', 'HOST1');
    const h2Name = sanitizeFirmwareAlias(backup.h2_name || '', 'HOST2');
    const h3Name = sanitizeFirmwareAlias(backup.h3_name || '', 'HOST3');
    const tvName = sanitizeFirmwareAlias(backup.tv_name || '', 'TV');

    const buildSlots = (
      prefix: 'h1' | 'h2' | 'h3' | 'tv',
      defaults: Record<HardwareSlotId, string>,
      allowLegacyMacFallback = false
    ): Record<HardwareSlotId, string> => {
      const slots = { ...defaults };
      for (const s of HARDWARE_SLOTS) {
        const direct = backup[`${prefix}_${s}`];
        const legacy = allowLegacyMacFallback ? backup[`mac_${s}`] : undefined;
        if (typeof direct === 'string' && isValidSlotAssignment(direct)) {
          slots[s] = direct;
        } else if (typeof legacy === 'string' && isValidSlotAssignment(legacy)) {
          slots[s] = legacy;
        }
      }
      return slots;
    };

    const h1Slots = buildSlots('h1', FACTORY_DEFAULT_SLOTS.HOST1, true);
    const h2Slots = buildSlots('h2', FACTORY_DEFAULT_SLOTS.HOST2, false);
    const h3Slots = buildSlots('h3', FACTORY_DEFAULT_SLOTS.HOST3, false);
    const tvSlots = buildSlots('tv', FACTORY_DEFAULT_SLOTS.TV, false);

    if (this.demoModeActive) {
      const res = await this.call(
        {
          path: '/api/config/import',
          schema: 'studio-pad-config',
          version: 2,
          h1_name: h1Name,
          h2_name: h2Name,
          h3_name: h3Name,
          tv_name: tvName,
          ...Object.fromEntries(HARDWARE_SLOTS.map(s => [`h1_${s}`, h1Slots[s]])),
          ...Object.fromEntries(HARDWARE_SLOTS.map(s => [`h2_${s}`, h2Slots[s]])),
          ...Object.fromEntries(HARDWARE_SLOTS.map(s => [`h3_${s}`, h3Slots[s]])),
          ...Object.fromEntries(HARDWARE_SLOTS.map(s => [`tv_${s}`, tvSlots[s]]))
        },
        4000
      );
      if (!res?.ok) {
        throw new Error(res?.message || 'Device rejected configuration backup.');
      }
      return res;
    }

    // Write each profile sequentially over USB Serial so every packet stays well
    // under the ESP32 1536-byte line buffer and works even when serial /api/config/import is absent.
    await this.saveFullProfile('HOST1', h1Slots);
    await this.saveFullProfile('HOST2', h2Slots);
    await this.saveFullProfile('HOST3', h3Slots);
    await this.saveFullProfile('TV', tvSlots);
    await this.renameProfile('HOST1', h1Name);
    await this.renameProfile('HOST2', h2Name);
    await this.renameProfile('HOST3', h3Name);
    return await this.renameProfile('TV', tvName);
  }

  private schedulePostRebootResync(expectedPort: any) {
    if (this.rebootResyncTimer !== null) {
      window.clearTimeout(this.rebootResyncTimer);
    }
    this.rebootResyncTimer = window.setTimeout(async () => {
      this.rebootResyncTimer = null;
      if (this.demoModeActive || !this.port || this.port !== expectedPort) return;
      if (!this.connectionInfo.connected) return;
      try {
        await this.call(
          { path: '/api/events/set', enabled: this.desiredEventsEnabled ? 1 : 0 },
          2500
        ).catch(() => {});
        const st = await this.fetchStatus(3000);
        const rawSlot = Number(st.ble?.active_host ?? st.ble_slot ?? 1);
        const slot: BleHostSlot = rawSlot === 2 ? 2 : rawSlot === 3 ? 3 : 1;
        this.handleHardwareEvent({
          event: 'ble_host',
          ble_slot: slot,
          active: normalizeHardwareProfileId(st.profiles?.active, slot)
        });
      } catch {}
    }, 2000);
  }

  /**
   * Switches the active Multi-Host BLE slot (1, 2, or 3) via `/api/ble/switch`.
   * On physical ESP32 hardware, switching to a new slot stores `ble_slot` in NVS
   * and triggers `ESP.restart()` (~350ms after replying) to apply the virtual MAC
   * and device name ("Studio Pad 1..3"), so we optimistically update telemetry
   * and automatically re-enable live events + refresh `/api/status` once booted.
   */
  public async switchBleHost(
    slot: BleHostSlot
  ): Promise<{ ok: boolean; message?: string; slot: BleHostSlot }> {
    if (slot !== 1 && slot !== 2 && slot !== 3) {
      throw new Error('Host slot must be 1, 2, or 3.');
    }
    const prevHost = this.connectionInfo.telemetry?.bleActiveHost;
    const activePort = this.port;

    const res = await this.call({
      path: '/api/ble/switch',
      slot
    });
    if (!res?.ok) {
      throw new Error(res?.message || 'Device could not switch BLE host.');
    }

    if (this.connectionInfo.telemetry) {
      const wasTv = this.connectionInfo.telemetry.activeProfile === 'TV';
      this.connectionInfo = {
        ...this.connectionInfo,
        telemetry: {
          ...this.connectionInfo.telemetry,
          bleActiveHost: slot,
          bleDeviceName: `Studio Pad ${slot}`,
          activeProfile: wasTv ? 'TV' : bleSlotToProfileId(slot)
        }
      };
      this.emitConnection();
    }

    if (!this.demoModeActive && activePort && prevHost !== slot) {
      this.logSerial(
        'info',
        `ESP32 rebooting into Host ${slot} (Studio Pad ${slot}) — resyncing in ~2.0s`
      );
      this.schedulePostRebootResync(activePort);
    }

    return {
      ok: true,
      slot,
      message:
        prevHost === slot
          ? `Host ${slot} (Studio Pad ${slot}) is already active.`
          : `Switched to Host ${slot} (Studio Pad ${slot}).`
    };
  }

  public async cancelRunningMacro(): Promise<void> {
    if (!this.connectionInfo.connected) return;
    try {
      await this.call({ path: '/api/macro/cancel' }, 1200);
    } catch {
      // Firmware < 4.5.0 does not expose /api/macro/cancel; safe to ignore
    }
  }

  public async testAction(action: string): Promise<{ ok: boolean; message?: string }> {
    if (!isValidFirmwareAction(action)) {
      throw new Error('Assign a valid firmware action first.');
    }

    if (action.startsWith('DELAY:') && !action.includes('||')) {
      const ms = Math.min(60000, Math.max(0, parseInt(action.slice(6).trim(), 10) || 0));
      if (ms > 0) {
        await new Promise(r => window.setTimeout(r, ms));
      }
      return { ok: true, message: `Paused ${ms} ms` };
    }

    // Route BLE:* host switch actions through `/api/ble/switch` so the device
    // always sends its JSON reply prior to `switchBleDevice()` / `ESP.restart()`.
    if (action === 'BLE:HOST1' || action === 'BLE:HOST2' || action === 'BLE:HOST3') {
      const targetSlot = Number(action.slice(-1)) as BleHostSlot;
      return await this.switchBleHost(targetSlot);
    }
    if (action === 'BLE:NEXT_HOST') {
      const current = this.connectionInfo.telemetry?.bleActiveHost ?? 1;
      const nextSlot = (((current % 3) + 1) as BleHostSlot);
      return await this.switchBleHost(nextSlot);
    }

    // Legacy firmware /api/test/action caps its single-command JSON parser at 128 bytes,
    // so execute multi-step || chains segment-by-segment with 50ms hardware-accurate ticks.
    if (
      !this.demoModeActive &&
      (action.includes('||') || action.length > MAX_SERIAL_SINGLE_SLOT_ACTION_BYTES)
    ) {
      const segments = action
        .split('||')
        .map(p => (p.startsWith('TEXT:') ? p : p.trim()))
        .filter(Boolean);
      let lastRes: { ok: boolean; message?: string } = { ok: true };
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (seg === 'NONE') {
          await new Promise(r => window.setTimeout(r, STANDALONE_TICK_MS));
          continue;
        }
        if (seg.startsWith('DELAY:')) {
          const ms = Math.min(60000, Math.max(0, parseInt(seg.slice(6).trim(), 10) || 0));
          if (ms > 0) {
            await new Promise(r => window.setTimeout(r, ms));
          }
          if (i < segments.length - 1) {
            await new Promise(r => window.setTimeout(r, STANDALONE_TICK_MS));
          }
          continue;
        }
        lastRes = await this.testAction(seg);
        if (i < segments.length - 1) {
          await new Promise(r => window.setTimeout(r, STANDALONE_TICK_MS));
        }
      }
      return lastRes;
    }

    const res = await this.call({
      path: '/api/test/action',
      action
    });
    if (!res?.ok) {
      throw new Error(res?.message || 'Device could not execute test action.');
    }
    return res;
  }

  /**
   * Saves Wi-Fi credentials and polls status up to 20s to confirm connection & IP
   */
  public async saveWifiAndWait(
    ssid: string,
    pass: string,
    maxWaitMs = 20000
  ): Promise<{ connected: boolean; ip: string; message: string }> {
    const cleanSsid = sanitizeSerialString(ssid.trim(), 32);
    const cleanPass = pass.slice(0, 63);
    const res = await this.call({
      path: '/api/wifi',
      ssid: cleanSsid,
      pass: cleanPass
    });
    if (!res?.ok) {
      throw new Error(res?.message || 'Invalid Wi-Fi credentials.');
    }

    if (this.demoModeActive) {
      const tel = this.connectionInfo.telemetry;
      if (tel?.wifiConnected && tel.ip) {
        return {
          connected: true,
          ip: tel.ip,
          message: `Connected to "${cleanSsid}" (${tel.ip})`
        };
      }
      return {
        connected: false,
        ip: '',
        message: "Couldn't connect to Wi-Fi — check the network name and password."
      };
    }

    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline && this.connectionInfo.connected) {
      await new Promise(r => setTimeout(r, 2000));
      if (!this.connectionInfo.connected) break;
      try {
        const st = await this.fetchStatus(2500);
        const wifiOk = Boolean(st.connection?.wifi_connected ?? st.wifi_connected);
        const ip = st.connection?.ip || st.ip || '';
        if (wifiOk && ip) {
          return {
            connected: true,
            ip,
            message: `Connected to "${cleanSsid}" (${ip})`
          };
        }
      } catch {}
    }

    return {
      connected: false,
      ip: '',
      message: "Couldn't connect to Wi-Fi — check the network name and password."
    };
  }

  public async saveTvConfig(
    tvIp: string,
    tvPort: number,
    token: string
  ): Promise<{ ok: boolean; message: string }> {
    const res = await this.call({
      path: '/api/token/save',
      tv_ip: sanitizeSerialString(tvIp.trim(), 63),
      tv_port: Number(tvPort) || 7345,
      token: sanitizeSerialString(token.trim(), 128)
    });
    if (!res?.ok) {
      throw new Error(res?.message || 'Failed to save TV settings.');
    }
    await this.fetchStatus().catch(() => {});
    return res;
  }

  public async testTv(): Promise<{ ok: boolean; message: string }> {
    return await this.call({ path: '/api/tv/test' }, 6500);
  }

  public async startTvPairing(
    tvIp: string,
    tvPort: number
  ): Promise<{ ok: boolean; message: string }> {
    const res = await this.call(
      {
        path: '/api/pair/start',
        tv_ip: sanitizeSerialString(tvIp.trim(), 63),
        tv_port: Number(tvPort) || 7345
      },
      6500
    );
    if (!res?.ok) {
      throw new Error(res?.message || 'Could not start pairing on TV.');
    }
    return res;
  }

  public async submitTvPin(pin: string): Promise<{ ok: boolean; message: string }> {
    const res = await this.call(
      {
        path: '/api/pair/submit',
        pin: pin.trim()
      },
      6500
    );
    if (!res?.ok) {
      throw new Error(res?.message || 'Invalid PIN or TV rejected pairing.');
    }
    await this.fetchStatus().catch(() => {});
    return res;
  }

  public async forgetTv(): Promise<{ ok: boolean; message: string }> {
    const res = await this.call({
      path: '/api/tv/forget',
      confirm: 'FORGET'
    });
    if (!res?.ok) {
      throw new Error(res?.message || 'Failed to forget TV configuration.');
    }
    await this.fetchStatus().catch(() => {});
    return res;
  }

  public async resetHardwareDefaults(): Promise<{ ok: boolean; rev?: number; message: string }> {
    const res = await this.call({
      path: '/api/device/reset-settings',
      confirm: 'RESET'
    });
    if (!res?.ok) {
      throw new Error(res?.message || 'Failed to reset hardware profiles.');
    }
    return res;
  }

  public async setHttpApiToken(token: string): Promise<{ ok: boolean; message: string }> {
    const res = await this.call({
      path: '/api/auth/set',
      token: sanitizeSerialString(token.trim(), 64)
    });
    if (!res?.ok) {
      throw new Error(res?.message || 'Token must be 8-64 characters, or empty to disable.');
    }
    await this.fetchStatus().catch(() => {});
    return res;
  }

  /**
   * Marks hardware Setup Mode complete (`/api/setup/complete`).
   * Gracefully falls back if connected firmware hasn't implemented `/api/setup/complete` yet.
   */
  public async completeSetupMode(): Promise<{ ok: boolean; message: string }> {
    if (this.connectionInfo.connected) {
      try {
        const res = await this.call(
          {
            path: '/api/setup/complete',
            setup_done: 1
          },
          2500
        );
        if (this.connectionInfo.telemetry) {
          this.connectionInfo = {
            ...this.connectionInfo,
            telemetry: {
              ...this.connectionInfo.telemetry,
              setupMode: false
            }
          };
          this.emitConnection();
        }
        this.emitSetupMode(false, 'status', this.connectionInfo.deviceId);
        return {
          ok: true,
          message: res?.message || 'Board exited Setup Mode and saved configuration.'
        };
      } catch {
        if (this.connectionInfo.telemetry) {
          this.connectionInfo = {
            ...this.connectionInfo,
            telemetry: {
              ...this.connectionInfo.telemetry,
              setupMode: false
            }
          };
          this.emitConnection();
        }
        this.emitSetupMode(false, 'status', this.connectionInfo.deviceId);
        return {
          ok: true,
          message: 'Setup completed locally.'
        };
      }
    }
    return { ok: true, message: 'Setup completed offline.' };
  }

  /**
   * Requests the connected MacroPad (or Demo Pad) to enter Setup Mode (`/api/setup/enter`).
   * If firmware does not yet expose `/api/setup/enter`, still activates Setup Mode in telemetry and opens the wizard.
   */
  public async enterSetupMode(): Promise<{ ok: boolean; message: string }> {
    if (this.connectionInfo.connected) {
      try {
        const res = await this.call(
          {
            path: '/api/setup/enter',
            setup_done: 0
          },
          2500
        );
        if (this.connectionInfo.telemetry) {
          this.connectionInfo = {
            ...this.connectionInfo,
            telemetry: {
              ...this.connectionInfo.telemetry,
              setupMode: true
            }
          };
          this.emitConnection();
        }
        if (!this.demoModeActive) {
          this.emitSetupMode(true, 'event', this.connectionInfo.deviceId);
        }
        return {
          ok: true,
          message: res?.message || 'MacroPad entered Setup Mode.'
        };
      } catch {
        if (this.connectionInfo.telemetry) {
          this.connectionInfo = {
            ...this.connectionInfo,
            telemetry: {
              ...this.connectionInfo.telemetry,
              setupMode: true
            }
          };
          this.emitConnection();
        }
        this.emitSetupMode(true, 'event', this.connectionInfo.deviceId);
        return {
          ok: true,
          message: 'Opened Setup Mode.'
        };
      }
    }
    return { ok: false, message: 'Connect MacroPad via USB or start Demo Mode first.' };
  }

  /**
   * Direct Wi-Fi OTA Update (`/api/ota/start`):
   * Instructs the connected ESP32 to download the `.bin` asset directly from GitHub over Wi-Fi
   * using `<HTTPClient.h>` + `<Update.h>`, completely bypassing browser CORS restrictions!
   */
  public async installFirmwareViaWifiOta(params: {
    url: string;
    version: string;
    sha256?: string;
    supportsV45Engine?: boolean;
    onProgress?: (
      percent: number,
      message: string,
      phase: 'downloading' | 'flashing' | 'rebooting' | 'complete'
    ) => void;
    timeoutMs?: number;
  }): Promise<{ ok: boolean; firmwareVersion: string; message: string }> {
    if (!this.connectionInfo.connected) {
      throw new Error('Connect your MacroPad via USB (or start Demo Mode) before updating firmware.');
    }

    const cleanUrl = params.url.trim();
    const cleanVersion = params.version.replace(/^[vV]/, '').trim();
    const preOtaDeviceId =
      this.connectionInfo.deviceId && this.connectionInfo.deviceId !== 'demo-pad'
        ? this.connectionInfo.deviceId
        : undefined;
    if (!cleanUrl.startsWith('https://') && !cleanUrl.startsWith('http://')) {
      throw new Error('Invalid firmware binary URL.');
    }

    let resolvedComplete = false;
    let otaErrorMsg: string | null = null;

    const unsubOta = this.onOtaEvent(evt => {
      const pct = Number(evt.percent ?? evt.progress ?? 0);
      const rawPhase = String(evt.phase || '').toLowerCase();
      const msg = String(evt.message || 'Updating MacroPad firmware…');

      if (rawPhase === 'error' || evt.ok === false) {
        otaErrorMsg = msg || 'ESP32 reported an OTA flashing error.';
        return;
      }

      const mappedPhase: 'downloading' | 'flashing' | 'rebooting' | 'complete' =
        rawPhase === 'complete' || pct >= 100
          ? 'complete'
          : rawPhase === 'rebooting'
          ? 'rebooting'
          : rawPhase === 'flashing' || pct >= 55
          ? 'flashing'
          : 'downloading';

      if (mappedPhase === 'complete') {
        resolvedComplete = true;
      }
      params.onProgress?.(Math.min(100, Math.max(5, Math.round(pct))), msg, mappedPhase);
    });

    try {
      params.onProgress?.(6, 'Sending firmware update URL to MacroPad…', 'downloading');
      const startRes = await this.call(
        {
          path: '/api/ota/start',
          url: cleanUrl,
          version: cleanVersion,
          ...(params.sha256 ? { sha256: params.sha256.slice(0, 64) } : {})
        },
        8000
      );

      if (!startRes?.ok) {
        const rawWifiMsg = String(startRes?.message || '');
        if (rawWifiMsg.toLowerCase().includes('update.begin')) {
          throw new Error(
            'This MacroPad uses a No-OTA partition layout (such as Huge APP) — click "Upload to MacroPad" over USB instead, which flashes Huge APP directly.'
          );
        }
        throw new Error(
          rawWifiMsg ||
            'Firmware did not accept /api/ota/start — use "Upload to MacroPad" over USB instead.'
        );
      }

      const deadline = Date.now() + (params.timeoutMs ?? 90000);
      while (Date.now() < deadline && !resolvedComplete && !otaErrorMsg) {
        await new Promise(r => setTimeout(r, 250));
      }

      if (otaErrorMsg) {
        throw new Error(otaErrorMsg);
      }

      if (!this.demoModeActive) {
        if (preOtaDeviceId) {
          writeFlashedLedger(preOtaDeviceId, {
            rawReportedVersion: '*',
            flashedVersion: cleanVersion,
            sha256: params.sha256,
            flashedAt: new Date().toISOString(),
            supportsV45Engine: params.supportsV45Engine
          });
        }
        params.onProgress?.(95, 'Waiting for ESP32 reboot & PadLink handshake…', 'rebooting');
        await new Promise(r => setTimeout(r, 2600));
        await this.call(
          { path: '/api/events/set', enabled: this.desiredEventsEnabled ? 1 : 0 },
          3000
        ).catch(() => {});
        const freshPkt = await this.fetchStatus(4000).catch(() => null);
        const actualId = freshPkt?.device?.id || preOtaDeviceId;
        if (actualId && actualId !== 'demo-pad') {
          const rawRep = freshPkt?.device?.firmware;
          writeFlashedLedger(actualId, {
            rawReportedVersion: rawRep ? `v${rawRep.replace(/^[vV]/, '')}` : '*',
            flashedVersion: cleanVersion,
            sha256: params.sha256,
            flashedAt: new Date().toISOString(),
            supportsV45Engine: params.supportsV45Engine
          });
          if (freshPkt) {
            this.applyTelemetryFromStatus(freshPkt, this.connectionInfo.vendorProduct);
          }
        }
      }

      const activeFw = this.connectionInfo.firmwareVersion || `v${cleanVersion}`;
      params.onProgress?.(100, `MacroPad running ${activeFw}`, 'complete');
      return {
        ok: true,
        firmwareVersion: activeFw,
        message: `Updated MacroPad firmware to ${activeFw}`
      };
    } finally {
      unsubOta();
    }
  }

  /**
   * Direct USB Hardware Bootloader Flash (`esptool-js`):
   * Flashes compiled `.ino.bin` / `.bin` firmware directly via the ESP32 silicon ROM bootloader
   * at `0x10000` (or `0x0` for `.merged.bin`), just like Arduino IDE over USB.
   * - Supports `Huge APP (3MB No OTA/1MB SPIFFS)`, `Default`, and `Minimal SPIFFS` with zero OTA partition needed!
   * - Preserves NVS (`0x9000`) so saved profiles, Bluetooth hosts, Wi-Fi, and TV pairing stay intact.
   * - Preserves virtual Demo Mode simulation when running in Demo Mode.
   */
  public async installFirmwareViaUsbSerial(params: {
    bytes: Uint8Array;
    fileName?: string;
    version: string;
    sha256?: string;
    supportsV45Engine?: boolean;
    onProgress?: (
      percent: number,
      bytesSent: number,
      totalBytes: number,
      message: string
    ) => void;
    signal?: AbortSignal;
  }): Promise<{ ok: boolean; firmwareVersion: string; message: string }> {
    const totalBytes = params.bytes.byteLength;
    if (totalBytes < 32768) {
      throw new Error(
        'Selected .bin file is too small to be a compiled ESP32 firmware image (upload the main .ino.bin file, not .partitions.bin or .bootloader.bin).'
      );
    }

    const cleanVersion = (params.version || 'custom').replace(/^[vV]/, '').trim();
    const inspectedBin = inspectFirmwareBinaryCapabilities(params.bytes);
    const effectiveSupportsV45 =
      typeof params.supportsV45Engine === 'boolean'
        ? params.supportsV45Engine
        : inspectedBin.supportsV45Engine;
    const preFlashDeviceId =
      this.connectionInfo.deviceId && this.connectionInfo.deviceId !== 'demo-pad'
        ? this.connectionInfo.deviceId
        : undefined;

    this.stopLiveTelemetryPolling();
    if (this.rebootResyncTimer !== null) {
      window.clearTimeout(this.rebootResyncTimer);
      this.rebootResyncTimer = null;
    }

    // Virtual Demo Mode fast simulation
    if (this.demoModeActive) {
      this.isFlashingOta = true;
      try {
        await this.call(
          { path: '/api/ota/begin', size: totalBytes },
          5000,
          { allowDuringOta: true }
        );
        const stepStride = Math.max(512, Math.ceil(totalBytes / 40));
        let seq = 0;
        for (let offset = 0; offset < totalBytes; offset += stepStride) {
          if (params.signal?.aborted) {
            throw new Error('Firmware flash cancelled.');
          }
          const sliceEnd = Math.min(totalBytes, offset + 512);
          const b64 = uint8ToBase64(params.bytes.subarray(offset, sliceEnd));
          await this.call(
            { path: '/api/ota/chunk', seq, data: b64 },
            5000,
            { silentLog: true, allowDuringOta: true }
          );
          seq += 1;
          const bytesDone = Math.min(totalBytes, offset + stepStride);
          const ratio = bytesDone / totalBytes;
          const pct = Math.min(95, Math.max(15, Math.round(15 + ratio * 80)));
          params.onProgress?.(
            pct,
            bytesDone,
            totalBytes,
            `Writing firmware binary to Demo MacroPad (${Math.round(ratio * 100)}%)…`
          );
        }
        await this.call(
          { path: '/api/ota/end', version: cleanVersion },
          5000,
          { allowDuringOta: true }
        );
        const activeFw = this.connectionInfo.firmwareVersion || `v${cleanVersion}`;
        params.onProgress?.(100, totalBytes, totalBytes, `Flashed & verified ${activeFw}`);
        return {
          ok: true,
          firmwareVersion: activeFw,
          message: `Updated Demo MacroPad to ${activeFw}`
        };
      } finally {
        this.isFlashingOta = false;
      }
    }

    // Physical ESP32 Hardware Flash via ROM Bootloader (esptool-js) with Retry & Exponential Backoff & Resume
    const { address: defaultFlashOffset, isMerged } = resolveEsp32FlashTarget(
      params.bytes,
      params.fileName
    );

    let flashPort = this.port;
    const wasConnectedBeforeFlash = Boolean(flashPort && this.connectionInfo.connected);

    if (!flashPort) {
      if (!this.browserSupportsWebSerial) {
        throw new Error(
          'Web Serial is not supported in this browser — open this site in Chrome or Edge on desktop over HTTPS.'
        );
      }
      try {
        flashPort = await (navigator as any).serial.requestPort();
      } catch (pickErr: any) {
        if (pickErr?.name === 'NotFoundError' || pickErr?.name === 'AbortError') {
          throw new Error('USB port selection was cancelled.');
        }
        throw translateSerialOpenError(pickErr);
      }
      if (!flashPort) {
        throw new Error('Select your MacroPad USB port to upload firmware.');
      }
    }

    this.isFlashingOta = true;
    this.otaRebootExpected = false;
    this.manualDisconnect = false;

    let activeTransport: Transport | null = null;
    let flashCompleted = false;

    let termLineBuf = '';
    const flushTermLine = (line: string) => {
      const trimmed = line.replace(/\r/g, '').trim();
      if (!trimmed) return;
      if (trimmed.startsWith('Writing at 0x')) return;
      this.logSerial('info', `[BOOTLOADER] ${trimmed}`);
    };

    const loaderTerminal: IEspLoaderTerminal = {
      clean: () => {
        termLineBuf = '';
      },
      writeLine: (data: string) => {
        if (termLineBuf) {
          flushTermLine(termLineBuf + data);
          termLineBuf = '';
        } else {
          flushTermLine(data);
        }
      },
      write: (data: string) => {
        termLineBuf += data;
        let nlIdx: number;
        while ((nlIdx = termLineBuf.indexOf('\n')) >= 0) {
          const line = termLineBuf.slice(0, nlIdx);
          termLineBuf = termLineBuf.slice(nlIdx + 1);
          flushTermLine(line);
        }
      }
    };

    const maxRetries = 3;
    let attempt = 0;
    let lastSuccessfulWrittenBytes = 0;
    let lastErr: any = null;

    while (attempt < maxRetries) {
      attempt++;
      if (attempt > 1) {
        const backoffMs = Math.min(10000, 1000 * Math.pow(2, attempt - 2));
        this.logSerial(
          'info',
          `[BOOTLOADER] Connection interrupted — retrying flash attempt ${attempt}/${maxRetries} after ${backoffMs}ms (resuming from offset 0x${(
            defaultFlashOffset + lastSuccessfulWrittenBytes
          ).toString(16)} · ${lastSuccessfulWrittenBytes} bytes written)`
        );
        params.onProgress?.(
          Math.min(
            95,
            Math.max(
              15,
              Math.round(15 + (lastSuccessfulWrittenBytes / totalBytes) * 80)
            )
          ),
          lastSuccessfulWrittenBytes,
          totalBytes,
          `Connection interrupted — retrying upload (attempt ${attempt}/${maxRetries}) from ${Math.round(
            (lastSuccessfulWrittenBytes / totalBytes) * 100
          )}%…`
        );
        await new Promise(r => setTimeout(r, backoffMs));
      }

      try {
        this.logSerial(
          'info',
          `Starting direct ESP32 bootloader USB flash (${formatBytesCompact(
            totalBytes
          )} · target v${cleanVersion} · default offset 0x${defaultFlashOffset.toString(
            16
          )} · attempt ${attempt}/${maxRetries} · offset ${lastSuccessfulWrittenBytes}b)`
        );

        params.onProgress?.(
          10,
          lastSuccessfulWrittenBytes,
          totalBytes,
          attempt > 1
            ? `Reconnecting & entering ESP32 bootloader for retry ${attempt}/${maxRetries}…`
            : 'Releasing live serial stream & entering ESP32 bootloader…'
        );

        // Cleanly close our JSON stream on flashPort so esptool-js Transport can open it
        await this.cleanupPort();
        await new Promise(r => setTimeout(r, 120));

        params.onProgress?.(
          12,
          lastSuccessfulWrittenBytes,
          totalBytes,
          'Syncing with ESP32 ROM bootloader over USB…'
        );

        let espLoader: ESPLoader;
        let chipDescription = 'ESP32';

        try {
          activeTransport = new Transport(flashPort, false);
          espLoader = new ESPLoader({
            transport: activeTransport,
            baudrate: 115200,
            romBaudrate: 115200,
            terminal: loaderTerminal
          });
          chipDescription = await espLoader.main('default_reset');
        } catch (firstSyncErr: any) {
          const firstMsg = String(firstSyncErr?.message || firstSyncErr || '').toLowerCase();
          if (
            firstSyncErr?.name === 'NetworkError' ||
            firstSyncErr?.name === 'InvalidStateError' ||
            firstMsg.includes('failed to open') ||
            firstMsg.includes('in use') ||
            firstMsg.includes('busy')
          ) {
            throw translateSerialOpenError(firstSyncErr);
          }

          // Fallback: if the MacroPad was already in ROM Download Mode (e.g. user holding BOOT), try no_reset
          this.logSerial(
            'info',
            '[BOOTLOADER] Auto-reset sync did not reply — retrying with no_reset…'
          );
          if (activeTransport) {
            await activeTransport.disconnect().catch(() => {});
            activeTransport = null;
          }
          await new Promise(r => setTimeout(r, 120));

          try {
            activeTransport = new Transport(flashPort, false);
            espLoader = new ESPLoader({
              transport: activeTransport,
              baudrate: 115200,
              romBaudrate: 115200,
              terminal: loaderTerminal
            });
            chipDescription = await espLoader.main('no_reset');
          } catch {
            throw new Error(
              'Could not enter ESP32 bootloader mode — hold down the BOOT button on your MacroPad while clicking Upload (release BOOT once Writing starts), and make sure Arduino Serial Monitor is closed.'
            );
          }
        }

        if (params.signal?.aborted) {
          throw new Error('Firmware upload cancelled.');
        }

        let targetAddress = defaultFlashOffset;
        const fileArray: { data: Uint8Array; address: number }[] = [];

        // Inspect live partition table at 0x8000 when flashing standalone .ino.bin (e.g. Huge APP 3MB No OTA)
        if (!isMerged && espLoader.IS_STUB && activeTransport) {
          try {
            const ptBytes = await espLoader.readFlash(0x8000, 256).catch(() => null);
            if (ptBytes && ptBytes.byteLength >= 32) {
              await activeTransport.drainInput(60, 250).catch(() => {});
              const { primaryApp, otaData, hasOta1 } = inspectBoardPartitionTable(ptBytes);

              if (primaryApp && primaryApp.size > 0) {
                targetAddress = primaryApp.offset;
                this.logSerial(
                  'info',
                  `[BOOTLOADER] Detected partition "${primaryApp.label || 'app0'}" at 0x${targetAddress.toString(
                    16
                  )} (${formatBytesCompact(primaryApp.size)} capacity${
                    !hasOta1 ? ' · No-OTA / Huge APP layout' : ''
                  })`
                );

                if (totalBytes > primaryApp.size) {
                  throw new Error(
                    `Firmware binary (${formatBytesCompact(
                      totalBytes
                    )}) exceeds this MacroPad's current "${
                      primaryApp.label || 'app0'
                    }" partition (${formatBytesCompact(
                      primaryApp.size
                    )}) — flash once from Arduino IDE with Partition Scheme set to "Huge APP (3MB No OTA/1MB SPIFFS)" to expand the partition table.`
                  );
                }

                // If the board has dual OTA slots (ota_1 present) and we are starting from 0, reset otadata so app0 is active
                if (hasOta1 && otaData && otaData.size > 0 && otaData.size <= 0x4000 && lastSuccessfulWrittenBytes === 0) {
                  fileArray.push({
                    data: new Uint8Array(otaData.size).fill(0xff),
                    address: otaData.offset
                  });
                }
              }
            }
          } catch (ptErr: any) {
            await activeTransport.drainInput(60, 250).catch(() => {});
            if (String(ptErr?.message || '').includes('exceeds this MacroPad')) {
              throw ptErr;
            }
          }
        }

        const remainingData = params.bytes.subarray(lastSuccessfulWrittenBytes);
        const resumeAddress = targetAddress + lastSuccessfulWrittenBytes;

        fileArray.push({
          data: remainingData,
          address: resumeAddress
        });
        const appFileIndex = fileArray.length - 1;

        params.onProgress?.(
          15,
          lastSuccessfulWrittenBytes,
          totalBytes,
          `Connected to ${chipDescription} — writing flash at 0x${resumeAddress.toString(
            16
          )} (${formatBytesCompact(lastSuccessfulWrittenBytes)} / ${formatBytesCompact(
            totalBytes
          )})…`
        );

        let lastLoggedDecile = Math.floor((lastSuccessfulWrittenBytes / totalBytes) * 10);

        await espLoader.writeFlash({
          fileArray,
          flashSize: 'keep',
          flashMode: 'keep',
          flashFreq: 'keep',
          eraseAll: false,
          compress: true,
          reportProgress: (fileIndex: number, written: number, totalCompressed: number) => {
            if (fileIndex !== appFileIndex) return;
            const remainingTotal = totalBytes - lastSuccessfulWrittenBytes;
            const ratio =
              totalCompressed > 0
                ? Math.min(1, Math.max(0, written / totalCompressed))
                : 0;
            const chunkBytesWritten = Math.min(
              remainingTotal,
              Math.round(ratio * remainingTotal)
            );
            const absoluteBytesWritten = Math.min(
              totalBytes,
              lastSuccessfulWrittenBytes + chunkBytesWritten
            );
            const overallRatio = absoluteBytesWritten / totalBytes;
            const pct = Math.min(95, Math.max(15, Math.round(15 + overallRatio * 80)));

            const decile = Math.floor(overallRatio * 10);
            if (decile > lastLoggedDecile) {
              lastLoggedDecile = decile;
              this.logSerial(
                'info',
                `[BOOTLOADER] Flash write ${decile * 10}% (${formatBytesCompact(
                  absoluteBytesWritten
                )} / ${formatBytesCompact(totalBytes)})`
              );
            }

            params.onProgress?.(
              pct,
              absoluteBytesWritten,
              totalBytes,
              `Writing firmware to MacroPad flash (${Math.round(overallRatio * 100)}%)…`
            );
          }
        });

        // Update lastSuccessfulWrittenBytes to totalBytes upon successful completion of writeFlash
        lastSuccessfulWrittenBytes = totalBytes;

        if (termLineBuf) {
          flushTermLine(termLineBuf);
          termLineBuf = '';
        }

        flashCompleted = true;

        params.onProgress?.(
          97,
          totalBytes,
          totalBytes,
          'Restarting MacroPad & reconnecting over USB…'
        );

        // Hardware reset pulse (EN=LOW with IO0=HIGH for 120ms, then EN=HIGH) to exit bootloader cleanly
        if (activeTransport) {
          try {
            await activeTransport.setDTR(false);
            await activeTransport.setRTS(true);
            await new Promise(r => setTimeout(r, 120));
            await activeTransport.setRTS(false);
            await activeTransport.setDTR(false);
            await new Promise(r => setTimeout(r, 80));
          } catch {}
          await activeTransport.disconnect().catch(() => {});
          activeTransport = null;
        }

        // Record flashed binary metadata in shared ledger BEFORE reconnecting so the
        // first post-boot status probe immediately resolves the newly installed version.
        if (preFlashDeviceId) {
          writeFlashedLedger(preFlashDeviceId, {
            rawReportedVersion: inspectedBin.embeddedVersion
              ? `v${inspectedBin.embeddedVersion.replace(/^[vV]/, '')}`
              : '*',
            flashedVersion: cleanVersion,
            sha256: params.sha256,
            flashedAt: new Date().toISOString(),
            supportsV45Engine: effectiveSupportsV45
          });
        }

        // Re-open live MacroPad PadLink serial session on the same authorized USB port
        // with retry backoff in case NimBLE / OLED boot takes an extra moment after flash reset.
        this.isFlashingOta = false;
        let reopenedStatus: FirmwareStatusPacket | null = null;
        for (let reconnAttempt = 1; reconnAttempt <= 3; reconnAttempt++) {
          await new Promise(r => setTimeout(r, reconnAttempt === 1 ? 850 : 1000));
          reopenedStatus = await this.openAuthorizedPort(flashPort, false).catch(() => null);
          if (reopenedStatus) break;
        }

        const actualDeviceId =
          reopenedStatus?.device?.id ||
          preFlashDeviceId ||
          (this.connectionInfo.deviceId !== 'demo-pad'
            ? this.connectionInfo.deviceId
            : undefined);
        const actualRawFw =
          reopenedStatus?.device?.firmware || inspectedBin.embeddedVersion || '';

        if (actualDeviceId) {
          writeFlashedLedger(actualDeviceId, {
            rawReportedVersion: actualRawFw
              ? `v${actualRawFw.replace(/^[vV]/, '')}`
              : '*',
            flashedVersion: cleanVersion,
            sha256: params.sha256,
            flashedAt: new Date().toISOString(),
            supportsV45Engine: effectiveSupportsV45
          });
          if (reopenedStatus) {
            this.applyTelemetryFromStatus(
              reopenedStatus,
              this.connectionInfo.vendorProduct
            );
          }
        }

        const finalLabel = `v${cleanVersion}`;
        const reportedFw =
          this.connectionInfo.connected &&
          this.connectionInfo.firmwareVersion &&
          this.connectionInfo.firmwareVersion !== '—' &&
          this.connectionInfo.firmwareVersion !== 'Connecting…'
            ? this.connectionInfo.firmwareVersion
            : finalLabel;

        params.onProgress?.(
          100,
          totalBytes,
          totalBytes,
          `Installed ${finalLabel} on MacroPad`
        );

        return {
          ok: true,
          firmwareVersion: reportedFw,
          message: `Installed firmware ${finalLabel} on MacroPad over USB`
        };
      } catch (err: any) {
        lastErr = err;
        if (activeTransport) {
          if (!flashCompleted) {
            try {
              await activeTransport.setDTR(false);
              await activeTransport.setRTS(true);
              await new Promise(r => setTimeout(r, 100));
              await activeTransport.setRTS(false);
              await activeTransport.setDTR(false);
            } catch {}
          }
          await activeTransport.disconnect().catch(() => {});
          activeTransport = null;
        }

        if (params.signal?.aborted || attempt >= maxRetries) {
          this.isFlashingOta = false;
          if (wasConnectedBeforeFlash && flashPort) {
            await new Promise(r => setTimeout(r, 450));
            await this.openAuthorizedPort(flashPort, false).catch(() => null);
          }
          throw err instanceof Error ? err : new Error('Failed to flash firmware over USB.');
        }

        // Loop continues for next retry attempt with exponential backoff
      }
    }

    this.isFlashingOta = false;
    if (wasConnectedBeforeFlash && flashPort) {
      await new Promise(r => setTimeout(r, 450));
      await this.openAuthorizedPort(flashPort, false).catch(() => null);
    }
    throw lastErr instanceof Error ? lastErr : new Error('Failed to flash firmware over USB.');
  }

  private async cleanupPort() {
    this.stopLiveTelemetryPolling();
    try {
      const portToClose = this.port;
      this.port = null;

      if (this.reader) {
        await this.reader.cancel().catch(() => {});
        try {
          this.reader.releaseLock();
        } catch (_) {}
        this.reader = null;
      }
      if (this.pipeClosedPromise) {
        await this.pipeClosedPromise.catch(() => {});
        this.pipeClosedPromise = null;
      }
      if (this.writer) {
        try {
          this.writer.releaseLock();
        } catch (_) {}
        this.writer = null;
      }
      if (portToClose) {
        const unlockDeadline = Date.now() + 450;
        while (
          Date.now() < unlockDeadline &&
          (portToClose.readable?.locked || portToClose.writable?.locked)
        ) {
          await new Promise(r => setTimeout(r, 25));
        }
        await portToClose.close().catch(() => {});
      }
    } catch (_) {}
  }

  public async setTvEnabled(enabled: boolean): Promise<any> {
    return this.call({ path: '/api/tv/enable', enabled });
  }

  public async disconnect(markManual = true) {
    if (markManual) {
      this.manualDisconnect = true;
    }
    await this.cleanupPort();
    this.markDisconnected();
  }
}

export const usbHardware = new PadLinkService();
