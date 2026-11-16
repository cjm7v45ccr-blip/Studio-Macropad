import React from 'react';
import {
  BleHostSlot,
  DeviceConnectionInfo,
  GyroCalibrationProfile,
  LiveInputEvent,
  profileIdToBleSlot,
  HardwareProfileId
} from '../types/studio';
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

  return (
    <aside
      aria-label="Live Test Mode Telemetry Inspector"
      className="w-full lg:w-[440px] xl:w-[460px] shrink-0 bg-[var(--bg-panel)] border-t lg:border-t-0 lg:border-l border-[var(--border-subtle)] lg:h-full lg:overflow-y-auto animate-panel-in"
    >
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-[var(--bg-panel)]/95 backdrop-blur-md px-4 sm:px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)] flex items-center justify-center shrink-0">
            <Play className="w-4 h-4 text-[var(--accent)]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] truncate">
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
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-xs font-semibold text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--accent)]" />
          <span>Back to Configure</span>
        </button>
      </div>

      <div className="p-4 sm:p-5 space-y-4">
        {/* Test Mode Isolation Banner */}
        <div className="px-3.5 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] leading-relaxed">
          Clicking keys, knobs, or gestures in <strong className="text-[var(--text-primary)]">Test controls</strong> fires live actions and logs telemetry without changing your Configure selection.
        </div>

        {/* Last Triggered Input Highlight Card */}
        <div className="p-3.5 rounded-2xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
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
              Press any keycap, turn/hold-spin Knob 1 or Knob 2, or click a motion card on the pad to inspect live output.
            </p>
          )}
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

        {/* MPU-6050 Orientation Summary */}
        {telemetry?.capabilities?.includes('motion') && (
          <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <Compass className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              <span className="font-medium text-[var(--text-primary)] truncate">
                MPU-6050 Motion
              </span>
            </div>
            <span className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums shrink-0">
              {telemetry.motion?.enabled ? `Sens ${telemetry.motion.sensitivity}/5` : 'Disabled'} ·{' '}
              DZ {(gyroCalibration?.deadzoneDeg ?? 0.4).toFixed(1)}°
            </span>
          </div>
        )}

        {/* Quick Keyboard Test Reference */}
        <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-1.5 text-[11px] text-[var(--text-muted)]">
          <div className="font-semibold text-[var(--text-secondary)]">
            Keyboard Test Shortcuts
          </div>
          <div className="grid grid-cols-2 gap-1.5 font-mono tabular-nums">
            <span>1–9 : Keys K1–K9</span>
            <span>[ / ] / Space : Knob 1</span>
            <span>{'{'} / {'}'} / ⇧Space : Knob 2</span>
            <span>Alt+Wheel : Hold+Turn</span>
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
