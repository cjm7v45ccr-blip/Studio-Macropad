/**
 * Hardware Driver for ESP32 Studio MacroPad
 * Direct USB Cable Web Serial Connection (115,200 baud, newline-delimited JSON)
 */

import {
  ConnectionMode,
  FirmwareStatus,
  ProfileMode,
} from '../types/macropod';

type StatusListener = (status: FirmwareStatus) => void;
type ToastListener = (msg: string) => void;
type BannerListener = (msg: string, type: 'success' | 'error') => void;

export const FACTORY_STATUS: FirmwareStatus = {
  ok: true,
  api_version: 1,
  device: {
    id: 'studio-pad',
    name: 'Studio MacroPad',
    firmware: '3.2-PRO',
    connection_type: 'offline'
  },
  connection: {
    wifi_connected: false,
    ip: '',
    ble_connected: false
  },
  diagnostics: {
    free_heap: 245760
  },
  tv: {
    configured: false,
    paired: false,
    host: '',
    port: 7345
  },
  profiles: {
    active: 'MAC',
    items: [
      {
        id: 'MAC',
        name: 'Mac',
        controls: {
          b1: 'MEDIA:PLAY_PAUSE',
          b2: 'KEY:F13',
          b3: 'KEY:F14',
          b4: 'KEY:F15',
          b5: 'MACRO:COPY',
          b6: 'MACRO:PASTE',
          b7: 'MACRO:UNDO',
          b8: 'MACRO:SAVE',
          dial: 'MEDIA:MUTE'
        }
      },
      {
        id: 'TV',
        name: 'TV',
        controls: {
          b1: 'TV:POWER',
          b2: 'APP:YOUTUBE',
          b3: 'APP:DISNEY',
          b4: 'APP:TUBI',
          b5: 'APP:NETFLIX',
          b6: 'APP:PRIME',
          b7: 'TV:INFO',
          b8: 'TV:HOME',
          dial: 'TV:MUTE'
        }
      }
    ]
  },
  wifi_connected: false,
  ip: '',
  heap: 245760,
  ssid: '',
  tv_ip: '',
  tv_port: 7345,
  has_auth: false,
  mac_b1: 'MEDIA:PLAY_PAUSE',
  mac_b2: 'KEY:F13',
  mac_b3: 'KEY:F14',
  mac_b4: 'KEY:F15',
  mac_b5: 'MACRO:COPY',
  mac_b6: 'MACRO:PASTE',
  mac_b7: 'MACRO:UNDO',
  mac_b8: 'MACRO:SAVE',
  mac_dial: 'MEDIA:MUTE',
  tv_b1: 'TV:POWER',
  tv_b2: 'APP:YOUTUBE',
  tv_b3: 'APP:DISNEY',
  tv_b4: 'APP:TUBI',
  tv_b5: 'APP:NETFLIX',
  tv_b6: 'APP:PRIME',
  tv_b7: 'TV:INFO',
  tv_b8: 'TV:HOME',
  tv_dial: 'TV:MUTE'
};

class HardwareDriver {
  private serialPort: any = null;
  private serialReader: any = null;
  private serialWriter: any = null;
  private isConnectedSerial = false;
  private isOpeningSerial = false;
  private manualDisconnectRequested = false;
  private usbListenersInitialized = false;

  private statusListeners: Set<StatusListener> = new Set();
  private toastListeners: Set<ToastListener> = new Set();
  private bannerListeners: Set<BannerListener> = new Set();

  private rxBuffer = '';
  private pendingResolver: ((res: any) => void) | null = null;
  private currentStatus: FirmwareStatus = JSON.parse(JSON.stringify(FACTORY_STATUS));

  constructor() {
    if (typeof window !== 'undefined') {
      this.initUsbManager();
    }
  }

  public getStatus(): FirmwareStatus {
    return this.currentStatus;
  }

  public onStatus(fn: StatusListener) {
    this.statusListeners.add(fn);
    return () => {
      this.statusListeners.delete(fn);
    };
  }

  public onToast(fn: ToastListener) {
    this.toastListeners.add(fn);
    return () => {
      this.toastListeners.delete(fn);
    };
  }

  public onBanner(fn: BannerListener) {
    this.bannerListeners.add(fn);
    return () => {
      this.bannerListeners.delete(fn);
    };
  }

  private notifyStatus() {
    this.statusListeners.forEach(fn => fn(this.currentStatus));
  }

  public emitToast(msg: string) {
    this.toastListeners.forEach(fn => fn(msg));
  }

  public get isConnected(): boolean {
    return this.isConnectedSerial;
  }

  public get connectionMode(): ConnectionMode {
    return this.isConnectedSerial ? 'usb' : 'disconnected';
  }

  private initUsbManager() {
    if (this.usbListenersInitialized) return;
    this.usbListenersInitialized = true;

    const navSerial = (navigator as any).serial;
    if (!navSerial) return;

    navSerial.addEventListener('connect', async (event: any) => {
      if (this.manualDisconnectRequested || this.isConnectedSerial) return;
      const targetPort = event.target || (await navSerial.getPorts().catch(() => []))[0];
      if (targetPort) {
        await this.openPort(targetPort);
      }
    });

    navSerial.addEventListener('disconnect', async (event: any) => {
      if (this.isConnectedSerial && (!event.target || event.target === this.serialPort)) {
        await this.cleanupSerial();
        this.currentStatus.device.connection_type = 'offline';
        this.emitToast('USB Disconnected');
        this.notifyStatus();
      }
    });

    this.tryAutoConnectSerial();
  }

  public async tryAutoConnectSerial(): Promise<boolean> {
    if (!('serial' in navigator) || this.isConnectedSerial || this.isOpeningSerial || this.manualDisconnectRequested) {
      return this.isConnectedSerial;
    }

    try {
      const ports: any[] = await (navigator as any).serial.getPorts();
      if (!ports || ports.length === 0) return false;

      const usbPorts = ports.filter(p => {
        const info = p.getInfo?.() || {};
        return info.usbVendorId !== undefined;
      });

      const candidates = [...usbPorts, ...ports.filter(p => !usbPorts.includes(p))];
      for (const port of candidates) {
        const ok = await this.openPort(port);
        if (ok) return true;
      }
    } catch (_) {}
    return false;
  }

  public async connectSerial(): Promise<boolean> {
    if (!('serial' in navigator)) {
      throw new Error('Web Serial is supported in Google Chrome, Edge, and Brave browsers.');
    }

    this.manualDisconnectRequested = false;
    try {
      const port = await (navigator as any).serial.requestPort();
      return await this.openPort(port);
    } catch (err: any) {
      if (err.name === 'NotFoundError') return false;
      throw err;
    }
  }

  private async openPort(port: any): Promise<boolean> {
    if (this.isConnectedSerial) return true;
    if (this.isOpeningSerial || !port) return false;

    this.isOpeningSerial = true;
    try {
      await port.open({ baudRate: 115200 });

      this.serialPort = port;
      this.serialWriter = port.writable.getWriter();
      this.isConnectedSerial = true;
      this.currentStatus.device.connection_type = 'usb';
      this.notifyStatus();

      this.readSerialStream(port);
      this.emitToast('USB Connected');

      await this.request('/api/status').catch(() => {});
      return true;
    } catch (_) {
      this.isConnectedSerial = false;
      return false;
    } finally {
      this.isOpeningSerial = false;
    }
  }

  private async readSerialStream(port: any) {
    let reader: any = null;
    try {
      const textDecoder = new TextDecoderStream();
      port.readable.pipeTo(textDecoder.writable).catch(() => {});
      reader = textDecoder.readable.getReader();
      this.serialReader = reader;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          this.rxBuffer += value;
          this.processIncomingJsonBuffer();
        }
      }
    } catch (_) {
    } finally {
      if (this.serialPort === port && this.isConnectedSerial) {
        await this.cleanupSerial();
        this.currentStatus.device.connection_type = 'offline';
        this.emitToast('USB Disconnected');
        this.notifyStatus();
      }
    }
  }

  private processIncomingJsonBuffer() {
    if (!this.rxBuffer.includes('\n')) return;
    const lines = this.rxBuffer.split('\n');
    this.rxBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('{') && this.pendingResolver) {
        try {
          const json = JSON.parse(trimmed);
          const resolve = this.pendingResolver;
          this.pendingResolver = null;
          resolve(json);
        } catch (_) {}
      }
    }
  }

  private async cleanupSerial() {
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
    this.isConnectedSerial = false;
  }

  public async disconnect() {
    this.manualDisconnectRequested = true;
    await this.cleanupSerial();
    this.currentStatus.device.connection_type = 'offline';
    this.emitToast('Disconnected');
    this.notifyStatus();
  }

  public async request(path: string, data: Record<string, any> = {}): Promise<any> {
    if (this.isConnectedSerial && this.serialWriter) {
      return new Promise(async (resolve, reject) => {
        const timer = setTimeout(() => {
          if (this.pendingResolver === resolve) {
            this.pendingResolver = null;
            reject(new Error('Hardware timeout'));
          }
        }, 5000);

        this.pendingResolver = res => {
          clearTimeout(timer);
          this.handleResponse(path, data, res);
          resolve(res);
        };

        const payload = JSON.stringify({ path, ...data }) + '\n';
        try {
          await this.serialWriter.write(new TextEncoder().encode(payload));
        } catch (err) {
          clearTimeout(timer);
          this.pendingResolver = null;
          reject(err);
        }
      });
    }

    if (path === '/api/customizer/save') {
      const profile = this.currentStatus.profiles.items.find(p => p.id === data.profile);
      if (profile) {
        (profile.controls as any)[data.slot] = data.action;
        if (data.profile === 'MAC') (this.currentStatus as any)[`mac_${data.slot}`] = data.action;
        if (data.profile === 'TV') (this.currentStatus as any)[`tv_${data.slot}`] = data.action;
        this.notifyStatus();
      }
      return { ok: true, offline: true, message: 'Saved locally. Connect USB cable to flash to ESP32.' };
    }

    throw new Error('Please connect your Studio MacroPad via USB cable.');
  }

  private handleResponse(path: string, data: any, res: any) {
    if (path === '/api/status' && res && res.profiles) {
      this.currentStatus = {
        ...res,
        device: {
          ...res.device,
          connection_type: 'usb'
        }
      };
      this.notifyStatus();
    } else if (path === '/api/customizer/save' && res.ok && this.currentStatus) {
      const profile = this.currentStatus.profiles.items.find(p => p.id === data.profile);
      if (profile) {
        (profile.controls as any)[data.slot] = data.action;
        if (data.profile === 'MAC') (this.currentStatus as any)[`mac_${data.slot}`] = data.action;
        if (data.profile === 'TV') (this.currentStatus as any)[`tv_${data.slot}`] = data.action;
        this.notifyStatus();
      }
    } else if (path === '/api/token/save' && res.ok && this.currentStatus) {
      this.currentStatus.tv_ip = data.tv_ip;
      this.currentStatus.tv_port = data.tv_port;
      if (data.token) {
        this.currentStatus.has_auth = true;
        this.currentStatus.tv.paired = true;
      }
      this.notifyStatus();
    }
  }

  public async dispatchSequence(actions: string[], delayMs = 60): Promise<boolean> {
    for (const act of actions) {
      if (!act) continue;
      await this.request('/api/test/action', { action: act });
      if (actions.length > 1) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
    return true;
  }

  public async setMode(mode: ProfileMode) {
    this.currentStatus.profiles.active = mode;
    this.emitToast(`Profile: ${mode === 'MAC' ? 'Mac' : 'TV'}`);
    this.notifyStatus();
  }
}

export const hardwareDriver = new HardwareDriver();
