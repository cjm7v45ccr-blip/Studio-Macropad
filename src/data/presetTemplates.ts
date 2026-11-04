import {
  ActionBinding,
  CustomMacroItem,
  EncoderControlConfig,
  HardwareProfileId,
  HardwareSlotId,
  HoldSlotId,
  KeyAppearance,
  KeyControlConfig,
  KeyId,
  SlotRepeatMap,
  StudioProfile,
  TextMacroRepeatConfig,
  defaultProfileAlias
} from '../types/studio';
import {
  buildFirmwareActionFromTextConfig,
  canonicalizeFirmwareAction,
  deriveAppearanceForAction,
  firmwareActionToBinding,
  stepToFirmwareAction,
  stripStandaloneDelayTicks
} from './firmwareCatalog';

export const ALL_KEY_IDS: KeyId[] = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9'];

export const ACTION_KEY_IDS = [
  'k1',
  'k2',
  'k3',
  'k4',
  'k5',
  'k6',
  'k7',
  'k8'
] as const;

export type ActionKeyId = (typeof ACTION_KEY_IDS)[number];
export type ButtonSlotId = 'b1' | 'b2' | 'b3' | 'b4' | 'b5' | 'b6' | 'b7' | 'b8';

export const KEY_TO_SLOT: Record<ActionKeyId, ButtonSlotId> = {
  k1: 'b1',
  k2: 'b2',
  k3: 'b3',
  k4: 'b4',
  k5: 'b5',
  k6: 'b6',
  k7: 'b7',
  k8: 'b8'
};

export const SLOT_TO_ACTION_KEY: Record<ButtonSlotId, ActionKeyId> = {
  b1: 'k1',
  b2: 'k2',
  b3: 'k3',
  b4: 'k4',
  b5: 'k5',
  b6: 'k6',
  b7: 'k7',
  b8: 'k8'
};

export const KEY_TO_HOLD_SLOT: Record<ActionKeyId, HoldSlotId> = {
  k1: 'b1h',
  k2: 'b2h',
  k3: 'b3h',
  k4: 'b4h',
  k5: 'b5h',
  k6: 'b6h',
  k7: 'b7h',
  k8: 'b8h'
};

export const HOLD_SLOT_TO_ACTION_KEY: Record<HoldSlotId, ActionKeyId> = {
  b1h: 'k1',
  b2h: 'k2',
  b3h: 'k3',
  b4h: 'k4',
  b5h: 'k5',
  b6h: 'k6',
  b7h: 'k7',
  b8h: 'k8'
};

export const PROFILE_ACCENT_COLORS: Record<HardwareProfileId, string> = {
  HOST1: '#F2A33A',
  HOST2: '#F2A33A',
  HOST3: '#F2A33A',
  TV: '#F2A33A'
};

export function emptyAction(): ActionBinding {
  return { type: 'none', value: '' };
}

function resolveMatchingRepeatConfig(
  actionStr: string,
  candidate?: TextMacroRepeatConfig
): TextMacroRepeatConfig | undefined {
  if (!candidate || !actionStr) return undefined;
  const expectedBase = buildFirmwareActionFromTextConfig(candidate);
  if (!expectedBase) return undefined;
  const canonExpected = canonicalizeFirmwareAction(expectedBase);
  const canonActual = canonicalizeFirmwareAction(actionStr);
  if (canonExpected === canonActual) return candidate;

  // Match legacy delay-stripped NVS strings (from before standalone ||NONE encoding)
  if (
    stripStandaloneDelayTicks(canonExpected) &&
    stripStandaloneDelayTicks(canonExpected) === stripStandaloneDelayTicks(canonActual)
  ) {
    return candidate;
  }

  // Match legacy Step-01 NVS fallback strings
  const firstRealStep = candidate.steps?.find(s => s.actionType !== 'delay');
  if (firstRealStep) {
    const firstFw = canonicalizeFirmwareAction(stepToFirmwareAction(firstRealStep));
    if (firstFw && firstFw === canonActual) {
      return candidate;
    }
  }
  return undefined;
}

function resolveUpgradedActionStr(
  actionStr: string,
  matchedRepeat?: TextMacroRepeatConfig
): string {
  if (!matchedRepeat) return actionStr;
  const compiled = buildFirmwareActionFromTextConfig(matchedRepeat);
  return compiled || actionStr;
}

export function makeHardwareKey(
  id: KeyId,
  actionStr: string,
  existingAppearance?: KeyAppearance,
  repeatConfig?: TextMacroRepeatConfig,
  customMacros?: CustomMacroItem[],
  holdActionStr = '',
  holdRepeatConfig?: TextMacroRepeatConfig
): KeyControlConfig {
  if (id === 'k9') {
    return {
      id: 'k9',
      isModeSwitch: true,
      triggers: { tap: emptyAction(), hold: emptyAction() },
      appearance: {
        label: 'Mode',
        icon: 'layers',
        labelColor: '#F2A33A'
      }
    };
  }

  const slot = KEY_TO_SLOT[id];
  const holdSlot = KEY_TO_HOLD_SLOT[id];
  const matchedRepeat = resolveMatchingRepeatConfig(actionStr, repeatConfig);
  const upgradedAction = resolveUpgradedActionStr(actionStr, matchedRepeat);
  const binding = firmwareActionToBinding(upgradedAction, matchedRepeat);

  const matchedHoldRepeat = resolveMatchingRepeatConfig(holdActionStr, holdRepeatConfig);
  const upgradedHoldAction = resolveUpgradedActionStr(holdActionStr, matchedHoldRepeat);
  const holdBinding = firmwareActionToBinding(upgradedHoldAction, matchedHoldRepeat);

  const appearance = deriveAppearanceForAction(
    upgradedAction,
    existingAppearance,
    matchedRepeat,
    customMacros
  );

  return {
    id,
    slot,
    holdSlot,
    triggers: {
      tap: binding,
      hold: holdBinding
    },
    appearance
  };
}

export function buildHardwareEncoder(
  dialAction = '',
  cwAction = '',
  ccwAction = '',
  color = '#F2A33A',
  dialRepeat?: TextMacroRepeatConfig,
  cwRepeat?: TextMacroRepeatConfig,
  ccwRepeat?: TextMacroRepeatConfig,
  pushCwAction = '',
  pushCcwAction = '',
  pushCwRepeat?: TextMacroRepeatConfig,
  pushCcwRepeat?: TextMacroRepeatConfig
): EncoderControlConfig {
  const matchedDial = resolveMatchingRepeatConfig(dialAction, dialRepeat);
  const matchedCw = resolveMatchingRepeatConfig(cwAction, cwRepeat);
  const matchedCcw = resolveMatchingRepeatConfig(ccwAction, ccwRepeat);
  const matchedPushCw = resolveMatchingRepeatConfig(pushCwAction, pushCwRepeat);
  const matchedPushCcw = resolveMatchingRepeatConfig(pushCcwAction, pushCcwRepeat);
  return {
    dial: firmwareActionToBinding(
      resolveUpgradedActionStr(dialAction, matchedDial),
      matchedDial
    ),
    cw: firmwareActionToBinding(
      resolveUpgradedActionStr(cwAction, matchedCw),
      matchedCw
    ),
    ccw: firmwareActionToBinding(
      resolveUpgradedActionStr(ccwAction, matchedCcw),
      matchedCcw
    ),
    pushCw: firmwareActionToBinding(
      resolveUpgradedActionStr(pushCwAction, matchedPushCw),
      matchedPushCw
    ),
    pushCcw: firmwareActionToBinding(
      resolveUpgradedActionStr(pushCcwAction, matchedPushCcw),
      matchedPushCcw
    ),
    color
  };
}

export function buildHardwareProfile(
  id: HardwareProfileId,
  name: string,
  slots?: Partial<Record<HardwareSlotId, string>>,
  existingProfile?: StudioProfile,
  repeatConfigs?: SlotRepeatMap,
  customMacros?: CustomMacroItem[]
): StudioProfile {
  const accent = PROFILE_ACCENT_COLORS[id];
  const prevKeys = existingProfile?.layers[0]?.keys;

  const prevAppFor = (kid: ActionKeyId): KeyAppearance | undefined => {
    const prev = prevKeys?.[kid];
    if (!prev || prev.isModeSwitch) return undefined;
    return prev.appearance;
  };

  const keys: Record<KeyId, KeyControlConfig> = {
    k1: makeHardwareKey(
      'k1',
      slots?.b1 || '',
      prevAppFor('k1'),
      repeatConfigs?.[`${id}:b1`],
      customMacros,
      slots?.b1h || '',
      repeatConfigs?.[`${id}:b1h`]
    ),
    k2: makeHardwareKey(
      'k2',
      slots?.b2 || '',
      prevAppFor('k2'),
      repeatConfigs?.[`${id}:b2`],
      customMacros,
      slots?.b2h || '',
      repeatConfigs?.[`${id}:b2h`]
    ),
    k3: makeHardwareKey(
      'k3',
      slots?.b3 || '',
      prevAppFor('k3'),
      repeatConfigs?.[`${id}:b3`],
      customMacros,
      slots?.b3h || '',
      repeatConfigs?.[`${id}:b3h`]
    ),
    k4: makeHardwareKey(
      'k4',
      slots?.b4 || '',
      prevAppFor('k4'),
      repeatConfigs?.[`${id}:b4`],
      customMacros,
      slots?.b4h || '',
      repeatConfigs?.[`${id}:b4h`]
    ),
    k5: makeHardwareKey(
      'k5',
      slots?.b5 || '',
      prevAppFor('k5'),
      repeatConfigs?.[`${id}:b5`],
      customMacros,
      slots?.b5h || '',
      repeatConfigs?.[`${id}:b5h`]
    ),
    k6: makeHardwareKey(
      'k6',
      slots?.b6 || '',
      prevAppFor('k6'),
      repeatConfigs?.[`${id}:b6`],
      customMacros,
      slots?.b6h || '',
      repeatConfigs?.[`${id}:b6h`]
    ),
    k7: makeHardwareKey(
      'k7',
      slots?.b7 || '',
      prevAppFor('k7'),
      repeatConfigs?.[`${id}:b7`],
      customMacros,
      slots?.b7h || '',
      repeatConfigs?.[`${id}:b7h`]
    ),
    k8: makeHardwareKey(
      'k8',
      slots?.b8 || '',
      prevAppFor('k8'),
      repeatConfigs?.[`${id}:b8`],
      customMacros,
      slots?.b8h || '',
      repeatConfigs?.[`${id}:b8h`]
    ),
    k9: makeHardwareKey('k9', '')
  };

  return {
    id,
    name: name || defaultProfileAlias(id),
    activeLayerIndex: 0,
    layers: [
      {
        id: `hw-${id.toLowerCase()}`,
        name: `${defaultProfileAlias(id)} Hardware Layer`,
        color: accent,
        keys,
        encoder: buildHardwareEncoder(
          slots?.dial || '',
          slots?.enc_cw || '',
          slots?.enc_ccw || '',
          existingProfile?.layers[0]?.encoder.color || accent,
          repeatConfigs?.[`${id}:dial`],
          repeatConfigs?.[`${id}:enc_cw`],
          repeatConfigs?.[`${id}:enc_ccw`],
          slots?.push_cw || '',
          slots?.push_ccw || '',
          repeatConfigs?.[`${id}:push_cw`],
          repeatConfigs?.[`${id}:push_ccw`]
        ),
        encoder2: buildHardwareEncoder(
          slots?.dial2 || '',
          slots?.e2_cw || '',
          slots?.e2_ccw || '',
          existingProfile?.layers[0]?.encoder2?.color || '#F2A33A',
          repeatConfigs?.[`${id}:dial2`],
          repeatConfigs?.[`${id}:e2_cw`],
          repeatConfigs?.[`${id}:e2_ccw`]
        )
      }
    ]
  };
}

export function buildBlankHardwareProfiles(): StudioProfile[] {
  return [
    buildHardwareProfile('HOST1', 'Device 1'),
    buildHardwareProfile('HOST2', 'Device 2'),
    buildHardwareProfile('HOST3', 'Device 3'),
    buildHardwareProfile('TV', 'TV')
  ];
}
