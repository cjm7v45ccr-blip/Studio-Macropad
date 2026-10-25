import {
  ActionBinding,
  EncoderControlConfig,
  HardwareProfileId,
  HardwareSlotId,
  KeyAppearance,
  KeyControlConfig,
  KeyId,
  SlotRepeatMap,
  StudioProfile,
  TextMacroRepeatConfig
} from '../types/studio';
import {
  buildFirmwareActionFromTextConfig,
  deriveAppearanceForAction,
  firmwareActionToBinding
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

export function emptyAction(): ActionBinding {
  return { type: 'none', value: '' };
}

function resolveMatchingRepeatConfig(
  actionStr: string,
  candidate?: TextMacroRepeatConfig
): TextMacroRepeatConfig | undefined {
  if (!candidate || !actionStr) return undefined;
  const expectedBase = buildFirmwareActionFromTextConfig(candidate);
  return expectedBase === actionStr ? candidate : undefined;
}

export function makeHardwareKey(
  id: KeyId,
  actionStr: string,
  existingAppearance?: KeyAppearance,
  repeatConfig?: TextMacroRepeatConfig
): KeyControlConfig {
  if (id === 'k9') {
    return {
      id: 'k9',
      isModeSwitch: true,
      triggers: { tap: emptyAction() },
      appearance: {
        label: 'MODE',
        icon: 'layers',
        labelColor: '#38BDF8'
      }
    };
  }

  const slot = KEY_TO_SLOT[id];
  const matchedRepeat = resolveMatchingRepeatConfig(actionStr, repeatConfig);
  const binding = firmwareActionToBinding(actionStr, matchedRepeat);
  const appearance = deriveAppearanceForAction(actionStr, existingAppearance, matchedRepeat);

  return {
    id,
    slot,
    triggers: {
      tap: binding
    },
    appearance
  };
}

export function buildHardwareEncoder(
  dialAction = '',
  cwAction = '',
  ccwAction = '',
  color = '#3B82F6',
  dialRepeat?: TextMacroRepeatConfig,
  cwRepeat?: TextMacroRepeatConfig,
  ccwRepeat?: TextMacroRepeatConfig
): EncoderControlConfig {
  return {
    dial: firmwareActionToBinding(
      dialAction,
      resolveMatchingRepeatConfig(dialAction, dialRepeat)
    ),
    cw: firmwareActionToBinding(
      cwAction,
      resolveMatchingRepeatConfig(cwAction, cwRepeat)
    ),
    ccw: firmwareActionToBinding(
      ccwAction,
      resolveMatchingRepeatConfig(ccwAction, ccwRepeat)
    ),
    color
  };
}

export function buildHardwareProfile(
  id: HardwareProfileId,
  name: string,
  slots?: Partial<Record<HardwareSlotId, string>>,
  existingProfile?: StudioProfile,
  repeatConfigs?: SlotRepeatMap
): StudioProfile {
  const accent = id === 'MAC' ? '#3B82F6' : '#10B981';
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
      repeatConfigs?.[`${id}:b1`]
    ),
    k2: makeHardwareKey(
      'k2',
      slots?.b2 || '',
      prevAppFor('k2'),
      repeatConfigs?.[`${id}:b2`]
    ),
    k3: makeHardwareKey(
      'k3',
      slots?.b3 || '',
      prevAppFor('k3'),
      repeatConfigs?.[`${id}:b3`]
    ),
    k4: makeHardwareKey(
      'k4',
      slots?.b4 || '',
      prevAppFor('k4'),
      repeatConfigs?.[`${id}:b4`]
    ),
    k5: makeHardwareKey(
      'k5',
      slots?.b5 || '',
      prevAppFor('k5'),
      repeatConfigs?.[`${id}:b5`]
    ),
    k6: makeHardwareKey(
      'k6',
      slots?.b6 || '',
      prevAppFor('k6'),
      repeatConfigs?.[`${id}:b6`]
    ),
    k7: makeHardwareKey(
      'k7',
      slots?.b7 || '',
      prevAppFor('k7'),
      repeatConfigs?.[`${id}:b7`]
    ),
    k8: makeHardwareKey(
      'k8',
      slots?.b8 || '',
      prevAppFor('k8'),
      repeatConfigs?.[`${id}:b8`]
    ),
    k9: makeHardwareKey('k9', '')
  };

  return {
    id,
    name: name || (id === 'MAC' ? 'Mac' : 'TV'),
    activeLayerIndex: 0,
    layers: [
      {
        id: `hw-${id.toLowerCase()}`,
        name: id === 'MAC' ? 'MAC Hardware Layer' : 'TV Hardware Layer',
        color: accent,
        keys,
        encoder: buildHardwareEncoder(
          slots?.dial || '',
          slots?.enc_cw || '',
          slots?.enc_ccw || '',
          existingProfile?.layers[0]?.encoder.color || accent,
          repeatConfigs?.[`${id}:dial`],
          repeatConfigs?.[`${id}:enc_cw`],
          repeatConfigs?.[`${id}:enc_ccw`]
        )
      }
    ]
  };
}

export function buildBlankHardwareProfiles(): [StudioProfile, StudioProfile] {
  return [
    buildHardwareProfile('MAC', 'Mac'),
    buildHardwareProfile('TV', 'TV')
  ];
}
