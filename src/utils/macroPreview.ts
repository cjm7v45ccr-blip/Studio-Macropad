import { ActionBinding, DeviceConnectionInfo, MacroStepConfig, TextMacroRepeatConfig } from '../types/studio';
import { actionToMacroSteps, describeFirmwareAction, stepToFirmwareAction } from '../data/firmwareCatalog';

export interface PreviewStep {
  step: MacroStepConfig;
  label: string;
  startMs: number;
  waitMs: number;
  repeats: number;
}

/** A compact single-cycle timeline. Never expands loops or sends device commands.
 * Offsets include configured waits only: transport/typing time cannot be predicted.
 */
export function buildMacroPreview(binding: ActionBinding) {
  const steps = actionToMacroSteps(binding.value, binding.repeatConfig);
  let elapsedMs = 0;
  const timeline: PreviewStep[] = steps.map((step, index) => {
    const repeats = Math.max(1, Math.min(999, step.repeatCount || 1));
    const delay = Math.max(0, step.delayMs || 0);
    const waitMs = step.actionType === 'delay'
      ? delay * repeats
      : delay * (repeats - 1 + (index < steps.length - 1 ? 1 : 0));
    const startMs = elapsedMs;
    elapsedMs += waitMs;
    return {
      step,
      repeats,
      startMs,
      waitMs,
      label: step.actionType === 'delay' ? 'Wait'
        : step.actionType === 'text' ? `Type ${JSON.stringify(step.value)}`
        : describeFirmwareAction(stepToFirmwareAction(step)).fullLabel
    };
  });
  const cycles = Math.max(1, Math.min(999, binding.repeatConfig?.repeatCount || 1));
  const loop = Boolean(binding.repeatConfig?.loopUntilStopped);
  const repeatDelayMs = Math.max(10, binding.repeatConfig?.repeatDelayMs || 0);
  const simulationConfig: TextMacroRepeatConfig = {
    text: '', followUpKey: '', keyDelayMs: 0,
    steps, repeatCount: 1, loopUntilStopped: false, repeatDelayMs
  };
  return {
    timeline, simulationConfig, cycles, loop, repeatDelayMs,
    cycleWaitMs: elapsedMs,
    totalWaitMs: loop ? null : elapsedMs * cycles + (cycles - 1) * repeatDelayMs
  };
}

/** Captures the test target so confirmation cannot carry over to another device. */
export function testTargetKey(connection: Pick<DeviceConnectionInfo, 'connected' | 'transport'> & Partial<Pick<DeviceConnectionInfo, 'deviceId' | 'deviceName' | 'telemetry'>>) {
  return `${connection.connected}:${connection.transport}:${connection.deviceId || connection.deviceName || ''}:${connection.telemetry?.activeProfile || ''}:${connection.telemetry?.bleActiveHost || ''}`;
}
