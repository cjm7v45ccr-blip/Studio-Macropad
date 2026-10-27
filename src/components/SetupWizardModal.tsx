import React, { useState, useEffect, useMemo } from 'react';
import {
  BleHostSlot,
  DeviceConnectionInfo,
  HardwareBackupPayload,
  HardwareEventPacket,
  HardwareSlotId,
  KeyboardLayoutId,
  StudioProfile,
  bleSlotToProfileId
} from '../types/studio';
import { ToastVariant, extractProfileSlots } from '../hooks/useStudioState';
import {
  FACTORY_DEFAULT_SLOTS,
  HARDWARE_SLOTS,
  SLOT_LABELS,
  UNIVERSAL_BLE_DEFAULT_SLOTS,
  describeFirmwareAction,
  sanitizeFirmwareAlias,
  validateFirmwareAlias
} from '../data/firmwareCatalog';
import { usbHardware } from '../services/usbHardwareService';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bluetooth,
  Check,
  CheckCircle2,
  Cpu,
  Laptop,
  Loader2,
  Radio,
  Monitor,
  Smartphone,
  Tv,
  Usb,
  Wifi,
  X
} from 'lucide-react';

export type HostOsPresetId = 'keep' | 'universal' | 'windows' | 'macos' | 'linux';
export type TvPresetChoiceId = 'keep' | 'streaming' | 'live_tv';

export interface WizardCompletionPayload {
  backup: HardwareBackupPayload | null;
  onlyRenameAliases?: {
    h1Name: string;
    h2Name: string;
    h3Name: string;
    tvName: string;
  };
  keyboardLayout: KeyboardLayoutId;
}

interface SetupWizardModalProps {
  isOpen: boolean;
  triggerSource: 'hardware' | 'manual';
  connection: DeviceConnectionInfo;
  profiles: StudioProfile[];
  keyboardLayout: KeyboardLayoutId;
  onClose: () => void;
  onConnectUsbPad: () => Promise<void> | void;
  onStartDemoSetup: () => Promise<void> | void;
  onSwitchBleHost: (slot: BleHostSlot) => Promise<void> | void;
  onCompleteSetup: (payload: WizardCompletionPayload) => Promise<void>;
  onToast: (msg: string, variant?: ToastVariant) => void;
}

const HOST_PRESET_SLOTS: Record<Exclude<HostOsPresetId, 'keep'>, Record<HardwareSlotId, string>> = {
  universal: { ...UNIVERSAL_BLE_DEFAULT_SLOTS },
  windows: {
    b1: 'WIN:SNIP',
    b2: 'WIN:EXPLORER',
    b3: 'WIN:TASK_MGR',
    b4: 'WIN:DESKTOP',
    b5: 'WIN:COPY',
    b6: 'WIN:PASTE',
    b7: 'WIN:UNDO',
    b8: 'WIN:LOCK',
    dial: 'MEDIA:MUTE',
    enc_cw: 'MEDIA:VOL_UP',
    enc_ccw: 'MEDIA:VOL_DOWN'
  },
  macos: {
    b1: 'MEDIA:PLAY_PAUSE',
    b2: 'MEDIA:PREV',
    b3: 'MEDIA:NEXT',
    b4: 'MACRO:SPOTLIGHT',
    b5: 'MACRO:COPY',
    b6: 'MACRO:PASTE',
    b7: 'MACRO:UNDO',
    b8: 'MACRO:LOCK',
    dial: 'MEDIA:MUTE',
    enc_cw: 'MEDIA:VOL_UP',
    enc_ccw: 'MEDIA:VOL_DOWN'
  },
  linux: {
    b1: 'MEDIA:PLAY_PAUSE',
    b2: 'WIN:NEW_TAB',
    b3: 'WIN:CLOSE_TAB',
    b4: 'KEY:F13',
    b5: 'WIN:COPY',
    b6: 'WIN:PASTE',
    b7: 'WIN:UNDO',
    b8: 'BLE:NEXT_HOST',
    dial: 'MEDIA:MUTE',
    enc_cw: 'MEDIA:VOL_UP',
    enc_ccw: 'MEDIA:VOL_DOWN'
  }
};

const TV_PRESET_SLOTS: Record<Exclude<TvPresetChoiceId, 'keep'>, Record<HardwareSlotId, string>> = {
  streaming: {
    b1: 'TV:POWER',
    b2: 'APP:YOUTUBE',
    b3: 'APP:NETFLIX',
    b4: 'APP:DISNEY',
    b5: 'APP:PRIME',
    b6: 'APP:APPLETV',
    b7: 'TV:HOME',
    b8: 'TV:BACK',
    dial: 'TV:MUTE',
    enc_cw: 'TV:VOL_UP',
    enc_ccw: 'TV:VOL_DOWN'
  },
  live_tv: {
    b1: 'TV:POWER',
    b2: 'TV:GUIDE',
    b3: 'TV:INPUT',
    b4: 'TV:PREV_CH',
    b5: 'TV:CC',
    b6: 'TV:INFO',
    b7: 'TV:OK',
    b8: 'TV:EXIT',
    dial: 'TV:MUTE',
    enc_cw: 'TV:CH_UP',
    enc_ccw: 'TV:CH_DOWN'
  }
};

const KEYBOARD_LAYOUT_OPTIONS: { id: KeyboardLayoutId; label: string }[] = [
  { id: 'us_qwerty', label: 'US English (QWERTY)' },
  { id: 'uk_qwerty', label: 'UK English (ISO)' },
  { id: 'de_qwertz', label: 'German (QWERTZ)' },
  { id: 'fr_azerty', label: 'French (AZERTY)' },
  { id: 'es_iso', label: 'Spanish (ISO)' },
  { id: 'nordic_iso', label: 'Nordic (ISO)' },
  { id: 'jp_jis', label: 'Japanese (JIS)' }
];

const WIZARD_STEPS = [
  { index: 0, code: '01', title: 'Devices & OS' },
  { index: 1, code: '02', title: 'Bluetooth' },
  { index: 2, code: '03', title: 'Wi-Fi & TV' },
  { index: 3, code: '04', title: 'Verify & Save' }
] as const;

export const SetupWizardModal: React.FC<SetupWizardModalProps> = ({
  isOpen,
  triggerSource,
  connection,
  profiles,
  keyboardLayout,
  onClose,
  onConnectUsbPad,
  onStartDemoSetup,
  onSwitchBleHost,
  onCompleteSetup,
  onToast
}) => {
  const [step, setStep] = useState<number>(0);

  // Step 1: Host profiles & OS layout state
  const [h1Preset, setH1Preset] = useState<HostOsPresetId>('universal');
  const [h2Preset, setH2Preset] = useState<HostOsPresetId>('universal');
  const [h3Preset, setH3Preset] = useState<HostOsPresetId>('universal');
  const [tvPreset, setTvPreset] = useState<TvPresetChoiceId>('streaming');

  const [h1Name, setH1Name] = useState('Host 1');
  const [h2Name, setH2Name] = useState('Host 2');
  const [h3Name, setH3Name] = useState('Host 3');
  const [tvName, setTvName] = useState('TV');
  const [selectedKbLayout, setSelectedKbLayout] = useState<KeyboardLayoutId>(keyboardLayout);

  // Step 2: Bluetooth switching state
  const [bleBusy, setBleBusy] = useState(false);

  // Step 3: Wi-Fi & SmartCast TV state (never persisted in browser storage)
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPass, setWifiPass] = useState('');
  const [wifiBusy, setWifiBusy] = useState(false);
  const [wifiBanner, setWifiBanner] = useState<{ ok: boolean; text: string } | null>(null);

  const [tvIp, setTvIp] = useState('');
  const [tvPort, setTvPort] = useState('7345');
  const [tvPin, setTvPin] = useState('');
  const [pairingActive, setPairingActive] = useState(false);
  const [tvBusy, setTvBusy] = useState(false);
  const [tvBanner, setTvBanner] = useState<{ ok: boolean; text: string } | null>(null);

  // Step 4: Live hardware input check & saving state
  const [detectedInput, setDetectedInput] = useState<{
    slotLabel: string;
    actionLabel: string;
    timestamp: string;
  } | null>(null);
  const [finishing, setFinishing] = useState(false);

  const telemetry = connection.telemetry;
  const isDemo = connection.transport === 'demo';

  // Hydrate initial names and live connection fields when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setStep(0);
    setDetectedInput(null);
    setWifiBanner(null);
    setTvBanner(null);
    setPairingActive(false);
    setWifiPass('');
    setTvPin('');

    const p1 = profiles.find(p => p.id === 'HOST1');
    const p2 = profiles.find(p => p.id === 'HOST2');
    const p3 = profiles.find(p => p.id === 'HOST3');
    const pTv = profiles.find(p => p.id === 'TV');

    setH1Name(p1?.name || 'Host 1');
    setH2Name(p2?.name || 'Host 2');
    setH3Name(p3?.name || 'Host 3');
    setTvName(pTv?.name || 'TV');
    setSelectedKbLayout(keyboardLayout);

    // If launched manually on an already-configured pad, default to 'keep' so existing custom keys aren't overwritten unintentionally
    if (triggerSource === 'manual' && (connection.rev ?? 0) > 1) {
      setH1Preset('keep');
      setH2Preset('keep');
      setH3Preset('keep');
      setTvPreset('keep');
    } else {
      setH1Preset('universal');
      setH2Preset('universal');
      setH3Preset('universal');
      setTvPreset('streaming');
    }
  }, [isOpen, triggerSource]);

  useEffect(() => {
    if (!isOpen || !connection.connected || !telemetry) return;
    if (telemetry.ssid && !wifiSsid) setWifiSsid(telemetry.ssid);
    if (telemetry.tvHost && !tvIp) setTvIp(telemetry.tvHost);
    if (telemetry.tvPort) setTvPort(String(telemetry.tvPort));
  }, [isOpen, connection.connected, telemetry?.ssid, telemetry?.tvHost, telemetry?.tvPort]);

  // Escape key closes modal when not mid-save
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !finishing) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, finishing, onClose]);

  // Listen for live hardware button press / encoder turn events during wizard
  useEffect(() => {
    if (!isOpen) return;
    const unsub = usbHardware.onHardwareEvent((e: HardwareEventPacket) => {
      if (e.event !== 'press' && e.event !== 'turn') return;
      const rawSlot = String(e.slot || '').toLowerCase();
      let slotLabel = rawSlot.toUpperCase() || 'Input';
      if (rawSlot === 'mode') {
        slotLabel = 'Mode Switch';
      } else if (rawSlot in SLOT_LABELS) {
        slotLabel = SLOT_LABELS[rawSlot as HardwareSlotId].full;
      } else if (e.event === 'turn') {
        slotLabel = e.dir === 'ccw' ? 'Turn Left (CCW)' : 'Turn Right (CW)';
      }
      const actionLabel = e.action
        ? describeFirmwareAction(String(e.action)).shortLabel
        : e.event === 'turn'
        ? 'Rotary Encoder'
        : 'Hardware Switch';
      const now = new Date().toTimeString().slice(0, 8);
      setDetectedInput({
        slotLabel,
        actionLabel,
        timestamp: now
      });
    });
    return unsub;
  }, [isOpen]);

  const aliasErrors = useMemo(() => {
    const check = (val: string) => {
      const res = validateFirmwareAlias(val);
      return res.valid ? null : res.error || '1–20 valid characters required';
    };
    return {
      h1: check(h1Name),
      h2: check(h2Name),
      h3: check(h3Name),
      tv: check(tvName)
    };
  }, [h1Name, h2Name, h3Name, tvName]);

  const hasAliasError = Boolean(
    aliasErrors.h1 || aliasErrors.h2 || aliasErrors.h3 || aliasErrors.tv
  );

  if (!isOpen) return null;

  const handleSelectPrimaryOs = (preset: HostOsPresetId) => {
    setH1Preset(preset);
    if (preset === 'windows' && h1Name === 'Host 1') setH1Name('Windows PC');
    else if (preset === 'macos' && h1Name === 'Host 1') setH1Name('Mac');
    else if (preset === 'linux' && h1Name === 'Host 1') setH1Name('Linux Desk');
  };

  const handleBleSlotSelect = async (slot: BleHostSlot) => {
    if (!connection.connected || bleBusy) return;
    setBleBusy(true);
    try {
      await onSwitchBleHost(slot);
    } finally {
      setBleBusy(false);
    }
  };

  const handleSaveWifi = async () => {
    if (!wifiSsid.trim() || !connection.connected) return;
    setWifiBusy(true);
    setWifiBanner(null);
    const submittedPass = wifiPass;
    setWifiPass('');
    try {
      const res = await usbHardware.saveWifiAndWait(wifiSsid, submittedPass, 20000);
      setWifiBanner({ ok: res.connected, text: res.message });
      onToast(res.message, res.connected ? 'success' : 'error');
    } catch (err: any) {
      const msg = err?.message || 'Could not save Wi-Fi credentials';
      setWifiBanner({ ok: false, text: msg });
      onToast(msg, 'error');
    } finally {
      setWifiBusy(false);
    }
  };

  const handleStartPairing = async () => {
    if (!tvIp.trim() || !connection.connected) return;
    setTvBusy(true);
    setTvBanner(null);
    try {
      const res = await usbHardware.startTvPairing(tvIp, Number(tvPort) || 7345);
      setPairingActive(true);
      onToast(res.message || 'Check your TV screen for the 4-digit PIN');
    } catch (err: any) {
      const msg = err?.message || 'Could not start SmartCast TV pairing';
      setTvBanner({ ok: false, text: msg });
      onToast(msg, 'error');
    } finally {
      setTvBusy(false);
    }
  };

  const handleSubmitTvPin = async () => {
    if (!tvPin.trim() || !connection.connected) return;
    setTvBusy(true);
    setTvBanner(null);
    try {
      await usbHardware.submitTvPin(tvPin);
      setPairingActive(false);
      setTvPin('');
      const testRes = await usbHardware.testTv();
      const passed = Boolean(testRes?.ok);
      const msg = passed
        ? `SmartCast TV paired and verified (${tvIp}:${Number(tvPort) || 7345})`
        : `PIN saved, but TV test did not respond: ${testRes?.message || 'Check TV network'}`;
      setTvBanner({ ok: passed, text: msg });
      onToast(msg, passed ? 'success' : 'error');
    } catch (err: any) {
      const msg = err?.message || 'Invalid PIN or TV rejected pairing';
      setTvBanner({ ok: false, text: msg });
      onToast(msg, 'error');
    } finally {
      setTvBusy(false);
    }
  };

  const handleFinishWizard = async () => {
    if (hasAliasError) {
      setStep(0);
      onToast('Fix profile alias names (1–20 letters, numbers, spaces, - or _) first', 'error');
      return;
    }

    setFinishing(true);
    try {
      const p1 = profiles.find(p => p.id === 'HOST1');
      const p2 = profiles.find(p => p.id === 'HOST2');
      const p3 = profiles.find(p => p.id === 'HOST3');
      const pTv = profiles.find(p => p.id === 'TV');

      const resolveHostSlots = (
        choice: HostOsPresetId,
        prof: StudioProfile | undefined,
        fallback: Record<HardwareSlotId, string>
      ): Record<HardwareSlotId, string> => {
        if (choice === 'keep') {
          return prof ? extractProfileSlots(prof) : fallback;
        }
        return { ...HOST_PRESET_SLOTS[choice] };
      };

      const resolveTvSlots = (
        choice: TvPresetChoiceId,
        prof: StudioProfile | undefined
      ): Record<HardwareSlotId, string> => {
        if (choice === 'keep') {
          return prof ? extractProfileSlots(prof) : { ...FACTORY_DEFAULT_SLOTS.TV };
        }
        return { ...TV_PRESET_SLOTS[choice] };
      };

      const cleanH1Name = sanitizeFirmwareAlias(h1Name, 'HOST1');
      const cleanH2Name = sanitizeFirmwareAlias(h2Name, 'HOST2');
      const cleanH3Name = sanitizeFirmwareAlias(h3Name, 'HOST3');
      const cleanTvName = sanitizeFirmwareAlias(tvName, 'TV');

      const allKeep =
        h1Preset === 'keep' &&
        h2Preset === 'keep' &&
        h3Preset === 'keep' &&
        tvPreset === 'keep';

      if (allKeep) {
        await onCompleteSetup({
          backup: null,
          onlyRenameAliases: {
            h1Name: cleanH1Name,
            h2Name: cleanH2Name,
            h3Name: cleanH3Name,
            tvName: cleanTvName
          },
          keyboardLayout: selectedKbLayout
        });
      } else {
        const h1Slots = resolveHostSlots(h1Preset, p1, FACTORY_DEFAULT_SLOTS.HOST1);
        const h2Slots = resolveHostSlots(h2Preset, p2, FACTORY_DEFAULT_SLOTS.HOST2);
        const h3Slots = resolveHostSlots(h3Preset, p3, FACTORY_DEFAULT_SLOTS.HOST3);
        const tvSlots = resolveTvSlots(tvPreset, pTv);

        const backupPayload: HardwareBackupPayload = {
          schema: 'studio-pad-config',
          version: 2,
          h1_name: cleanH1Name,
          h2_name: cleanH2Name,
          h3_name: cleanH3Name,
          tv_name: cleanTvName,
          mac_name: cleanH1Name,
          ...Object.fromEntries(HARDWARE_SLOTS.map(s => [`h1_${s}`, h1Slots[s]])),
          ...Object.fromEntries(HARDWARE_SLOTS.map(s => [`h2_${s}`, h2Slots[s]])),
          ...Object.fromEntries(HARDWARE_SLOTS.map(s => [`h3_${s}`, h3Slots[s]])),
          ...Object.fromEntries(HARDWARE_SLOTS.map(s => [`mac_${s}`, h1Slots[s]])),
          tv_b1: tvSlots.b1,
          tv_b2: tvSlots.b2,
          tv_b3: tvSlots.b3,
          tv_b4: tvSlots.b4,
          tv_b5: tvSlots.b5,
          tv_b6: tvSlots.b6,
          tv_b7: tvSlots.b7,
          tv_b8: tvSlots.b8,
          tv_dial: tvSlots.dial,
          tv_enc_cw: tvSlots.enc_cw,
          tv_enc_ccw: tvSlots.enc_ccw
        };

        await onCompleteSetup({
          backup: backupPayload,
          keyboardLayout: selectedKbLayout
        });
      }

      onClose();
    } catch (err: any) {
      onToast(err?.message || 'Could not complete setup', 'error');
    } finally {
      setFinishing(false);
    }
  };

  const presetLabel = (id: HostOsPresetId): string => {
    if (id === 'universal') return 'Universal Multi-Device';
    if (id === 'windows') return 'Windows PC';
    if (id === 'macos') return 'macOS';
    if (id === 'linux') return 'Linux / ChromeOS';
    return 'Keep Existing Keys';
  };

  const tvPresetLabel = (id: TvPresetChoiceId): string => {
    if (id === 'streaming') return 'Streaming Lounge (Apps + Vol)';
    if (id === 'live_tv') return 'Live TV & Channel Surfer';
    return 'Keep Existing TV Keys';
  };

  const activeBleSlot: BleHostSlot = telemetry?.bleActiveHost ?? 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="setup-wizard-title"
    >
      <div className="w-full max-w-2xl rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-strong)] shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--accent)] flex items-center justify-center text-white shrink-0">
              <Cpu className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2
                id="setup-wizard-title"
                className="text-sm sm:text-base font-bold text-[var(--text-primary)] truncate"
              >
                Studio MacroPad Guided Setup
              </h2>
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-[var(--text-muted)] tabular-nums truncate">
                <span>
                  {triggerSource === 'hardware'
                    ? 'Board reported Setup Mode'
                    : 'Guided Configuration'}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {connection.connected
                    ? `${connection.deviceName} (${connection.firmwareVersion})`
                    : 'Offline Draft'}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={finishing}
            onClick={onClose}
            aria-label="Close setup wizard"
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step Navigation Bar */}
        <div className="px-5 py-2.5 bg-[var(--bg-input)] border-b border-[var(--border-subtle)] flex items-center gap-1.5 overflow-x-auto shrink-0">
          {WIZARD_STEPS.map(s => {
            const active = step === s.index;
            const completed = step > s.index;
            return (
              <button
                key={s.code}
                type="button"
                onClick={() => setStep(s.index)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-strong)] shadow-xs'
                    : completed
                    ? 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] border border-transparent'
                }`}
              >
                <span className="font-mono text-[11px] tabular-nums opacity-80">
                  {completed ? '✓' : `${s.code}.`}
                </span>
                <span>{s.title}</span>
              </button>
            );
          })}
        </div>

        {/* Step Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* Connection Prompt Banner if unplugged */}
          {!connection.connected && (
            <div className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5 text-xs">
                <div className="font-semibold text-[var(--text-primary)]">
                  No MacroPad connected over USB yet
                </div>
                <p className="text-[var(--text-muted)]">
                  Connect your pad via USB to provision Bluetooth, Wi-Fi, and NVS profiles directly, or test with Demo Setup Mode.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={onStartDemoSetup}
                  className="px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0"
                >
                  Demo Setup
                </button>
                <button
                  type="button"
                  onClick={onConnectUsbPad}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Usb className="w-3.5 h-3.5" />
                  <span>Connect USB</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 01: DEVICES & OS */}
          {step === 0 && (
            <div className="space-y-5">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  01. Choose your primary starter layout
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Pick how Host 1 should work out of the box. Every button and rotary action can be customized individually later.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {(
                  [
                    {
                      id: 'universal' as const,
                      title: 'Universal Multi-Device',
                      meta: 'Windows · macOS · Linux · Phone',
                      desc: 'OS-neutral media playback, F13–F15 macro triggers, 1-tap Next BLE Host, and rotary volume.',
                      icon: Radio
                    },
                    {
                      id: 'windows' as const,
                      title: 'Windows PC',
                      meta: 'Ctrl Shortcuts · Win+Shift+S',
                      desc: 'Screen Snip, File Explorer, Task Manager, Show Desktop, Ctrl Copy/Paste/Undo, Lock PC, and volume.',
                      icon: Monitor
                    },
                    {
                      id: 'macos' as const,
                      title: 'macOS',
                      meta: 'Command Shortcuts · Spotlight',
                      desc: 'Media transport, Spotlight search, Cmd Copy/Paste/Undo, Lock Screen, and rotary speaker volume.',
                      icon: Laptop
                    },
                    {
                      id: 'linux' as const,
                      title: 'Linux & Browser Desk',
                      meta: 'Ctrl Shortcuts · F13 · Host Cycle',
                      desc: 'Standard Ctrl Copy/Paste/Undo, New/Close Tab, F13 custom trigger, Next BLE Host, and rotary volume.',
                      icon: Smartphone
                    }
                  ] as const
                ).map(card => {
                  const Icon = card.icon;
                  const selected = h1Preset === card.id;
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => handleSelectPrimaryOs(card.id)}
                      className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer space-y-1.5 ${
                        selected
                          ? 'bg-[var(--bg-elevated)] border-[var(--accent)] text-[var(--text-primary)]'
                          : 'bg-[var(--bg-input)] border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-[var(--text-secondary)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Icon
                            className={`w-4 h-4 shrink-0 ${
                              selected ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                            }`}
                          />
                          <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                            {card.title}
                          </span>
                        </div>
                        {selected && <Check className="w-4 h-4 text-[var(--accent)] shrink-0" />}
                      </div>
                      <div className="text-[11px] font-mono text-[var(--text-muted)]">
                        {card.meta}
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                        {card.desc}
                      </p>
                    </button>
                  );
                })}
              </div>

              {triggerSource === 'manual' && (
                <div className="flex items-center justify-between gap-3 pt-1">
                  <span className="text-xs text-[var(--text-muted)]">
                    Already customized your keys? Keep existing button bindings while updating names or wireless links:
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setH1Preset('keep');
                      setH2Preset('keep');
                      setH3Preset('keep');
                      setTvPreset('keep');
                    }}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                      h1Preset === 'keep'
                        ? 'border-[var(--accent)] bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Keep Existing Keys
                  </button>
                </div>
              )}

              {/* Name Host 1–3 & Keyboard Layout */}
              <div className="pt-3 border-t border-[var(--border-subtle)] space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-xs font-semibold text-[var(--text-primary)]">
                    Name your 3 Bluetooth Host slots
                  </div>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    Saved directly on your MacroPad (1–20 chars)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {(
                    [
                      {
                        slot: 'H1',
                        label: 'Studio Pad 1',
                        name: h1Name,
                        setName: setH1Name,
                        preset: h1Preset,
                        setPreset: setH1Preset,
                        err: aliasErrors.h1
                      },
                      {
                        slot: 'H2',
                        label: 'Studio Pad 2',
                        name: h2Name,
                        setName: setH2Name,
                        preset: h2Preset,
                        setPreset: setH2Preset,
                        err: aliasErrors.h2
                      },
                      {
                        slot: 'H3',
                        label: 'Studio Pad 3',
                        name: h3Name,
                        setName: setH3Name,
                        preset: h3Preset,
                        setPreset: setH3Preset,
                        err: aliasErrors.h3
                      }
                    ] as const
                  ).map(h => (
                    <div
                      key={h.slot}
                      className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-2"
                    >
                      <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)] tabular-nums">
                        <span>[{h.slot}]</span>
                        <span>{h.label}</span>
                      </div>
                      <input
                        type="text"
                        maxLength={20}
                        value={h.name}
                        onChange={e => h.setName(e.target.value)}
                        aria-label={`${h.label} profile name`}
                        placeholder={h.label}
                        className={`w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-panel)] border text-xs text-[var(--text-primary)] focus:outline-none ${
                          h.err ? 'border-rose-500' : 'border-[var(--border-subtle)] focus:border-[var(--accent)]'
                        }`}
                      />
                      <select
                        value={h.preset}
                        onChange={e => h.setPreset(e.target.value as HostOsPresetId)}
                        aria-label={`${h.label} OS preset`}
                        className="w-full px-2 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)]"
                      >
                        <option value="universal">Universal Layout</option>
                        <option value="windows">Windows Layout</option>
                        <option value="macos">macOS Layout</option>
                        <option value="linux">Linux / Browser Layout</option>
                        <option value="keep">Keep Current Keys</option>
                      </select>
                      {h.err && <div className="text-[10px] text-rose-400">{h.err}</div>}
                    </div>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                  <label
                    htmlFor="wizard-kb-layout"
                    className="text-xs text-[var(--text-secondary)]"
                  >
                    Host OS Keyboard Layout (for typed text & custom shortcuts):
                  </label>
                  <select
                    id="wizard-kb-layout"
                    value={selectedKbLayout}
                    onChange={e => setSelectedKbLayout(e.target.value as KeyboardLayoutId)}
                    className="px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
                  >
                    {KEYBOARD_LAYOUT_OPTIONS.map(opt => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* STEP 02: BLUETOOTH PAIRING */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  02. Pair Bluetooth Hosts
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Your MacroPad advertises 3 independent Bluetooth identities (<span className="font-mono">Studio Pad 1–3</span>) so you can switch between your computer, laptop, and phone without re-pairing.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <Bluetooth
                      className={`w-5 h-5 shrink-0 ${
                        connection.connected && telemetry?.bleConnected
                          ? 'text-sky-400'
                          : 'text-[var(--text-muted)]'
                      }`}
                    />
                    <div>
                      <div className="text-xs font-semibold text-[var(--text-primary)]">
                        Active Radio: Studio Pad {activeBleSlot} ([H{activeBleSlot}])
                      </div>
                      <div className="text-[11px] font-mono text-[var(--text-muted)] tabular-nums">
                        {!connection.connected
                          ? 'Connect USB pad to view live Bluetooth telemetry'
                          : telemetry?.bleConnected
                          ? 'Bluetooth Host Connected'
                          : 'Advertising — open Bluetooth settings on your device to pair'}
                      </div>
                    </div>
                  </div>

                  {connection.connected && (
                    <span
                      className={`text-xs font-mono font-semibold tabular-nums whitespace-nowrap shrink-0 ${
                        telemetry?.bleConnected ? 'text-emerald-400' : 'text-amber-300'
                      }`}
                    >
                      {telemetry?.bleConnected ? 'Paired & Connected' : 'Waiting to Pair'}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {([1, 2, 3] as const).map(slot => {
                    const active = activeBleSlot === slot;
                    const alias = slot === 1 ? h1Name : slot === 2 ? h2Name : h3Name;
                    return (
                      <button
                        key={slot}
                        type="button"
                        disabled={!connection.connected || bleBusy}
                        onClick={() => handleBleSlotSelect(slot)}
                        className={`p-3 rounded-xl border text-left transition-colors cursor-pointer disabled:opacity-45 space-y-1 ${
                          active
                            ? 'bg-[var(--bg-elevated)] border-[var(--accent)] text-[var(--text-primary)]'
                            : 'bg-[var(--bg-panel)] border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-[var(--text-secondary)]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 font-mono text-[11px] tabular-nums">
                          <span className="font-bold">[H{slot}]</span>
                          <span>{active ? 'Broadcasting' : 'Switch'}</span>
                        </div>
                        <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                          {alias || `Host ${slot}`}
                        </div>
                        <div className="text-[11px] font-mono text-[var(--text-muted)] truncate">
                          BLE: Studio Pad {slot}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {isDemo && telemetry && (
                  <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11px] text-[var(--text-muted)]">
                      Demo Bluetooth Link Simulator:
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        usbHardware.setDemoLinkState({
                          bleConnected: !telemetry.bleConnected
                        })
                      }
                      className="px-3 py-1 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-[11px] font-mono text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0"
                    >
                      {telemetry.bleConnected ? 'Simulate BLE Disconnect' : 'Simulate BLE Connected'}
                    </button>
                  </div>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">
                <div className="font-semibold text-[var(--text-primary)]">
                  How to pair & switch standalone
                </div>
                <p>
                  1. Open Bluetooth settings on Windows, macOS, Linux, iOS, or Android and select{' '}
                  <span className="font-mono text-[var(--text-primary)]">
                    Studio Pad {activeBleSlot}
                  </span>
                  .
                </p>
                <p>
                  2. Anytime the USB cable is unplugged, hold the physical{' '}
                  <span className="font-mono text-[var(--text-primary)]">Mode</span> key and turn the rotary knob to jump between Host 1, Host 2, and Host 3.
                </p>
              </div>
            </div>
          )}

          {/* STEP 03: OPTIONAL WI-FI & SMARTCAST TV */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    03. Wi-Fi & Smart TV Setup (Optional)
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Only needed if you want your MacroPad to control a Vizio SmartCast TV over local Wi-Fi. Bluetooth keyboard and media controls work without Wi-Fi.
                  </p>
                </div>
              </div>

              {/* 2.4 GHz Wi-Fi Card */}
              <div className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                    <Wifi className="w-4 h-4 text-emerald-400" />
                    <span>2.4 GHz Wi-Fi Network</span>
                  </div>
                  <span className="font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
                    {connection.connected && telemetry
                      ? telemetry.wifiConnected
                        ? `Connected · ${telemetry.ip}`
                        : telemetry.ssid
                        ? `Saved: ${telemetry.ssid} (Offline)`
                        : 'Not configured'
                      : 'Requires USB connection'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    maxLength={32}
                    disabled={!connection.connected || wifiBusy}
                    value={wifiSsid}
                    onChange={e => setWifiSsid(e.target.value)}
                    placeholder="2.4 GHz SSID"
                    aria-label="2.4 GHz Wi-Fi SSID"
                    className="px-3 py-2 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] disabled:opacity-50 focus:outline-none focus:border-[var(--accent)]"
                  />
                  <input
                    type="password"
                    maxLength={63}
                    autoComplete="new-password"
                    disabled={!connection.connected || wifiBusy}
                    value={wifiPass}
                    onChange={e => setWifiPass(e.target.value)}
                    placeholder="Wi-Fi Password"
                    aria-label="Wi-Fi Password"
                    className="px-3 py-2 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] disabled:opacity-50 focus:outline-none focus:border-[var(--accent)]"
                  />
                  <button
                    type="button"
                    disabled={!connection.connected || wifiBusy || !wifiSsid.trim()}
                    onClick={handleSaveWifi}
                    className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold disabled:opacity-40 hover:opacity-90 cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    {wifiBusy && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
                    <span>{wifiBusy ? 'Connecting…' : 'Connect Wi-Fi'}</span>
                  </button>
                </div>

                {wifiBanner && (
                  <div
                    className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                      wifiBanner.ok
                        ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-300'
                        : 'bg-rose-500/10 border-rose-500/35 text-rose-300'
                    }`}
                  >
                    {wifiBanner.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <span>{wifiBanner.text}</span>
                  </div>
                )}
              </div>

              {/* Vizio SmartCast TV Pairing Card */}
              <div className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                    <Tv className="w-4 h-4 text-purple-400" />
                    <span>Vizio SmartCast TV Profile</span>
                  </div>
                  <span className="font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
                    {connection.connected && telemetry
                      ? telemetry.tvPaired
                        ? `Paired (${telemetry.tvHost}:${telemetry.tvPort})`
                        : 'Not paired'
                      : 'Optional'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] text-[var(--text-muted)]">
                      TV Profile Name
                    </label>
                    <input
                      type="text"
                      maxLength={20}
                      value={tvName}
                      onChange={e => setTvName(e.target.value)}
                      placeholder="Living Room TV"
                      className={`w-full px-3 py-1.5 rounded-lg bg-[var(--bg-panel)] border text-xs text-[var(--text-primary)] focus:outline-none ${
                        aliasErrors.tv
                          ? 'border-rose-500'
                          : 'border-[var(--border-subtle)] focus:border-[var(--accent)]'
                      }`}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-[var(--text-muted)]">
                      TV Button Layout
                    </label>
                    <select
                      value={tvPreset}
                      onChange={e => setTvPreset(e.target.value as TvPresetChoiceId)}
                      className="w-full px-3 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
                    >
                      <option value="streaming">Streaming Lounge (YouTube, Netflix, Vol)</option>
                      <option value="live_tv">Live TV & Channel Surfer</option>
                      <option value="keep">Keep Current TV Keys</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1">
                  <input
                    type="text"
                    disabled={!connection.connected || tvBusy}
                    value={tvIp}
                    onChange={e => setTvIp(e.target.value)}
                    placeholder="TV IP (e.g. 192.168.1.50)"
                    aria-label="SmartCast TV IP"
                    className="sm:col-span-2 px-3 py-2 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] disabled:opacity-50"
                  />
                  <input
                    type="number"
                    disabled={!connection.connected || tvBusy}
                    value={tvPort}
                    onChange={e => setTvPort(e.target.value)}
                    placeholder="7345"
                    aria-label="SmartCast TV Port"
                    className="px-3 py-2 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] tabular-nums disabled:opacity-50"
                  />
                  <button
                    type="button"
                    disabled={!connection.connected || tvBusy || !tvIp.trim()}
                    onClick={handleStartPairing}
                    className="px-3 py-2 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-strong)] hover:border-[var(--accent)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Pair TV
                  </button>
                </div>

                {pairingActive && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      maxLength={8}
                      value={tvPin}
                      onChange={e => setTvPin(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && tvPin.trim()) handleSubmitTvPin();
                      }}
                      placeholder="4-digit PIN shown on TV"
                      className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--accent)] text-xs font-mono text-[var(--text-primary)]"
                    />
                    <button
                      type="button"
                      disabled={tvBusy || !tvPin.trim()}
                      onClick={handleSubmitTvPin}
                      className="px-3.5 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Submit PIN
                    </button>
                  </div>
                )}

                {tvBanner && (
                  <div
                    className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                      tvBanner.ok
                        ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-300'
                        : 'bg-rose-500/10 border-rose-500/35 text-rose-300'
                    }`}
                  >
                    {tvBanner.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <span>{tvBanner.text}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 04: HARDWARE CHECK & FINISH */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  04. Verify Hardware & Save to Pad
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Press any physical key or turn the knob on your MacroPad to verify live communication, then save your setup to non-volatile memory.
                </p>
              </div>

              {/* Live Hardware Press Verification Box */}
              <div className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex items-center justify-between gap-3 flex-wrap">
                <div className="space-y-0.5 min-w-0">
                  <div className="text-xs font-semibold text-[var(--text-primary)]">
                    Live Switch & Encoder Check
                  </div>
                  {detectedInput ? (
                    <div className="flex items-center gap-2 text-xs text-emerald-400 font-mono tabular-nums">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>
                        Detected {detectedInput.slotLabel} · {detectedInput.actionLabel} ({detectedInput.timestamp})
                      </span>
                    </div>
                  ) : (
                    <div className="text-xs text-[var(--text-muted)]">
                      {connection.connected
                        ? 'Waiting for a button press or knob turn on your MacroPad…'
                        : 'Connect your MacroPad via USB to test physical switches live.'}
                    </div>
                  )}
                </div>

                {isDemo && connection.connected && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => usbHardware.simulateDemoPadInput('b1')}
                      className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-[11px] font-mono text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Simulate Key 1
                    </button>
                    <button
                      type="button"
                      onClick={() => usbHardware.simulateDemoPadInput('enc_cw')}
                      className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-[11px] font-mono text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Simulate Knob CW
                    </button>
                  </div>
                )}
              </div>

              {/* Clean Summary Grid */}
              <div className="rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)] text-xs">
                <div className="px-4 py-2.5 flex items-center justify-between gap-4">
                  <span className="text-[var(--text-muted)]">Host 1 ([H1] Studio Pad 1)</span>
                  <span className="font-mono text-[var(--text-primary)] tabular-nums text-right">
                    {sanitizeFirmwareAlias(h1Name, 'HOST1')} · {presetLabel(h1Preset)}
                  </span>
                </div>
                <div className="px-4 py-2.5 flex items-center justify-between gap-4">
                  <span className="text-[var(--text-muted)]">Host 2 ([H2] Studio Pad 2)</span>
                  <span className="font-mono text-[var(--text-primary)] tabular-nums text-right">
                    {sanitizeFirmwareAlias(h2Name, 'HOST2')} · {presetLabel(h2Preset)}
                  </span>
                </div>
                <div className="px-4 py-2.5 flex items-center justify-between gap-4">
                  <span className="text-[var(--text-muted)]">Host 3 ([H3] Studio Pad 3)</span>
                  <span className="font-mono text-[var(--text-primary)] tabular-nums text-right">
                    {sanitizeFirmwareAlias(h3Name, 'HOST3')} · {presetLabel(h3Preset)}
                  </span>
                </div>
                <div className="px-4 py-2.5 flex items-center justify-between gap-4">
                  <span className="text-[var(--text-muted)]">TV Profile</span>
                  <span className="font-mono text-[var(--text-primary)] tabular-nums text-right">
                    {sanitizeFirmwareAlias(tvName, 'TV')} · {tvPresetLabel(tvPreset)}
                  </span>
                </div>
                <div className="px-4 py-2.5 flex items-center justify-between gap-4">
                  <span className="text-[var(--text-muted)]">Wireless Links</span>
                  <span className="font-mono text-[var(--text-secondary)] tabular-nums text-right">
                    BLE {telemetry?.bleConnected ? 'Connected' : 'Standby'} · Wi-Fi{' '}
                    {telemetry?.wifiConnected ? telemetry.ip : 'Not set'} · TV{' '}
                    {telemetry?.tvPaired ? 'Paired' : 'Unpaired'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="px-5 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-panel)] flex items-center justify-between gap-3 shrink-0">
          <div>
            {step > 0 ? (
              <button
                type="button"
                disabled={finishing}
                onClick={() => setStep(s => Math.max(0, s - 1))}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={finishing}
                onClick={onClose}
                className="px-3 py-2 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0"
              >
                Setup later
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {step === 2 && (
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-3 py-2 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0"
              >
                Skip Wi-Fi & TV
              </button>
            )}

            {step < 3 ? (
              <button
                type="button"
                onClick={() => {
                  if (step === 0 && hasAliasError) {
                    onToast('Profile names must be 1–20 letters, numbers, spaces, - or _', 'error');
                    return;
                  }
                  setStep(s => Math.min(3, s + 1));
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 cursor-pointer whitespace-nowrap shrink-0"
              >
                <span>Continue</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                disabled={finishing}
                onClick={handleFinishWizard}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
              >
                {finishing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>
                  {finishing
                    ? 'Saving Setup…'
                    : connection.connected
                    ? 'Finish Setup & Save to Pad'
                    : 'Save Offline Setup'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
