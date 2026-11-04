import React, { useState, useEffect } from 'react';
import { Compass, Activity, RefreshCw, Sliders, ShieldAlert, Zap } from 'lucide-react';
import { usbHardware } from '../services/usbHardwareService';

interface MotionSettingsProps {
  motion?: {
    present: boolean;
    enabled: boolean;
    wake: boolean;
    sensitivity: number;
    who?: number;
  };
  supported: boolean;
  connected: boolean;
  onToast: (msg: string, variant?: any) => void;
}

export const MotionSettings: React.FC<MotionSettingsProps> = ({
  motion,
  supported,
  connected,
  onToast,
}) => {
  if (!supported || !motion) return null;

  const [enabled, setEnabled] = useState(motion.enabled);
  const [wake, setWake] = useState(motion.wake);
  const [sensitivity, setSensitivity] = useState(motion.sensitivity || 3);
  const [calibrating, setCalibrating] = useState(false);
  const [reading, setReading] = useState<{
    ax?: number;
    ay?: number;
    az?: number;
    temp_c?: number;
    face_up?: number;
  } | null>(null);
  const [testActive, setTestActive] = useState(false);
  const [lastGesture, setLastGesture] = useState<string | null>(null);
  const [flashGesture, setFlashGesture] = useState<string | null>(null);

  useEffect(() => {
    setEnabled(motion.enabled);
    setWake(motion.wake);
    setSensitivity(motion.sensitivity || 3);
  }, [motion]);

  useEffect(() => {
    if (!testActive || !connected || !motion.present) return;
    const interval = setInterval(async () => {
      try {
        const res = await usbHardware.readMotion();
        if (res?.ok) {
          setReading(res);
        }
      } catch {}
    }, 250);
    return () => clearInterval(interval);
  }, [testActive, connected, motion.present]);

  useEffect(() => {
    const unsub = usbHardware.onHardwareEvent(pkt => {
      if (pkt.event === 'gesture' && pkt.type) {
        setLastGesture(pkt.type);
        setFlashGesture(pkt.type);
        setTimeout(() => setFlashGesture(null), 1200);
      }
    });
    return unsub;
  }, []);

  const handleSave = async (patch: { enabled?: boolean; wake?: boolean; sensitivity?: number }) => {
    try {
      const res = await usbHardware.setMotionSettings(patch);
      onToast(res.message || 'Motion settings saved', 'success');
    } catch (err: any) {
      onToast(err?.message || 'Failed to save motion settings', 'error');
    }
  };

  const handleCalibrate = async () => {
    setCalibrating(true);
    try {
      const res = await usbHardware.calibrateMotion();
      onToast(res.message || 'Current position saved as flat.', 'success');
    } catch (err: any) {
      onToast(err?.message || 'Calibration failed', 'error');
    } finally {
      setCalibrating(false);
    }
  };

  return (
    <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-5 space-y-6 shadow-sm">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)]">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              Gyroscope &amp; Motion Sensor (GY-521 / MPU-6050)
            </h3>
            <p className="text-xs text-[var(--text-muted)] font-mono">
              {motion.present
                ? `Connected · Chip ID (WHO_AM_I): 0x${(motion.who || 0x68).toString(16)}`
                : 'No motion sensor detected. Check I2C wiring (SDA 21, SCL 22).'}
            </p>
          </div>
        </div>

        {motion.present && (
          <button
            type="button"
            onClick={() => setTestActive(!testActive)}
            className={`text-xs px-3.5 py-2 rounded-xl border font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
              testActive
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)] border-[var(--accent)]'
                : 'bg-[var(--bg-input)] text-[var(--text-primary)] border-[var(--border-subtle)] hover:border-[var(--accent)]'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>{testActive ? 'Test Sensor Active' : 'Test Sensor & Bubble Level'}</span>
          </button>
        )}
      </div>

      {motion.present ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Enable Motion Detection */}
            <div className="p-4 bg-[var(--bg-input)] rounded-xl border border-[var(--border-subtle)] flex items-center justify-between gap-4">
              <div>
                <span className="text-sm font-semibold text-[var(--text-primary)] block">Motion Detection</span>
                <span className="text-xs text-[var(--text-muted)]">Trigger actions on shake, tilt down, or tilt up</span>
              </div>
              <input
                type="checkbox"
                disabled={!connected}
                checked={enabled}
                onChange={(e) => {
                  const val = e.target.checked;
                  setEnabled(val);
                  handleSave({ enabled: val });
                }}
                className="w-4 h-4 rounded border-[var(--border-subtle)] text-[var(--accent)] focus:ring-[var(--accent)] bg-[var(--bg-panel)] cursor-pointer"
              />
            </div>

            {/* Wake on Shake/Pick-up */}
            <div className="p-4 bg-[var(--bg-input)] rounded-xl border border-[var(--border-subtle)] flex items-center justify-between gap-4">
              <div>
                <span className="text-sm font-semibold text-[var(--text-primary)] block">Wake on Pick-Up</span>
                <span className="text-xs text-[var(--text-muted)]">Wake OLED screen when moved or shaken</span>
              </div>
              <input
                type="checkbox"
                disabled={!connected}
                checked={wake}
                onChange={(e) => {
                  const val = e.target.checked;
                  setWake(val);
                  handleSave({ wake: val });
                }}
                className="w-4 h-4 rounded border-[var(--border-subtle)] text-[var(--accent)] focus:ring-[var(--accent)] bg-[var(--bg-panel)] cursor-pointer"
              />
            </div>
          </div>

          {/* Sensitivity Slider (1 to 5) */}
          <div className="p-4 bg-[var(--bg-input)] rounded-xl border border-[var(--border-subtle)] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[var(--accent)]" /> Motion Sensitivity (1 = Least, 5 = Most)
              </span>
              <span className="text-sm font-mono text-[var(--accent)] font-bold tabular-nums">Level {sensitivity}</span>
            </div>
            <input
              type="range"
              disabled={!connected}
              min={1}
              max={5}
              step={1}
              value={sensitivity}
              onChange={(e) => setSensitivity(Number(e.target.value))}
              onPointerUp={() => handleSave({ sensitivity })}
              onBlur={() => handleSave({ sensitivity })}
              className="w-full accent-[var(--accent)] bg-[var(--bg-panel)] h-2 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-xs text-[var(--text-muted)] font-mono">
              <span>1 (Firm)</span>
              <span>3 (Default)</span>
              <span>5 (Ultra Sensitive)</span>
            </div>
          </div>

          {/* Calibration & Gesture Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-[var(--bg-input)] rounded-xl border border-[var(--border-subtle)] flex items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-[var(--text-primary)]">Reference Calibration</h4>
                <p className="text-xs text-[var(--text-muted)]">Keep pad still on desk and save flat position</p>
              </div>
              <button
                type="button"
                disabled={!connected || calibrating}
                onClick={handleCalibrate}
                className="px-4 py-2 bg-[var(--accent)] hover:opacity-90 text-[var(--accent-contrast)] text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
              >
                {calibrating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Compass className="w-4 h-4" />}
                {calibrating ? 'Calibrating...' : 'Calibrate Flat'}
              </button>
            </div>

            <div className="p-4 bg-[var(--bg-input)] rounded-xl border border-[var(--border-subtle)] flex items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-[var(--text-primary)]">Last Detected Gesture</h4>
                <p className="text-xs text-[var(--text-muted)]">Live gesture event stream</p>
              </div>
              <span className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold uppercase transition-all ${
                flashGesture ? 'bg-[var(--accent)] text-[var(--accent-contrast)] scale-105 shadow-md' : 'bg-[var(--bg-panel)] text-[var(--text-secondary)]'
              }`}>
                {lastGesture || 'None'}
              </span>
            </div>
          </div>

          {/* Test Sensor Panel with Live Bubble Level */}
          {testActive && (
            <div className="p-5 bg-[var(--bg-input)] rounded-xl border border-[var(--accent)] space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
                  <Zap className="w-4 h-4 text-[var(--accent)] animate-pulse" />
                  <span>Sensor Test Panel &amp; Live Bubble Level</span>
                </div>
                <span className="font-mono text-xs text-[var(--accent)]">
                  {reading ? `${reading.temp_c ?? 25}°C` : 'Polling live...'}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                {/* Acceleration Telemetry */}
                <div className="space-y-1.5 font-mono text-xs bg-[var(--bg-panel)] p-3.5 rounded-xl border border-[var(--border-subtle)]">
                  <div className="text-[11px] font-semibold text-[var(--text-primary)] mb-1">Raw Acceleration (milli-g)</div>
                  <div className="flex justify-between text-[var(--text-secondary)]">
                    <span>AX:</span>
                    <span className="text-[var(--text-primary)] font-bold">{reading?.ax ?? 0} mg</span>
                  </div>
                  <div className="flex justify-between text-[var(--text-secondary)]">
                    <span>AY:</span>
                    <span className="text-[var(--text-primary)] font-bold">{reading?.ay ?? 0} mg</span>
                  </div>
                  <div className="flex justify-between text-[var(--text-secondary)]">
                    <span>AZ:</span>
                    <span className="text-[var(--text-primary)] font-bold">{reading?.az ?? 1000} mg</span>
                  </div>
                </div>

                {/* Face Up Alignment */}
                <div className="space-y-1.5 font-mono text-xs bg-[var(--bg-panel)] p-3.5 rounded-xl border border-[var(--border-subtle)]">
                  <div className="text-[11px] font-semibold text-[var(--text-primary)] mb-1">Orientation State</div>
                  <div className="flex justify-between text-[var(--text-secondary)]">
                    <span>Alignment:</span>
                    <span className="text-[var(--accent)] font-bold">
                      {reading?.face_up !== undefined
                        ? reading.face_up > 0.7
                          ? 'Face Up'
                          : reading.face_up < -0.7
                          ? 'Face Down'
                          : 'Tilted'
                        : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between text-[var(--text-secondary)]">
                    <span>Dot product:</span>
                    <span className="text-[var(--text-primary)] font-bold">{reading?.face_up ?? 1.00}</span>
                  </div>
                </div>

                {/* Visual Bubble Level */}
                <div className="flex flex-col items-center justify-center p-3 bg-[var(--bg-panel)] rounded-xl border border-[var(--border-subtle)]">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] mb-2">Live Bubble Level</div>
                  <div className="relative w-24 h-24 rounded-full bg-[var(--bg-input)] border-2 border-[var(--border-strong)] flex items-center justify-center overflow-hidden shadow-inner">
                    {/* Crosshairs */}
                    <div className="absolute inset-x-0 top-1/2 h-px bg-[var(--border-subtle)]" />
                    <div className="absolute inset-y-0 left-1/2 w-px bg-[var(--border-subtle)]" />
                    <div className="absolute w-8 h-8 rounded-full border border-dashed border-[var(--border-strong)] pointer-events-none" />
                    {/* Moving Bubble */}
                    <div
                      className="absolute w-5 h-5 rounded-full bg-[var(--accent)] shadow-md transition-all duration-75"
                      style={{
                        transform: `translate(${Math.max(-36, Math.min(36, (reading?.ax || 0) / 12))}px, ${Math.max(-36, Math.min(36, (reading?.ay || 0) / 12))}px)`
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="p-4 bg-[var(--bg-input)] rounded-xl border border-amber-500/30 flex items-center gap-3 text-amber-400 text-xs">
          <ShieldAlert className="w-5 h-5 flex-shrink-0" />
          <span>
            GY-521 (MPU-6050) motion sensor not detected on I2C bus (SDA: GPIO 21, SCL: GPIO 22). Connect the sensor to enable shake, face-down, and face-up trigger actions.
          </span>
        </div>
      )}
    </div>
  );
};
