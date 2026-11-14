import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MacroEditorView, STARTER_TEMPLATES } from '../src/components/MacroEditorView';
import { buildBlankHardwareProfiles } from '../src/data/presetTemplates';
import {
  buildFirmwareActionFromTextConfig,
  suggestSmartMacroName
} from '../src/data/firmwareCatalog';
import { DeviceConnectionInfo, TextMacroRepeatConfig } from '../src/types/studio';

const noop = () => {};
const connection: DeviceConnectionInfo = {
  connected: false,
  transport: 'disconnected',
  deviceName: 'Test pad',
  firmwareVersion: '4.10.1'
};

test('MacroEditorView header uses flex-wrap metadata container and collapses >3 binding pills into +N more', () => {
  const profiles = buildBlankHardwareProfiles();
  const starterRepeatConfig: TextMacroRepeatConfig = {
    text: '',
    followUpKey: '',
    keyDelayMs: 0,
    repeatCount: 1,
    loopUntilStopped: false,
    repeatDelayMs: 500,
    steps: STARTER_TEMPLATES[0].steps.map((s, idx) => ({
      ...s,
      id: `init-step-${idx + 1}`
    }))
  };
  const compiledAction = buildFirmwareActionFromTextConfig(starterRepeatConfig, {
    nativeDelay: false
  });
  const binding = {
    type: 'text' as const,
    value: compiledAction,
    repeatConfig: starterRepeatConfig
  };

  // Assign the initial starter action to 5 slots across profiles so >3 binding pills exist
  profiles[0].layers[0].keys.k1.triggers.tap = binding;
  profiles[0].layers[0].keys.k2.triggers.tap = binding;
  profiles[1].layers[0].keys.k1.triggers.tap = binding;
  profiles[2].layers[0].keys.k1.triggers.tap = binding;
  profiles[3].layers[0].keys.k1.triggers.tap = binding;

  const html = renderToStaticMarkup(
    React.createElement(MacroEditorView, {
      profiles,
      activeProfileId: 'HOST1',
      customMacros: [
        {
          id: 'macro-test-1',
          name: 'Launch Terminal',
          action: compiledAction,
          repeatConfig: starterRepeatConfig,
          createdAt: '2026-11-13T00:00:00.000Z'
        }
      ],
      keyboardLayout: 'us_qwerty',
      connection,
      activeRepeatJob: null,
      hostOsMap: { HOST1: 'mac', HOST2: 'windows', HOST3: 'linux' },
      onSaveMacro: () => ({ saved: null, updatedSlotCount: 0 }),
      onDeleteMacro: noop,
      onAssignSlot: noop,
      onTestBinding: noop,
      onStopRepeat: noop,
      onPullFromUsb: async () => true,
      onJumpToControl: noop
    })
  );

  const metaMatch = html.match(/<div[^>]*aria-label="Macro metadata"[^>]*>([\s\S]*?)<\/div>/);
  assert.ok(metaMatch, 'Macro metadata container should be rendered');
  assert.match(metaMatch[0], /flex-wrap/, 'Metadata container should use flex-wrap');
  assert.match(metaMatch[1], /3 steps/, 'Should show step count pill');
  assert.match(metaMatch[1], /est\. run/, 'Should show duration pill');
  assert.doesNotMatch(
    metaMatch[1],
    /\/\s*\d+\s*B/,
    'Small macro should not display 512 B byte counter clutter'
  );
  assert.doesNotMatch(
    metaMatch[1],
    /aria-hidden="true">·</,
    'Metadata container should not use fixed · separator spans'
  );
  assert.match(
    metaMatch[1],
    /\+2 more/,
    '5 bindings should display first 3 and collapse remaining 2 into +2 more indicator'
  );

  // Near-limit (>= 384 B) macro should surface the 512 B storage meter
  const longText = 'A'.repeat(115);
  const bigSteps: TextMacroRepeatConfig = {
    ...starterRepeatConfig,
    steps: [1, 2, 3, 4].map(i => ({
      id: `big-${i}`,
      label: 'Type Text',
      actionType: 'text',
      value: longText,
      delayMs: 50,
      repeatCount: 1
    }))
  };
  const bigAction = buildFirmwareActionFromTextConfig(bigSteps, { nativeDelay: false });
  const cleanProfiles = buildBlankHardwareProfiles();
  cleanProfiles[0].layers[0].keys.k1.triggers.tap = {
    type: 'text',
    value: bigAction,
    repeatConfig: bigSteps
  };
  const bigHtml = renderToStaticMarkup(
    React.createElement(MacroEditorView, {
      profiles: cleanProfiles,
      activeProfileId: 'HOST1',
      externalTarget: {
        requestId: 1,
        macroId: 'macro-test-big',
        name: 'Large Sequence',
        action: bigAction,
        repeatConfig: bigSteps,
        targetProfile: 'HOST1',
        targetSlot: 'b1'
      },
      customMacros: [
        {
          id: 'macro-test-big',
          name: 'Large Sequence',
          action: bigAction,
          repeatConfig: bigSteps,
          createdAt: '2026-11-13T00:00:00.000Z'
        }
      ],
      keyboardLayout: 'us_qwerty',
      connection,
      activeRepeatJob: null,
      hostOsMap: { HOST1: 'mac', HOST2: 'windows', HOST3: 'linux' },
      onSaveMacro: () => ({ saved: null, updatedSlotCount: 0 }),
      onDeleteMacro: noop,
      onAssignSlot: noop,
      onTestBinding: noop,
      onStopRepeat: noop,
      onPullFromUsb: async () => true,
      onJumpToControl: noop
    })
  );
  assert.match(bigHtml, /\d+\s*\/\s*512\s*B/, 'Near-limit macro should surface storage warning');
});

test('Empty macro suggests Untitled Macro, Target picker is compact, and Assign button warns what is replaced', () => {
  assert.equal(suggestSmartMacroName([]), 'Untitled Macro');

  const profiles = buildBlankHardwareProfiles();
  profiles[0].layers[0].keys.k5.triggers.tap = {
    type: 'shortcut',
    value: 'SHORTCUT::f13'
  };

  const html = renderToStaticMarkup(
    React.createElement(MacroEditorView, {
      profiles,
      activeProfileId: 'HOST1',
      initialTargetSlot: 'b5',
      customMacros: [],
      keyboardLayout: 'us_qwerty',
      connection,
      activeRepeatJob: null,
      hostOsMap: { HOST1: 'mac', HOST2: 'windows', HOST3: 'linux' },
      onSaveMacro: () => ({ saved: null, updatedSlotCount: 0 }),
      onDeleteMacro: noop,
      onAssignSlot: noop,
      onTestBinding: noop,
      onStopRepeat: noop,
      onPullFromUsb: async () => true,
      onJumpToControl: noop
    })
  );

  assert.match(html, /aria-label="Target control"/, 'Compact target control select should render');
  assert.match(html, /Pick on pad/, 'Visual pad drawer should start collapsed behind Pick on pad');
  assert.match(html, /Assign to Device 1 · Key 5/, 'Assign CTA should name target slot');
  assert.match(html, /Replaces F13/, 'Assign CTA should note existing binding being overwritten');
});
