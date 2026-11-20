import React, { useState, useEffect } from 'react';
import {
  DeviceConnectionInfo,
  HardwareProfileId,
  StudioProfile,
  isBleHostProfile
} from '../types/studio';
import { ToastVariant } from '../hooks/useStudioState';
import { usbHardware } from '../services/usbHardwareService';
import { FIRMWARE_VERSION } from '../utils/version';
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
      <div className="pt-5 border-t border-[var(--border-subtle)] text-xs text-[var(--text-muted)] space-y-1">
        <div className="font-semibold text-[var(--text-secondary)]">Bluetooth Multi-Host Manager</div>
        <p>Select Device 1, 2, or 3 to manage Bluetooth pairings.</p>
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
    <div className="pt-5 border-t border-[var(--border-subtle)] space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Bluetooth className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
          <div className="min-w-0 flex items-center gap-2 flex-wrap">
            <h3 className="text-xs font-semibold text-[var(--text-primary)] truncate">
              Pairing &amp; Security ({activeProf.name})
            </h3>
            <span className="font-mono text-[11px] text-[var(--text-muted)]">
              Host {hostSlotNum} · v{FIRMWARE_VERSION}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {hostSlotNum > 1 && (
            <span className="hidden sm:inline text-[11px] text-[var(--text-muted)]">
              Updating from v4.9 or older? Re-pair Host 2 &amp; 3 once.
            </span>
          )}

          <div
            className={`inline-flex items-center gap-1.5 font-mono text-[11px] font-medium tabular-nums ${
              bleMgr?.pairing
                ? 'text-[var(--accent)] animate-pulse'
                : telemetry?.bleConnected
                ? 'text-[var(--text-primary)]'
                : 'text-[var(--text-muted)]'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                bleMgr?.pairing || telemetry?.bleConnected
                  ? 'bg-[var(--accent)]'
                  : 'bg-[var(--text-muted)]'
              }`}
            />
            <span>{stateLabel}</span>
          </div>
        </div>
      </div>

      <div className="divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)] text-xs">
        <div className="py-2.5 flex items-center justify-between gap-4">
          <span className="text-[var(--text-muted)]">Paired Hosts (Host {hostSlotNum})</span>
          <span className="font-mono font-semibold text-[var(--text-primary)] tabular-nums">
            {pairedCount} {pairedCount === 1 ? 'Host' : 'Hosts'} registered
          </span>
        </div>

        <div className="py-2.5 flex items-center justify-between gap-4">
          <span className="text-[var(--text-muted)]">Strict Security</span>
          <div className="flex items-center gap-3">
            <span className="font-medium text-[var(--text-primary)]">
              {bleMgr?.strict !== false ? 'Strict (Known only)' : 'Open (Permissive)'}
            </span>
            <button
              type="button"
              disabled={!connection.connected || busy}
              onClick={() => handleToggleStrict(bleMgr?.strict === false)}
              className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium underline underline-offset-2 cursor-pointer disabled:opacity-40 whitespace-nowrap"
            >
              Toggle
            </button>
          </div>
        </div>

        <div className="py-2.5 flex items-center justify-between gap-4">
          <span className="text-[var(--text-muted)]">Virtual MAC Address</span>
          <span className="font-mono text-[var(--text-secondary)] tabular-nums">
            24:6F:28:XX:XX:0{hostSlotNum}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          disabled={!connection.connected || busy}
          onClick={handlePair}
          className="studio-cta flex items-center justify-center gap-1.5 py-2 px-3.5 rounded-lg text-xs font-semibold disabled:opacity-40 cursor-pointer whitespace-nowrap"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Radio className="w-3.5 h-3.5" />}
          <span>Pair New Host (120s)</span>
        </button>

        {bleMgr?.paused ? (
          <button
            type="button"
            disabled={!connection.connected || busy}
            onClick={handleConnect}
            className="studio-btn flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium text-[var(--text-primary)] disabled:opacity-40 cursor-pointer whitespace-nowrap"
          >
            <Bluetooth className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
            <span>Resume Bluetooth</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={!connection.connected || busy}
            onClick={handleDisconnect}
            className="studio-btn flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 cursor-pointer whitespace-nowrap"
          >
            <PowerOff className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span>Disconnect Host</span>
          </button>
        )}

        <button
          type="button"
          disabled={!connection.connected || busy}
          onClick={() => setForgetModalOpen(true)}
          className="studio-btn flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 cursor-pointer whitespace-nowrap"
        >
          <UserX className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          <span>Forget Profile Pairing</span>
        </button>
      </div>

      {/* Forget Confirmation Modal */}
      {forgetModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="forget-ble-modal-title"
          onClick={() => setForgetModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-[var(--bg-panel)] border border-[var(--border-strong)] shadow-2xl p-5 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4
                  id="forget-ble-modal-title"
                  className="text-sm font-semibold text-[var(--text-primary)]"
                >
                  Forget pairings for {activeProf.name} (Host {hostSlotNum})?
                </h4>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Removes paired hosts for this profile slot and generates a new Bluetooth MAC address.
                </p>
              </div>
            </div>

            <div className="py-2.5 border-y border-[var(--border-subtle)] space-y-1.5 text-xs text-[var(--text-muted)]">
              <p className="font-medium text-[var(--text-secondary)]">Reminder:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Remove the old &ldquo;BertoPad {hostSlotNum}&rdquo; entry from your computer&apos;s Bluetooth settings.</li>
                <li>Other device profiles (Host 1–3) remain untouched.</li>
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

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setForgetModalOpen(false)}
                className="studio-btn py-1.5 px-3 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleForgetConfirm}
                className="studio-cta py-1.5 px-3.5 rounded-lg text-xs font-semibold cursor-pointer"
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
