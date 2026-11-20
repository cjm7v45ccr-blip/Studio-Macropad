import { ActionBinding, ControlId, KeyControlConfig, KeyId } from '../types/studio';
import { ActionKeyId, HOLD_SLOT_TO_ACTION_KEY } from '../data/presetTemplates';
import { firmwareActionToBinding, isHoldSlot } from '../data/firmwareCatalog';

export const PROGRAMMABLE_KEY_IDS: ActionKeyId[] = [
  'k1',
  'k2',
  'k3',
  'k4',
  'k5',
  'k6',
  'k7',
  'k8'
];

export function isProgrammableKeyId(id: ControlId | string): id is ActionKeyId {
  return (PROGRAMMABLE_KEY_IDS as string[]).includes(id);
}

/**
 * Resolves the currently active programmable key anchor (including if a key's Hold slot is selected).
 */
export function resolveAnchorActionKey(selectedControl: ControlId): ActionKeyId | null {
  if (isProgrammableKeyId(selectedControl)) {
    return selectedControl;
  }
  if (isHoldSlot(selectedControl)) {
    return HOLD_SLOT_TO_ACTION_KEY[selectedControl];
  }
  return null;
}

export interface MultiSelectToggleResult {
  nextMultiKeys: ActionKeyId[];
  nextPrimaryControl: ActionKeyId;
}

/**
 * Computes the next multi-selection state when the user Shift+Clicks a programmable key.
 * - Starts from the currently selected anchor key so clicking K1 then Shift+Clicking K3 selects [K1, K3].
 * - Toggles a key off if already selected, collapsing back to single-selection when 1 key remains.
 */
export function toggleMultiSelectKey(
  currentMultiKeys: ActionKeyId[],
  selectedControl: ControlId,
  clickedKey: ActionKeyId
): MultiSelectToggleResult {
  if (currentMultiKeys.length === 0) {
    const anchor = resolveAnchorActionKey(selectedControl);
    if (anchor && anchor !== clickedKey) {
      return {
        nextMultiKeys: [anchor, clickedKey],
        nextPrimaryControl: clickedKey
      };
    }
    return {
      nextMultiKeys: [clickedKey],
      nextPrimaryControl: clickedKey
    };
  }

  if (currentMultiKeys.includes(clickedKey)) {
    const remaining = currentMultiKeys.filter(k => k !== clickedKey);
    if (remaining.length <= 1) {
      return {
        nextMultiKeys: [],
        nextPrimaryControl: remaining[0] ?? clickedKey
      };
    }
    return {
      nextMultiKeys: remaining,
      nextPrimaryControl: remaining[remaining.length - 1]
    };
  }

  return {
    nextMultiKeys: [...currentMultiKeys, clickedKey],
    nextPrimaryControl: clickedKey
  };
}

/**
 * Ensures a key is added to the current selection (used for Shift+Right-Click or "Add to selection").
 */
export function addKeyToMultiSelection(
  currentMultiKeys: ActionKeyId[],
  selectedControl: ControlId,
  keyToAdd: ActionKeyId
): ActionKeyId[] {
  if (currentMultiKeys.length === 0) {
    const anchor = resolveAnchorActionKey(selectedControl);
    if (anchor && anchor !== keyToAdd) {
      return [anchor, keyToAdd];
    }
    return [keyToAdd];
  }
  if (currentMultiKeys.includes(keyToAdd)) {
    return currentMultiKeys;
  }
  return [...currentMultiKeys, keyToAdd];
}

/**
 * Formats selected key IDs cleanly as "K1 · K3 · K5" (or compact range when all 8 are selected).
 */
export function formatMultiKeySummary(keys: ActionKeyId[]): string {
  if (keys.length === 0) return '';
  if (keys.length === PROGRAMMABLE_KEY_IDS.length) {
    return 'All Keys (K1–K8)';
  }
  return keys.map(k => `K${k.slice(1)}`).join(' · ');
}

/**
 * Combines assigned tap actions from the multi-selected keys (in selection order)
 * into a native `||`-delimited multi-step firmware macro binding for Macro Studio.
 */
export function buildCombinedMacroBindingFromKeys(
  keys: ActionKeyId[],
  layerKeys: Record<KeyId, KeyControlConfig>
): ActionBinding | null {
  const parts: string[] = [];
  for (const kid of keys) {
    const val = layerKeys[kid]?.triggers?.tap?.value?.trim();
    if (!val || val === 'NONE') continue;
    parts.push(val);
  }
  if (parts.length === 0) return null;
  const combined = parts.join('||');
  return firmwareActionToBinding(combined);
}
