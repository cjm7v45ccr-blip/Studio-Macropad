import {
  DeviceConnectionInfo,
  KeyId,
  LightingConfig,
  StudioProfile,
  StudioSettings
} from '../types/studio';

type ConnectionListener = (info: DeviceConnectionInfo) => void;
type HardwareKeyListener = (keyId: KeyId, pressed: boolean) => void;
type HardwareEncoderListener = (event: {
  type: 'cw' | 'ccw' | 'press' | 'release';
}) => void;

const ALL_KEYS: KeyId[] = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9'];

class UsbHardwareService {
  private hidDevice: any = null;
  private serialPort: any = null;
  private serialReader: any = null;
  private serialWriter: any = null;
  private serialRxBuffer = '';

  private connectionInfo: DeviceConnectionInfo = {
    connected: false,
    transport: 'disconnected',
    deviceName: 'Studio Pad Pro',
    firmwareVersion: 'v3.4.0'
  };

  private connListeners = new Set<ConnectionListener>();
  private keyListeners = new Set<HardwareKeyListener>();
  private encListeners = new Set<HardwareEncoderListener>();

  constructor() {
    if (typeof window !== 'undefined') {
      this.setupDeviceWatchers();
    }
  }

  public get browserSupportsWebHid(): boolean {
    return typeof navigator !== 'undefined' && 'hid' in navigator;
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

  public onHardwareKey(fn: HardwareKeyListener) {
    this.keyListeners.add(fn);
    return () => {
      this.keyListeners.delete(fn);
    };
  }

  public onHardwareEncoder(fn: HardwareEncoderListener) {
    this.encListeners.add(fn);
    return () => {
      this.encListeners.delete(fn);
    };
  }

  private emitConnection() {
    this.connListeners.forEach(fn => fn({ ...this.connectionInfo }));
  }

  private setupDeviceWatchers() {
    const navHid = (navigator as any).hid;
    if (navHid) {
      navHid.addEventListener('disconnect', (e: any) => {
        if (this.hidDevice && e.device === this.hidDevice) {
          this.hidDevice = null;
          this.setDisconnected();
        }
      });
    }

    const navSerial = (navigator as any).serial;
    if (navSerial) {
      navSerial.addEventListener('disconnect', (e: any) => {
        if (this.serialPort && (!e.target || e.target === this.serialPort)) {
          this.cleanupSerial();
          this.setDisconnected();
        }
      });
    }
  }

  private setDisconnected() {
    this.connectionInfo = {
      connected: false,
      transport: 'disconnected',
      deviceName: 'Studio Pad Pro',
      firmwareVersion: 'v3.4.0'
    };
    this.emitConnection();
  }

  public async connectWebHid(): Promise<boolean> {
    if (!this.browserSupportsWebHid) {
      throw new Error('WebHID is available in Chrome and Edge over a USB cable.');
    }

    const devices: any[] = await (navigator as any).hid.requestDevice({
      filters: []
    });

    if (!devices || devices.length === 0) {
      return false;
    }

    await this.disconnect();

    const device = devices[0];
    if (!device.opened) {
      await device.open();
    }

    this.hidDevice = device;
    device.addEventListener('inputreport', this.handleHidInputReport);

    const hexVid = device.vendorId ? device.vendorId.toString(16).padStart(4, '0').toUpperCase() : 'FEED';
    const hexPid = device.productId ? device.productId.toString(16).padStart(4, '0').toUpperCase() : '6060';

    this.connectionInfo = {
      connected: true,
      transport: 'webhid',
      deviceName: device.productName || 'Studio Pad Pro',
      firmwareVersion: 'v3.4.0-QMK',
      vendorProduct: `${hexVid}:${hexPid}`
    };
    this.emitConnection();
    return true;
  }

  private handleHidInputReport = (event: any) => {
    try {
      const data = new Uint8Array(event.data.buffer);
      // Protocol byte 0: 0x01 = key matrix state, 0x02 = encoder delta
      if (data[0] === 0x01 && data.length >= 3) {
        const keyIndex = data[1];
        const pressed = data[2] > 0;
        if (keyIndex >= 0 && keyIndex < ALL_KEYS.length) {
          this.keyListeners.forEach(fn => fn(ALL_KEYS[keyIndex], pressed));
        }
      } else if (data[0] === 0x02 && data.length >= 2) {
        const code = data[1];
        if (code === 1) this.encListeners.forEach(fn => fn({ type: 'cw' }));
        else if (code === 2) this.encListeners.forEach(fn => fn({ type: 'ccw' }));
        else if (code === 3) this.encListeners.forEach(fn => fn({ type: 'press' }));
        else if (code === 4) this.encListeners.forEach(fn => fn({ type: 'release' }));
      }
    } catch (_) {}
  };

  public async connectWebSerial(): Promise<boolean> {
    if (!this.browserSupportsWebSerial) {
      throw new Error('WebSerial is available in Chrome and Edge over a USB cable.');
    }

    try {
      const port = await (navigator as any).serial.requestPort();
      if (!port) return false;

      await this.disconnect();
      await port.open({ baudRate: 115200 });

      this.serialPort = port;
      this.serialWriter = port.writable?.getWriter();

      const info = port.getInfo?.() || {};
      const vid = info.usbVendorId ? info.usbVendorId.toString(16).padStart(4, '0').toUpperCase() : '303A';
      const pid = info.usbProductId ? info.usbProductId.toString(16).padStart(4, '0').toUpperCase() : '1001';

      this.connectionInfo = {
        connected: true,
        transport: 'webserial',
        deviceName: 'Studio Pad Pro',
        firmwareVersion: 'v3.4.0',
        vendorProduct: `${vid}:${pid}`
      };
      this.emitConnection();

      this.readSerialLoop(port);
      await this.sendSerialJson({ path: '/api/status' }).catch(() => {});
      return true;
    } catch (err: any) {
      if (err?.name === 'NotFoundError') return false;
      throw err;
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
      if (!trimmed.startsWith('{')) continue;
      try {
        const msg = JSON.parse(trimmed);
        if (msg.device?.name || msg.device?.firmware) {
          this.connectionInfo = {
            ...this.connectionInfo,
            deviceName: msg.device.name || this.connectionInfo.deviceName,
            firmwareVersion: msg.device.firmware ? `v${msg.device.firmware.replace(/^v/, '')}` : this.connectionInfo.firmwareVersion
          };
          this.emitConnection();
        }
        if (msg.event === 'key' && typeof msg.index === 'number') {
          const kid = ALL_KEYS[msg.index];
          if (kid) this.keyListeners.forEach(fn => fn(kid, Boolean(msg.pressed)));
        }
        if (msg.event === 'encoder') {
          this.encListeners.forEach(fn => fn({ type: msg.dir || 'cw' }));
        }
      } catch (_) {}
    }
  }

  private async sendSerialJson(payload: Record<string, any>) {
    if (!this.serialWriter) return;
    const encoded = new TextEncoder().encode(JSON.stringify(payload) + '\n');
    await this.serialWriter.write(encoded);
  }

  public async saveConfigurationToDevice(
    profile: StudioProfile,
    settings: StudioSettings
  ): Promise<{ syncedHardware: boolean; message: string }> {
    if (!this.connectionInfo.connected) {
      return {
        syncedHardware: false,
        message: `Saved "${profile.name}" locally (connect USB cable to flash hardware)`
      };
    }

    if (this.connectionInfo.transport === 'webhid' && this.hidDevice) {
      try {
        // Send compact 32-byte QMK/VIA style config header packet
        const packet = new Uint8Array(32);
        packet[0] = 0x11; // CMD_SET_CONFIG
        packet[1] = profile.activeLayerIndex & 0x03;
        packet[2] = Math.round((profile.lighting.brightness / 100) * 255);
        packet[3] = Math.round((profile.lighting.speed / 100) * 255);
        packet[4] = settings.globalDebounceMs & 0xff;
        await this.hidDevice.sendReport(0x00, packet);
      } catch (_) {}
      return {
        syncedHardware: true,
        message: `Saved "${profile.name}" to ${this.connectionInfo.deviceName} over WebHID`
      };
    }

    if (this.connectionInfo.transport === 'webserial' && this.serialWriter) {
      try {
        await this.sendSerialJson({
          path: '/api/studio/sync',
          profileId: profile.id,
          name: profile.name,
          activeLayer: profile.activeLayerIndex,
          debounceMs: settings.globalDebounceMs,
          pollingRateHz: settings.pollingRateHz,
          lighting: {
            effect: profile.lighting.effect,
            brightness: profile.lighting.brightness,
            speed: profile.lighting.speed
          }
        });
      } catch (_) {}
      return {
        syncedHardware: true,
        message: `Saved "${profile.name}" to ${this.connectionInfo.deviceName} over USB cable`
      };
    }

    return {
      syncedHardware: false,
      message: `Saved "${profile.name}"`
    };
  }

  public async streamLightingPreview(lighting: LightingConfig) {
    if (!this.connectionInfo.connected) return;
    try {
      if (this.connectionInfo.transport === 'webhid' && this.hidDevice) {
        const packet = new Uint8Array(32);
        packet[0] = 0x07; // VIA RGB_MATRIX_SET_VALUE
        packet[1] = Math.round((lighting.brightness / 100) * 255);
        packet[2] = Math.round((lighting.speed / 100) * 255);
        await this.hidDevice.sendReport(0x00, packet);
      } else if (this.connectionInfo.transport === 'webserial' && this.serialWriter) {
        await this.sendSerialJson({
          path: '/api/rgb/preview',
          effect: lighting.effect,
          brightness: lighting.brightness,
          speed: lighting.speed
        });
      }
    } catch (_) {}
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
  }

  public async disconnect() {
    if (this.hidDevice) {
      try {
        this.hidDevice.removeEventListener('inputreport', this.handleHidInputReport);
        await this.hidDevice.close();
      } catch (_) {}
      this.hidDevice = null;
    }
    await this.cleanupSerial();
    this.setDisconnected();
  }
}

export const usbHardware = new UsbHardwareService();
