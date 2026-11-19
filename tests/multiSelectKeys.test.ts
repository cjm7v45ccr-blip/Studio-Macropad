import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROGRAMMABLE_KEY_IDS,
  addKeyToMultiSelection,
  buildCombinedMacroBindingFromKeys,
  formatMultiKeySummary,
  resolveAnchorActionKey,
  toggleMultiSelectKey
} from '../src/utils/keyMultiSelect';
import { buildHardwareProfile } from '../src/data/presetTemplates';
import { FACTORY_DEFAULT_SLOTS } from '../src/data/firmwareCatalog';

test('Shift+Click multi-select starts from active anchor key and toggles keys cleanly', () => {
  // Starting on single selected k1, Shift+Click k3 -> [k1, k3]
  const step1 = toggleMultiSelectKey([], 'k1', 'k3');
  assert.deepEqual(step1.nextMultiKeys, ['k1', 'k3']);
  assert.equal(step1.nextPrimaryControl, 'k3');

  // Shift+Click k5 -> [k1, k3, k5]
  const step2 = toggleMultiSelectKey(step1.nextMultiKeys, step1.nextPrimaryControl, 'k5');
  assert.deepEqual(step2.nextMultiKeys, ['k1', 'k3', 'k5']);
  assert.equal(step2.nextPrimaryControl, 'k5');

  // Shift+Click k3 again -> toggles k3 off -> [k1, k5]
  const step3 = toggleMultiSelectKey(step2.nextMultiKeys, step2.nextPrimaryControl, 'k3');
  assert.deepEqual(step3.nextMultiKeys, ['k1', 'k5']);
  assert.equal(step3.nextPrimaryControl, 'k5');

  // Shift+Click k1 -> only 1 key remains -> collapses back to single select on k5
  const step4 = toggleMultiSelectKey(step3.nextMultiKeys, step3.nextPrimaryControl, 'k1');
  assert.deepEqual(step4.nextMultiKeys, []);
  assert.equal(step4.nextPrimaryControl, 'k5');
});

test('Shift+Click from a hold slot resolves its parent programmable key as anchor', () => {
  assert.equal(resolveAnchorActionKey('b2h'), 'k2');
  assert.equal(resolveAnchorActionKey('k9'), null);
  assert.equal(resolveAnchorActionKey('dial'), null);

  const res = toggleMultiSelectKey([], 'b2h', 'k6');
  assert.deepEqual(res.nextMultiKeys, ['k2', 'k6']);
  assert.equal(res.nextPrimaryControl, 'k6');
});

test('addKeyToMultiSelection appends keys without duplicates and supports Shift+Right-Click', () => {
  const fromSingle = addKeyToMultiSelection([], 'k1', 'k4');
  assert.deepEqual(fromSingle, ['k1', 'k4']);

  const duplicate = addKeyToMultiSelection(fromSingle, 'k4', 'k1');
  assert.deepEqual(duplicate, ['k1', 'k4']);

  const appended = addKeyToMultiSelection(fromSingle, 'k4', 'k7');
  assert.deepEqual(appended, ['k1', 'k4', 'k7']);
});

test('formatMultiKeySummary formats partial selections and full 8-key selection', () => {
  assert.equal(formatMultiKeySummary(['k1', 'k3', 'k5']), 'K1 · K3 · K5');
  assert.equal(formatMultiKeySummary(PROGRAMMABLE_KEY_IDS), 'All Keys (K1–K8)');
});

test('buildCombinedMacroBindingFromKeys joins assigned tap actions in selection order', () => {
  const profile = buildHardwareProfile('HOST1', 'Device 1', {
    ...FACTORY_DEFAULT_SLOTS.HOST1,
    b1: 'MACRO:COPY',
    b3: '',
    b5: 'MACRO:PASTE'
  });
  const combined = buildCombinedMacroBindingFromKeys(
    ['k1', 'k3', 'k5'],
    profile.layers[0].keys
  );
  assert.ok(combined);
  assert.equal(combined.value, 'MACRO:COPY||MACRO:PASTE');
});
