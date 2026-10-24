/**
 * Hardware Driver for ESP32 Studio MacroPad Pro
 * Direct Web Serial (USB), Web Bluetooth (BLE UART/HID), & Wi-Fi REST Connection
 * Features:
 * - Automatic Open-Channel Discovery (USB -> Bluetooth -> Wi-Fi) when unplugged
 * - Automatic Cable Priority Handoff (Bluetooth -> USB Cable when plugged in)
 */

import {
  AutoScanChannel,
  ConnectionMode,
  FirmwareStatus,
  ProfileMode,
} from '../types/macropod';

type StatusListener = (status: FirmwareStatus) => void;
type ToastListener = (msg: string) => void;
type BannerListener = (msg: string, type: 'success' | 'error') => void;

// Nordic UART Service (Standard ESP32 BLE UART) & Custom ESP32 GATT UUIDs
const BLE_NUS_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const BLE_NUS_RX_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // Host -> ESP32 (Write)
const BLE_NUS_TX_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // ESP32 -> Host (Notify)

const BLE_ESP32_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const BLE_ESP32_CHAR_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

const SAVED_WIFI_IP_KEY = 'studio_pad_last_wifi_ip';
const SAVED_BLE_ID_KEY = 'studio_pad_last_ble_id';

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
  // USB Web Serial State
  private serialPort: any = null;
  private serialReader: any = null;
  private serialWriter: any = null;
  private isConnectedSerial = false;
  private isOpeningSerial = false;

  // Web Bluetooth State
  private bleDevice: any = null;
  private bleServer: any = null;
  private bleTxChar: any = null;
  private bleRxChar: any = null;
  private isConnectedBle = false;
  private isOpeningBle = false;
  private bleDisconnectHandler: (() => void) | null = null;
  private bleNotifyHandler: ((event: any) => void) | null = null;
  private watchedBleDeviceIds: Set<string> = new Set();

  // Wi-Fi HTTP State
  private wifiIp: string = '';

  // Auto-Discovery & Priority Management
  private autoScanChannel: AutoScanChannel = 'idle';
  private isScanningOpenTransports = false;
  private manualDisconnectRequested = false;
  private autoTransportInitialized = false;
  private autoDiscoveryInterval: number | null = null;
  private cablePriorityInterval: number | null = null;

  // Listeners
  private statusListeners: Set<StatusListener> = new Set();
  private toastListeners: Set<ToastListener> = new Set();
  private bannerListeners: Set<BannerListener> = new Set();

  // Stream Buffers & RPC Resolver
  private rxBuffer = '';
  private bleRxBuffer = '';
  private pendingResolver: ((res: any) => void) | null = null;
  private currentStatus: FirmwareStatus = JSON.parse(JSON.stringify(FACTORY_STATUS));

  constructor() {
    if (typeof window !== 'undefined') {
      this.initAutoTransportManager();
    }
  }

  public getStatus(): FirmwareStatus {
    return this.currentStatus;
  }

  public get autoScanState(): AutoScanChannel {
    return this.autoScanChannel;
  }

  public get bleDeviceName(): string {
    return this.bleDevice?.name || 'Studio Pad BLE';
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

  private emitBanner(msg: string, type: 'success' | 'error' = 'success') {
    this.bannerListeners.forEach(fn => fn(msg, type));
  }

  private setAutoScanChannel(channel: AutoScanChannel) {
    if (this.autoScanChannel !== channel) {
      this.autoScanChannel = channel;
      this.notifyStatus();
    }
  }

  public get isConnected(): boolean {
    return this.isConnectedSerial || this.isConnectedBle || !!this.wifiIp;
  }

  public get connectionMode(): ConnectionMode {
    if (this.isConnectedSerial) return 'usb';
    if (this.isConnectedBle) return 'bluetooth';
    if (this.wifiIp) return 'wifi';
    return 'disconnected';
  }

  // ==========================================
  // AUTO-DETECTION & CABLE PRIORITY HANDOFF
  // ==========================================
  private initAutoTransportManager() {
    if (this.autoTransportInitialized) return;
    this.autoTransportInitialized = true;

    const navSerial = (navigator as any).serial;
    if (navSerial) {
      // Instant USB hot-plug listener: switches from Bluetooth/Wi-Fi to Cable immediately!
      navSerial.addEventListener('connect', async (event: any) => {
        this.manualDisconnectRequested = false;
        const wasBluetooth = this.isConnectedBle;
        if (!this.isConnectedSerial) {
          this.emitToast(wasBluetooth ? 'Cable detected — Switching to USB...' : 'Cable plugged in...');
          const targetPort = event.target || (await navSerial.getPorts().catch(() => []))[0];
          if (targetPort) {
            await this.openPort(targetPort, { switchedFromBle: wasBluetooth });
          }
        }
      });

      // Instant USB unplug listener: falls back to open Bluetooth / Wi-Fi automatically
      navSerial.addEventListener('disconnect', async (event: any) => {
        if (this.isConnectedSerial && (!event.target || event.target === this.serialPort)) {
          await this.cleanupSerial();
          this.currentStatus.device.connection_type = 'offline';
          this.emitToast('Cable unplugged — Checking Bluetooth...');
          this.notifyStatus();

          if (!this.manualDisconnectRequested) {
            setTimeout(() => {
              this.tryAutoConnectOpenTransport();
            }, 350);
          }
        }
      });
    }

    // Immediate startup scan: checks USB first, then Bluetooth, then saved Wi-Fi
    this.tryAutoConnectOpenTransport();

    // Background open-channel scanner while disconnected
    this.autoDiscoveryInterval = window.setInterval(() => {
      if (!this.isConnected && !this.manualDisconnectRequested && !this.isScanningOpenTransports) {
        this.tryAutoConnectOpenTransport();
      }
    }, 4000);

    // Cable priority watcher: if currently on Bluetooth (or Wi-Fi) and a physical USB cable
    // becomes available, automatically switch to the wired USB connection.
    this.cablePriorityInterval = window.setInterval(() => {
      if (
        !this.isConnectedSerial &&
        !this.isOpeningSerial &&
        (this.isConnectedBle || !!this.wifiIp)
      ) {
        this.tryAutoConnectSerial({ requireUsbHardwareId: true });
      }
    }, 2500);
  }

  /**
   * Automatically checks which transport is open and connects in priority order:
   * 1. USB Cable (Web Serial)
   * 2. Bluetooth LE (Web Bluetooth previously paired / advertising devices)
   * 3. Wi-Fi REST (Previously connected IP)
   */
  public async tryAutoConnectOpenTransport(): Promise<boolean> {
    if (this.isConnected || this.isScanningOpenTransports || this.manualDisconnectRequested) {
      return this.isConnected;
    }

    this.isScanningOpenTransports = true;
    try {
      // 1. Check physical USB cable first
      this.setAutoScanChannel('usb');
      const connectedUsb = await this.tryAutoConnectSerial({ requireUsbHardwareId: false });
      if (connectedUsb) {
        this.setAutoScanChannel('idle');
        return true;
      }

      // 2. If not plugged in, check if Bluetooth is open & reachable
      this.setAutoScanChannel('bluetooth');
      const connectedBle = await this.tryAutoConnectBluetooth();
      if (connectedBle) {
        this.setAutoScanChannel('idle');
        return true;
      }

      // 3. Check saved Wi-Fi endpoint if previously configured
      this.setAutoScanChannel('wifi');
      const connectedWifi = await this.tryAutoConnectWifi();
      if (connectedWifi) {
        this.setAutoScanChannel('idle');
        return true;
      }

      this.setAutoScanChannel('idle');
      return false;
    } finally {
      this.isScanningOpenTransports = false;
      if (this.isConnected) {
        this.setAutoScanChannel('idle');
      }
    }
  }

  public async tryAutoConnectSerial(
    opts: { requireUsbHardwareId?: boolean } = {}
  ): Promise<boolean> {
    if (!('serial' in navigator) || this.isConnectedSerial || this.isOpeningSerial) {
      return this.isConnectedSerial;
    }

    try {
      const ports: any[] = await (navigator as any).serial.getPorts();
      if (!ports || ports.length === 0) return false;

      // Prioritize physical USB-C serial ports (ports reporting usbVendorId)
      const usbPorts = ports.filter(p => {
        const info = p.getInfo?.() || {};
        return info.usbVendorId !== undefined;
      });

      const candidates = opts.requireUsbHardwareId
        ? usbPorts
        : [...usbPorts, ...ports.filter(p => !usbPorts.includes(p))];

      for (const port of candidates) {
        const wasBluetooth = this.isConnectedBle;
        const ok = await this.openPort(port, { switchedFromBle: wasBluetooth });
        if (ok) return true;
      }
    } catch (_) {}
    return false;
  }

  public async tryAutoConnectBluetooth(): Promise<boolean> {
    if (this.isConnectedSerial || this.isConnectedBle || this.isOpeningBle) {
      return this.isConnectedBle;
    }

    const navBle = typeof navigator !== 'undefined' ? (navigator as any).bluetooth : null;
    if (!navBle || typeof navBle.getDevices !== 'function') return false;

    try {
      const devices: any[] = await navBle.getDevices();
      if (!devices || devices.length === 0) return false;

      const lastBleId = this.safeGetStorage(SAVED_BLE_ID_KEY);
      const sorted = [...devices].sort((a, b) => {
        if (lastBleId && a.id === lastBleId) return -1;
        if (lastBleId && b.id === lastBleId) return 1;
        return 0;
      });

      for (const device of sorted) {
        // Watch advertisements so waking up the MacroPad immediately triggers auto-connect
        this.setupBleAdvertisementWatcher(device);

        const ok = await this.openBleDevice(device, { silent: true, timeoutMs: 3200 });
        if (ok) return true;
      }
    } catch (_) {}
    return false;
  }

  private setupBleAdvertisementWatcher(device: any) {
    if (!device || !device.id || this.watchedBleDeviceIds.has(device.id)) return;
    if (typeof device.watchAdvertisements !== 'function') return;

    this.watchedBleDeviceIds.add(device.id);
    device.addEventListener('advertisementreceived', async () => {
      if (!this.isConnected && !this.manualDisconnectRequested) {
        await this.openBleDevice(device, { silent: true, timeoutMs: 4000 });
      }
    });
    device.watchAdvertisements().catch(() => {
      this.watchedBleDeviceIds.delete(device.id);
    });
  }

  private async tryAutoConnectWifi(): Promise<boolean> {
    if (this.isConnected) return true;
    const savedIp = this.safeGetStorage(SAVED_WIFI_IP_KEY);
    if (!savedIp) return false;

    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 1600);
      const res = await fetch(`http://${savedIp}/api/status`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!res.ok || this.isConnectedSerial || this.isConnectedBle) return false;
      const json = await res.json();
      if (json && json.ok) {
        this.wifiIp = savedIp;
        this.currentStatus.wifi_connected = true;
        this.currentStatus.connection.wifi_connected = true;
        this.currentStatus.device.connection_type = 'wifi';
        this.handleResponse('/api/status', {}, json);
        this.emitToast(`Auto-connected Wi-Fi (${savedIp})`);
        this.notifyStatus();
        return true;
      }
    } catch (_) {}
    return false;
  }

  // ==========================================
  // HARDWARE CONNECTIVITY: WEB SERIAL (USB)
  // ==========================================
  public async connectSerial(): Promise<boolean> {
    if (!('serial' in navigator)) {
      throw new Error('Web Serial is supported in Google Chrome, Edge, and Brave browsers.');
    }

    this.manualDisconnectRequested = false;
    try {
      const port = await (navigator as any).serial.requestPort();
      const wasBluetooth = this.isConnectedBle;
      return await this.openPort(port, { switchedFromBle: wasBluetooth });
    } catch (err: any) {
      if (err.name === 'NotFoundError') return false;
      throw err;
    }
  }

  private async openPort(
    port: any,
    opts: { switchedFromBle?: boolean } = {}
  ): Promise<boolean> {
    if (this.isConnectedSerial) return true;
    if (this.isOpeningSerial || !port) return false;

    this.isOpeningSerial = true;
    try {
      const wasBluetooth = opts.switchedFromBle || this.isConnectedBle;

      await port.open({ baudRate: 115200 });

      // Cable takes priority: cleanly close Bluetooth or Wi-Fi session upon USB connection
      if (this.isConnectedBle) {
        await this.cleanupBluetooth();
      }
      if (this.wifiIp) {
        this.wifiIp = '';
      }

      this.serialPort = port;
      this.serialWriter = port.writable.getWriter();
      this.isConnectedSerial = true;
      this.currentStatus.connection.ble_connected = false;
      this.currentStatus.device.connection_type = 'usb';
      this.setAutoScanChannel('idle');
      this.notifyStatus();

      this.readSerialStream(port);

      if (wasBluetooth) {
        this.emitToast('USB Cable Connected');
        this.emitBanner('Cable plugged in — Switched from Bluetooth to USB', 'success');
      } else {
        this.emitToast('MacroPad USB Connected');
      }

      // Sync live state from physical ESP32 over USB
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
          this.processIncomingJsonBuffer('serial');
        }
      }
    } catch (_) {
    } finally {
      if (this.serialPort === port && this.isConnectedSerial) {
        await this.cleanupSerial();
        this.currentStatus.device.connection_type = 'offline';
        this.notifyStatus();

        if (!this.manualDisconnectRequested) {
          this.emitToast('USB Disconnected — Scanning Bluetooth...');
          setTimeout(() => {
            this.tryAutoConnectOpenTransport();
          }, 400);
        }
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

  // ==========================================
  // HARDWARE CONNECTIVITY: WEB BLUETOOTH (BLE)
  // ==========================================
  public async connectBluetooth(): Promise<boolean> {
    const navBle = typeof navigator !== 'undefined' ? (navigator as any).bluetooth : null;
    if (!navBle) {
      throw new Error('Web Bluetooth is supported in Google Chrome, Edge, and Brave browsers.');
    }

    this.manualDisconnectRequested = false;

    try {
      const device = await navBle.requestDevice({
        filters: [
          { services: [BLE_NUS_SERVICE_UUID] },
          { services: [BLE_ESP32_SERVICE_UUID] },
          { namePrefix: 'Studio' },
          { namePrefix: 'MacroPad' },
          { namePrefix: 'ESP32' },
          { namePrefix: 'NimBLE' }
        ],
        optionalServices: [
          BLE_NUS_SERVICE_UUID,
          BLE_ESP32_SERVICE_UUID,
          'device_information',
          'battery_service'
        ]
      });

      this.setupBleAdvertisementWatcher(device);
      return await this.openBleDevice(device, { silent: false, timeoutMs: 8000 });
    } catch (err: any) {
      if (err.name === 'NotFoundError') return false;
      throw err;
    }
  }

  private async openBleDevice(
    device: any,
    opts: { silent?: boolean; timeoutMs?: number } = {}
  ): Promise<boolean> {
    // If USB cable is already plugged in, USB always takes priority
    if (this.isConnectedSerial) {
      if (!opts.silent) {
        this.emitBanner('USB cable is active — Wired connection takes priority over Bluetooth', 'success');
      }
      return true;
    }
    if (this.isConnectedBle && this.bleDevice?.id === device?.id && this.bleServer?.connected) {
      return true;
    }
    if (this.isOpeningBle || !device || !device.gatt) return false;

    this.isOpeningBle = true;
    try {
      await this.cleanupBluetooth();

      const timeoutMs = opts.timeoutMs ?? 5000;
      const server: any = await Promise.race([
        device.gatt.connect(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Bluetooth connection timeout')), timeoutMs)
        )
      ]);

      // Race check: if cable was plugged in during BLE GATT handshake, abort BLE and keep USB
      if (this.isConnectedSerial) {
        try {
          server.disconnect();
        } catch (_) {}
        return false;
      }

      this.bleDevice = device;
      this.bleServer = server;
      this.bleTxChar = null;
      this.bleRxChar = null;

      // Discover Nordic UART Service (NUS) or Custom ESP32 Service if exposed
      try {
        const nusService = await server.getPrimaryService(BLE_NUS_SERVICE_UUID).catch(() => null);
        if (nusService) {
          this.bleTxChar = await nusService.getCharacteristic(BLE_NUS_RX_UUID).catch(() => null);
          this.bleRxChar = await nusService.getCharacteristic(BLE_NUS_TX_UUID).catch(() => null);
        } else {
          const customService = await server.getPrimaryService(BLE_ESP32_SERVICE_UUID).catch(() => null);
          if (customService) {
            const rwChar = await customService.getCharacteristic(BLE_ESP32_CHAR_UUID).catch(() => null);
            this.bleTxChar = rwChar;
            this.bleRxChar = rwChar;
          }
        }

        if (this.bleRxChar && typeof this.bleRxChar.startNotifications === 'function') {
          await this.bleRxChar.startNotifications().catch(() => {});
          this.bleNotifyHandler = (event: any) => {
            const dv = event?.target?.value;
            if (!dv) return;
            const chunk = new TextDecoder().decode(dv.buffer ? new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength) : dv);
            this.bleRxBuffer += chunk;
            this.processIncomingJsonBuffer('ble');
          };
          this.bleRxChar.addEventListener('characteristicvaluechanged', this.bleNotifyHandler);
        }
      } catch (_) {
        // Standard BLE HID MacroPads may restrict raw GATT characteristics; keep BLE link active
      }

      this.bleDisconnectHandler = () => {
        const wasBle = this.isConnectedBle;
        this.cleanupBluetooth();
        if (wasBle && !this.isConnectedSerial) {
          this.currentStatus.device.connection_type = 'offline';
          this.emitToast('Bluetooth Disconnected');
          this.notifyStatus();

          if (!this.manualDisconnectRequested) {
            setTimeout(() => {
              this.tryAutoConnectOpenTransport();
            }, 600);
          }
        }
      };
      device.addEventListener('gattserverdisconnected', this.bleDisconnectHandler);

      if (device.id) {
        this.safeSetStorage(SAVED_BLE_ID_KEY, device.id);
      }

      this.wifiIp = '';
      this.isConnectedBle = true;
      this.currentStatus.connection.ble_connected = true;
      this.currentStatus.device.connection_type = 'bluetooth';
      if (device.name) {
        this.currentStatus.device.name = device.name;
      }
      this.setAutoScanChannel('idle');
      this.emitToast('MacroPad Bluetooth Connected');
      if (opts.silent) {
        this.emitBanner(`Auto-connected to ${device.name || 'Studio MacroPad'} via Bluetooth`, 'success');
      }
      this.notifyStatus();

      if (this.bleTxChar) {
        await this.request('/api/status').catch(() => {});
      }

      return true;
    } catch (err: any) {
      await this.cleanupBluetooth();
      if (!opts.silent) {
        throw err;
      }
      return false;
    } finally {
      this.isOpeningBle = false;
    }
  }

  private async cleanupBluetooth() {
    try {
      if (this.bleRxChar && this.bleNotifyHandler) {
        try {
          this.bleRxChar.removeEventListener('characteristicvaluechanged', this.bleNotifyHandler);
        } catch (_) {}
      }
      if (this.bleDevice && this.bleDisconnectHandler) {
        try {
          this.bleDevice.removeEventListener('gattserverdisconnected', this.bleDisconnectHandler);
        } catch (_) {}
      }
      if (this.bleServer && this.bleServer.connected) {
        try {
          this.bleServer.disconnect();
        } catch (_) {}
      }
    } catch (_) {}

    this.bleNotifyHandler = null;
    this.bleDisconnectHandler = null;
    this.bleTxChar = null;
    this.bleRxChar = null;
    this.bleServer = null;
    this.isConnectedBle = false;
    this.currentStatus.connection.ble_connected = false;
  }

  private processIncomingJsonBuffer(source: 'serial' | 'ble') {
    const buf = source === 'serial' ? this.rxBuffer : this.bleRxBuffer;
    if (buf.includes('\n')) {
      const lines = buf.split('\n');
      const remainder = lines.pop() || '';
      if (source === 'serial') this.rxBuffer = remainder;
      else this.bleRxBuffer = remainder;

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
    } else if (source === 'ble') {
      const trimmed = buf.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}') && this.pendingResolver) {
        try {
          const json = JSON.parse(trimmed);
          this.bleRxBuffer = '';
          const resolve = this.pendingResolver;
          this.pendingResolver = null;
          resolve(json);
        } catch (_) {}
      }
    }
  }

  // ==========================================
  // HARDWARE CONNECTIVITY: WI-FI HTTP
  // ==========================================
  public async connectWifi(ip: string): Promise<boolean> {
    this.manualDisconnectRequested = false;
    const cleanIp = ip.trim();
    this.wifiIp = cleanIp;
    try {
      const res = await this.request('/api/status');
      if (res && res.ok) {
        this.safeSetStorage(SAVED_WIFI_IP_KEY, cleanIp);
        this.currentStatus.wifi_connected = true;
        this.currentStatus.connection.wifi_connected = true;
        this.currentStatus.device.connection_type = 'wifi';
        this.emitToast(`Connected: ${cleanIp}`);
        this.notifyStatus();
        return true;
      }
      this.wifiIp = '';
      return false;
    } catch (e: any) {
      this.wifiIp = '';
      throw new Error(`Could not reach MacroPad at ${cleanIp}: ${e.message}`);
    }
  }

  public async disconnect() {
    this.manualDisconnectRequested = true;
    await this.cleanupSerial();
    await this.cleanupBluetooth();
    this.wifiIp = '';
    this.currentStatus.device.connection_type = 'offline';
    this.setAutoScanChannel('idle');
    this.emitToast('Disconnected');
    this.notifyStatus();
  }

  // ==========================================
  // DIRECT PHYSICAL REQUEST ENGINE
  // ==========================================
  public async request(path: string, data: Record<string, any> = {}): Promise<any> {
    // 1. Web Serial Execution (Highest Priority)
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

    // 2. Web Bluetooth BLE Execution
    if (this.isConnectedBle) {
      if (this.bleTxChar) {
        return new Promise(async (resolve, reject) => {
          const payloadBytes = new TextEncoder().encode(JSON.stringify({ path, ...data }) + '\n');
          const hasNotifications = !!this.bleRxChar;

          const timer = setTimeout(() => {
            if (this.pendingResolver === resolve) {
              this.pendingResolver = null;
              // If BLE device accepted the GATT write without sending a JSON reply, resolve optimistically
              const fallbackRes = { ok: true };
              this.handleResponse(path, data, fallbackRes);
              resolve(fallbackRes);
            }
          }, hasNotifications ? 2800 : 150);

          this.pendingResolver = res => {
            clearTimeout(timer);
            this.handleResponse(path, data, res);
            resolve(res);
          };

          try {
            const chunkSize = 180;
            for (let i = 0; i < payloadBytes.length; i += chunkSize) {
              const slice = payloadBytes.slice(i, i + chunkSize);
              if (this.bleTxChar.properties?.writeWithoutResponse && this.bleTxChar.writeValueWithoutResponse) {
                await this.bleTxChar.writeValueWithoutResponse(slice);
              } else {
                await this.bleTxChar.writeValue(slice);
              }
            }
          } catch (err) {
            clearTimeout(timer);
            this.pendingResolver = null;
            reject(err);
          }
        });
      }

      // Connected BLE HID device without custom UART service: sync state cleanly
      if (path === '/api/status') {
        return this.currentStatus;
      }
      const bleFallback = { ok: true };
      this.handleResponse(path, data, bleFallback);
      return bleFallback;
    }

    // 3. Wi-Fi HTTP Execution
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

    throw new Error('Please connect your Studio MacroPad via USB, Bluetooth, or Wi-Fi.');
  }

  private handleResponse(path: string, data: any, res: any) {
    if (path === '/api/status' && res && res.profiles) {
      const wasBle = this.isConnectedBle;
      this.currentStatus = {
        ...res,
        connection: {
          ...res.connection,
          ble_connected: wasBle || !!res.connection?.ble_connected
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

  private safeGetStorage(key: string): string {
    try {
      return localStorage.getItem(key) || '';
    } catch (_) {
      return '';
    }
  }

  private safeSetStorage(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch (_) {}
  }
}

export const hardwareDriver = new HardwareDriver();
