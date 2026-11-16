import { GyroCalibrationProfile } from '../types/studio';

export const DEFAULT_GYRO_CALIBRATION: GyroCalibrationProfile = {
  isCalibrated: false,
  pitchOffset: 0,
  rollOffset: 0,
  yawOffset: 0,
  pitchScale: 1.0,
  rollScale: 1.0,
  yawScale: 1.0,
  invertPitch: false,
  invertRoll: false,
  swapXY: false,
  deadzoneDeg: 0.4
};

export function applyMotionOrientationAndDeadzone(
  rawPitch: number,
  rawRoll: number,
  rawYaw: number,
  profile: GyroCalibrationProfile
): { pitchDelta: number; rollDelta: number; yawDelta: number } {
  const calibratedPitch = profile.isCalibrated
    ? (rawPitch - profile.pitchOffset) * profile.pitchScale
    : rawPitch;
  const calibratedRoll = profile.isCalibrated
    ? (rawRoll - profile.rollOffset) * profile.rollScale
    : rawRoll;
  const calibratedYaw = profile.isCalibrated
    ? (rawYaw - (profile.yawOffset || 0)) * (profile.yawScale || 1.0)
    : rawYaw;

  const orientedPitch = profile.swapXY ? calibratedRoll : calibratedPitch;
  const orientedRoll = profile.swapXY ? calibratedPitch : calibratedRoll;

  const signedPitch = orientedPitch * (profile.invertPitch ? -1 : 1);
  const signedRoll = orientedRoll * (profile.invertRoll ? -1 : 1);

  const deadzone = Math.max(0, Math.min(8, Number(profile.deadzoneDeg ?? 0.4)));
  const pitchDelta = Math.abs(signedPitch) < deadzone ? 0 : signedPitch;
  const rollDelta = Math.abs(signedRoll) < deadzone ? 0 : signedRoll;
  const yawDelta = Math.abs(calibratedYaw) < deadzone ? 0 : calibratedYaw;

  return { pitchDelta, rollDelta, yawDelta };
}

export function computeGyroCalibration(
  flatPitch: number,
  flatRoll: number,
  flatYaw: number,
  leftRoll: number,
  rightRoll: number,
  backwardPitch: number,
  forwardPitch: number,
  existing?: Partial<GyroCalibrationProfile>
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
    invertPitch: Boolean(existing?.invertPitch),
    invertRoll: Boolean(existing?.invertRoll),
    swapXY: Boolean(existing?.swapXY),
    deadzoneDeg: existing?.deadzoneDeg ?? 0.4,
    calibratedAt: new Date().toISOString()
  };
}

