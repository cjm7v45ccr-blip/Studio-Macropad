import React, { useState, useEffect } from 'react';
import {
  DeviceConnectionInfo,
  HardwareProfileId,
  StudioProfile,
  isBleHostProfile
} from '../types/studio';
import { ToastVariant } from '../hooks/useStudioState';
import { usbHardware } from '../services/usbHardwareService';
import {
  Bluetooth,
  Radio,
  PowerOff,
  UserX,
  AlertTriangle,
  Loader2
} from 'lucide-react';

interface BleManagementCardProps {
  connection: DeviceConnectionInfo;
  activeProfileId: HardwareProfileId;
  profiles: StudioProfile[];
  onToast: (msg: string, variant?: ToastVariant) => void;
  onPullFromUsb?: () => Promise<boolean>;
}

export const BleManagementCard: React.FC<BleManagementCardProps> = ({
  connection,
  activeProfileId,
  profiles,
  onToast,
  onPullFromUsb
}) => {
  const [busy, setBusy] = useState(false);
  const [forgetModalOpen, setForgetModalOpen] = useState(false);
  const [resetBindingsWithForget, setResetBindingsWithForget] = useState(false);

  useEffect(() => {
    if (!forgetModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setForgetModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [forgetModalOpen]);

  const isBle = isBleHostProfile(activeProfileId);
  const hostSlotNum: number =
    activeProfileId === 'HOST1' ? 1 : activeProfileId === 'HOST2' ? 2 : activeProfileId === 'HOST3' ? 3 : 1;

  const activeProf = profiles.find(p => p.id === activeProfileId) || profiles[0];
  const telemetry = connection.telemetry;
  const bleMgr = telemetry?.bleManager;

  const handlePair = async () => {
    setBusy(true);
    try {
      const res = await usbHardware.pairBle(120);
      onToast(res.message || 'Pairing mode active for 120s. Connect from your computer Bluetooth settings.');
      if (onPullFromUsb) await onPullFromUsb();
    } catch (err: any) {
      onToast(err?.message || 'Could not start pairing mode', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      const res = await usbHardware.disconnectBle(true);
      onToast(res.message || 'Disconnected current BLE host.');
      if (onPullFromUsb) await onPullFromUsb();
    } catch (err: any) {
      onToast(err?.message || 'Could not disconnect BLE host', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleConnect = async () => {
    setBusy(true);
    try {
      const res = await usbHardware.connectBle();
      onToast(res.message || 'Bluetooth visible again.');
      if (onPullFromUsb) await onPullFromUsb();
    } catch (err: any) {
      onToast(err?.message || 'Could not resume Bluetooth visibility', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleForgetConfirm = async () => {
    setForgetModalOpen(false);
    setBusy(true);
    try {
      const res = await usbHardware.forgetBleProfile(hostSlotNum, resetBindingsWithForget);
      onToast(res.message || `Forgot pairings for ${activeProf.name} (Host ${hostSlotNum}).`);
      if (onPullFromUsb) await onPullFromUsb();
    } catch (err: any) {
      onToast(err?.message || 'Could not forget BLE profile', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleStrict = async (nextStrict: boolean) => {
    setBusy(true);
    try {
      const res = await usbHardware.setBleSettings(nextStrict);
      onToast(res.message || `Strict mode ${nextStrict ? 'enabled' : 'disabled'}.`);
      if (onPullFromUsb) await onPullFromUsb();
    } catch (err: any) {
      onToast(err?.message || 'Could not update strict mode', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!isBle) {
    return (
      <div className="p-4 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-xs text-[var(--text-muted)] space-y-1">
        <div className="font-semibold text-[var(--text-secondary)]">Bluetooth Multi-Host Manager</div>
        <p>Switch to Device 1, 2, or 3 to manage Bluetooth pairings and pairing mode for that virtual host.</p>
      </div>
    );
  }

  const stateLabel = bleMgr?.pairing
    ? `Pairing Active (${bleMgr.secondsLeft}s left)`
    : bleMgr?.paused
    ? 'Paused (Disconnected)'
    : telemetry?.bleConnected
    ? 'Connected'
    : connection.connected
    ? 'Waiting for Host'
    : 'Offline (Connect USB)';

  const rawHosts = bleMgr?.hostsPerProfile;
  const pairedCount = Array.isArray(rawHosts)
    ? (rawHosts[hostSlotNum - 1] ?? 0)
    : (rawHosts?.[hostSlotNum] ?? bleMgr?.pairedCount ?? 0);

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-[var(--accent-soft)] border border-[rgba(var(--accent-rgb),0.3)] flex items-center justify-center text-[var(--accent)] shrink-0">
            <Bluetooth className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-[var(--text-primary)] truncate">
              Bluetooth Pairing &amp; Security ({activeProf.name} · Host {hostSlotNum})
            </h3>
            <p className="text-[11px] text-[var(--text-muted)] truncate">
              Firmware v4.11.0 multi-host isolation &amp; seamless switching
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {hostSlotNum > 1 && (
            <span className="hidden sm:inline text-[11px] text-[var(--text-muted)]">
              Updating from v4.9 or older? Re-pair Host 2 &amp; 3 once.
            </span>
          )}

          <div
            className={`inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold tabular-nums ${
              bleMgr?.pairing
                ? 'text-[var(--accent)] animate-pulse'
                : telemetry?.bleConnected
                ? 'text-[var(--text-primary)]'
                : 'text-[var(--text-muted)]'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                bleMgr?.pairing
                  ? 'bg-[var(--accent)]'
                  : telemetry?.bleConnected
                  ? 'bg-[var(--accent)]'
                  : 'bg-[var(--text-muted)]'
              }`}
            />
            <span>{stateLabel}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
        <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex flex-col justify-between">
          <span className="text-[11px] text-[var(--text-muted)]">Paired Hosts (Host {hostSlotNum})</span>
          <span className="font-mono text-sm font-bold text-[var(--text-primary)] mt-1 tabular-nums">
            {pairedCount} {pairedCount === 1 ? 'Host' : 'Hosts'} registered
          </span>
        </div>

        <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex flex-col justify-between">
          <span className="text-[11px] text-[var(--text-muted)]">Strict Security</span>
          <div className="flex items-center justify-between mt-1">
            <span className="font-semibold text-[var(--text-primary)]">
              {bleMgr?.strict !== false ? 'Strict (Known only)' : 'Open (Permissive)'}
            </span>
            <button
              type="button"
              disabled={!connection.connected || busy}
              onClick={() => handleToggleStrict(bleMgr?.strict === false)}
              className="text-[11px] text-[var(--accent)] font-semibold hover:underline cursor-pointer disabled:opacity-40 whitespace-nowrap"
            >
              Toggle
            </button>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex flex-col justify-between">
          <span className="text-[11px] text-[var(--text-muted)]">Virtual MAC Address</span>
          <span className="font-mono text-xs font-semibold text-[var(--text-secondary)] mt-1 tabular-nums">
            24:6F:28:XX:XX:0{hostSlotNum}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap pt-1">
        <button
          type="button"
          disabled={!connection.connected || busy}
          onClick={handlePair}
          className="flex-1 min-w-[130px] flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer whitespace-nowrap"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Radio className="w-3.5 h-3.5" />}
          <span>Pair New Host (120s)</span>
        </button>

        {bleMgr?.paused ? (
          <button
            type="button"
            disabled={!connection.connected || busy}
            onClick={handleConnect}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Bluetooth className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>Resume Bluetooth</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={!connection.connected || busy}
            onClick={handleDisconnect}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
          >
            <PowerOff className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>Disconnect Host</span>
          </button>
        )}

        <button
          type="button"
          disabled={!connection.connected || busy}
          onClick={() => setForgetModalOpen(true)}
          className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-strong)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
        >
          <UserX className="w-3.5 h-3.5 text-[var(--accent)]" />
          <span>Forget Profile Pairing</span>
        </button>
      </div>

      {/* Forget Confirmation Modal */}
      {forgetModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="forget-ble-modal-title"
          onClick={() => setForgetModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-strong)] shadow-2xl p-5 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] border border-[rgba(var(--accent-rgb),0.3)] flex items-center justify-center text-[var(--accent)] shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4
                  id="forget-ble-modal-title"
                  className="text-sm font-bold text-[var(--text-primary)]"
                >
                  Forget pairings for {activeProf.name} (Host {hostSlotNum})?
                </h4>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  This removes all paired hosts assigned to this virtual profile slot. The pad will generate a new Bluetooth MAC address for this slot.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-2 text-xs text-[var(--text-muted)]">
              <p className="font-semibold text-[var(--text-primary)]">Important reminder:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>You must also remove the old &ldquo;BertoPad {hostSlotNum}&rdquo; entry from your computer&apos;s Bluetooth settings.</li>
                <li>Other device profiles (Host 1–3) and their pairings remain untouched.</li>
              </ul>
            </div>

            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={resetBindingsWithForget}
                onChange={e => setResetBindingsWithForget(e.target.checked)}
                className="rounded border-[var(--border-strong)] bg-[var(--bg-input)] text-[var(--accent)] focus:ring-[var(--accent)]"
              />
              <span>Also reset key and knob bindings for this profile to default</span>
            </label>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setForgetModalOpen(false)}
                className="py-2 px-3.5 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleForgetConfirm}
                className="py-2 px-4 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] hover:opacity-90 text-xs font-semibold transition-opacity cursor-pointer"
              >
                Yes, Forget Pairings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
