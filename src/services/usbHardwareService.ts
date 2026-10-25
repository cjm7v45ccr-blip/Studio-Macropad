import {
  DeviceConnectionInfo,
  HardwareBackupPayload,
  HardwareEventPacket,
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
  ok?: boolean;
  api_version?: number;
  rev?: number;
  device: {
    id: string;
    name: string;
    firmware: string;
    connection_type?: string;
  };
  connection?: {
    wifi_connected: boolean;
    ip: string;
    ble_connected: boolean;
  };
  diagnostics?: {
    free_heap: number;
    http_api_enabled?: boolean;
  };
  tv?: {
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
  mac_dial?: string;
  tv_b1?: string;
  tv_b2?: string;
  tv_b3?: string;
  tv_b4?: string;
  tv_dial?: string;
}

type ConnectionListener = (info: DeviceConnectionInfo) => void;
type ConnectStatusListener = (status: FirmwareStatusPacket) => void;
type HardwareEventListener = (event: HardwareEventPacket) => void;

/**
 * PadLink WebSerial Transport
 * - Sends strictly one request at a time via a Promise queue
 * - Separates asynchronous hardware events (`msg.event`) from command replies
 * - Ignores ESP32 boot noise lines (anything not starting with `{`)
 * - Waits 2000ms on open for ESP32 auto-reset, enables `/api/events/set`, and reads `/api/status`
 * - Reconnects automatically via `navigator.serial.getPorts()` without showing the port picker
 */
class PadLinkService {
  private port: any = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private reader: ReadableStreamDefaultReader<string> | null = null;
  private pipeClosedPromise: Promise<void> | null = null;

  private queue: Promise<void> = Promise.resolve();
  private pending: ((msg: any) => void) | null = null;
  private pendingReject: ((err: Error) => void) | null = null;
  private buf = '';

  private isOpening = false;
  private manualDisconnect = false;

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

  constructor() {
    if (typeof window !== 'undefined') {
      this.setupSerialWatchers();
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

  /**
   * Fired when a fresh USB connection completes its handshake & initial `/api/status` read
   */
  public onConnectStatus(fn: ConnectStatusListener) {
    this.connectStatusListeners.add(fn);
    return () => {
      this.connectStatusListeners.delete(fn);
    };
  }

  /**
   * Fired whenever the pad streams an asynchronous JSON event (`msg.event`)
   */
  public onHardwareEvent(fn: HardwareEventListener) {
    this.eventListeners.add(fn);
    return () => {
      this.eventListeners.delete(fn);
    };
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
      if (this.manualDisconnect || this.port || this.isOpening) return;
      const targetPort = e?.target;
      if (targetPort) {
        await this.openAuthorizedPort(targetPort).catch(() => {});
      } else {
        await this.tryAutoConnectSerial();
      }
    });

    navSerial.addEventListener('disconnect', async (e: any) => {
      if (this.port && (!e?.target || e.target === this.port)) {
        await this.cleanupPort();
        this.markDisconnected();
      }
    });

    // Reconnect automatically using previously approved ports without showing the port picker
    this.tryAutoConnectSerial();
  }

  private markDisconnected() {
    if (this.pendingReject) {
      const rej = this.pendingReject;
      this.pending = null;
      this.pendingReject = null;
      rej(new Error('MacroPad USB disconnected'));
    }

    this.connectionInfo = {
      connected: false,
      connecting: false,
      transport: 'disconnected',
      deviceName: 'Studio MacroPad',
      firmwareVersion: '—',
      // Wi-Fi, TV pairing, and HTTP token live strictly on the pad — clear on disconnect
      telemetry: undefined
    };
    this.emitConnection();
  }

  public async tryAutoConnectSerial(): Promise<boolean> {
    if (
      !this.browserSupportsWebSerial ||
      this.port ||
      this.isOpening ||
      this.manualDisconnect
    ) {
      return Boolean(this.port && this.connectionInfo.connected);
    }

    try {
      const ports: any[] = await (navigator as any).serial.getPorts();
      if (!ports || ports.length === 0) return false;

      // Prefer USB serial ports exposing a USB Vendor ID (CP210x / CH340 / FTDI / ESP32)
      const sorted = [...ports].sort((a, b) => {
        const aUsb = a.getInfo?.()?.usbVendorId ? 1 : 0;
        const bUsb = b.getInfo?.()?.usbVendorId ? 1 : 0;
        return bUsb - aUsb;
      });

      for (const candidate of sorted) {
        const ok = await this.openAuthorizedPort(candidate);
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
      throw new Error('Chrome or Edge on HTTPS is required for Web Serial.');
    }

    this.manualDisconnect = false;
    let selectedPort: any;
    try {
      selectedPort = await (navigator as any).serial.requestPort();
    } catch (err: any) {
      if (err?.name === 'NotFoundError') return null;
      throw err;
    }

    if (!selectedPort) return null;
    await this.disconnect(false);
    this.manualDisconnect = false;
    return await this.openAuthorizedPort(selectedPort, true);
  }

  private async openAuthorizedPort(
    port: any,
    throwOnError = false
  ): Promise<FirmwareStatusPacket | null> {
    if (this.isOpening || !port) return null;
    this.isOpening = true;

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
      firmwareVersion: 'Rebooting…',
      vendorProduct
    };
    this.emitConnection();

    try {
      await port.open({ baudRate: 115200 });
      this.port = port;
      this.buf = '';
      this.writer = port.writable.getWriter();

      const decoder = new TextDecoderStream();
      this.pipeClosedPromise = port.readable.pipeTo(decoder.writable).catch(() => {});
      this.reader = decoder.readable.getReader();

      this.readLoop(port);

      // ESP32 boards often pulse EN/RTS when the port opens; wait 2000ms for setup()
      await new Promise(r => setTimeout(r, 2000));
      if (this.port !== port) return null;

      // Enable real-time hardware events (`press`, `turn`, `profile`, `connection`, `config`)
      try {
        await this.call({ path: '/api/events/set', enabled: 1 });
      } catch (_) {
        // Retry once in case board boot took slightly over 2s
        if (this.port === port) {
          await this.call({ path: '/api/events/set', enabled: 1 }).catch(() => {});
        }
      }

      const status = await this.call<FirmwareStatusPacket>({ path: '/api/status' });
      if (!status || !status.profiles) {
        throw new Error('Unexpected status reply from MacroPad.');
      }

      this.applyTelemetryFromStatus(status, vendorProduct);
      this.connectStatusListeners.forEach(fn => fn(status));
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

  private async readLoop(port: any) {
    try {
      for (;;) {
        if (!this.reader) break;
        const { value, done } = await this.reader.read();
        if (done) break;
        if (!value) continue;

        this.buf += value;
        if (this.buf.length > 32768) {
          this.buf = this.buf.slice(-8192);
        }

        let i: number;
        while ((i = this.buf.indexOf('\n')) >= 0) {
          const line = this.buf.slice(0, i).trim();
          this.buf = this.buf.slice(i + 1);
          if (!line.startsWith('{')) continue; // skip ESP32 boot noise

          let msg: any;
          try {
            msg = JSON.parse(line);
          } catch {
            continue;
          }

          if (msg.event) {
            this.handleHardwareEvent(msg as HardwareEventPacket);
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
              resolveFn(msg);
            }
          }
        }
      }
    } catch (_) {
    } finally {
      if (this.port === port) {
        await this.cleanupPort();
        this.markDisconnected();
      }
    }
  }

  private handleHardwareEvent(e: HardwareEventPacket) {
    if (e.event === 'connection' && this.connectionInfo.telemetry) {
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
      const nextActive: HardwareProfileId =
        (e.active || e.profile) === 'TV' ? 'TV' : 'MAC';
      this.connectionInfo = {
        ...this.connectionInfo,
        telemetry: {
          ...this.connectionInfo.telemetry,
          activeProfile: nextActive
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
    }

    this.eventListeners.forEach(fn => fn(e));
  }

  private applyTelemetryFromStatus(pkt: FirmwareStatusPacket, vendorProduct?: string) {
    const rawFw = pkt.device?.firmware || '';
    const fw = rawFw
      ? rawFw.startsWith('v')
        ? rawFw
        : `v${rawFw}`
      : this.connectionInfo.firmwareVersion;

    // Live-only pad telemetry (never stored in localStorage["pad:" + id])
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
      connected: true,
      connecting: false,
      transport: 'webserial',
      deviceId: pkt.device?.id || 'studio-pad',
      rev: typeof pkt.rev === 'number' ? pkt.rev : this.connectionInfo.rev ?? 0,
      deviceName: pkt.device?.name || 'Studio MacroPad',
      firmwareVersion: fw,
      vendorProduct: vendorProduct ?? this.connectionInfo.vendorProduct,
      lastSyncedAt: new Date().toLocaleTimeString(),
      telemetry
    };
    this.emitConnection();
  }

  /**
   * Serialized single-request-at-a-time JSON RPC over USB Serial
   */
  public call<T = any>(obj: Record<string, any>, timeoutMs = 3000): Promise<T> {
    const run = () =>
      new Promise<T>((resolve, reject) => {
        if (!this.writer || !this.port) {
          reject(new Error('MacroPad USB cable is disconnected.'));
          return;
        }

        const encodedLine = JSON.stringify(obj) + '\n';
        if (encodedLine.length > 1536) {
          reject(new Error('Serial JSON packet exceeds 1536-byte firmware limit.'));
          return;
        }

        const t = window.setTimeout(() => {
          if (this.pending === onReply) {
            this.pending = null;
            this.pendingReject = null;
          }
          reject(new Error('Timed out waiting for MacroPad reply over USB.'));
        }, timeoutMs);

        const onReply = (msg: any) => {
          window.clearTimeout(t);
          resolve(msg as T);
        };

        this.pending = onReply;
        this.pendingReject = (err: Error) => {
          window.clearTimeout(t);
          reject(err);
        };

        this.writer.write(new TextEncoder().encode(encodedLine)).catch(err => {
          window.clearTimeout(t);
          if (this.pending === onReply) {
            this.pending = null;
            this.pendingReject = null;
          }
          reject(
            err instanceof Error ? err : new Error('Failed to write to USB Serial port.')
          );
        });
      });

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

  public async fetchStatus(timeoutMs = 3000): Promise<FirmwareStatusPacket> {
    const res = await this.call<FirmwareStatusPacket>({ path: '/api/status' }, timeoutMs);
    if (!res || !res.profiles) {
      throw new Error((res as any)?.message || 'Unexpected status reply from MacroPad.');
    }
    return res;
  }

  public async activateProfile(
    profile: HardwareProfileId
  ): Promise<{ ok: boolean; rev?: number; active?: HardwareProfileId; message?: string }> {
    const res = await this.call({
      path: '/api/profile/activate',
      profile
    });
    if (res?.ok && this.connectionInfo.telemetry) {
      this.connectionInfo = {
        ...this.connectionInfo,
        telemetry: {
          ...this.connectionInfo.telemetry,
          activeProfile: profile
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
    if (!isValidFirmwareAction(action)) {
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
      if (!isValidFirmwareAction(slots[slotId])) {
        throw new Error(
          `Slot ${slotId.toUpperCase()} on ${profile} is unassigned or invalid.`
        );
      }
    }
    const res = await this.call({
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
  ): Promise<{ ok: boolean; rev?: number; message?: string }> {
    const clean = sanitizeFirmwareAlias(name, profile);
    const res = await this.call({
      path: '/api/profile/rename',
      profile,
      name: clean
    });
    if (!res?.ok) {
      throw new Error(
        res?.message || 'Invalid profile name (1-20 letters, numbers, spaces, - or _).'
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
    const res = await this.call(
      {
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
      },
      4000
    );
    if (!res?.ok) {
      throw new Error(res?.message || 'Device rejected configuration backup.');
    }
    return res;
  }

  public async testAction(action: string): Promise<{ ok: boolean; message?: string }> {
    if (!isValidFirmwareAction(action)) {
      throw new Error('Assign a valid firmware action first.');
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

  public async saveWifi(ssid: string, pass: string): Promise<{ ok: boolean; message: string }> {
    const res = await this.call({
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

  private async cleanupPort() {
    try {
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
      if (this.port) {
        await this.port.close().catch(() => {});
        this.port = null;
      }
    } catch (_) {}
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
