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

export const ALL_KEY_IDS: KeyId[] = ['k1', 'k2', 'k3', 'k4', 'k5'];

export const KEY_TO_SLOT: Record<'k1' | 'k2' | 'k3' | 'k4', 'b1' | 'b2' | 'b3' | 'b4'> = {
  k1: 'b1',
  k2: 'b2',
  k3: 'b3',
  k4: 'b4'
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
  if (id === 'k5') {
    return {
      id: 'k5',
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

  const keys: Record<KeyId, KeyControlConfig> = {
    k1: makeHardwareKey(
      'k1',
      slots?.b1 || '',
      prevKeys?.k1?.appearance,
      repeatConfigs?.[`${id}:b1`]
    ),
    k2: makeHardwareKey(
      'k2',
      slots?.b2 || '',
      prevKeys?.k2?.appearance,
      repeatConfigs?.[`${id}:b2`]
    ),
    k3: makeHardwareKey(
      'k3',
      slots?.b3 || '',
      prevKeys?.k3?.appearance,
      repeatConfigs?.[`${id}:b3`]
    ),
    k4: makeHardwareKey(
      'k4',
      slots?.b4 || '',
      prevKeys?.k4?.appearance,
      repeatConfigs?.[`${id}:b4`]
    ),
    k5: makeHardwareKey('k5', '')
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
