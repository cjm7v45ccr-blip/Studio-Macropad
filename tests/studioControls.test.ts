import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TopBar } from '../src/components/TopBar';
import { MacroTestModal } from '../src/components/MacroTestModal';
import { buildBlankHardwareProfiles } from '../src/data/presetTemplates';
import { DeviceConnectionInfo } from '../src/types/studio';

const noop = () => {};
const profiles = buildBlankHardwareProfiles();
const disconnected: DeviceConnectionInfo = {
  connected: false, transport: 'disconnected', deviceName: 'Test pad', firmwareVersion: '4.7.1'
};
const base: React.ComponentProps<typeof TopBar> = {
  connection: disconnected, syncStatus: 'Disconnected', currentRev: 0, dirty: false, isSyncingUsb: false,
  profiles, activeProfile: profiles[0], hostOsMap: { HOST1: 'mac', HOST2: 'windows', HOST3: 'linux' },
  canUndo: false, canRedo: false,
  onConnectUsbPad: noop, onStartDemoMode: noop, onOpenConnectModal: noop, onPullFromUsb: noop,
  onSetHostOs: noop, onSelectProfile: noop, onRenameProfile: () => true, onRequestCopyProfile: noop,
  onUndo: noop, onRedo: noop, onSaveToDevice: noop, onSwitchBleHost: noop
};
function header(overrides: Partial<typeof base> = {}) {
  return renderToStaticMarkup(React.createElement(TopBar, { ...base, ...overrides }));
}
function button(markup: string, label: string) {
  const match = markup.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)?.find(b => b.endsWith(`${label}</button>`));
  assert.ok(match, `Button "${label}" exists`);
  return match;
}

test('offline draft shows Connect USB without manual save button or background save status text', () => {
  const html = header({ dirty: true, syncStatus: 'Out of sync' });
  assert.match(html, /Connect USB/);
  assert.doesNotMatch(html, /Save to device/);
  assert.doesNotMatch(html, /Unsaved changes/);
  assert.doesNotMatch(html, /Not saved to a device/);
});

test('connected state shows USB connected without manual save button or status clutter', () => {
  const html = header({ connection: { ...disconnected, connected: true, transport: 'webserial' }, dirty: true, syncStatus: 'Out of sync' });
  assert.match(html, /USB connected/);
  assert.doesNotMatch(html, /Save to device/);
  assert.doesNotMatch(html, /Edits auto-save/);
});

test('demo state is clearly labeled Demo mode without physical USB or manual save controls', () => {
  const html = header({ connection: { ...disconnected, connected: true, transport: 'demo' }, syncStatus: 'Synced' });
  assert.match(html, /Demo mode/);
  assert.doesNotMatch(html, /USB connected/);
  assert.doesNotMatch(html, /Save to demo/);
});

function modal(connection: DeviceConnectionInfo) {
  return renderToStaticMarkup(React.createElement(MacroTestModal, {
    binding: { type: 'media', value: 'MEDIA:PLAY_PAUSE' }, connection, activeJob: null,
    onClose: noop, onRun: noop
  }));
}

test('offline preview remains available while execution is disabled', () => {
  const html = modal(disconnected);
  assert.match(html, /Dry-run timeline/);
  assert.doesNotMatch(button(html, 'Dry run · no output'), /disabled=""/);
  assert.match(button(html, 'Run on device'), /disabled=""/);
});

test('connected test starts unconfirmed and warns about real side effects', () => {
  const html = modal({ ...disconnected, connected: true, transport: 'webserial' });
  assert.match(html, /type="checkbox"/);
  assert.doesNotMatch(html, /checked=""/);
  assert.match(html, /execute real actions/);
  assert.match(html, /Stop cannot undo actions already sent/);
  assert.match(button(html, 'Run on device'), /disabled=""/);
});

test('demo test is explicitly labeled and also starts unconfirmed', () => {
  const html = modal({ ...disconnected, connected: true, transport: 'demo' });
  assert.match(html, /No physical device receives them/);
  assert.match(button(html, 'Run in demo'), /disabled=""/);
});
