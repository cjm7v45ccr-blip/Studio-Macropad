import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Compass,
  Activity,
  RefreshCw,
  SlidersHorizontal,
  ShieldAlert,
  RotateCcw
} from 'lucide-react';
import { ToastVariant } from '../hooks/useStudioState';
import { MotionSlotId, GyroCalibrationProfile } from '../types/studio';
import { gestureTypeToMotionSlot, SLOT_LABELS } from '../data/firmwareCatalog';
import { usbHardware } from '../services/usbHardwareService';
import { soundEngine } from '../services/soundEffects';
import { DEFAULT_GYRO_CALIBRATION } from '../utils/motionCalibration';

export interface MotionTelemetryState {
  present: boolean;
  enabled: boolean;
  wake: boolean;
  sensitivity: number;
  who?: number;
}

interface MotionSettingsProps {
  motion?: MotionTelemetryState;
  supported: boolean;
  connected: boolean;
  onToast: (msg: string, variant?: ToastVariant) => void;
  onJumpToMotionSlot?: (slot: MotionSlotId) => void;
  gyroCalibration?: GyroCalibrationProfile;
  onUpdateGyroCalibration?: (calib: GyroCalibrationProfile) => void;
}

const SENSITIVITY_LABELS: Record<number, string> = {
  1: 'Least sensitive (firm)',
  2: 'Low',
  3: 'Balanced (default)',
  4: 'High',
  5: 'Most sensitive'
};

export const MotionSettings: React.FC<MotionSettingsProps> = ({
  motion,
  supported,
  connected,
  onToast,
  onJumpToMotionSlot,
  gyroCalibration,
  onUpdateGyroCalibration
}) => {
  const effectivePresent = motion?.present ?? true;
  const effectiveEnabled = motion?.enabled ?? true;
  const effectiveWake = motion?.wake ?? true;
  const effectiveSensitivity = Math.max(1, Math.min(5, Math.round(motion?.sensitivity ?? 3)));

  const [enabled, setEnabled] = useState<boolean>(effectiveEnabled);
  const [wake, setWake] = useState<boolean>(effectiveWake);
  const [sensitivity, setSensitivity] = useState<number>(effectiveSensitivity);
  const [savingBusy, setSavingBusy] = useState<boolean>(false);
  const [calibrating, setCalibrating] = useState<boolean>(false);
  const [calibrationStatus, setCalibrationStatus] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [testActive, setTestActive] = useState<boolean>(false);
  const [reading, setReading] = useState<{
    ax: number;
    ay: number;
    az: number;
    temp_c?: number;
    face_up?: number;
  } | null>(null);
  const [flashedSlot, setFlashedSlot] = useState<MotionSlotId | null>(null);
  const [lastGestureSlot, setLastGestureSlot] = useState<MotionSlotId | null>(null);

  // 3D Directional Calibration States
  const [profile, setProfile] = useState<GyroCalibrationProfile>(() => {
    if (gyroCalibration) return { ...DEFAULT_GYRO_CALIBRATION, ...gyroCalibration };
    try {
      const raw = localStorage.getItem('bertopad_gyro_calib');
      if (raw) return { ...DEFAULT_GYRO_CALIBRATION, ...JSON.parse(raw) };
    } catch {}
    return { ...DEFAULT_GYRO_CALIBRATION };
  });

  const committedSensitivityRef = useRef<number>(effectiveSensitivity);
  const flashTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (gyroCalibration) {
      setProfile({ ...DEFAULT_GYRO_CALIBRATION, ...gyroCalibration });
    }
  }, [gyroCalibration]);

  useEffect(() => {
    const onCalibUpdate = (e: any) => {
      if (e.detail) {
        setProfile(e.detail);
      }
    };
    window.addEventListener('bertopad_gyro_calib_updated', onCalibUpdate);
    return () => window.removeEventListener('bertopad_gyro_calib_updated', onCalibUpdate);
  }, []);

  useEffect(() => {
    setEnabled(effectiveEnabled);
  }, [effectiveEnabled]);

  useEffect(() => {
    setWake(effectiveWake);
  }, [effectiveWake]);

  useEffect(() => {
    setSensitivity(effectiveSensitivity);
    committedSensitivityRef.current = effectiveSensitivity;
  }, [effectiveSensitivity]);

  useEffect(() => {
    if (!connected) {
      setTestActive(false);
    }
  }, [connected]);

  useEffect(() => {
    if (!supported || !testActive || !connected || !effectivePresent) {
      return;
    }

    let cancelled = false;
    let inFlight = false;

    const pollOnce = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const res = await usbHardware.readMotion();
        if (!cancelled && res?.ok) {
          setReading({
            ax: typeof res.ax === 'number' ? res.ax : 0,
            ay: typeof res.ay === 'number' ? res.ay : 0,
            az: typeof res.az === 'number' ? res.az : 1000,
            temp_c: typeof res.temp_c === 'number' ? res.temp_c : undefined,
            face_up: typeof res.face_up === 'number' ? res.face_up : undefined
          });
        }
      } catch {
        // Ignore transient read errors while polling live test panel
      } finally {
        inFlight = false;
      }
    };

    pollOnce();
    const timer = window.setInterval(pollOnce, 250);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [supported, testActive, connected, effectivePresent]);

  useEffect(() => {
    if (!supported) return;
    const unsub = usbHardware.onHardwareEvent(pkt => {
      if (pkt.event === 'gesture') {
        const slot = gestureTypeToMotionSlot(pkt.type);
        if (!slot) return;
        setLastGestureSlot(slot);
        setFlashedSlot(slot);
        if (flashTimerRef.current !== null) {
          window.clearTimeout(flashTimerRef.current);
        }
        flashTimerRef.current = window.setTimeout(() => {
          flashTimerRef.current = null;
          setFlashedSlot(null);
        }, 900);
      }
    });
    return () => {
      unsub();
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current);
      }
    };
  }, [supported]);

  const applyMotionPatch = useCallback(
    async (patch: { enabled?: boolean; wake?: boolean; sensitivity?: number }) => {
      if (!connected) return;
      setSavingBusy(true);
      try {
        const res = await usbHardware.setMotionSettings(patch);
        onToast(res.message || 'Motion settings saved.', 'success');
      } catch (err: any) {
        onToast(err?.message || 'Could not update motion settings on BertoPad', 'error');
      } finally {
        setSavingBusy(false);
      }
    },
    [connected, onToast]
  );

  const commitSensitivityIfChanged = useCallback(
    (rawNext: number) => {
      if (!connected) return;
      const clamped = Math.max(1, Math.min(5, Math.round(rawNext || 3)));
      setSensitivity(clamped);
      if (clamped === committedSensitivityRef.current) return;
      committedSensitivityRef.current = clamped;
      applyMotionPatch({ sensitivity: clamped });
    },
    [connected, applyMotionPatch]
  );

  const handleToggleEnabled = () => {
    if (!connected || savingBusy) return;
    const nextVal = !enabled;
    setEnabled(nextVal);
    applyMotionPatch({ enabled: nextVal });
  };

  const handleToggleWake = () => {
    if (!connected || savingBusy) return;
    const nextVal = !wake;
    setWake(nextVal);
    applyMotionPatch({ wake: nextVal });
  };

  const handleCalibrate = async () => {
    if (!connected || calibrating) return;
    setCalibrating(true);
    setCalibrationStatus(null);
    try {
      const res = await usbHardware.calibrateMotion();
      const msg =
        res.message ||
        (res.ok
          ? 'Current position saved as flat, face-up.'
          : 'Keep the pad still while calibrating.');
      setCalibrationStatus({ ok: Boolean(res.ok), message: msg });
      onToast(msg, res.ok ? 'success' : 'error');
    } catch (err: any) {
      const msg = err?.message || 'Keep the pad still while calibrating.';
      setCalibrationStatus({ ok: false, message: msg });
      onToast(msg, 'error');
    } finally {
      setCalibrating(false);
    }
  };

  if (!supported) {
    return null;
  }

  const controlsDisabled = !connected || !effectivePresent;
  const bubbleOffsetX = Math.max(-34, Math.min(34, ((reading?.ax ?? 0) / 1000) * 34));
  const bubbleOffsetY = Math.max(-34, Math.min(34, ((reading?.ay ?? 0) / 1000) * 34));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <Compass className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            Motion &amp; Orientation Sensor
          </span>
          <span className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums">
            · {effectivePresent ? 'Connected' : 'Sensor offline'}
          </span>
        </div>

        {effectivePresent && (
          <button
            type="button"
            disabled={!connected}
            onClick={() => setTestActive(v => !v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              !connected
                ? 'opacity-45 cursor-not-allowed studio-btn text-[var(--text-muted)]'
                : testActive
                ? 'bg-[var(--text-primary)] text-[var(--bg-canvas)] cursor-pointer'
                : 'studio-btn text-[var(--text-primary)] cursor-pointer'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{testActive ? 'Close Test Sensor' : 'Test Sensor'}</span>
          </button>
        )}
      </div>

      {!effectivePresent ? (
        <div className="py-3 border-y border-[var(--border-subtle)] flex items-start gap-2.5 text-xs text-[var(--text-secondary)]">
          <ShieldAlert className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
          <span>
            Motion sensor not detected. Check connection and refresh status to enable motion controls.
          </span>
        </div>
      ) : (
        <>
          {/* Enabled & Wake Switches */}
          <div className="divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
            <div className="py-3 flex items-center justify-between gap-4">
              <div className="space-y-0.5 min-w-0">
                <div
                  id="motion-enabled-label"
                  className="text-xs font-medium text-[var(--text-primary)]"
                >
                  Motion gestures
                </div>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Shake, face-down, and face-up triggers
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-labelledby="motion-enabled-label"
                aria-checked={enabled}
                disabled={controlsDisabled || savingBusy}
                onClick={handleToggleEnabled}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                  controlsDisabled || savingBusy
                    ? 'opacity-40 cursor-not-allowed'
                    : 'cursor-pointer'
                } ${
                  enabled
                    ? 'bg-[var(--accent)] border-transparent'
                    : 'bg-[var(--bg-input)] border-[var(--border-strong)]'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full shadow-sm ring-0 transition duration-200 ease-in-out ${
                    enabled
                      ? 'translate-x-4 bg-[var(--accent-contrast)]'
                      : 'translate-x-0 bg-[var(--text-secondary)]'
                  }`}
                />
              </button>
            </div>

            <div className="py-3 flex items-center justify-between gap-4">
              <div className="space-y-0.5 min-w-0">
                <div
                  id="motion-wake-label"
                  className="text-xs font-medium text-[var(--text-primary)]"
                >
                  Wake screen on pick-up
                </div>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Wake sleeping OLED when pad moves
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-labelledby="motion-wake-label"
                aria-checked={wake}
                disabled={controlsDisabled || savingBusy}
                onClick={handleToggleWake}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                  controlsDisabled || savingBusy
                    ? 'opacity-40 cursor-not-allowed'
                    : 'cursor-pointer'
                } ${
                  wake
                    ? 'bg-[var(--accent)] border-transparent'
                    : 'bg-[var(--bg-input)] border-[var(--border-strong)]'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full shadow-sm ring-0 transition duration-200 ease-in-out ${
                    wake
                      ? 'translate-x-4 bg-[var(--accent-contrast)]'
                      : 'translate-x-0 bg-[var(--text-secondary)]'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Sensitivity Slider (1–5, commits on release to protect NVS flash) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label
                htmlFor="motion-sensitivity-range"
                className="text-xs font-medium text-[var(--text-primary)] flex items-center gap-1.5"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                <span>Gesture sensitivity</span>
              </label>
              <span className="font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
                {sensitivity} / 5 · {SENSITIVITY_LABELS[sensitivity] || 'Balanced'}
              </span>
            </div>

            <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
              <input
                id="motion-sensitivity-range"
                type="range"
                min={1}
                max={5}
                step={1}
                disabled={controlsDisabled}
                value={sensitivity}
                onChange={e =>
                  setSensitivity(Math.max(1, Math.min(5, Math.round(Number(e.target.value) || 3))))
                }
                onPointerUp={e => commitSensitivityIfChanged(Number(e.currentTarget.value))}
                onKeyUp={e => commitSensitivityIfChanged(Number(e.currentTarget.value))}
                onBlur={e => commitSensitivityIfChanged(Number(e.currentTarget.value))}
                className="flex-1 min-w-[140px] accent-[var(--accent)] cursor-pointer disabled:opacity-45"
              />

              <div className="flex items-center gap-1 shrink-0">
                {([1, 2, 3, 4, 5] as const).map(lvl => {
                  const active = sensitivity === lvl;
                  return (
                    <button
                      key={lvl}
                      type="button"
                      disabled={controlsDisabled}
                      onClick={() => commitSensitivityIfChanged(lvl)}
                      className={`w-7 h-7 rounded-md font-mono text-[11px] transition-colors cursor-pointer tabular-nums disabled:opacity-45 ${
                        active
                          ? 'bg-[var(--text-primary)] text-[var(--bg-canvas)] font-semibold'
                          : 'bg-transparent hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                      title={`Sensitivity ${lvl}: ${SENSITIVITY_LABELS[lvl]}`}
                    >
                      {lvl}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between font-mono text-[10px] text-[var(--text-muted)] tabular-nums">
              <span>1 · Least sensitive</span>
              <span>3 · Default</span>
              <span>5 · Most sensitive</span>
            </div>
          </div>

          {/* Sensor Calibration & 3D Normalization */}
          <div className="pt-4 border-t border-[var(--border-subtle)] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  Sensor Calibration &amp; 3D Normalization
                </div>
                <p className="font-mono text-[11px] text-[var(--text-muted)]">
                  MPU-6050 flat desk reference · axis orientation
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <button
                  type="button"
                  disabled={controlsDisabled || calibrating}
                  onClick={handleCalibrate}
                  title="Zero the pad's hardware flat reference on NVS"
                  className="studio-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-primary)] disabled:opacity-40 cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 shrink-0 ${calibrating ? 'animate-spin' : ''}`}
                  />
                  <span>{calibrating ? 'Zeroing…' : 'Quick Flat Zero'}</span>
                </button>
              </div>
            </div>

            {/* Active Normalization Metrics Row */}
            <div className="py-2.5 border-y border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-4 flex-wrap font-mono tabular-nums text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className="text-[var(--text-muted)]">Roll</span>
                  <span className="font-semibold text-[var(--text-primary)]">{profile.rollScale.toFixed(2)}×</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[var(--text-muted)]">Pitch</span>
                  <span className="font-semibold text-[var(--text-primary)]">{profile.pitchScale.toFixed(2)}×</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[var(--text-muted)]">Offsets</span>
                  <span className="text-[var(--text-secondary)]">
                    P {profile.pitchOffset >= 0 ? '+' : ''}{profile.pitchOffset.toFixed(1)}° · R {profile.rollOffset >= 0 ? '+' : ''}{profile.rollOffset.toFixed(1)}°
                  </span>
                </div>
                {profile.calibratedAt && (
                  <span className="text-[10px] text-[var(--text-muted)]">
                    · {new Date(profile.calibratedAt).toLocaleDateString()}
                  </span>
                )}
              </div>

              {(profile.isCalibrated ||
                profile.rollScale !== 1 ||
                profile.pitchScale !== 1 ||
                profile.pitchOffset !== 0 ||
                profile.rollOffset !== 0 ||
                profile.invertPitch ||
                profile.invertRoll ||
                profile.swapXY ||
                (profile.deadzoneDeg ?? 0.4) !== 0.4) && (
                <button
                  type="button"
                  onClick={() => {
                    const neutral: GyroCalibrationProfile = { ...DEFAULT_GYRO_CALIBRATION };
                    setProfile(neutral);
                    localStorage.setItem('bertopad_gyro_calib', JSON.stringify(neutral));
                    onUpdateGyroCalibration?.(neutral);
                    window.dispatchEvent(new CustomEvent('bertopad_gyro_calib_updated', { detail: neutral }));
                    soundEngine.playDialTick();
                    onToast('3D calibration & orientation reset to defaults.', 'success');
                  }}
                  className="flex items-center gap-1 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Calibration</span>
                </button>
              )}
            </div>

            {/* MPU-6050 Axis Orientation & Tilt Deadzone */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-medium text-[var(--text-primary)]">
                  Axis Orientation &amp; Tilt Deadzone
                </span>
                <span className="font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
                  Deadzone {(profile.deadzoneDeg ?? 0.4).toFixed(1)}°
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                {(
                  [
                    { key: 'invertPitch', label: 'Invert Pitch' },
                    { key: 'invertRoll', label: 'Invert Roll' },
                    { key: 'swapXY', label: 'Swap X-Y Axes' }
                  ] as const
                ).map(item => {
                  const active = Boolean(profile[item.key]);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        const next: GyroCalibrationProfile = {
                          ...profile,
                          [item.key]: !active
                        };
                        setProfile(next);
                        localStorage.setItem('bertopad_gyro_calib', JSON.stringify(next));
                        onUpdateGyroCalibration?.(next);
                        window.dispatchEvent(
                          new CustomEvent('bertopad_gyro_calib_updated', { detail: next })
                        );
                        soundEngine.playKeyClick();
                      }}
                      className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                        active
                          ? 'bg-[var(--bg-selected)] text-[var(--text-primary)]'
                          : 'bg-transparent hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <span>{item.label}</span>
                      <span
                        className={`font-mono text-[10px] uppercase ${
                          active ? 'text-[var(--accent)] font-semibold' : 'text-[var(--text-muted)]'
                        }`}
                      >
                        {active ? 'ON' : 'OFF'}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                <label
                  htmlFor="mpu-deadzone-slider"
                  className="text-[11px] font-medium text-[var(--text-secondary)] whitespace-nowrap"
                >
                  Deadzone angle
                </label>
                <input
                  id="mpu-deadzone-slider"
                  type="range"
                  min={0}
                  max={3.0}
                  step={0.1}
                  value={profile.deadzoneDeg ?? 0.4}
                  onChange={e => {
                    const nextVal = Math.max(0, Math.min(3.0, Number(e.target.value)));
                    const next: GyroCalibrationProfile = {
                      ...profile,
                      deadzoneDeg: Number(nextVal.toFixed(1))
                    };
                    setProfile(next);
                    localStorage.setItem('bertopad_gyro_calib', JSON.stringify(next));
                    onUpdateGyroCalibration?.(next);
                    window.dispatchEvent(
                      new CustomEvent('bertopad_gyro_calib_updated', { detail: next })
                    );
                  }}
                  className="flex-1 min-w-[140px] accent-[var(--accent)] cursor-pointer"
                />
                <span className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums whitespace-nowrap">
                  0.0° – 3.0°
                </span>
              </div>
            </div>

            {calibrationStatus && (
              <div
                role="status"
                className={`text-xs font-mono px-3 py-2 rounded-lg border ${
                  calibrationStatus.ok
                    ? 'border-[var(--border-strong)] bg-[var(--bg-selected)] text-[var(--text-primary)]'
                    : 'border-[#D97706] bg-[var(--bg-input)] text-[var(--text-primary)]'
                }`}
              >
                {calibrationStatus.message}
              </div>
            )}
          </div>

          {/* Live Gesture Action Slots Flash Strip */}
          <div className="pt-4 border-t border-[var(--border-subtle)] space-y-2.5">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="font-medium text-[var(--text-secondary)]">
                Gesture slots
              </span>
              <span className="font-mono text-[var(--text-muted)] tabular-nums">
                {lastGestureSlot
                  ? `Last: ${SLOT_LABELS[lastGestureSlot].short}`
                  : 'Waiting for gesture'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
              {(['g_shake', 'g_down', 'g_up'] as const).map(slot => {
                const isFlashing = flashedSlot === slot;
                const title =
                  slot === 'g_shake'
                    ? 'Shake'
                    : slot === 'g_down'
                    ? 'Face Down'
                    : 'Face Up';

                return (
                  <button
                    key={slot}
                    type="button"
                    disabled={!onJumpToMotionSlot}
                    onClick={() => onJumpToMotionSlot?.(slot)}
                    className={`px-3 py-2 rounded-lg text-left flex items-center justify-between gap-2 transition-colors ${
                      onJumpToMotionSlot ? 'cursor-pointer' : 'cursor-default'
                    } ${
                      isFlashing
                        ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                        : 'bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)]'
                    }`}
                  >
                    <span className="text-xs font-medium truncate">{title}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Opt-in Live Sensor Test & Bubble Level (`GET /api/motion/read`) */}
          {testActive && (
            <div className="pt-4 border-t border-[var(--border-subtle)] space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  Live Sensor Readout &amp; Bubble Level
                </span>
                <span className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums">
                  {reading && typeof reading.temp_c === 'number'
                    ? `${reading.temp_c.toFixed(1)} °C`
                    : 'Sampling /api/motion/read…'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center pt-1">
                <div className="font-mono text-xs space-y-1.5 tabular-nums">
                  <div className="text-[11px] font-sans font-medium text-[var(--text-muted)]">
                    Acceleration (milli-g)
                  </div>
                  <div className="flex items-center justify-between py-0.5 border-b border-[var(--border-subtle)]">
                    <span className="text-[var(--text-secondary)]">AX</span>
                    <span className="font-semibold text-[var(--text-primary)]">
                      {reading?.ax ?? 0} mg
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-0.5 border-b border-[var(--border-subtle)]">
                    <span className="text-[var(--text-secondary)]">AY</span>
                    <span className="font-semibold text-[var(--text-primary)]">
                      {reading?.ay ?? 0} mg
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-0.5">
                    <span className="text-[var(--text-secondary)]">AZ</span>
                    <span className="font-semibold text-[var(--text-primary)]">
                      {reading?.az ?? 1000} mg
                    </span>
                  </div>
                </div>

                <div className="font-mono text-xs space-y-1.5 tabular-nums">
                  <div className="text-[11px] font-sans font-medium text-[var(--text-muted)]">
                    Orientation
                  </div>
                  <div className="flex items-center justify-between py-0.5 border-b border-[var(--border-subtle)]">
                    <span className="text-[var(--text-secondary)]">State</span>
                    <span className="font-semibold text-[var(--accent)]">
                      {reading?.face_up !== undefined
                        ? reading.face_up > 0.65
                          ? 'Face Up'
                          : reading.face_up < -0.65
                          ? 'Face Down'
                          : 'Tilted'
                        : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-0.5 border-b border-[var(--border-subtle)]">
                    <span className="text-[var(--text-secondary)]">face_up</span>
                    <span className="font-semibold text-[var(--text-primary)]">
                      {reading?.face_up !== undefined ? reading.face_up.toFixed(2) : '1.00'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-0.5">
                    <span className="text-[var(--text-secondary)]">Die temp</span>
                    <span className="font-semibold text-[var(--text-primary)]">
                      {reading?.temp_c !== undefined ? `${reading.temp_c.toFixed(1)} °C` : '—'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center gap-1.5">
                  <span className="text-[11px] font-medium text-[var(--text-muted)]">
                    Bubble level
                  </span>
                  <div
                    aria-label="2D accelerometer bubble level"
                    className="relative w-24 h-24 rounded-full bg-[var(--bg-panel)] border border-[var(--border-strong)] flex items-center justify-center overflow-hidden"
                  >
                    <div className="absolute inset-x-0 top-1/2 h-px bg-[var(--border-subtle)]" />
                    <div className="absolute inset-y-0 left-1/2 w-px bg-[var(--border-subtle)]" />
                    <div className="absolute w-8 h-8 rounded-full border border-dashed border-[var(--border-strong)] pointer-events-none" />
                    <div
                      style={{
                        transform: `translate(${bubbleOffsetX.toFixed(1)}px, ${bubbleOffsetY.toFixed(1)}px)`
                      }}
                      className="w-4 h-4 rounded-full bg-[var(--accent)] transition-transform duration-75"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
