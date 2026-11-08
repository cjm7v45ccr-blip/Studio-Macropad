import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Compass,
  Activity,
  RefreshCw,
  SlidersHorizontal,
  ShieldAlert,
  Check,
  RotateCcw,
  Sparkles,
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  ArrowUp
} from 'lucide-react';
import { ToastVariant } from '../hooks/useStudioState';
import { MotionSlotId, GyroCalibrationProfile } from '../types/studio';
import { gestureTypeToMotionSlot, SLOT_LABELS } from '../data/firmwareCatalog';
import { usbHardware } from '../services/usbHardwareService';
import { soundEngine } from '../services/soundEffects';
import { computeGyroCalibration } from '../utils/motionCalibration';

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
  const effectiveWho = motion?.who ?? 0x68;

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
    if (gyroCalibration) return gyroCalibration;
    try {
      const raw = localStorage.getItem('bertopad_gyro_calib');
      if (raw) return JSON.parse(raw);
    } catch {}
    return {
      isCalibrated: false,
      pitchOffset: 0,
      rollOffset: 0,
      yawOffset: 0,
      pitchScale: 1.0,
      rollScale: 1.0,
      yawScale: 1.0
    };
  });

  const committedSensitivityRef = useRef<number>(effectiveSensitivity);
  const flashTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (gyroCalibration) {
      setProfile(gyroCalibration);
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
    <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)] flex-wrap">
            <Compass className="w-4 h-4 text-[var(--accent)] shrink-0" />
            <span>Motion &amp; Orientation Sensor</span>
            <span className="font-mono text-[11px] font-normal text-[var(--text-muted)] tabular-nums">
              ·{' '}
              {effectivePresent
                ? `GY-521 · 0x${effectiveWho.toString(16).toUpperCase()}`
                : 'Sensor offline'}
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            Configure shake and face-up / face-down tilt gestures, pick-up screen wake, sensitivity, and flat desk calibration.
          </p>
        </div>

        {effectivePresent && (
          <button
            type="button"
            disabled={!connected}
            onClick={() => setTestActive(v => !v)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              !connected
                ? 'opacity-45 cursor-not-allowed bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                : testActive
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)] border-[var(--accent)] cursor-pointer'
                : 'bg-[var(--bg-input)] hover:border-[var(--border-strong)] text-[var(--text-primary)] border-[var(--border-subtle)] cursor-pointer'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{testActive ? 'Close Test Sensor' : 'Test Sensor'}</span>
          </button>
        )}
      </div>

      {!effectivePresent ? (
        <div className="p-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex items-start gap-2.5 text-xs text-[var(--text-secondary)]">
          <ShieldAlert className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
          <span>
            No MPU-6050 / GY-521 sensor responded on I2C (SDA GPIO 21, SCL GPIO 22). Check wiring and refresh status to enable motion controls.
          </span>
        </div>
      ) : (
        <>
          {/* Enabled & Wake Switches */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="p-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex items-center justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                <div
                  id="motion-enabled-label"
                  className="text-xs font-semibold text-[var(--text-primary)]"
                >
                  Motion gestures
                </div>
                <p className="text-[11px] text-[var(--text-muted)] leading-snug">
                  Fire assigned actions on shake, face-down, and face-up tilts
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-labelledby="motion-enabled-label"
                aria-checked={enabled}
                disabled={controlsDisabled || savingBusy}
                onClick={handleToggleEnabled}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                  controlsDisabled || savingBusy
                    ? 'opacity-40 cursor-not-allowed'
                    : 'cursor-pointer'
                } ${
                  enabled
                    ? 'bg-[var(--accent)] border-transparent'
                    : 'bg-[var(--bg-panel)] border-[var(--border-strong)]'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full shadow-sm ring-0 transition duration-200 ease-in-out ${
                    enabled
                      ? 'translate-x-5 bg-[var(--accent-contrast)]'
                      : 'translate-x-0 bg-[var(--text-secondary)]'
                  }`}
                />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex items-center justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                <div
                  id="motion-wake-label"
                  className="text-xs font-semibold text-[var(--text-primary)]"
                >
                  Wake screen on pick-up
                </div>
                <p className="text-[11px] text-[var(--text-muted)] leading-snug">
                  Wake dimmed or sleeping OLED when the pad is moved
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-labelledby="motion-wake-label"
                aria-checked={wake}
                disabled={controlsDisabled || savingBusy}
                onClick={handleToggleWake}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                  controlsDisabled || savingBusy
                    ? 'opacity-40 cursor-not-allowed'
                    : 'cursor-pointer'
                } ${
                  wake
                    ? 'bg-[var(--accent)] border-transparent'
                    : 'bg-[var(--bg-panel)] border-[var(--border-strong)]'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full shadow-sm ring-0 transition duration-200 ease-in-out ${
                    wake
                      ? 'translate-x-5 bg-[var(--accent-contrast)]'
                      : 'translate-x-0 bg-[var(--text-secondary)]'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Sensitivity Slider (1–5, commits on release to protect NVS flash) */}
          <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label
                htmlFor="motion-sensitivity-range"
                className="text-xs font-medium text-[var(--text-primary)] flex items-center gap-1.5"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                <span>Gesture sensitivity</span>
              </label>
              <span className="font-mono text-[11px] text-[var(--accent)] font-semibold tabular-nums">
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
                      className={`w-7 h-7 rounded-lg font-mono text-[11px] transition-colors cursor-pointer tabular-nums disabled:opacity-45 ${
                        active
                          ? 'bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold'
                          : 'bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
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
          <div className="pt-3 border-t border-[var(--border-subtle)] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-xs font-semibold text-[var(--text-primary)]">
                    Sensor Calibration &amp; 3D Normalization
                  </div>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--accent)] font-semibold">
                    GY-521 · MPU6050
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                  Calibrate the physical flat resting reference and guide directional tilts (left, right, forward) to normalize rotation inputs for the 3D Tactile pad view.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <button
                  type="button"
                  disabled={controlsDisabled || calibrating}
                  onClick={handleCalibrate}
                  title="Zero the pad's hardware flat reference on NVS"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--border-strong)] disabled:opacity-40 cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 shrink-0 ${calibrating ? 'animate-spin' : ''}`}
                  />
                  <span>{calibrating ? 'Zeroing…' : 'Quick Flat Zero'}</span>
                </button>
              </div>
            </div>

            {/* Current Active Normalization Metrics Card */}
            <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3 sm:gap-4 flex-wrap font-mono tabular-nums text-[11px]">
                <div className="flex items-center gap-1">
                  <span className="text-[var(--text-muted)]">Roll Scale:</span>
                  <span className="font-bold text-[var(--accent)]">{profile.rollScale.toFixed(2)}×</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[var(--text-muted)]">Pitch Scale:</span>
                  <span className="font-bold text-[var(--accent)]">{profile.pitchScale.toFixed(2)}×</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[var(--text-muted)]">Offsets:</span>
                  <span className="text-[var(--text-primary)]">
                    P: {profile.pitchOffset >= 0 ? '+' : ''}{profile.pitchOffset.toFixed(1)}° · R: {profile.rollOffset >= 0 ? '+' : ''}{profile.rollOffset.toFixed(1)}°
                  </span>
                </div>
                {profile.calibratedAt && (
                  <span className="text-[10px] text-[var(--text-muted)]">
                    · Calibrated {new Date(profile.calibratedAt).toLocaleDateString()}
                  </span>
                )}
              </div>

              {(profile.isCalibrated || profile.rollScale !== 1 || profile.pitchScale !== 1 || profile.pitchOffset !== 0 || profile.rollOffset !== 0) && (
                <button
                  type="button"
                  onClick={() => {
                    const neutral: GyroCalibrationProfile = {
                      isCalibrated: false,
                      pitchOffset: 0,
                      rollOffset: 0,
                      yawOffset: 0,
                      pitchScale: 1.0,
                      rollScale: 1.0,
                      yawScale: 1.0
                    };
                    setProfile(neutral);
                    localStorage.setItem('bertopad_gyro_calib', JSON.stringify(neutral));
                    onUpdateGyroCalibration?.(neutral);
                    window.dispatchEvent(new CustomEvent('bertopad_gyro_calib_updated', { detail: neutral }));
                    soundEngine.playDialTick();
                    onToast('3D calibration reset to uncalibrated neutral.', 'success');
                  }}
                  className="flex items-center gap-1 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Calibration</span>
                </button>
              )}
            </div>

            {calibrationStatus && (
              <div
                role="status"
                className={`text-xs font-mono px-3 py-2 rounded-xl bg-[var(--bg-input)] border ${
                  calibrationStatus.ok
                    ? 'border-[var(--accent)] text-[var(--text-primary)]'
                    : 'border-[#D97706] text-[var(--text-primary)]'
                }`}
              >
                {calibrationStatus.message}
              </div>
            )}

          </div>

          {/* Live Gesture Action Slots Flash Strip */}
          <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="font-medium text-[var(--text-secondary)]">
                Gesture slots (flashes on live event)
              </span>
              <span className="font-mono text-[var(--text-muted)] tabular-nums">
                {lastGestureSlot
                  ? `Last: ${SLOT_LABELS[lastGestureSlot].short}`
                  : 'Waiting for gesture'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(['g_shake', 'g_down', 'g_up'] as const).map(slot => {
                const isFlashing = flashedSlot === slot;
                const meta =
                  slot === 'g_shake'
                    ? { title: 'Shake', idLabel: 'g_shake' }
                    : slot === 'g_down'
                    ? { title: 'Face Down', idLabel: 'g_down' }
                    : { title: 'Face Up', idLabel: 'g_up' };

                return (
                  <button
                    key={slot}
                    type="button"
                    disabled={!onJumpToMotionSlot}
                    onClick={() => onJumpToMotionSlot?.(slot)}
                    className={`px-3 py-2 rounded-xl border text-left flex items-center justify-between gap-2 transition-colors ${
                      onJumpToMotionSlot ? 'cursor-pointer' : 'cursor-default'
                    } ${
                      isFlashing
                        ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-contrast)]'
                        : 'bg-[var(--bg-input)] border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-[var(--text-primary)]'
                    }`}
                  >
                    <span className="text-xs font-semibold truncate">{meta.title}</span>
                    <span
                      className={`font-mono text-[10px] tabular-nums shrink-0 ${
                        isFlashing ? 'text-[var(--accent-contrast)]' : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {meta.idLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Opt-in Live Sensor Test & Bubble Level (`GET /api/motion/read`) */}
          {testActive && (
            <div className="pt-3 border-t border-[var(--border-subtle)] space-y-3">
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-stretch">
                <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] font-mono text-xs space-y-1.5 tabular-nums flex flex-col justify-center">
                  <div className="text-[11px] font-sans font-medium text-[var(--text-muted)]">
                    Acceleration (milli-g)
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-secondary)]">AX</span>
                    <span className="font-bold text-[var(--text-primary)]">
                      {reading?.ax ?? 0} mg
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-secondary)]">AY</span>
                    <span className="font-bold text-[var(--text-primary)]">
                      {reading?.ay ?? 0} mg
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-secondary)]">AZ</span>
                    <span className="font-bold text-[var(--text-primary)]">
                      {reading?.az ?? 1000} mg
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] font-mono text-xs space-y-1.5 tabular-nums flex flex-col justify-center">
                  <div className="text-[11px] font-sans font-medium text-[var(--text-muted)]">
                    Orientation vs. calibrated flat
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-secondary)]">State</span>
                    <span className="font-bold text-[var(--accent)]">
                      {reading?.face_up !== undefined
                        ? reading.face_up > 0.65
                          ? 'Face Up'
                          : reading.face_up < -0.65
                          ? 'Face Down'
                          : 'Tilted'
                        : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-secondary)]">face_up</span>
                    <span className="font-bold text-[var(--text-primary)]">
                      {reading?.face_up !== undefined ? reading.face_up.toFixed(2) : '1.00'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-secondary)]">Die temp</span>
                    <span className="font-bold text-[var(--text-primary)]">
                      {reading?.temp_c !== undefined ? `${reading.temp_c.toFixed(1)} °C` : '—'}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex flex-col items-center justify-center gap-2">
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
