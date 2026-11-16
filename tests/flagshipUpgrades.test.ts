import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DEFAULT_GYRO_CALIBRATION,
  applyMotionOrientationAndDeadzone
} from '../src/utils/motionCalibration';
import {
  OLED_HEIGHT,
  OLED_WIDTH,
  SSD1306_HEX_LENGTH,
  blankSsd1306Hex,
  generateBitmapsHeader,
  generateConfigHeader,
  getSsd1306Pixel,
  imageDataToSsd1306Hex,
  invertSsd1306Hex,
  setSsd1306Pixel
} from '../src/utils/firmwareHeaderExport';
import { buildBlankHardwareProfiles } from '../src/data/presetTemplates';
import { HARDWARE_SLOTS } from '../src/data/firmwareCatalog';
import { extractProfileSlots } from '../src/hooks/useStudioState';
import { LiveTelemetryInspector } from '../src/components/LiveTelemetryInspector';
import { StudioSettings } from '../src/types/studio';

test('applyMotionOrientationAndDeadzone respects inversion, swapXY, and deadzone', () => {
  const base = { ...DEFAULT_GYRO_CALIBRATION, deadzoneDeg: 1.5 };

  // Within deadzone -> clamped to zero
  const quiet = applyMotionOrientationAndDeadzone(1.0, -1.2, 0.5, base);
  assert.equal(quiet.pitchDelta, 0);
  assert.equal(quiet.rollDelta, 0);
  assert.equal(quiet.yawDelta, 0);

  // Swap X-Y + invert pitch/roll
  const rotated = applyMotionOrientationAndDeadzone(10, -20, 4, {
    ...base,
    swapXY: true,
    invertPitch: true,
    invertRoll: true
  });
  assert.equal(rotated.pitchDelta, 20); // roll -20 swapped to pitch, then negated -> +20
  assert.equal(rotated.rollDelta, -10); // pitch 10 swapped to roll, then negated -> -10
  assert.equal(rotated.yawDelta, 4);
});

test('SSD1306 pixel buffer helpers map page-addressed bits and export valid bitmaps.h', () => {
  let hex = blankSsd1306Hex();
  assert.equal(hex.length, SSD1306_HEX_LENGTH);
  assert.equal(getSsd1306Pixel(hex, 5, 10), false);

  hex = setSsd1306Pixel(hex, 5, 10, true);
  assert.equal(getSsd1306Pixel(hex, 5, 10), true);
  assert.equal(getSsd1306Pixel(hex, 5, 11), false);

  const inverted = invertSsd1306Hex(hex);
  assert.equal(getSsd1306Pixel(inverted, 5, 10), false);
  assert.equal(getSsd1306Pixel(inverted, 5, 11), true);

  // Quantize small 128x64 white bar
  const rgba = new Uint8ClampedArray(OLED_WIDTH * OLED_HEIGHT * 4);
  for (let x = 0; x < OLED_WIDTH; x++) {
    const idx = x * 4;
    rgba[idx] = 255;
    rgba[idx + 1] = 255;
    rgba[idx + 2] = 255;
    rgba[idx + 3] = 255;
  }
  const quantized = imageDataToSsd1306Hex(rgba, OLED_WIDTH, OLED_HEIGHT, 128, false);
  assert.equal(getSsd1306Pixel(quantized, 0, 0), true);
  assert.equal(getSsd1306Pixel(quantized, 64, 0), true);
  assert.equal(getSsd1306Pixel(quantized, 0, 1), false);

  const header = generateBitmapsHeader({
    enabled: true,
    customName: 'Studio Pad',
    invertDisplay: true,
    bitmapBytesHex: quantized
  });
  assert.match(header, /#define OLED_COMPOSER_ENABLED 1/);
  assert.match(header, /#define OLED_INVERT_DISPLAY 1/);
  assert.match(header, /#define OLED_CUSTOM_TITLE "Studio Pad"/);
  assert.match(header, /const unsigned char bertopad_oled_bitmap\[1024\] PROGMEM/);
});

test('Knob 2 push_cw2 / push_ccw2 parity and config.h generator', () => {
  assert.ok(HARDWARE_SLOTS.includes('push_cw2'));
  assert.ok(HARDWARE_SLOTS.includes('push_ccw2'));

  const profiles = buildBlankHardwareProfiles();
  profiles[0].layers[0].encoder2.pushCw = { type: 'media', value: 'MEDIA:NEXT' };
  profiles[0].layers[0].encoder2.pushCcw = { type: 'media', value: 'MEDIA:PREV' };

  const slots = extractProfileSlots(profiles[0]);
  assert.equal(slots.push_cw2, 'MEDIA:NEXT');
  assert.equal(slots.push_ccw2, 'MEDIA:PREV');

  const settings: StudioSettings = {
    theme: 'dark',
    accentColor: '#F2A33A',
    keyboardLayout: 'us_qwerty',
    encoderPlacement: 'grid',
    soundEnabled: true,
    liveEventsEnabled: true,
    autoCheckFirmwareUpdates: true,
    firmwareRepo: 'Berto1899/Bertopad',
    hostOsMap: { HOST1: 'mac', HOST2: 'windows', HOST3: 'linux' },
    showAdvancedIds: false,
    gyroCalibration: {
      ...DEFAULT_GYRO_CALIBRATION,
      invertPitch: true,
      deadzoneDeg: 1.2
    }
  };

  const configHeader = generateConfigHeader({
    profiles,
    settings,
    activeProfileId: 'HOST1',
    tvEnabled: true
  });
  assert.match(configHeader, /#define BERTOPAD_GYRO_INVERT_PITCH 1/);
  assert.match(configHeader, /#define BERTOPAD_GYRO_DEADZONE_DEG 1\.20f/);
  assert.match(configHeader, /\{ "push_cw2", "MEDIA:NEXT" \}/);
  assert.match(configHeader, /\{ "push_ccw2", "MEDIA:PREV" \}/);
});

test('LiveTelemetryInspector renders Test Mode telemetry and Knob 2 shortcut cheat-sheet', () => {
  const html = renderToStaticMarkup(
    React.createElement(LiveTelemetryInspector, {
      connection: {
        connected: true,
        transport: 'demo',
        deviceName: 'BertoPad Studio',
        firmwareVersion: '4.12.1',
        telemetry: {
          apiVersion: 1,
          setupMode: false,
          activeProfile: 'HOST1',
          wifiConnected: true,
          ip: '192.168.1.44',
          ssid: 'StudioNet',
          bleConnected: true,
          bleActiveHost: 1,
          bleMaxHosts: 3,
          bleDeviceName: 'BertoPad 1',
          freeHeap: 180000,
          httpApiEnabled: false,
          tvConfigured: false,
          tvPaired: false,
          tvHost: '',
          tvPort: 7345,
          tvEnabled: true,
          capabilities: ['motion', 'key_hold'],
          connectionType: 'demo'
        }
      },
      activeProfileId: 'HOST1',
      activeProfileName: 'Device 1',
      testLog: [
        {
          id: 'evt-1',
          timestamp: '12:00:01',
          controlLabel: 'Knob 2',
          triggerLabel: 'Hold + Right',
          actionSummary: 'Next Track',
          source: 'usb-test'
        }
      ],
      onClearLog: () => {},
      onBackToEdit: () => {}
    })
  );

  assert.match(html, /Live Test Telemetry/);
  assert.match(html, /Back to Configure/);
  assert.match(html, /Knob 2/);
  assert.match(html, /Next Track/);
});
