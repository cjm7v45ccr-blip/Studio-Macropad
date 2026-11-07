import { useState, useEffect, useRef, useCallback } from 'react';
import { GyroCalibrationProfile } from '../types/studio';
import { usbHardware } from '../services/usbHardwareService';

export interface MotionSensorOptions {
  /** Whether live sensor polling and hardware event subscriptions are active. Default: true */
  enabled?: boolean;
  /** Polling frequency in milliseconds. Default: 40ms (~25Hz) */
  pollIntervalMs?: number;
  /** Optional custom calibration profile overriding localStorage */
  calibration?: GyroCalibrationProfile;
  /** Default pitch baseline angle in degrees for isometric UI. Default: 18 */
  defaultPitchBaseline?: number;
  /** Default roll baseline angle in degrees for isometric UI. Default: -8 */
  defaultRollBaseline?: number;
}

export interface MotionSensorState {
  /** Normalized pitch angle in degrees (with baseline and calibration applied) */
  pitch: number;
  /** Normalized roll angle in degrees (with baseline and calibration applied) */
  roll: number;
  /** Estimated yaw (planar tilt/heading) angle in degrees */
  yaw: number;
  /** Uncalibrated raw pitch angle in degrees */
  rawPitch: number;
  /** Uncalibrated raw roll angle in degrees */
  rawRoll: number;
  /** Uncalibrated raw yaw angle in degrees */
  rawYaw: number;
  /** Acceleration X axis in milli-g */
  ax: number;
  /** Acceleration Y axis in milli-g */
  ay: number;
  /** Acceleration Z axis in milli-g */
  az: number;
  /** True when high acceleration jerk (shake) is physically detected */
  shakeActive: boolean;
  /** Spring displacement offset in pixels for 3D UI physics rendering */
  shakeZOffset: number;
  /** True when connected and GY-521 MPU-6050 sensor is actively returning samples */
  isOnline: boolean;
  /** Die temperature in °C if reported by hardware */
  tempC?: number;
  /** Orientation vector face_up score (-1.0 face down to +1.0 face up) */
  faceUp?: number;
  /** Active calibration profile used for normalization */
  calibrationProfile: GyroCalibrationProfile;
  /** Zero the pad's hardware flat reference on NVS storage */
  calibrateFlatZero: () => Promise<{ ok: boolean; message: string }>;
}

const DEFAULT_CALIBRATION: GyroCalibrationProfile = {
  pitchOffset: 0,
  rollOffset: 0,
  rollScale: 1.0,
  pitchScale: 1.0
};

export function useMotionSensor(options: MotionSensorOptions = {}): MotionSensorState {
  const {
    enabled = true,
    pollIntervalMs = 40,
    calibration: customCalibration,
    defaultPitchBaseline = 18,
    defaultRollBaseline = -8
  } = options;

  const [calibProfile, setCalibProfile] = useState<GyroCalibrationProfile>(() => {
    if (customCalibration) return customCalibration;
    try {
      const raw = localStorage.getItem('bertopad_gyro_calib');
      if (raw) return JSON.parse(raw);
    } catch {}
    return DEFAULT_CALIBRATION;
  });

  const [sensorData, setSensorData] = useState<{
    pitch: number;
    roll: number;
    yaw: number;
    rawPitch: number;
    rawRoll: number;
    rawYaw: number;
    ax: number;
    ay: number;
    az: number;
    shakeActive: boolean;
    shakeZOffset: number;
    isOnline: boolean;
    tempC?: number;
    faceUp?: number;
  }>({
    pitch: defaultPitchBaseline,
    roll: defaultRollBaseline,
    yaw: 0,
    rawPitch: 0,
    rawRoll: 0,
    rawYaw: 0,
    ax: 0,
    ay: 0,
    az: 1000,
    shakeActive: false,
    shakeZOffset: 0,
    isOnline: false
  });

  const prevAccelRef = useRef<{ ax: number; ay: number; az: number }>({ ax: 0, ay: 0, az: 1000 });
  const shakeTimerRef = useRef<number | null>(null);

  // Sync custom calibration prop or window updates
  useEffect(() => {
    if (customCalibration) {
      setCalibProfile(customCalibration);
    }
  }, [customCalibration]);

  useEffect(() => {
    const handleUpdate = (e: any) => {
      if (e.detail) {
        setCalibProfile(e.detail);
      } else {
        try {
          const raw = localStorage.getItem('bertopad_gyro_calib');
          if (raw) setCalibProfile(JSON.parse(raw));
        } catch {}
      }
    };
    window.addEventListener('bertopad_gyro_calib_updated', handleUpdate);
    return () => window.removeEventListener('bertopad_gyro_calib_updated', handleUpdate);
  }, []);

  // Subscribe to hardware shake gestures
  useEffect(() => {
    if (!enabled) return;
    const unsub = usbHardware.onHardwareEvent(pkt => {
      if (pkt.event === 'gesture' && pkt.type === 'shake') {
        setSensorData(prev => ({
          ...prev,
          shakeActive: true,
          shakeZOffset: (Math.random() - 0.5) * 18
        }));
        if (shakeTimerRef.current !== null) {
          window.clearTimeout(shakeTimerRef.current);
        }
        shakeTimerRef.current = window.setTimeout(() => {
          shakeTimerRef.current = null;
          setSensorData(prev => ({ ...prev, shakeActive: false, shakeZOffset: 0 }));
        }, 450);
      }
    });
    return () => {
      unsub();
      if (shakeTimerRef.current !== null) {
        window.clearTimeout(shakeTimerRef.current);
      }
    };
  }, [enabled]);

  // Poll GY-521 hardware telemetry
  useEffect(() => {
    if (!enabled || !usbHardware.info.connected) {
      setSensorData(prev => ({
        ...prev,
        pitch: defaultPitchBaseline,
        roll: defaultRollBaseline,
        yaw: 0,
        shakeZOffset: 0,
        shakeActive: false,
        isOnline: false
      }));
      return;
    }

    let cancelled = false;
    let inFlight = false;

    const poll = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const res = await usbHardware.readMotion();
        if (!cancelled && res?.ok) {
          const ax = typeof res.ax === 'number' ? res.ax : 0;
          const ay = typeof res.ay === 'number' ? res.ay : 0;
          const az = typeof res.az === 'number' ? res.az : 1000;
          const tempC = typeof res.temp_c === 'number' ? res.temp_c : undefined;
          const faceUp = typeof res.face_up === 'number' ? res.face_up : undefined;

          // Jerk acceleration check
          const prev = prevAccelRef.current;
          const deltaA = Math.sqrt(
            Math.pow(ax - prev.ax, 2) + Math.pow(ay - prev.ay, 2) + Math.pow(az - prev.az, 2)
          );
          prevAccelRef.current = { ax, ay, az };

          let currentShakeZ = 0;
          let isShakeJerk = deltaA > 480;
          if (isShakeJerk) {
            currentShakeZ = (Math.random() - 0.5) * 16;
          }

          // Convert raw accelerometer milli-g components to angular tilt in degrees
          const radToDeg = 180 / Math.PI;
          const rawPitch = Math.atan2(-ay, Math.sqrt(ax * ax + az * az)) * radToDeg;
          const rawRoll = Math.atan2(ax, az) * radToDeg;
          const rawYaw = Math.atan2(ax, ay) * radToDeg;

          // Apply normalization scale & offsets from calibration profile
          const effectiveRawPitch = (rawPitch - calibProfile.pitchOffset) * calibProfile.pitchScale;
          const effectiveRawRoll = (rawRoll - calibProfile.rollOffset) * calibProfile.rollScale;

          // Clamp for UI 3D perspective limits
          const clampedPitch = Math.max(-50, Math.min(60, effectiveRawPitch + defaultPitchBaseline));
          const clampedRoll = Math.max(-55, Math.min(55, effectiveRawRoll + defaultRollBaseline));

          setSensorData({
            pitch: clampedPitch,
            roll: clampedRoll,
            yaw: 0,
            rawPitch,
            rawRoll,
            rawYaw,
            ax,
            ay,
            az,
            shakeActive: isShakeJerk,
            shakeZOffset: isShakeJerk ? currentShakeZ : 0,
            isOnline: true,
            tempC,
            faceUp
          });
        }
      } catch {
        if (!cancelled) {
          setSensorData(prev => ({ ...prev, isOnline: false }));
        }
      } finally {
        inFlight = false;
      }
    };

    poll();
    const interval = window.setInterval(poll, Math.max(10, pollIntervalMs));

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [enabled, pollIntervalMs, calibProfile, defaultPitchBaseline, defaultRollBaseline]);

  const calibrateFlatZero = useCallback(async () => {
    try {
      const res = await usbHardware.calibrateMotion();
      return {
        ok: Boolean(res.ok),
        message: res.message || (res.ok ? 'Position saved as flat.' : 'Keep pad still while calibrating.')
      };
    } catch (err: any) {
      return {
        ok: false,
        message: err?.message || 'Could not send calibration command over USB.'
      };
    }
  }, []);

  return {
    ...sensorData,
    calibrationProfile: calibProfile,
    calibrateFlatZero
  };
}
