/**
 * Studio MacroPad - Physical Hardware Protocol & Type Definitions
 * Matched 1:1 with ESP32 Firmware (v3.2-PRO)
 */

export type SlotId = 'b1' | 'b2' | 'b3' | 'b4' | 'dial';
export type ProfileMode = 'MAC' | 'TV';
export type ConnectionMode = 'usb' | 'disconnected';

export interface MacropodProfile {
  id: ProfileMode;
  name: string;
  controls: {
    b1: string;
    b2: string;
    b3: string;
    b4: string;
    dial: string;
  };
}

export interface FirmwareStatus {
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
  };
  tv: {
    configured: boolean;
    paired: boolean;
    host: string;
    port: number;
  };
  profiles: {
    active: ProfileMode;
    items: MacropodProfile[];
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

export interface ActionInfo {
  id: string;
  name: string;
  description: string;
  category: 'mac' | 'win' | 'media' | 'tv' | 'app' | 'custom' | 'text';
}
