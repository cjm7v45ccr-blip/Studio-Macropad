import { extractProfileSlots } from '../hooks/useStudioState';
import {
  HARDWARE_PROFILE_IDS,
  HardwareProfileId,
  HardwareSlotId,
  OledComposerConfig,
  StudioProfile,
  StudioSettings
} from '../types/studio';
import { HARDWARE_SLOTS } from '../data/firmwareCatalog';
import { FIRMWARE_VERSION } from './version';
import { DEFAULT_GYRO_CALIBRATION } from './motionCalibration';

export const OLED_WIDTH = 128;
export const OLED_HEIGHT = 64;
export const SSD1306_BYTE_COUNT = (OLED_WIDTH * OLED_HEIGHT) / 8; // 1024 bytes
export const SSD1306_HEX_LENGTH = SSD1306_BYTE_COUNT * 2; // 2048 hex chars

export const DEFAULT_OLED_COMPOSER_CONFIG: OledComposerConfig = {
  enabled: false,
  showHostBadge: true,
  showBleStatus: true,
  showWifiStatus: true,
  showLayerHint: true,
  invertDisplay: false,
  customName: '',
  bitmapBytesHex: '00'.repeat(SSD1306_BYTE_COUNT)
};

export function normalizeSsd1306Hex(raw?: string): string {
  const cleaned = (raw || '').replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  if (cleaned.length === SSD1306_HEX_LENGTH) return cleaned;
  if (cleaned.length > SSD1306_HEX_LENGTH) return cleaned.slice(0, SSD1306_HEX_LENGTH);
  return cleaned.padEnd(SSD1306_HEX_LENGTH, '0');
}

export function blankSsd1306Hex(): string {
  return '00'.repeat(SSD1306_BYTE_COUNT);
}

export function hexToSsd1306Bytes(hex?: string): Uint8Array {
  const norm = normalizeSsd1306Hex(hex);
  const bytes = new Uint8Array(SSD1306_BYTE_COUNT);
  for (let i = 0; i < SSD1306_BYTE_COUNT; i++) {
    bytes[i] = parseInt(norm.slice(i * 2, i * 2 + 2), 16) || 0;
  }
  return bytes;
}

export function ssd1306BytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < SSD1306_BYTE_COUNT; i++) {
    const b = i < bytes.length ? bytes[i] & 0xff : 0;
    out += b.toString(16).padStart(2, '0');
  }
  return out;
}

export function getSsd1306Pixel(hex: string, x: number, y: number): boolean {
  if (x < 0 || x >= OLED_WIDTH || y < 0 || y >= OLED_HEIGHT) return false;
  const norm = normalizeSsd1306Hex(hex);
  const byteIndex = Math.floor(y / 8) * OLED_WIDTH + x;
  const byteVal = parseInt(norm.slice(byteIndex * 2, byteIndex * 2 + 2), 16) || 0;
  const bitMask = 1 << (y % 8);
  return (byteVal & bitMask) !== 0;
}

export function setSsd1306Pixel(hex: string, x: number, y: number, on: boolean): string {
  if (x < 0 || x >= OLED_WIDTH || y < 0 || y >= OLED_HEIGHT) return normalizeSsd1306Hex(hex);
  const bytes = hexToSsd1306Bytes(hex);
  const byteIndex = Math.floor(y / 8) * OLED_WIDTH + x;
  const bitMask = 1 << (y % 8);
  if (on) {
    bytes[byteIndex] |= bitMask;
  } else {
    bytes[byteIndex] &= ~bitMask;
  }
  return ssd1306BytesToHex(bytes);
}

export function invertSsd1306Hex(hex: string): string {
  const bytes = hexToSsd1306Bytes(hex);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = ~bytes[i] & 0xff;
  }
  return ssd1306BytesToHex(bytes);
}

export function imageDataToSsd1306Hex(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 128,
  floydSteinberg = false
): string {
  const w = Math.min(OLED_WIDTH, Math.max(1, Math.floor(width)));
  const h = Math.min(OLED_HEIGHT, Math.max(1, Math.floor(height)));
  const lum = new Float32Array(OLED_WIDTH * OLED_HEIGHT);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * width + x) * 4;
      const r = pixels[idx] ?? 0;
      const g = pixels[idx + 1] ?? 0;
      const b = pixels[idx + 2] ?? 0;
      const a = (pixels[idx + 3] ?? 255) / 255;
      lum[y * OLED_WIDTH + x] = (0.299 * r + 0.587 * g + 0.114 * b) * a;
    }
  }

  const bytes = new Uint8Array(SSD1306_BYTE_COUNT);
  const cutoff = Math.max(1, Math.min(254, threshold));

  for (let y = 0; y < OLED_HEIGHT; y++) {
    for (let x = 0; x < OLED_WIDTH; x++) {
      const i = y * OLED_WIDTH + x;
      const oldVal = lum[i];
      const isWhite = oldVal >= cutoff;
      const newVal = isWhite ? 255 : 0;

      if (isWhite) {
        const byteIndex = Math.floor(y / 8) * OLED_WIDTH + x;
        bytes[byteIndex] |= 1 << (y % 8);
      }

      if (floydSteinberg) {
        const err = oldVal - newVal;
        if (x + 1 < OLED_WIDTH) lum[i + 1] += err * (7 / 16);
        if (y + 1 < OLED_HEIGHT) {
          if (x > 0) lum[i + OLED_WIDTH - 1] += err * (3 / 16);
          lum[i + OLED_WIDTH] += err * (5 / 16);
          if (x + 1 < OLED_WIDTH) lum[i + OLED_WIDTH + 1] += err * (1 / 16);
        }
      }
    }
  }

  return ssd1306BytesToHex(bytes);
}

function escapeCppString(raw: string): string {
  return (raw || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

export interface ConfigHeaderInput {
  profiles: StudioProfile[];
  settings: StudioSettings;
  activeProfileId: HardwareProfileId;
  tvEnabled: boolean;
}

export function generateConfigHeader({
  profiles,
  settings,
  activeProfileId,
  tvEnabled
}: ConfigHeaderInput): string {
  const gyro = { ...DEFAULT_GYRO_CALIBRATION, ...(settings.gyroCalibration || {}) };

  const findProfile = (id: HardwareProfileId) =>
    profiles.find(p => p.id === id) || profiles[0];

  const lines: string[] = [
    '// Auto-generated by BertoPad Studio',
    `// Firmware Target: v${FIRMWARE_VERSION}`,
    `// Generated: ${new Date().toISOString()}`,
    '#pragma once',
    '#ifndef BERTOPAD_CONFIG_H',
    '#define BERTOPAD_CONFIG_H',
    '',
    `#define BERTOPAD_FW_VERSION "${escapeCppString(FIRMWARE_VERSION)}"`,
    `#define BERTOPAD_ACTIVE_PROFILE "${escapeCppString(activeProfileId)}"`,
    `#define BERTOPAD_TV_ENABLED ${tvEnabled ? 1 : 0}`,
    '',
    '// Dual Rotary Encoders & Hardware Pinout',
    '#define BERTOPAD_ENC1_CLK 32',
    '#define BERTOPAD_ENC1_DT  33',
    '#define BERTOPAD_ENC1_SW  25',
    '#define BERTOPAD_ENC2_CLK 34',
    '#define BERTOPAD_ENC2_DT  35',
    '#define BERTOPAD_ENC2_SW  15',
    '',
    '// MPU-6050 Orientation & Tilt Deadzone',
    `#define BERTOPAD_GYRO_INVERT_PITCH ${gyro.invertPitch ? 1 : 0}`,
    `#define BERTOPAD_GYRO_INVERT_ROLL ${gyro.invertRoll ? 1 : 0}`,
    `#define BERTOPAD_GYRO_SWAP_XY ${gyro.swapXY ? 1 : 0}`,
    `#define BERTOPAD_GYRO_DEADZONE_DEG ${Number(gyro.deadzoneDeg ?? 0.4).toFixed(2)}f`,
    '',
    '// Host Aliases & OS Layout Hints'
  ];

  HARDWARE_PROFILE_IDS.forEach(pid => {
    const prof = findProfile(pid);
    lines.push(`#define BERTOPAD_${pid}_NAME "${escapeCppString(prof?.name || pid)}"`);
  });
  lines.push(
    `#define BERTOPAD_HOST1_OS "${escapeCppString(settings.hostOsMap?.HOST1 || 'mac')}"`,
    `#define BERTOPAD_HOST2_OS "${escapeCppString(settings.hostOsMap?.HOST2 || 'windows')}"`,
    `#define BERTOPAD_HOST3_OS "${escapeCppString(settings.hostOsMap?.HOST3 || 'mac')}"`,
    '',
    'struct BertoPadSlotDefault {',
    '  const char* slot;',
    '  const char* action;',
    '};',
    ''
  );

  HARDWARE_PROFILE_IDS.forEach(pid => {
    const prof = findProfile(pid);
    const slots = prof ? extractProfileSlots(prof) : ({} as Record<HardwareSlotId, string>);
    lines.push(`static const BertoPadSlotDefault BERTOPAD_SLOTS_${pid}[] = {`);
    HARDWARE_SLOTS.forEach((slotId, idx) => {
      const actionVal = slots[slotId] || '';
      const comma = idx < HARDWARE_SLOTS.length - 1 ? ',' : '';
      lines.push(`  { "${slotId}", "${escapeCppString(actionVal)}" }${comma}`);
    });
    lines.push('};', '');
  });

  lines.push('#endif // BERTOPAD_CONFIG_H', '');
  return lines.join('\n');
}

export function generateBitmapsHeader(rawConfig?: Partial<OledComposerConfig>): string {
  const cfg: OledComposerConfig = {
    ...DEFAULT_OLED_COMPOSER_CONFIG,
    ...(rawConfig || {}),
    bitmapBytesHex: normalizeSsd1306Hex(rawConfig?.bitmapBytesHex)
  };
  const bytes = hexToSsd1306Bytes(cfg.bitmapBytesHex);

  const hexRows: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const chunk = Array.from(bytes.slice(offset, offset + 16))
      .map(b => `0x${b.toString(16).padStart(2, '0')}`)
      .join(', ');
    const comma = offset + 16 < bytes.length ? ',' : '';
    hexRows.push(`  ${chunk}${comma}`);
  }

  return [
    '// Auto-generated by BertoPad Studio — 128x64 SSD1306 Vertical-Page Bitmap',
    `// Generated: ${new Date().toISOString()}`,
    '#pragma once',
    '#ifndef BERTOPAD_BITMAPS_H',
    '#define BERTOPAD_BITMAPS_H',
    '',
    '#include <pgmspace.h>',
    '',
    `#define OLED_COMPOSER_ENABLED ${cfg.enabled ? 1 : 0}`,
    `#define OLED_INVERT_DISPLAY ${cfg.invertDisplay ? 1 : 0}`,
    `#define OLED_SHOW_HOST_BADGE ${cfg.showHostBadge ? 1 : 0}`,
    `#define OLED_SHOW_BLE_STATUS ${cfg.showBleStatus ? 1 : 0}`,
    `#define OLED_SHOW_WIFI_STATUS ${cfg.showWifiStatus ? 1 : 0}`,
    `#define OLED_SHOW_LAYER_HINT ${cfg.showLayerHint ? 1 : 0}`,
    `#define OLED_CUSTOM_TITLE "${escapeCppString(cfg.customName)}"`,
    '',
    '#define BERTOPAD_OLED_WIDTH 128',
    '#define BERTOPAD_OLED_HEIGHT 64',
    '',
    'const unsigned char bertopad_oled_bitmap[1024] PROGMEM = {',
    ...hexRows,
    '};',
    '',
    '#endif // BERTOPAD_BITMAPS_H',
    ''
  ].join('\n');
}
