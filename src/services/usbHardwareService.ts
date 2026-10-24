import {
  DeviceConnectionInfo,
  HardwareBackupPayload,
  HardwareProfileId,
  HardwareSlotId,
  HardwareTelemetry
} from '../types/studio';
import {
  HARDWARE_SLOTS,
  isValidFirmwareAction,
  sanitizeFirmwareAlias,
  sanitizeSerialString
} from '../data/firmwareCatalog';

export interface FirmwareStatusPacket {
  ok: boolean;
  api_version: number;
  device: {
    id: string;
    name: string;
    firmware: string;
    connection_type: string;
  };
  connection: {
    wifi_connected: boolean;
    ip: string;
    ble_connected: boolean;
  };
  diagnostics: {
    free_heap: number;
    http_api_enabled?: boolean;
  };
  tv: {
    configured: boolean;
    paired: boolean;
    host: string;
    port: number;
  };
  profiles: {
    active: HardwareProfileId;
    items: {
      id: HardwareProfileId;
      name: string;
      controls: Record<HardwareSlotId, string>;
    }[];
  };
  wifi_connected: boolean;
  ip: string;
  heap: number;
  ssid: string;
  tv_ip: string;
  tv_port: number;
  has_auth: boolean;
  mac_b1: string;
  mac_b2: string;
  mac_b3: string;
  mac_b4: string;
  mac_dial: string;
  tv_b1: string;
  tv_b2: string;
  tv_b3: string;
  tv_b4: string;
  tv_dial: string;
}

type ConnectionListener = (info: DeviceConnectionInfo) => void;
type HardwareStatusListener = (status: FirmwareStatusPacket, isInitialOrManual: boolean) => void;

interface QueuedCommand {
  payload: Record<string, any>;
  timeoutMs: number;
  isManualOrInitialStatus?: boolean;
  resolve: (res: any) => void;
  reject: (err: Error) => void;
}

class UsbHardwareService {
  private serialPort: any = null;
  private serialReader: any = null;
  private serialWriter: any = null;
  private serialRxBuffer = '';
  private isOpening = false;
  private manualDisconnect = false;
  private pollIntervalId: number | null = null;
  private hasCompletedInitialSync = false;

  private commandQueue: QueuedCommand[] = [];
  private inFlight: {
    cmd: QueuedCommand;
    timerId: number;
  } | null = null;

  private connectionInfo: DeviceConnectionInfo = {
    connected: false,
    transport: 'disconnected',
    deviceName: 'Studio MacroPad',
    firmwareVersion: '—'
  };

  private connListeners = new Set<ConnectionListener>();
  private statusListeners = new Set<HardwareStatusListener>();

  constructor() {
    if (typeof window !== 'undefined') {
      this.setupDeviceWatchers();
    }
  }

  public get browserSupportsWebSerial(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  public get info(): DeviceConnectionInfo {
    return this.connectionInfo;
  }

  public onConnectionChange(fn: ConnectionListener) {
    this.connListeners.add(fn);
    return () => {
      this.connListeners.delete(fn);
    };
  }

  public onHardwareStatus(fn: HardwareStatusListener) {
    this.statusListeners.add(fn);
    return () => {
      this.statusListeners.delete(fn);
    };
  }

  private emitConnection() {
    const snap = { ...this.connectionInfo };
    this.connListeners.forEach(fn => fn(snap));
  }

  private setupDeviceWatchers() {
    const navSerial = (navigator as any).serial;
    if (!navSerial) return;

    navSerial.addEventListener('connect', async (e: any) => {
      if (this.manualDisconnect || this.serialPort || this.isOpening) return;
      const targetPort = e.target;
      if (targetPort) {
        await this.openPort(targetPort);
      } else {
        await this.tryAutoConnectSerial();
      }
    });

    navSerial.addEventListener('disconnect', async (e: any) => {
      if (this.serialPort && (!e.target || e.target === this.serialPort)) {
        await this.cleanupSerial();
        this.setDisconnected();
      }
    });

    // Auto-pair with previously authorized USB port on startup
    this.tryAutoConnectSerial();
  }

  private setDisconnected() {
    this.stopBackgroundPoll();
    this.hasCompletedInitialSync = false;
    this.rejectAllPending(new Error('USB cable disconnected.'));
    this.connectionInfo = {
      connected: false,
      transport: 'disconnected',
      deviceName: 'Studio MacroPad',
      firmwareVersion: '—'
    };
    this.emitConnection();
  }

  private rejectAllPending(err: Error) {
    if (this.inFlight) {
      window.clearTimeout(this.inFlight.timerId);
      this.inFlight.cmd.reject(err);
      this.inFlight = null;
    }
    while (this.commandQueue.length > 0) {
      const next = this.commandQueue.shift();
      next?.reject(err);
    }
  }

  public async tryAutoConnectSerial(): Promise<boolean> {
    if (!this.browserSupportsWebSerial || this.serialPort || this.isOpening || this.manualDisconnect) {
      return Boolean(this.serialPort);
    }
    try {
      const ports: any[] = await (navigator as any).serial.getPorts();
      if (!ports || ports.length === 0) return false;
      // Prefer ports with a USB vendor ID (ESP32 CP210x / CH340 / FTDI / USB-JTAG)
      const sorted = [...ports].sort((a, b) => {
        const aUsb = a.getInfo?.()?.usbVendorId ? 1 : 0;
        const bUsb = b.getInfo?.()?.usbVendorId ? 1 : 0;
        return bUsb - aUsb;
      });
      for (const port of sorted) {
        const ok = await this.openPort(port);
        if (ok) return true;
      }
    } catch (_) {}
    return false;
  }

  public async connectWebSerial(): Promise<boolean> {
    if (!this.browserSupportsWebSerial) {
      throw new Error('Web Serial requires Chrome, Edge, or Brave over a USB data cable.');
    }

    this.manualDisconnect = false;
    try {
      const port = await (navigator as any).serial.requestPort();
      if (!port) return false;
      await this.disconnect(false);
      this.manualDisconnect = false;
      return await this.openPort(port);
    } catch (err: any) {
      if (err?.name === 'NotFoundError') return false;
      throw err;
    }
  }

  private async openPort(port: any): Promise<boolean> {
    if (this.serialPort) return true;
    if (this.isOpening || !port) return false;

    this.isOpening = true;
    try {
      await port.open({ baudRate: 115200 });
      await port.setSignals?.({ dataTerminalReady: false, requestToSend: false }).catch(() => {});

      this.serialPort = port;
      this.serialWriter = port.writable?.getWriter();
      this.serialRxBuffer = '';
      this.hasCompletedInitialSync = false;

      const info = port.getInfo?.() || {};
      const vid = info.usbVendorId
        ? info.usbVendorId.toString(16).padStart(4, '0').toUpperCase()
        : undefined;
      const pid = info.usbProductId
        ? info.usbProductId.toString(16).padStart(4, '0').toUpperCase()
        : undefined;

      this.connectionInfo = {
        connected: true,
        transport: 'webserial',
        deviceName: 'Studio MacroPad',
        firmwareVersion: 'Syncing…',
        vendorProduct: vid && pid ? `${vid}:${pid}` : undefined
      };
      this.emitConnection();

      this.readSerialLoop(port);
      this.runInitialSyncHandshake();
      this.startBackgroundPoll();
      return true;
    } catch (_) {
      await this.cleanupSerial();
      return false;
    } finally {
      this.isOpening = false;
    }
  }

  /**
   * ESP32-WROOM-32 boards often pulse EN/BOOT on serial port open and take ~600-1400ms
   * in setup() before entering loop(). Retry /api/status cleanly until synced.
   */
  private async runInitialSyncHandshake() {
    const delays = [160, 550, 750, 950];
    for (let attempt = 0; attempt < delays.length; attempt++) {
      if (!this.serialPort || this.hasCompletedInitialSync) return;
      await new Promise(r => setTimeout(r, delays[attempt]));
      if (!this.serialPort || this.hasCompletedInitialSync) return;
      try {
        await this.fetchStatus({ isManualOrInitial: true, timeoutMs: 950 });
        if (this.hasCompletedInitialSync) return;
      } catch (_) {
        // Retry next window while ESP32 finishes setup()
      }
    }
  }

  private startBackgroundPoll() {
    this.stopBackgroundPoll();
    this.pollIntervalId = window.setInterval(() => {
      if (!this.serialPort || !this.serialWriter) return;
      if (this.inFlight || this.commandQueue.length > 0) return;
      this.fetchStatus({ isManualOrInitial: !this.hasCompletedInitialSync, timeoutMs: 1800 }).catch(
        () => {}
      );
    }, 2600);
  }

  private stopBackgroundPoll() {
    if (this.pollIntervalId !== null) {
      window.clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
  }

  private async readSerialLoop(port: any) {
    try {
      const decoder = new TextDecoderStream();
      port.readable.pipeTo(decoder.writable).catch(() => {});
      const reader = decoder.readable.getReader();
      this.serialReader = reader;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          this.serialRxBuffer += value;
          if (this.serialRxBuffer.length > 32768) {
            this.serialRxBuffer = this.serialRxBuffer.slice(-8192);
          }
          this.parseSerialLines();
        }
      }
    } catch (_) {
    } finally {
      if (this.serialPort === port) {
        await this.cleanupSerial();
        this.setDisconnected();
      }
    }
  }

  private parseSerialLines() {
    if (!this.serialRxBuffer.includes('\n')) return;
    const lines = this.serialRxBuffer.split('\n');
    this.serialRxBuffer = lines.pop() || '';

    for (const raw of lines) {
      const trimmed = raw.trim();
      if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) continue;

      let msg: any;
      try {
        msg = JSON.parse(trimmed);
      } catch (_) {
        continue;
      }

      const activeCmd = this.inFlight;
      const isInitialOrManual = Boolean(activeCmd?.cmd.isManualOrInitialStatus);

      // Check if this is a full buildStatusJson() packet from /api/status
      if (msg && msg.profiles && Array.isArray(msg.profiles.items) && msg.device) {
        this.applyTelemetryFromStatus(msg as FirmwareStatusPacket);
        const announce = !this.hasCompletedInitialSync || isInitialOrManual;
        this.hasCompletedInitialSync = true;
        this.statusListeners.forEach(fn => fn(msg as FirmwareStatusPacket, announce));
      }

      if (activeCmd) {
        window.clearTimeout(activeCmd.timerId);
        this.inFlight = null;
        activeCmd.cmd.resolve(msg);
        this.flushNextCommand();
      }
    }
  }

  private applyTelemetryFromStatus(pkt: FirmwareStatusPacket) {
    const fw = pkt.device?.firmware
      ? pkt.device.firmware.startsWith('v')
        ? pkt.device.firmware
        : `v${pkt.device.firmware}`
      : this.connectionInfo.firmwareVersion;

    const telemetry: HardwareTelemetry = {
      activeProfile: pkt.profiles?.active === 'TV' ? 'TV' : 'MAC',
      wifiConnected: Boolean(pkt.connection?.wifi_connected ?? pkt.wifi_connected),
      ip: pkt.connection?.ip || pkt.ip || '',
      ssid: pkt.ssid || '',
      bleConnected: Boolean(pkt.connection?.ble_connected),
      freeHeap: Number(pkt.diagnostics?.free_heap ?? pkt.heap ?? 0),
      httpApiEnabled: Boolean(pkt.diagnostics?.http_api_enabled),
      tvConfigured: Boolean(pkt.tv?.configured),
      tvPaired: Boolean(pkt.tv?.paired ?? pkt.has_auth),
      tvHost: pkt.tv?.host ?? pkt.tv_ip ?? '',
      tvPort: Number(pkt.tv?.port ?? pkt.tv_port ?? 7345),
      connectionType: pkt.device?.connection_type || 'USB'
    };

    this.connectionInfo = {
      ...this.connectionInfo,
      connected: true,
      transport: 'webserial',
      deviceName: pkt.device?.name || 'Studio MacroPad',
      firmwareVersion: fw,
      lastSyncedAt: new Date().toLocaleTimeString(),
      telemetry
    };
    this.emitConnection();
  }

  private enqueueCommand(
    payload: Record<string, any>,
    timeoutMs = 2800,
    isManualOrInitialStatus = false
  ): Promise<any> {
    if (!this.connectionInfo.connected || !this.serialWriter) {
      return Promise.reject(new Error('MacroPad USB cable is not connected.'));
    }

    return new Promise((resolve, reject) => {
      this.commandQueue.push({
        payload,
        timeoutMs,
        isManualOrInitialStatus,
        resolve,
        reject
      });
      this.flushNextCommand();
    });
  }

  private async flushNextCommand() {
    if (this.inFlight || this.commandQueue.length === 0 || !this.serialWriter) return;

    const cmd = this.commandQueue.shift()!;
    const serialized = JSON.stringify(cmd.payload) + '\n';

    if (serialized.length > 1536) {
      cmd.reject(new Error('Serial JSON packet exceeds 1536-byte firmware limit.'));
      this.flushNextCommand();
      return;
    }

    const timerId = window.setTimeout(() => {
      if (this.inFlight?.cmd === cmd) {
        this.inFlight = null;
        cmd.reject(new Error('Timed out waiting for response from MacroPad over USB.'));
        this.flushNextCommand();
      }
    }, cmd.timeoutMs);

    this.inFlight = { cmd, timerId };

    try {
      await this.serialWriter.write(new TextEncoder().encode(serialized));
    } catch (err: any) {
      window.clearTimeout(timerId);
      if (this.inFlight?.cmd === cmd) {
        this.inFlight = null;
      }
      cmd.reject(err instanceof Error ? err : new Error('Failed to write to USB Serial port.'));
      this.flushNextCommand();
    }
  }

  // ===========================================================================
  // Public Bi-Directional Firmware API Methods (1:1 with processSerialPacket)
  // ===========================================================================

  public async fetchStatus(opts?: {
    isManualOrInitial?: boolean;
    timeoutMs?: number;
  }): Promise<FirmwareStatusPacket> {
    const res = await this.enqueueCommand(
      { path: '/api/status' },
      opts?.timeoutMs ?? 2500,
      opts?.isManualOrInitial ?? true
    );
    if (!res || !res.profiles) {
      throw new Error(res?.message || 'Unexpected status response from MacroPad.');
    }
    return res as FirmwareStatusPacket;
  }

  public async saveSlotBinding(
    profile: HardwareProfileId,
    slot: HardwareSlotId,
    action: string
  ): Promise<{ ok: boolean; message: string }> {
    if (!isValidFirmwareAction(action)) {
      throw new Error(`Unsupported firmware action: ${action}`);
    }
    const res = await this.enqueueCommand({
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
  ): Promise<{ ok: boolean; message: string }> {
    for (const slotId of HARDWARE_SLOTS) {
      if (!isValidFirmwareAction(slots[slotId])) {
        throw new Error(
          `Slot ${slotId.toUpperCase()} on ${profile} is unassigned or invalid. Assign all 7 controls before saving the full profile.`
        );
      }
    }
    const res = await this.enqueueCommand({
      path: '/api/profile/save',
      profile,
      b1: slots.b1,
      b2: slots.b2,
      b3: slots.b3,
      b4: slots.b4,
      dial: slots.dial,
      enc_cw: slots.enc_cw,
      enc_ccw: slots.enc_ccw
    });
    if (!res?.ok) {
      throw new Error(res?.message || 'Device rejected profile payload.');
    }
    return res;
  }

  public async renameProfile(
    profile: HardwareProfileId,
    name: string
  ): Promise<{ ok: boolean; message: string }> {
    const clean = sanitizeFirmwareAlias(name, profile);
    const res = await this.enqueueCommand({
      path: '/api/profile/rename',
      profile,
      name: clean
    });
    if (!res?.ok) {
      throw new Error(res?.message || 'Invalid profile name (1-20 letters, numbers, spaces, - or _).');
    }
    return res;
  }

  public async copyProfile(
    source: HardwareProfileId,
    target: HardwareProfileId
  ): Promise<{ ok: boolean; message: string }> {
    const res = await this.enqueueCommand({
      path: '/api/profile/copy',
      source,
      target
    });
    if (!res?.ok) {
      throw new Error(res?.message || 'Failed to copy profile on device.');
    }
    await this.fetchStatus({ isManualOrInitial: true }).catch(() => {});
    return res;
  }

  public async exportHardwareConfig(): Promise<HardwareBackupPayload> {
    const res = await this.enqueueCommand({ path: '/api/config/export' });
    if (res?.schema !== 'studio-pad-config') {
      throw new Error(res?.message || 'Failed to export configuration from MacroPad.');
    }
    return res as HardwareBackupPayload;
  }

  public async importHardwareConfig(
    backup: HardwareBackupPayload
  ): Promise<{ ok: boolean; message: string }> {
    const payload = {
      path: '/api/config/import',
      schema: 'studio-pad-config',
      version: 1,
      mac_name: sanitizeFirmwareAlias(backup.mac_name, 'MAC'),
      tv_name: sanitizeFirmwareAlias(backup.tv_name, 'TV'),
      mac_b1: backup.mac_b1,
      mac_b2: backup.mac_b2,
      mac_b3: backup.mac_b3,
      mac_b4: backup.mac_b4,
      mac_dial: backup.mac_dial,
      mac_enc_cw: backup.mac_enc_cw,
      mac_enc_ccw: backup.mac_enc_ccw,
      tv_b1: backup.tv_b1,
      tv_b2: backup.tv_b2,
      tv_b3: backup.tv_b3,
      tv_b4: backup.tv_b4,
      tv_dial: backup.tv_dial,
      tv_enc_cw: backup.tv_enc_cw,
      tv_enc_ccw: backup.tv_enc_ccw
    };
    const res = await this.enqueueCommand(payload, 3500);
    if (!res?.ok) {
      throw new Error(res?.message || 'Device rejected configuration backup.');
    }
    await this.fetchStatus({ isManualOrInitial: true }).catch(() => {});
    return res;
  }

  public async testAction(action: string): Promise<{ ok: boolean; message: string }> {
    if (!isValidFirmwareAction(action)) {
      throw new Error('Assign a valid firmware action first.');
    }
    const res = await this.enqueueCommand({
      path: '/api/test/action',
      action
    });
    if (!res?.ok) {
      throw new Error(res?.message || 'Device could not execute test action.');
    }
    return res;
  }

  public async saveWifi(ssid: string, pass: string): Promise<{ ok: boolean; message: string }> {
    const res = await this.enqueueCommand({
      path: '/api/wifi',
      ssid: sanitizeSerialString(ssid.trim(), 32),
      pass: sanitizeSerialString(pass, 63)
    });
    if (!res?.ok) {
      throw new Error(res?.message || 'Invalid Wi-Fi credentials.');
    }
    return res;
  }

  public async saveTvConfig(
    tvIp: string,
    tvPort: number,
    token: string
  ): Promise<{ ok: boolean; message: string }> {
    const res = await this.enqueueCommand({
      path: '/api/token/save',
      tv_ip: sanitizeSerialString(tvIp.trim(), 63),
      tv_port: Number(tvPort) || 7345,
      token: sanitizeSerialString(token.trim(), 128)
    });
    if (!res?.ok) {
      throw new Error(res?.message || 'Failed to save TV settings.');
    }
    await this.fetchStatus({ isManualOrInitial: false }).catch(() => {});
    return res;
  }

  public async testTv(): Promise<{ ok: boolean; message: string }> {
    return await this.enqueueCommand({ path: '/api/tv/test' }, 6500);
  }

  public async startTvPairing(
    tvIp: string,
    tvPort: number
  ): Promise<{ ok: boolean; message: string }> {
    const res = await this.enqueueCommand(
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
    const res = await this.enqueueCommand(
      {
        path: '/api/pair/submit',
        pin: pin.trim()
      },
      6500
    );
    if (!res?.ok) {
      throw new Error(res?.message || 'Invalid PIN or TV rejected pairing.');
    }
    await this.fetchStatus({ isManualOrInitial: false }).catch(() => {});
    return res;
  }

  public async forgetTv(): Promise<{ ok: boolean; message: string }> {
    const res = await this.enqueueCommand({
      path: '/api/tv/forget',
      confirm: 'FORGET'
    });
    if (!res?.ok) {
      throw new Error(res?.message || 'Failed to forget TV configuration.');
    }
    await this.fetchStatus({ isManualOrInitial: false }).catch(() => {});
    return res;
  }

  public async resetHardwareDefaults(): Promise<{ ok: boolean; message: string }> {
    const res = await this.enqueueCommand({
      path: '/api/device/reset-settings',
      confirm: 'RESET'
    });
    if (!res?.ok) {
      throw new Error(res?.message || 'Failed to reset hardware profiles.');
    }
    await this.fetchStatus({ isManualOrInitial: true }).catch(() => {});
    return res;
  }

  public async setHttpApiToken(token: string): Promise<{ ok: boolean; message: string }> {
    const res = await this.enqueueCommand({
      path: '/api/auth/set',
      token: sanitizeSerialString(token.trim(), 64)
    });
    if (!res?.ok) {
      throw new Error(res?.message || 'Token must be 8-64 characters, or empty to disable.');
    }
    await this.fetchStatus({ isManualOrInitial: false }).catch(() => {});
    return res;
  }

  private async cleanupSerial() {
    this.stopBackgroundPoll();
    try {
      if (this.serialReader) {
        await this.serialReader.cancel().catch(() => {});
        try {
          this.serialReader.releaseLock();
        } catch (_) {}
        this.serialReader = null;
      }
      if (this.serialWriter) {
        try {
          this.serialWriter.releaseLock();
        } catch (_) {}
        this.serialWriter = null;
      }
      if (this.serialPort) {
        await this.serialPort.close().catch(() => {});
        this.serialPort = null;
      }
    } catch (_) {}
  }

  public async disconnect(markManual = true) {
    if (markManual) {
      this.manualDisconnect = true;
    }
    await this.cleanupSerial();
    this.setDisconnected();
  }
}

export const usbHardware = new UsbHardwareService();
