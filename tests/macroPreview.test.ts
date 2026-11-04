import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMacroPreview, testTargetKey } from '../src/utils/macroPreview';
import { ActionBinding, MacroStepConfig, TextMacroRepeatConfig } from '../src/types/studio';
import { repeatMacroRunner } from '../src/services/repeatMacroRunner';
import { usbHardware } from '../src/services/usbHardwareService';

const currentJob = () => repeatMacroRunner.activeJob;

const config = (steps: MacroStepConfig[], overrides: Partial<TextMacroRepeatConfig> = {}): TextMacroRepeatConfig => ({
  text: '', followUpKey: '', keyDelayMs: 0, repeatCount: 1,
  loopUntilStopped: false, repeatDelayMs: 500, steps, ...overrides
});
const step = (overrides: Partial<MacroStepConfig> = {}): MacroStepConfig => ({
  id: 'step-1', label: 'Press key', actionType: 'key', value: 'enter', delayMs: 0, repeatCount: 1, ...overrides
});
const binding = (cfg: TextMacroRepeatConfig): ActionBinding => ({ type: 'text', value: 'KEY:ENTER', repeatConfig: cfg });

test('an unassigned control has no executable timeline', () => {
  const result = buildMacroPreview({ type: 'none', value: '' });
  assert.deepEqual(result.timeline, []);
  assert.equal(result.totalWaitMs, 0);
});

test('a simple action produces one readable step', () => {
  const result = buildMacroPreview({ type: 'media', value: 'MEDIA:PLAY_PAUSE' });
  assert.equal(result.timeline.length, 1);
  assert.match(result.timeline[0].label, /play/i);
  assert.equal(result.timeline[0].startMs, 0);
});

test('legacy text and follow-up delay are reconstructed without mutating the binding', () => {
  const source: ActionBinding = { type: 'text', value: 'TEXT:hello', repeatConfig: {
    text: 'hello', followUpKey: 'enter', keyDelayMs: 750, repeatCount: 2,
    loopUntilStopped: false, repeatDelayMs: 200
  } };
  const before = structuredClone(source);
  const result = buildMacroPreview(source);
  assert.equal(result.timeline.length, 2);
  assert.equal(result.timeline[0].label, 'Type "hello"');
  assert.equal(result.timeline[1].startMs, 750);
  assert.equal(result.totalWaitMs, 1700);
  assert.deepEqual(source, before);
});

test('explicit waits, intra-step repeats and last-step delays match runner semantics', () => {
  const result = buildMacroPreview(binding(config([
    step({ actionType: 'delay', value: '', delayMs: 100, repeatCount: 2 }),
    step({ id: 'second', delayMs: 300, repeatCount: 3 }),
    step({ id: 'last', delayMs: 400, repeatCount: 2 })
  ])));
  assert.deepEqual(result.timeline.map(s => s.startMs), [0, 200, 1100]);
  assert.deepEqual(result.timeline.map(s => s.waitMs), [200, 900, 400]);
  assert.equal(result.cycleWaitMs, 1500);
  // No trailing wait after the final repetition of the last action.
  assert.equal(buildMacroPreview(binding(config([step({ delayMs: 999 })]))).cycleWaitMs, 0);
});

test('finite cycle totals include only intervening repeat delays', () => {
  const result = buildMacroPreview(binding(config([step({ actionType: 'delay', delayMs: 250 })], { repeatCount: 3, repeatDelayMs: 100 })));
  assert.equal(result.totalWaitMs, 950);
  assert.equal(result.simulationConfig.repeatCount, 1);
  assert.equal(result.simulationConfig.loopUntilStopped, false);
});

test('loops stay compact and dry runs always preview just one cycle', () => {
  const result = buildMacroPreview(binding(config([step()], { loopUntilStopped: true, repeatCount: 999 })));
  assert.equal(result.loop, true);
  assert.equal(result.totalWaitMs, null);
  assert.equal(result.timeline.length, 1);
  assert.equal(result.simulationConfig.loopUntilStopped, false);
  assert.equal(result.simulationConfig.repeatCount, 1);
});

test('confirmation identity changes on disconnect, transport or device changes', () => {
  const target = { connected: true, transport: 'webserial' as const, deviceId: 'pad-1' };
  assert.notEqual(testTargetKey(target), testTargetKey({ ...target, connected: false }));
  assert.notEqual(testTargetKey(target), testTargetKey({ ...target, transport: 'demo' }));
  assert.notEqual(testTargetKey(target), testTargetKey({ ...target, deviceId: 'pad-2' }));
});

test('dry-run animation and stopping never invoke hardware actions or cancellation', async t => {
  // Browser timers only; the USB singleton was imported without a window, so it
  // has no serial watchers or physical device connection in this test.
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout, clearTimeout } });
  t.after(() => {
    repeatMacroRunner.stop();
    if (previousWindow === undefined) Reflect.deleteProperty(globalThis, 'window');
    else Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
  });
  const action = t.mock.method(usbHardware, 'testAction', async () => { throw new Error('Dry run must never send actions'); });
  const cancel = t.mock.method(usbHardware, 'cancelRunningMacro', async () => { throw new Error('Dry run must never cancel hardware'); });
  const result = buildMacroPreview(binding(config([
    step({ actionType: 'text', value: 'safe preview', delayMs: 5 }),
    step({ id: 'second' })
  ], { loopUntilStopped: true })));
  const progress: number[] = [];
  const unsubscribe = repeatMacroRunner.onJobChange(job => {
    if (job?.activeStepIndex !== undefined) progress.push(job.activeStepIndex);
  });
  t.after(unsubscribe);
  await repeatMacroRunner.simulateInUi(result.simulationConfig);
  assert.equal(currentJob(), null);
  assert.ok(progress.includes(0));
  assert.ok(progress.includes(1));
  const running = repeatMacroRunner.simulateInUi(config([step({ actionType: 'delay', delayMs: 10000 })]));
  assert.equal(currentJob()?.id.startsWith('sim-'), true);
  assert.equal(repeatMacroRunner.stop(), true);
  await running;
  assert.equal(currentJob(), null);
  assert.equal(action.mock.callCount(), 0);
  assert.equal(cancel.mock.callCount(), 0);
});
