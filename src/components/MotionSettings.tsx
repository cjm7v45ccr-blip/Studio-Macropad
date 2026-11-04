import React, { useState, useEffect } from 'react';
import { Compass, Activity, RefreshCw, Sliders, ShieldAlert } from 'lucide-react';
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
  const [pollTelemetry, setPollTelemetry] = useState(false);

  useEffect(() => {
    setEnabled(motion.enabled);
    setWake(motion.wake);
    setSensitivity(motion.sensitivity || 3);
  }, [motion]);

  useEffect(() => {
    if (!pollTelemetry || !connected || !motion.present) return;
    const interval = setInterval(async () => {
      try {
        const res = await usbHardware.readMotion();
        if (res?.ok) {
          setReading(res);
        }
      } catch {}
    }, 500);
    return () => clearInterval(interval);
  }, [pollTelemetry, connected, motion.present]);

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
      onToast(res.message || 'Motion calibrated successfully', 'success');
    } catch (err: any) {
      onToast(err?.message || 'Calibration failed', 'error');
    } finally {
      setCalibrating(false);
    }
  };

  return (
    <div className="bg-[#1E2128] border border-[#2B2F3A] rounded-xl p-5 space-y-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#F2A33A]/10 flex items-center justify-center text-[#F2A33A]">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#ECEAE4]">Gyroscope & Motion Sensor (GY-521)</h3>
            <p className="text-xs text-[#A3A6AD]">
              {motion.present
                ? `MPU-6050 Connected (WHO_AM_I: 0x${(motion.who || 0x68).toString(16)})`
                : 'No motion sensor detected. Check I2C wiring.'}
            </p>
          </div>
        </div>
        {motion.present && (
          <button
            onClick={() => setPollTelemetry(!pollTelemetry)}
            className={`text-xs px-3 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 transition-colors ${
              pollTelemetry
                ? 'bg-[#F2A33A] text-[#14161B] border-[#F2A33A]'
                : 'bg-[#14161B] text-[#ECEAE4] border-[#2B2F3A] hover:border-[#F2A33A]/50'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            {pollTelemetry ? 'Live Feed On' : 'Live Telemetry'}
          </button>
        )}
      </div>

      {motion.present ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Enable Motion Detection */}
            <div className="p-4 bg-[#14161B] rounded-lg border border-[#2B2F3A] flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-[#ECEAE4] block">Motion Detection</span>
                <span className="text-xs text-[#A3A6AD]">Trigger actions on shake or tilt</span>
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
                className="w-4 h-4 rounded border-[#2B2F3A] text-[#F2A33A] focus:ring-[#F2A33A] bg-[#1E2128]"
              />
            </div>

            {/* Wake on Shake/Pick-up */}
            <div className="p-4 bg-[#14161B] rounded-lg border border-[#2B2F3A] flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-[#ECEAE4] block">Wake on Pick-Up</span>
                <span className="text-xs text-[#A3A6AD]">Wake screen when moved or shaken</span>
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
                className="w-4 h-4 rounded border-[#2B2F3A] text-[#F2A33A] focus:ring-[#F2A33A] bg-[#1E2128]"
              />
            </div>
          </div>

          {/* Sensitivity Slider */}
          <div className="p-4 bg-[#14161B] rounded-lg border border-[#2B2F3A] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[#ECEAE4] flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#F2A33A]" /> Motion Sensitivity (1 – 5)
              </span>
              <span className="text-sm font-mono text-[#F2A33A] font-semibold">Level {sensitivity}</span>
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
              className="w-full accent-[#F2A33A] bg-[#2B2F3A] h-2 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-xs text-[#A3A6AD]">
              <span>1 (Least sensitive)</span>
              <span>3 (Default)</span>
              <span>5 (Most sensitive)</span>
            </div>
          </div>

          {/* Calibration & Telemetry */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 bg-[#14161B] rounded-lg border border-[#2B2F3A]">
            <div>
              <h4 className="text-sm font-medium text-[#ECEAE4]">Reference Position Calibration</h4>
              <p className="text-xs text-[#A3A6AD]">Place pad flat face-up on desk and click calibrate</p>
            </div>
            <button
              disabled={!connected || calibrating}
              onClick={handleCalibrate}
              className="px-4 py-2 bg-[#F2A33A] hover:bg-[#D97706] text-[#14161B] text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              {calibrating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Compass className="w-4 h-4" />}
              {calibrating ? 'Calibrating...' : 'Calibrate Flat Face-Up'}
            </button>
          </div>

          {pollTelemetry && reading && (
            <div className="p-4 bg-[#14161B] rounded-lg border border-[#2B2F3A] space-y-2 font-mono text-xs">
              <div className="text-[#F2A33A] font-semibold mb-1">Live Telemetry Feed:</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[#ECEAE4]">
                <div>AX: {reading.ax ?? 0} mg</div>
                <div>AY: {reading.ay ?? 0} mg</div>
                <div>AZ: {reading.az ?? 0} mg</div>
                <div>Temp: {reading.temp_c ?? 0}°C</div>
              </div>
              <div className="text-[#A3A6AD] pt-1">
                Orientation alignment (face_up): {reading.face_up ?? 0}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="p-4 bg-[#14161B] rounded-lg border border-amber-500/30 flex items-center gap-3 text-amber-400 text-xs">
          <ShieldAlert className="w-5 h-5 flex-shrink-0" />
          <span>
            GY-521 (MPU-6050) gyroscope sensor not detected on I2C bus (SDA: GPIO 21, SCL: GPIO 22). Connect the sensor to enable shake, face-down, and face-up trigger actions.
          </span>
        </div>
      )}
    </div>
  );
};
