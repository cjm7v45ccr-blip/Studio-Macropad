/**
 * Hardware Driver for ESP32 Studio MacroPad
 * Direct Web Serial & Wi-Fi REST Connection with Auto-Detection & Direct Auth
 */

import { FirmwareStatus, MacropodProfile, ProfileMode, SlotId } from '../types/macropod';

type StatusListener = (status: FirmwareStatus) => void;
type ToastListener = (msg: string) => void;

export const FACTORY_STATUS: FirmwareStatus = {
  ok: true,
  api_version: 1,
  device: {
    id: 'ESP32-MACROPAD',
    name: 'Studio Pad',
    firmware: '3.2-PRO',
    connection_type: 'offline'
  },
  connection: {
    wifi_connected: false,
    ip: '192.168.4.1',
    ble_connected: false
  },
  diagnostics: {
    free_heap: 245760
  },
  tv: {
    configured: false,
    paired: false,
    host: '192.168.1.100',
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
          dial: 'TV:MUTE'
        }
      }
    ]
  },
  wifi_connected: false,
  ip: '192.168.4.1',
  heap: 245760,
  ssid: '',
  tv_ip: '192.168.1.100',
  tv_port: 7345,
  has_auth: false,
  mac_b1: 'MEDIA:PLAY_PAUSE',
  mac_b2: 'KEY:F13',
  mac_b3: 'KEY:F14',
  mac_b4: 'KEY:F15',
  mac_dial: 'MEDIA:MUTE',
  tv_b1: 'TV:POWER',
  tv_b2: 'APP:YOUTUBE',
  tv_b3: 'APP:DISNEY',
  tv_b4: 'APP:TUBI',
  tv_dial: 'TV:MUTE'
};

class HardwareDriver {
  private serialPort: any = null;
  private serialReader: any = null;
  private serialWriter: any = null;
  private isConnectedSerial = false;
  private wifiIp: string = '';

  private statusListeners: Set<StatusListener> = new Set();
  private toastListeners: Set<ToastListener> = new Set();

  private rxBuffer = '';
  private pendingResolver: ((res: any) => void) | null = null;
  private currentStatus: FirmwareStatus = JSON.parse(JSON.stringify(FACTORY_STATUS));
  private autoSerialInitialized = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initAutoSerial();
    }
  }

  public getStatus(): FirmwareStatus {
    return this.currentStatus;
  }

  public onStatus(fn: StatusListener) {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  public onToast(fn: ToastListener) {
    this.toastListeners.add(fn);
    return () => this.toastListeners.delete(fn);
  }

  private notifyStatus() {
    this.statusListeners.forEach(fn => fn(this.currentStatus));
  }

  public emitToast(msg: string) {
    this.toastListeners.forEach(fn => fn(msg));
  }

  public get isConnected(): boolean {
    return this.isConnectedSerial || !!this.wifiIp;
  }

  public get connectionMode(): 'usb' | 'wifi' | 'disconnected' {
    if (this.isConnectedSerial) return 'usb';
    if (this.wifiIp) return 'wifi';
    return 'disconnected';
  }

  // ==========================================
  // AUTO-DETECTION: CABLE HOT-PLUG & RECONNECT
  // ==========================================
  private initAutoSerial() {
    if (!('serial' in navigator) || this.autoSerialInitialized) return;
    this.autoSerialInitialized = true;

    const navSerial = (navigator as any).serial;
    if (!navSerial) return;

    // Hot-plug auto-connect listener
    navSerial.addEventListener('connect', async (event: any) => {
      this.emitToast('Cable plugged in — Auto-connecting...');
      if (!this.isConnectedSerial && event.target) {
        await this.openPort(event.target);
      }
    });

    // Unplug listener
    navSerial.addEventListener('disconnect', () => {
      if (this.isConnectedSerial) {
        this.emitToast('Cable unplugged');
        this.disconnect();
      }
    });

    // Attempt auto-connect on load if already authorized
    this.tryAutoConnect();
  }

  public async tryAutoConnect(): Promise<boolean> {
    if (!('serial' in navigator)) return false;
    try {
      const ports = await (navigator as any).serial.getPorts();
      if (ports && ports.length > 0 && !this.isConnectedSerial) {
        // Automatically open the first previously authorized port
        return await this.openPort(ports[0]);
      }
    } catch (_) {}
    return false;
  }

  private async openPort(port: any): Promise<boolean> {
    try {
      if (this.isConnectedSerial) return true;
      await port.open({ baudRate: 115200 });
      this.serialPort = port;
      this.serialWriter = port.writable.getWriter();
      this.isConnectedSerial = true;

      this.readSerialStream(port);
      this.emitToast('MacroPad USB Connected');

      // Request live device state from physical ESP32
      await this.request('/api/status').catch(() => {});
      return true;
    } catch (err: any) {
      this.isConnectedSerial = false;
      return false;
    }
  }

  // ==========================================
  // HARDWARE CONNECTIVITY: WEB SERIAL (USB)
  // ==========================================
  public async connectSerial(): Promise<boolean> {
    if (!('serial' in navigator)) {
      throw new Error('Web Serial is supported in Google Chrome, Edge, and Brave browsers.');
    }

    try {
      const port = await (navigator as any).serial.requestPort();
      return await this.openPort(port);
    } catch (err: any) {
      if (err.name === 'NotFoundError') return false;
      throw err;
    }
  }

  private async readSerialStream(port: any) {
    const textDecoder = new TextDecoderStream();
    port.readable.pipeTo(textDecoder.writable);
    this.serialReader = textDecoder.readable.getReader();

    try {
      while (true) {
        const { value, done } = await this.serialReader.read();
        if (done) break;
        if (value) {
          this.rxBuffer += value;
          if (this.rxBuffer.includes('\n')) {
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
        }
      }
    } catch (_) {
    } finally {
      this.disconnect();
    }
  }

  // ==========================================
  // HARDWARE CONNECTIVITY: WI-FI HTTP
  // ==========================================
  public async connectWifi(ip: string): Promise<boolean> {
    this.wifiIp = ip.trim();
    try {
      const res = await this.request('/api/status');
      if (res && res.ok) {
        this.emitToast(`Connected: ${ip}`);
        return true;
      }
      this.wifiIp = '';
      return false;
    } catch (e: any) {
      this.wifiIp = '';
      throw new Error(`Could not reach MacroPad at ${ip}: ${e.message}`);
    }
  }

  public async disconnect() {
    try {
      if (this.serialReader) {
        await this.serialReader.cancel().catch(() => {});
        this.serialReader.releaseLock();
        this.serialReader = null;
      }
      if (this.serialWriter) {
        this.serialWriter.releaseLock();
        this.serialWriter = null;
      }
      if (this.serialPort) {
        await this.serialPort.close().catch(() => {});
        this.serialPort = null;
      }
    } catch (_) {}

    this.isConnectedSerial = false;
    this.wifiIp = '';
    this.emitToast('Disconnected');
    this.notifyStatus();
  }

  // ==========================================
  // DIRECT PHYSICAL REQUEST ENGINE
  // ==========================================
  public async request(path: string, data: Record<string, any> = {}): Promise<any> {
    // Web Serial Execution
    if (this.isConnectedSerial && this.serialWriter) {
      return new Promise(async (resolve, reject) => {
        const timer = setTimeout(() => {
          if (this.pendingResolver === resolve) {
            this.pendingResolver = null;
            reject(new Error('Hardware timeout'));
          }
        }, 5000);

        this.pendingResolver = (res) => {
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

    // Wi-Fi HTTP Execution
    if (this.wifiIp) {
      const url = `http://${this.wifiIp}${path}`;
      const method = path.startsWith('/api/status') || path === '/api/config/export' ? 'GET' : 'POST';
      const opts: RequestInit = {
        method,
        headers: { 'Content-Type': 'application/json' }
      };
      if (method === 'POST') opts.body = JSON.stringify(data);

      const res = await fetch(url, opts);
      const json = await res.json();
      this.handleResponse(path, data, json);
      return json;
    }

    // If offline, still update in-memory layout for preview
    if (path === '/api/customizer/save') {
      const profile = this.currentStatus.profiles.items.find(p => p.id === data.profile);
      if (profile) {
        (profile.controls as any)[data.slot] = data.action;
        if (data.profile === 'MAC') (this.currentStatus as any)[`mac_${data.slot}`] = data.action;
        if (data.profile === 'TV') (this.currentStatus as any)[`tv_${data.slot}`] = data.action;
        this.notifyStatus();
      }
      return { ok: true, offline: true, message: 'Saved locally. Connect hardware to flash to ESP32.' };
    }

    throw new Error('Please connect your Studio MacroPad via USB or Wi-Fi.');
  }

  private handleResponse(path: string, data: any, res: any) {
    if (path === '/api/status' && res && res.profiles) {
      this.currentStatus = { ...res };
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
