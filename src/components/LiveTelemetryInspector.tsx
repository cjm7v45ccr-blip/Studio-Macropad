import React, { useMemo } from 'react';
import {
  BleHostSlot,
  DeviceConnectionInfo,
  GyroCalibrationProfile,
  LiveInputEvent,
  profileIdToBleSlot,
  HardwareProfileId
} from '../types/studio';
import { useMotionSensor } from '../hooks/useMotionSensor';
import {
  Activity,
  Bluetooth,
  Compass,
  Play,
  SlidersHorizontal,
  Trash2,
  Wifi
} from 'lucide-react';

interface LiveTelemetryInspectorProps {
  connection: DeviceConnectionInfo;
  activeProfileId: HardwareProfileId;
  activeProfileName: string;
  testLog: LiveInputEvent[];
  gyroCalibration?: GyroCalibrationProfile;
  onClearLog: () => void;
  onBackToEdit: () => void;
  onSimulateHostSwitch?: (nextSlot: BleHostSlot) => void;
}

export const LiveTelemetryInspector: React.FC<LiveTelemetryInspectorProps> = ({
  connection,
  activeProfileId,
  activeProfileName,
  testLog,
  gyroCalibration,
  onClearLog,
  onBackToEdit,
  onSimulateHostSwitch
}) => {
  const telemetry = connection.telemetry;
  const isDemo = connection.transport === 'demo';
  const latest = testLog[0] || null;
  const activeBleHost: BleHostSlot = connection.connected
    ? telemetry?.bleActiveHost ?? 1
    : profileIdToBleSlot(activeProfileId) ?? 1;

  const hasMotion = Boolean(telemetry?.capabilities?.includes('motion'));
  const motion = useMotionSensor({
    enabled: hasMotion && connection.connected,
    pollIntervalMs: 80,
    calibration: gyroCalibration,
    defaultPitchBaseline: 0,
    defaultRollBaseline: 0
  });

  // Real session actuation metrics & 12-slot activity rhythm derived strictly from testLog
  const sessionMetrics = useMemo(() => {
    const uniqueControls = new Set(testLog.map(item => item.controlLabel)).size;
    const hwCount = testLog.filter(item => item.source === 'hardware').length;
    const simCount = testLog.length - hwCount;

    // Group the most recent 12 events by timestamp second-bucket density for a clean rhythm sparkline
    const buckets = new Array<number>(12).fill(0);
    if (testLog.length > 0) {
      const parseSecs = (ts: string) => {
        const parts = ts.split(':').map(Number);
        if (parts.length !== 3 || parts.some(Number.isNaN)) return 0;
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
      };
      const newestSec = parseSecs(testLog[0].timestamp);
      for (const evt of testLog) {
        const diff = newestSec - parseSecs(evt.timestamp);
        if (diff >= 0 && diff < 12) {
          buckets[11 - diff] += 1;
        }
      }
    }
    const maxBucket = Math.max(1, ...buckets);
    return { uniqueControls, hwCount, simCount, buckets, maxBucket };
  }, [testLog]);

  // Clamp reticle dot to [-18, +18] SVG units around center (28, 28)
  const reticleX = 28 + Math.max(-18, Math.min(18, (motion.roll / 45) * 18));
  const reticleY = 28 + Math.max(-18, Math.min(18, (motion.pitch / 45) * 18));

  return (
    <aside
      aria-label="Live Test Mode Telemetry Inspector"
      className="w-full lg:w-[440px] xl:w-[460px] shrink-0 studio-chrome border-t lg:border-t-0 lg:border-l border-[var(--border-subtle)] lg:h-full lg:overflow-y-auto animate-panel-in"
    >
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 studio-chrome px-4 sm:px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/60 flex items-center justify-center shrink-0">
            <Play className="w-4 h-4 text-[var(--accent)]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] tracking-tight truncate">
              Live Test Telemetry
            </h2>
            <p className="text-xs text-[var(--text-muted)] truncate tabular-nums">
              {connection.connected
                ? isDemo
                  ? 'Demo Pad Simulator'
                  : 'USB Hardware Stream'
                : 'Offline Dry Run'}{' '}
              · {activeProfileName}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onBackToEdit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl studio-btn text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent)] cursor-pointer whitespace-nowrap shrink-0"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--accent)]" />
          <span>Back to Configure</span>
        </button>
      </div>

      <div className="p-4 sm:p-5 space-y-4">
        {/* Test Mode Isolation Banner */}
        <div className="px-3.5 py-2.5 rounded-xl studio-well text-xs text-[var(--text-secondary)] leading-relaxed">
          Clicking keys, dragging knobs, or triggering gestures in <strong className="text-[var(--text-primary)]">Test controls</strong> fires live actions and logs telemetry without changing your Configure selection.
        </div>

        {/* Last Triggered Input Highlight Card + Real-Time Activity Rhythm */}
        <div className="p-4 rounded-2xl studio-panel space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-[var(--text-muted)]">
              Last Triggered Control
            </span>
            {latest && (
              <span className="font-mono text-[10px] text-[var(--text-muted)] tabular-nums">
                {latest.timestamp}
              </span>
            )}
          </div>

          {latest ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-[var(--text-primary)] truncate">
                  {latest.controlLabel}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-[var(--accent-soft)] border border-[rgba(var(--accent-rgb),0.3)] font-mono text-[10px] font-semibold text-[var(--accent)] shrink-0">
                  {latest.triggerLabel}
                </span>
              </div>
              <div className="text-xs font-mono text-[var(--text-secondary)] break-words">
                {latest.actionSummary || 'Unassigned'}
              </div>
            </div>
          ) : (
            <p className="text-xs text-[var(--text-muted)] py-1">
              Press any keycap, drag or turn Knob 1 / Knob 2, or click a motion card on the pad to inspect live output.
            </p>
          )}

          {/* Session Actuation Strip + 12-Second SVG Rhythm Sparkline */}
          <div className="pt-2.5 border-t border-[var(--border-subtle)] flex items-end justify-between gap-3">
            <div className="flex items-center gap-4 text-[11px] tabular-nums">
              <div>
                <div className="text-[10px] text-[var(--text-muted)]">Events</div>
                <div className="font-mono font-semibold text-[var(--text-primary)]">
                  {testLog.length}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-[var(--text-muted)]">Controls</div>
                <div className="font-mono font-semibold text-[var(--text-primary)]">
                  {sessionMetrics.uniqueControls}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-[var(--text-muted)]">Source</div>
                <div className="font-mono font-semibold text-[var(--text-secondary)]">
                  {sessionMetrics.hwCount > 0 ? 'Hardware' : isDemo ? 'Demo' : 'Studio'}
                </div>
              </div>
            </div>

            <svg
              viewBox="0 0 96 24"
              aria-label="Recent input activity"
              className="w-24 h-6 shrink-0"
            >
              {sessionMetrics.buckets.map((count, i) => {
                const height = count === 0 ? 3 : Math.max(6, Math.round((count / sessionMetrics.maxBucket) * 22));
                const y = 24 - height;
                return (
                  <rect
                    key={i}
                    x={i * 8 + 1}
                    y={y}
                    width="5"
                    height={height}
                    rx="1.5"
                    fill={count > 0 ? 'var(--accent)' : 'var(--border-strong)'}
                    opacity={count > 0 ? 0.9 : 0.45}
                  />
                );
              })}
            </svg>
          </div>
        </div>

        {/* Live Pad Link State */}
        <div className="grid grid-cols-2 gap-2.5 text-xs">
          <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-1.5">
            <div className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
              <Bluetooth className="w-3 h-3 text-[var(--accent)]" />
              <span>BLE Link</span>
            </div>
            <div className="font-semibold text-[var(--text-primary)] truncate">
              {connection.connected
                ? telemetry?.bleConnected
                  ? `Connected (Host ${activeBleHost})`
                  : `Advertising (Host ${activeBleHost})`
                : `Offline (Host ${activeBleHost})`}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-1.5">
            <div className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
              <Wifi className="w-3 h-3 text-[var(--accent)]" />
              <span>Wi-Fi Link</span>
            </div>
            <div className="font-semibold text-[var(--text-primary)] truncate tabular-nums">
              {connection.connected && telemetry?.wifiConnected
                ? telemetry.ip || telemetry.ssid || 'Connected'
                : 'Standby'}
            </div>
          </div>
        </div>

        {/* MPU-6050 Live Attitude Reticle & Orientation Summary */}
        {hasMotion && (
          <div className="p-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex items-center justify-between gap-3 text-xs">
            <div className="space-y-1.5 min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <Compass className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                <span className="font-semibold text-[var(--text-primary)] truncate">
                  MPU-6050 Attitude
                </span>
              </div>
              <div className="font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
                Pitch {motion.pitch.toFixed(1)}° · Roll {motion.roll.toFixed(1)}°
              </div>
              <div className="font-mono text-[10px] text-[var(--text-muted)] tabular-nums">
                {telemetry?.motion?.enabled ? `Sens ${telemetry.motion.sensitivity}/5` : 'Disabled'} ·{' '}
                DZ {(gyroCalibration?.deadzoneDeg ?? 0.4).toFixed(1)}°
                {motion.shakeActive ? ' · SHAKE' : ''}
              </div>
            </div>

            <svg
              viewBox="0 0 56 56"
              aria-label="Live tilt attitude reticle"
              className="w-14 h-14 shrink-0"
            >
              <circle
                cx="28"
                cy="28"
                r="24"
                fill="var(--bg-panel)"
                stroke="var(--border-strong)"
                strokeWidth="1.2"
              />
              <circle
                cx="28"
                cy="28"
                r="10"
                fill="none"
                stroke="var(--border-subtle)"
                strokeDasharray="2 2"
                strokeWidth="1"
              />
              <line x1="8" y1="28" x2="48" y2="28" stroke="var(--border-subtle)" strokeWidth="1" />
              <line x1="28" y1="8" x2="28" y2="48" stroke="var(--border-subtle)" strokeWidth="1" />
              <circle
                cx={reticleX}
                cy={reticleY}
                r={motion.shakeActive ? 5.5 : 4}
                fill="var(--accent)"
              />
            </svg>
          </div>
        )}

        {/* Quick Keyboard Test Reference */}
        <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-1.5 text-[11px] text-[var(--text-muted)]">
          <div className="font-semibold text-[var(--text-secondary)]">
            Keyboard &amp; Mouse Test Shortcuts
          </div>
          <div className="grid grid-cols-2 gap-1.5 font-mono tabular-nums">
            <span>1–9 : Keys K1–K9</span>
            <span>[ / ] / Space : Knob 1</span>
            <span>{'{'} / {'}'} / ⇧Space : Knob 2</span>
            <span>Drag Knob : Scrub</span>
          </div>
        </div>

        {/* Live Input Feed */}
        <div className="rounded-2xl bg-[var(--bg-input)] border border-[var(--border-subtle)] p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
              <Activity className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Live Input Feed</span>
              <span className="font-mono text-[10px] text-[var(--text-muted)] tabular-nums">
                ({testLog.length})
              </span>
            </div>

            <div className="flex items-center gap-2">
              {isDemo && onSimulateHostSwitch && (
                <button
                  type="button"
                  onClick={() => onSimulateHostSwitch(((activeBleHost % 3) + 1) as BleHostSlot)}
                  className="px-2 py-1 rounded-md bg-[var(--bg-panel)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[11px] font-medium text-[var(--accent)] cursor-pointer whitespace-nowrap"
                >
                  Next Host
                </button>
              )}
              {testLog.length > 0 && (
                <button
                  type="button"
                  onClick={onClearLog}
                  className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>
          </div>

          {testLog.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] py-2">
              Waiting for input events…
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto space-y-1 font-mono text-[11px] tabular-nums">
              {testLog.map(item => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2 py-1.5 px-2.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[var(--text-muted)] shrink-0">
                      {item.timestamp}
                    </span>
                    <span className="font-semibold text-[var(--text-primary)] truncate">
                      {item.controlLabel}
                    </span>
                    <span className="text-[10px] text-[var(--accent)] shrink-0">
                      · {item.triggerLabel}
                    </span>
                  </div>
                  <span className="text-[var(--text-secondary)] truncate max-w-[44%]">
                    {item.actionSummary}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
