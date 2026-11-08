import { GyroCalibrationProfile } from '../types/studio';

export const DEFAULT_GYRO_CALIBRATION: GyroCalibrationProfile = {
  isCalibrated: false,
  pitchOffset: 0,
  rollOffset: 0,
  yawOffset: 0,
  pitchScale: 1.0,
  rollScale: 1.0,
  yawScale: 1.0
};

export function computeGyroCalibration(
  flatPitch: number,
  flatRoll: number,
  flatYaw: number,
  leftRoll: number,
  rightRoll: number,
  backwardPitch: number,
  forwardPitch: number
): GyroCalibrationProfile {
  const rollDiff = rightRoll - leftRoll;
  const rawRollScale = Math.abs(rollDiff) > 3 ? 60 / rollDiff : 1.0;
  const rollScale = Math.sign(rawRollScale) * Math.min(3.0, Math.max(0.3, Math.abs(rawRollScale)));

  const pitchDiff = forwardPitch - backwardPitch;
  const rawPitchScale = Math.abs(pitchDiff) > 3 ? -50 / pitchDiff : -1.0;
  const pitchScale = Math.sign(rawPitchScale) * Math.min(3.0, Math.max(0.3, Math.abs(rawPitchScale)));

  return {
    isCalibrated: true,
    pitchOffset: Number(flatPitch.toFixed(2)),
    rollOffset: Number(flatRoll.toFixed(2)),
    yawOffset: Number(flatYaw.toFixed(2)),
    pitchScale: Number(pitchScale.toFixed(3)),
    rollScale: Number(rollScale.toFixed(3)),
    yawScale: 1.0,
    calibratedAt: new Date().toISOString()
  };
}
