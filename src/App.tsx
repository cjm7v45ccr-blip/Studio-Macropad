import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ActionBinding,
  ActiveRepeatJob,
  BleHostProfileId,
  BleHostSlot,
  CanvasViewMode,
  ControlId,
  DeviceConnectionInfo,
  EncoderIndex,
  EncoderSubControlId,
  HardwareProfileId,
  HardwareSlotId,
  HostOsType,
  KeyId,
  MotionSlotId,
  SidebarSection,
  bleSlotToProfileId,
  isBleHostProfile,
  profileShortTag
} from './types/studio';
import {
  ToastVariant,
  extractProfileSlots,
  useStudioState
} from './hooks/useStudioState';
import { useFirmwareUpdateCheck } from './hooks/useFirmwareUpdateCheck';
import { usbHardware } from './services/usbHardwareService';
import { repeatMacroRunner } from './services/repeatMacroRunner';
import {
  SLOT_LABELS,
  actionToMacroSteps,
  describeFirmwareAction,
  getActionTestAvailability,
  getMacroCanonicalSignature,
  getVisibleHardwareSlots,
  hasKeyHoldCapability,
  hasMotionCapability,
  isHoldSlot,
  isMotionSlot,
  isMultiStepOrTimedMacro,
  suggestSmartMacroName
} from './data/firmwareCatalog';
import {
  ActionKeyId,
  ButtonSlotId,
  HOLD_SLOT_TO_ACTION_KEY,
  KEY_TO_HOLD_SLOT,
  KEY_TO_SLOT,
  SLOT_TO_ACTION_KEY
} from './data/presetTemplates';
import { MacroTestModal } from './components/MacroTestModal';
import { buildMacroPreview } from './utils/macroPreview';
import { TopBar } from './components/TopBar';
import { LeftSidebar } from './components/LeftSidebar';
import { MacropadCanvas } from './components/MacropadCanvas';
import { ButtonInspector } from './components/ButtonInspector';
import { EncoderInspector } from './components/EncoderInspector';
import { MotionInspector } from './components/MotionInspector';
import { MacroEditorExternalTarget, MacroEditorView } from './components/MacroEditorView';
import { GlobalMacroSearch } from './components/GlobalMacroSearch';
import { LibraryView } from './components/LibraryView';
import { SettingsView } from './components/SettingsView';
import { UsbConnectModal } from './components/UsbConnectModal';
import { ConnectOverlay } from './components/ConnectOverlay';
import { SetupWizardModal, WizardCompletionPayload } from './components/SetupWizardModal';
import { SyncConflictModal } from './components/SyncConflictModal';
import { DiffConfirmModal, DiffPreviewRow } from './components/DiffConfirmModal';
import { CheatSheetModal } from './components/CheatSheetModal';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { AboutModal } from './components/AboutModal';
import { AlertCircle, CheckCircle2, Repeat, Square } from 'lucide-react';

export default function App() {
  const [toast, setToast] = useState<{
    message: string;
    variant: ToastVariant;
  } | null>(null);
  const [pendingTest, setPendingTest] = useState<{ binding: ActionBinding; id: number } | null>(null);
  const testRequestId = useRef(0);
  const pendingTestResolver = useRef<((sent: boolean) => void) | null>(null);

  const handleCloseTest = useCallback(() => {
    pendingTestResolver.current?.(false);
    pendingTestResolver.current = null;
    setPendingTest(null);
  }, []);

  useEffect(() => () => { pendingTestResolver.current?.(false); }, []);

  const [isSyncingUsb, setIsSyncingUsb] = useState(false);

  const showToast = useCallback((message: string, variant: ToastVariant = 'success') => {
    setToast({ message, variant });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const duration = toast.variant === 'error' ? 8500 : 3600;
    const t = setTimeout(() => setToast(null), duration);
    return () => clearTimeout(t);
  }, [toast]);

  const studio = useStudioState(showToast);

  const [systemPrefersLight, setSystemPrefersLight] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: light)').matches
      : false
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = (e: MediaQueryListEvent) => setSystemPrefersLight(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolvedTheme: 'light' | 'dark' =
    studio.settings.theme === 'system'
      ? systemPrefersLight
        ? 'light'
        : 'dark'
      : studio.settings.theme;

  const handleToggleTheme = useCallback(() => {
    studio.updateSettings({
      theme: resolvedTheme === 'dark' ? 'light' : 'dark'
    });
  }, [resolvedTheme, studio]);

  const activeHostOs: HostOsType = isBleHostProfile(studio.activeProfile.id)
    ? studio.settings.hostOsMap[studio.activeProfile.id]
    : 'mac';

  const [activeSection, setActiveSection] = useState<SidebarSection>('device');
  const [selectedControl, setSelectedControl] = useState<ControlId>('k1');
  const [viewMode, setViewMode] = useState<CanvasViewMode>('edit');
  const deviceWorkspaceRef = useRef<HTMLDivElement>(null);
  const inspectorAnchorRef = useRef<HTMLDivElement>(null);
  const handleSelectCanvasControl = useCallback((control: ControlId) => {
    setSelectedControl(control);
    if (window.matchMedia('(max-width: 1023px)').matches) {
      requestAnimationFrame(() => {
        deviceWorkspaceRef.current?.scrollTo({
          top: inspectorAnchorRef.current?.offsetTop || 0,
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
        });
      });
    }
  }, []);
  const [externalMacroTarget, setExternalMacroTarget] =
    useState<MacroEditorExternalTarget | null>(null);
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [connectOverlayOpen, setConnectOverlayOpen] = useState(false);
  const [connectModalError, setConnectModalError] = useState<string | null>(null);
  const [setupWizardOpen, setSetupWizardOpen] = useState(false);
  const [setupWizardTrigger, setSetupWizardTrigger] = useState<'hardware' | 'manual'>(
    'manual'
  );
  const [pendingCopyPair, setPendingCopyPair] = useState<{
    source: HardwareProfileId;
    target: HardwareProfileId;
  } | null>(null);
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [aboutModalOpen, setAboutModalOpen] = useState(false);

  const [connection, setConnection] = useState<DeviceConnectionInfo>(usbHardware.info);
  const [activeRepeatJob, setActiveRepeatJob] = useState<ActiveRepeatJob | null>(
    repeatMacroRunner.activeJob
  );

  useEffect(() => {
    if (connection.connected) {
      setConnectOverlayOpen(false);
      setConnectModalOpen(false);
    }
  }, [connection.connected]);

  useEffect(() => {
    const unsubConn = usbHardware.onConnectionChange(info => {
      setConnection(info);
    });
    const unsubSetup = usbHardware.onSetupModeDetected(signal => {
      if (signal.active) {
        setConnectModalOpen(false);
        setSetupWizardTrigger('hardware');
        setSetupWizardOpen(true);
      }
    });
    const unsubJob = repeatMacroRunner.onJobChange(job => {
      setActiveRepeatJob(job);
    });
    if (usbHardware.info.connected && usbHardware.info.telemetry?.setupMode) {
      setSetupWizardTrigger('hardware');
      setSetupWizardOpen(true);
    }
    return () => {
      unsubConn();
      unsubSetup();
      unsubJob();
    };
  }, []);

  const hasKeyHold = hasKeyHoldCapability(connection.telemetry?.capabilities);
  const hasMotion = hasMotionCapability(connection.telemetry?.capabilities);
  const visibleSlots = useMemo(
    () => getVisibleHardwareSlots(connection.telemetry?.capabilities),
    [connection.telemetry?.capabilities]
  );

  useEffect(() => {
    if (!hasKeyHold && isHoldSlot(selectedControl)) {
      setSelectedControl(HOLD_SLOT_TO_ACTION_KEY[selectedControl]);
    }
  }, [hasKeyHold, selectedControl]);

  useEffect(() => {
    if (!hasMotion && isMotionSlot(selectedControl)) {
      setSelectedControl('k1');
    }
  }, [hasMotion, selectedControl]);

  useEffect(() => {
    if (!studio.tvEnabled && studio.activeProfile.id === 'TV') {
      const fallbackSlot = connection.telemetry?.bleActiveHost ?? 1;
      studio.selectProfile(bleSlotToProfileId(fallbackSlot));
    }
  }, [studio.tvEnabled, studio.activeProfile.id, connection.telemetry?.bleActiveHost, studio]);

  const firmwareUpdater = useFirmwareUpdateCheck({
    connected: connection.connected,
    installedVersion: connection.firmwareVersion,
    autoCheckEnabled: studio.settings.autoCheckFirmwareUpdates,
    onExportBackupFile: studio.exportHardwareBackupFile,
    onToast: showToast,
    onUpdateAvailableToast: (release, installed) => {
      showToast(
        `New BertoPad update v${release.version} available (installed: ${installed})`
      );
    }
  });

  const hasFirmwareUpdateNotification =
    connection.connected &&
    firmwareUpdater.updateState.status === 'update_available' &&
    Boolean(firmwareUpdater.updateState.latestRelease);

  const handleStopRepeat = useCallback(() => {
    const wasPreview = repeatMacroRunner.activeJob?.id.startsWith('sim-');
    const stoppedLocal = repeatMacroRunner.stop();
    if (connection.connected && !wasPreview) {
      usbHardware.cancelRunningMacro().catch(() => {});
    }
    if (stoppedLocal) {
      showToast(wasPreview ? 'Stopped dry run — no actions sent' : 'Stopped macro sequence');
    }
  }, [connection.connected, showToast]);

  useEffect(() => {
    const handleGlobalShortcutsKey = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT' ||
          (activeEl as HTMLElement).isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      setShortcutsModalOpen(true);
    };
    window.addEventListener('keydown', handleGlobalShortcutsKey);
    return () => window.removeEventListener('keydown', handleGlobalShortcutsKey);
  }, []);

  useEffect(() => {
    if (!activeRepeatJob) return;
    const handleGlobalEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleStopRepeat();
      }
    };
    window.addEventListener('keydown', handleGlobalEsc);
    return () => window.removeEventListener('keydown', handleGlobalEsc);
  }, [activeRepeatJob, handleStopRepeat]);

  const handleConnectUsbPad = useCallback(() => {
    setConnectOverlayOpen(true);
  }, []);

  const handleStartDemoMode = useCallback(async () => {
    try {
      setConnectModalError(null);
      await usbHardware.connectDemoMode();
      setConnectModalOpen(false);
      showToast('Started Demo Mode — all hardware controls, motion gestures, and settings are active');
    } catch (err: any) {
      showToast(err?.message || 'Could not start Demo Mode', 'error');
    }
  }, [showToast]);

  const handleOpenSetupWizard = useCallback(() => {
    setSetupWizardTrigger(
      connection.connected && connection.telemetry?.setupMode ? 'hardware' : 'manual'
    );
    setSetupWizardOpen(true);
  }, [connection.connected, connection.telemetry?.setupMode]);

  const handleStartDemoSetup = useCallback(async () => {
    try {
      setConnectModalError(null);
      setConnectModalOpen(false);
      await usbHardware.connectDemoMode({ setupMode: true });
      setSetupWizardTrigger('hardware');
      setSetupWizardOpen(true);
      showToast('Demo BertoPad connected in Setup Mode');
    } catch (err: any) {
      showToast(err?.message || 'Could not start Demo Setup Mode', 'error');
    }
  }, [showToast]);

  const handleEnterHardwareSetupMode = useCallback(async () => {
    const res = await usbHardware.enterSetupMode();
    if (res.ok) {
      setSetupWizardTrigger('hardware');
      setSetupWizardOpen(true);
      showToast(res.message);
    } else {
      showToast(res.message, 'error');
    }
  }, [showToast]);

  const handleCompleteSetup = useCallback(
    async (payload: WizardCompletionPayload) => {
      if (payload.keyboardLayout !== studio.settings.keyboardLayout) {
        studio.updateSettings({ keyboardLayout: payload.keyboardLayout });
      }

      if (payload.backup) {
        await studio.applyHardwareBackup(payload.backup);
      } else if (payload.onlyRenameAliases) {
        const aliasTargets: { id: HardwareProfileId; name: string }[] = [
          { id: 'HOST1', name: payload.onlyRenameAliases.h1Name },
          { id: 'HOST2', name: payload.onlyRenameAliases.h2Name },
          { id: 'HOST3', name: payload.onlyRenameAliases.h3Name },
          { id: 'TV', name: payload.onlyRenameAliases.tvName }
        ];
        for (const target of aliasTargets) {
          const current = studio.profiles.find(p => p.id === target.id);
          if (current && current.name !== target.name) {
            await studio.renameProfile(target.id, target.name);
          }
        }
      }

      const doneRes = await usbHardware.completeSetupMode();
      showToast(
        connection.connected
          ? doneRes.message || 'Saved setup to BertoPad and exited Setup Mode'
          : 'Saved setup to offline workspace'
      );
    },
    [connection.connected, showToast, studio]
  );

  const handlePullFromUsb = useCallback(async () => {
    setIsSyncingUsb(true);
    try {
      return await studio.pullFromUsbNow();
    } finally {
      setIsSyncingUsb(false);
    }
  }, [studio]);

  const handleSaveToDevice = useCallback(async () => {
    if (!connection.connected) {
      await handleConnectUsbPad();
      return;
    }
    setIsSyncingUsb(true);
    try {
      await studio.pushAllToDeviceNow();
    } finally {
      setIsSyncingUsb(false);
    }
  }, [connection.connected, handleConnectUsbPad, studio]);

  const handleExecuteHardwareBinding = useCallback(
    async (binding: ActionBinding): Promise<boolean> => {
      const avail = getActionTestAvailability(binding.value, usbHardware.info);
      if (!avail.canTest) {
        const preview = buildMacroPreview(binding);
        if (preview.timeline.length > 0) {
          repeatMacroRunner.simulateInUi(preview.simulationConfig).catch(() => {});
          showToast(
            `Dry run: Fired ${describeFirmwareAction(binding.value, binding.repeatConfig).shortLabel} (offline mode)`
          );
          return true;
        }
        showToast(
          avail.reason || 'Connect BertoPad via USB to test actions on hardware',
          'error'
        );
        return false;
      }

      if (repeatMacroRunner.activeJob) {
        showToast('Stop the current sequence before starting another test', 'error');
        return false;
      }
      const preview = buildMacroPreview(binding);
      if (preview.timeline.length > 1 || (binding.repeatConfig && isMultiStepOrTimedMacro(binding.value, binding.repeatConfig))) {
        const config = { ...preview.simulationConfig, ...binding.repeatConfig, steps: preview.simulationConfig.steps };
        repeatMacroRunner
          .runFromUiTest(config)
          .catch((err: any) => {
            showToast(
              err?.message || 'Hardware could not complete repeat sequence',
              'error'
            );
          });
        return true;
      }

      try {
        const res = await usbHardware.testAction(binding.value);
        if ((res as any)?.tvDisabled) {
          showToast(res.message || 'TV mode is turned off on the pad.');
          return false;
        }
        showToast(
          res.message ||
            `Fired ${describeFirmwareAction(binding.value, binding.repeatConfig).shortLabel}`
        );
        return true;
      } catch (err: any) {
        showToast(err?.message || 'Hardware could not run test action', 'error');
        return false;
      }
    },
    [connection, showToast]
  );

  const handleReviewBinding = useCallback(
    (binding: ActionBinding): Promise<boolean> => {
      return handleExecuteHardwareBinding(binding);
    },
    [handleExecuteHardwareBinding]
  );

  const handleSwitchBleHost = useCallback(
    async (slot: BleHostSlot) => {
      const targetProfId = bleSlotToProfileId(slot);
      const targetProf = studio.profiles.find(p => p.id === targetProfId);
      const friendlyName = targetProf?.name || `Host ${slot}`;

      if (!connection.connected) {
        studio.selectProfile(targetProfId);
        showToast(`Editing ${friendlyName} ([H${slot}]) — connect USB to switch hardware BLE slot`);
        return;
      }
      try {
        const res = await usbHardware.switchBleHost(slot);
        studio.selectProfile(targetProfId);
        showToast(res.message || `Switched to ${friendlyName} (BertoPad ${slot})`);
      } catch (err: any) {
        showToast(err?.message || 'Could not switch Bluetooth host', 'error');
      }
    },
    [connection.connected, showToast, studio]
  );

  const isEncoder2Selected =
    selectedControl === 'encoder2' ||
    selectedControl === 'dial2' ||
    selectedControl === 'e2_cw' ||
    selectedControl === 'e2_ccw';

  const isEncoderControlSelected =
    isEncoder2Selected ||
    selectedControl === 'encoder' ||
    selectedControl === 'dial' ||
    selectedControl === 'enc_cw' ||
    selectedControl === 'enc_ccw' ||
    selectedControl === 'push_cw' ||
    selectedControl === 'push_ccw';

  const selectedEncoderIndex: EncoderIndex = isEncoder2Selected ? 2 : 1;

  const selectedEncoderSubControl: EncoderSubControlId = isEncoder2Selected
    ? selectedControl === 'e2_cw'
      ? 'e2_cw'
      : selectedControl === 'e2_ccw'
      ? 'e2_ccw'
      : 'dial2'
    : selectedControl === 'enc_cw'
    ? 'enc_cw'
    : selectedControl === 'enc_ccw'
    ? 'enc_ccw'
    : selectedControl === 'push_cw'
    ? 'push_cw'
    : selectedControl === 'push_ccw'
    ? 'push_ccw'
    : 'dial';

  const isMotionControlSelected = isMotionSlot(selectedControl) && hasMotion;

  const selectedKeyId: KeyId =
    !isEncoderControlSelected && !isMotionControlSelected
      ? isHoldSlot(selectedControl)
        ? HOLD_SLOT_TO_ACTION_KEY[selectedControl]
        : (selectedControl as KeyId)
      : 'k1';

  const selectedKeyConfig =
    !isEncoderControlSelected && !isMotionControlSelected
      ? studio.activeLayer.keys[selectedKeyId] || studio.activeLayer.keys.k1
      : null;

  const selectedHardwareSlot: HardwareSlotId = isEncoderControlSelected
    ? selectedEncoderSubControl
    : isMotionSlot(selectedControl)
    ? selectedControl
    : isHoldSlot(selectedControl)
    ? selectedControl
    : selectedControl === 'k9'
    ? 'b1'
    : KEY_TO_SLOT[selectedControl as ActionKeyId] || 'b1';

  const handleOpenMacroBuilderForSlot = useCallback(
    (slot: HardwareSlotId, binding: ActionBinding) => {
      const sig = binding.value
        ? getMacroCanonicalSignature(binding.value, binding.repeatConfig)
        : '';
      const matchedSaved = sig
        ? studio.customMacros.find(
            m => getMacroCanonicalSignature(m.action, m.repeatConfig) === sig
          ) || null
        : null;
      const derivedSteps = binding.value
        ? actionToMacroSteps(binding.value, binding.repeatConfig)
        : [];
      const smartName =
        matchedSaved?.name ||
        (derivedSteps.length > 0
          ? suggestSmartMacroName(derivedSteps, binding.repeatConfig)
          : '') ||
        (binding.value
          ? describeFirmwareAction(binding.value, binding.repeatConfig).shortLabel
          : 'New Sequence');

      setExternalMacroTarget({
        requestId: Date.now(),
        macroId: matchedSaved?.id ?? null,
        name: smartName,
        action: binding.value,
        repeatConfig: binding.repeatConfig,
        targetProfile: studio.activeProfile.id,
        targetSlot: slot
      });
      setActiveSection('macros');
    },
    [studio.activeProfile.id, studio.customMacros]
  );

  const handleJumpToSlotControl = useCallback(
    (profileId: HardwareProfileId, slot: HardwareSlotId) => {
      studio.selectProfile(profileId);
      if (
        slot === 'dial' ||
        slot === 'enc_cw' ||
        slot === 'enc_ccw' ||
        slot === 'push_cw' ||
        slot === 'push_ccw' ||
        slot === 'dial2' ||
        slot === 'e2_cw' ||
        slot === 'e2_ccw'
      ) {
        setSelectedControl(slot);
      } else if (isMotionSlot(slot)) {
        setSelectedControl(hasMotion ? slot : 'k1');
      } else if (isHoldSlot(slot)) {
        setSelectedControl(hasKeyHold ? slot : HOLD_SLOT_TO_ACTION_KEY[slot]);
      } else {
        setSelectedControl(SLOT_TO_ACTION_KEY[slot as ButtonSlotId] || 'k1');
      }
      setActiveSection('device');
    },
    [hasKeyHold, hasMotion, studio]
  );

  const pendingCopyLabels = useMemo(() => {
    if (!pendingCopyPair) return null;
    const srcProf =
      studio.profiles.find(p => p.id === pendingCopyPair.source) || studio.profiles[0];
    const tgtProf =
      studio.profiles.find(p => p.id === pendingCopyPair.target) || studio.profiles[0];
    return {
      srcProf,
      tgtProf,
      srcLabel: `${srcProf.name} (${profileShortTag(pendingCopyPair.source)})`,
      tgtLabel: `${tgtProf.name} (${profileShortTag(pendingCopyPair.target)})`
    };
  }, [pendingCopyPair, studio.profiles]);

  const topBarCopyDiffRows: DiffPreviewRow[] = useMemo(() => {
    if (!pendingCopyPair || !pendingCopyLabels) return [];
    const srcSlots = extractProfileSlots(pendingCopyLabels.srcProf);
    const tgtSlots = extractProfileSlots(pendingCopyLabels.tgtProf);
    return visibleSlots.map(slot => ({
      id: `${pendingCopyPair.target}-${slot}`,
      slotLabel: `${profileShortTag(pendingCopyPair.target)} · ${SLOT_LABELS[slot].short}`,
      beforeLabel: tgtSlots[slot]
        ? describeFirmwareAction(tgtSlots[slot]).shortLabel
        : 'Unassigned',
      afterLabel: srcSlots[slot]
        ? describeFirmwareAction(srcSlots[slot]).shortLabel
        : 'Unassigned',
      changed: tgtSlots[slot] !== srcSlots[slot]
    }));
  }, [pendingCopyPair, pendingCopyLabels, visibleSlots]);

  return (
    <div className="h-[100dvh] w-full max-w-[100vw] overflow-x-hidden overflow-y-hidden bg-[var(--bg-canvas)] text-[var(--text-primary)] flex flex-col">
      {/* Top Bar */}
      <TopBar
        connection={connection}
        resolvedTheme={resolvedTheme}
        syncStatus={studio.syncStatus}
        currentRev={studio.currentRev}
        dirty={studio.dirty}
        isSyncingUsb={isSyncingUsb}
        onConnectUsbPad={handleConnectUsbPad}
        onStartDemoMode={handleStartDemoMode}
        onOpenConnectModal={() => {
          setConnectModalError(null);
          setConnectModalOpen(true);
        }}
        onPullFromUsb={handlePullFromUsb}
        profiles={studio.profiles}
        activeProfile={studio.activeProfile}
        hostOsMap={studio.settings.hostOsMap}
        onSetHostOs={studio.setHostOs}
        onSelectProfile={studio.selectProfile}
        onRenameProfile={studio.renameProfile}
        onRequestCopyProfile={(source, target) =>
          setPendingCopyPair({ source, target })
        }
        canUndo={studio.canUndo}
        canRedo={studio.canRedo}
        onUndo={studio.undo}
        onRedo={studio.redo}
        onSwitchBleHost={handleSwitchBleHost}
        onDisconnect={async () => {
          await usbHardware.disconnect(true);
          showToast('Disconnected from BertoPad');
        }}
        onOpenSetupWizard={handleOpenSetupWizard}
        tvEnabled={studio.tvEnabled}
        searchSlot={
          <GlobalMacroSearch
            profiles={studio.profiles}
            activeProfileId={studio.activeProfile.id}
            selectedControl={selectedControl}
            customMacros={studio.customMacros}
            connection={connection}
            activeHostOs={activeHostOs}
            tvEnabled={studio.tvEnabled}
            showAdvancedIds={studio.settings.showAdvancedIds}
            onSaveMacro={studio.saveCustomMacro}
            onAssignSlot={studio.assignSlotAction}
            onJumpToControl={(profileId, controlId) => {
              studio.selectProfile(profileId);
              setSelectedControl(controlId);
              setActiveSection('device');
            }}
            onOpenInMacroEditor={payload => {
              setExternalMacroTarget({
                ...payload,
                requestId: Date.now()
              });
              setActiveSection('macros');
            }}
            onApplyProfilePreset={(profileId, slots, presetTitle) => {
              studio.selectProfile(profileId);
              studio.assignProfileSlots(
                profileId,
                slots,
                `Applied "${presetTitle}" to ${profileId}`
              );
              setActiveSection('device');
            }}
            onTestBinding={binding => {
              handleReviewBinding(binding);
            }}
          />
        }
      />

      {/* Main Workspace Area: Desktop Left Rail + Active Section */}
      <div className="flex-1 flex overflow-hidden min-w-0">
        <LeftSidebar
          variant="rail"
          activeSection={activeSection}
          onSelectSection={setActiveSection}
          soundEnabled={studio.settings.soundEnabled}
          onToggleSound={() =>
            studio.updateSettings({ soundEnabled: !studio.settings.soundEnabled })
          }
          resolvedTheme={resolvedTheme}
          onToggleTheme={handleToggleTheme}
          macroCount={studio.customMacros.length}
          hasFirmwareUpdate={hasFirmwareUpdateNotification}
        />

        {activeSection === 'device' && (
          <div ref={deviceWorkspaceRef} className="relative flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden min-w-0">
            <MacropadCanvas
              activeProfileId={studio.activeProfile.id}
              activeProfileName={studio.activeProfile.name}
              layer={studio.activeLayer}
              selectedControl={selectedControl}
              viewMode={viewMode}
              encoderPlacement={studio.settings.encoderPlacement}
              liveEventsEnabled={studio.settings.liveEventsEnabled}
              conflicts={studio.conflicts}
              customMacros={studio.customMacros}
              connection={connection}
              tvEnabled={studio.tvEnabled}
              isSyncedWithHardware={studio.isSyncedWithHardware}
              onSelectControl={handleSelectCanvasControl}
              onChangeViewMode={setViewMode}
              onChangeEncoderPlacement={placement =>
                studio.updateSettings({ encoderPlacement: placement })
              }
              onToggleHardwareMode={studio.toggleActiveProfile}
              onSelectProfile={studio.selectProfile}
              onConnectUsbPad={handleConnectUsbPad}
              onStartDemoMode={handleStartDemoMode}
              onPullFromUsb={handlePullFromUsb}
              onExecuteHardwareBinding={handleReviewBinding}
              onSwitchBleHost={handleSwitchBleHost}
              onOpenSetupWizard={handleOpenSetupWizard}
              onOpenCheatSheet={() => setCheatSheetOpen(true)}
              onOpenShortcuts={() => setShortcutsModalOpen(true)}
            />

            <div ref={inspectorAnchorRef} className="lg:hidden shrink-0 flex items-center justify-between px-4 py-2 bg-[var(--bg-panel)] border-t border-[var(--border-subtle)] text-xs">
              <span className="text-[var(--text-secondary)]">Selected control</span>
              <button type="button" onClick={() => deviceWorkspaceRef.current?.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })} className="text-[var(--accent)] font-semibold px-2 py-1 cursor-pointer">Back to pad ↑</button>
            </div>
            {isEncoderControlSelected ? (
              <EncoderInspector
                encoder={
                  selectedEncoderIndex === 2
                    ? studio.activeLayer.encoder2
                    : studio.activeLayer.encoder
                }
                encoderIndex={selectedEncoderIndex}
                encoder1Color={studio.activeLayer.encoder.color}
                encoder2Color={studio.activeLayer.encoder2.color}
                onSelectEncoder={idx => {
                  const isCw =
                    selectedEncoderSubControl === 'enc_cw' ||
                    selectedEncoderSubControl === 'push_cw' ||
                    selectedEncoderSubControl === 'e2_cw';
                  const isCcw =
                    selectedEncoderSubControl === 'enc_ccw' ||
                    selectedEncoderSubControl === 'push_ccw' ||
                    selectedEncoderSubControl === 'e2_ccw';
                  setSelectedControl(
                    idx === 2
                      ? isCw
                        ? 'e2_cw'
                        : isCcw
                        ? 'e2_ccw'
                        : 'dial2'
                      : isCw
                      ? 'enc_cw'
                      : isCcw
                      ? 'enc_ccw'
                      : 'dial'
                  );
                }}
                selectedSubControl={selectedEncoderSubControl}
                onSelectSubControl={sub => setSelectedControl(sub)}
                activeProfileId={studio.activeProfile.id}
                activeProfileName={studio.activeProfile.name}
                customMacros={studio.customMacros}
                keyboardLayout={studio.settings.keyboardLayout}
                connection={connection}
                activeRepeatJob={activeRepeatJob}
                activeHostOs={activeHostOs}
                tvEnabled={studio.tvEnabled}
                onChangeHostOs={
                  isBleHostProfile(studio.activeProfile.id)
                    ? os => studio.setHostOs(studio.activeProfile.id as BleHostProfileId, os)
                    : undefined
                }
                showAdvancedIds={studio.settings.showAdvancedIds}
                onToggleAdvancedIds={() =>
                  studio.updateSettings({
                    showAdvancedIds: !studio.settings.showAdvancedIds
                  })
                }
                onUpdateSlot={studio.updateEncoderSlot}
                onResetSlotToDefault={slot =>
                  studio.resetSlotToDefault(studio.activeProfile.id, slot)
                }
                onClearSlot={slot =>
                  studio.clearSlot(studio.activeProfile.id, slot)
                }
                onApplyKnobSlots={(partial, msg, repeatOverrides) =>
                  studio.assignProfileSlots(
                    studio.activeProfile.id,
                    partial,
                    msg,
                    repeatOverrides
                  )
                }
                onUpdateColor={color =>
                  studio.updateEncoderColor(color, selectedEncoderIndex)
                }
                onTestBinding={binding => {
                  handleReviewBinding(binding);
                }}
                onStopRepeat={handleStopRepeat}
                onOpenMacroBuilder={() => {
                  const activeEnc =
                    selectedEncoderIndex === 2
                      ? studio.activeLayer.encoder2
                      : studio.activeLayer.encoder;
                  const activeBind =
                    selectedEncoderSubControl === 'dial' ||
                    selectedEncoderSubControl === 'dial2'
                      ? activeEnc.dial
                      : selectedEncoderSubControl === 'enc_cw' ||
                        selectedEncoderSubControl === 'e2_cw'
                      ? activeEnc.cw
                      : selectedEncoderSubControl === 'push_cw'
                      ? activeEnc.pushCw ?? { type: 'none', value: '' }
                      : selectedEncoderSubControl === 'push_ccw'
                      ? activeEnc.pushCcw ?? { type: 'none', value: '' }
                      : activeEnc.ccw;
                  handleOpenMacroBuilderForSlot(selectedEncoderSubControl, activeBind);
                }}
              />
            ) : isMotionControlSelected ? (
              <MotionInspector
                motionConfig={studio.activeLayer.motion}
                selectedSlot={selectedControl as MotionSlotId}
                onSelectSlot={slot => setSelectedControl(slot)}
                activeProfileId={studio.activeProfile.id}
                activeProfileName={studio.activeProfile.name}
                activeHostOs={activeHostOs}
                tvEnabled={studio.tvEnabled}
                onChangeHostOs={
                  isBleHostProfile(studio.activeProfile.id)
                    ? os => studio.setHostOs(studio.activeProfile.id as BleHostProfileId, os)
                    : undefined
                }
                showAdvancedIds={studio.settings.showAdvancedIds}
                onToggleAdvancedIds={() =>
                  studio.updateSettings({
                    showAdvancedIds: !studio.settings.showAdvancedIds
                  })
                }
                customMacros={studio.customMacros}
                keyboardLayout={studio.settings.keyboardLayout}
                connection={connection}
                activeRepeatJob={activeRepeatJob}
                onUpdateSlot={(slot, binding) =>
                  studio.assignSlotAction(studio.activeProfile.id, slot, binding)
                }
                onResetSlotToDefault={slot =>
                  studio.resetSlotToDefault(studio.activeProfile.id, slot)
                }
                onClearSlot={slot =>
                  studio.clearSlot(studio.activeProfile.id, slot)
                }
                onTestBinding={binding => {
                  handleReviewBinding(binding);
                }}
                onStopRepeat={handleStopRepeat}
                onOpenMacroBuilder={() => {
                  const slot = selectedControl as MotionSlotId;
                  const bind = studio.activeLayer.motion[slot] ?? {
                    type: 'none',
                    value: ''
                  };
                  handleOpenMacroBuilderForSlot(slot, bind);
                }}
                onOpenMotionSettings={() => setActiveSection('settings')}
              />
            ) : (
              selectedKeyConfig && (
                <ButtonInspector
                  keyConfig={selectedKeyConfig}
                  profiles={studio.profiles}
                  activeProfileId={studio.activeProfile.id}
                  activeProfileName={studio.activeProfile.name}
                  customMacros={studio.customMacros}
                  keyboardLayout={studio.settings.keyboardLayout}
                  connection={connection}
                  activeRepeatJob={activeRepeatJob}
                  activeTrigger={isHoldSlot(selectedControl) ? 'hold' : 'tap'}
                  onSelectTrigger={trig => {
                    if (selectedKeyConfig.id === 'k9') return;
                    setSelectedControl(
                      trig === 'hold'
                        ? KEY_TO_HOLD_SLOT[selectedKeyConfig.id as ActionKeyId]
                        : selectedKeyConfig.id
                    );
                  }}
                  activeHostOs={activeHostOs}
                  tvEnabled={studio.tvEnabled}
                  onChangeHostOs={
                    isBleHostProfile(studio.activeProfile.id)
                      ? os => studio.setHostOs(studio.activeProfile.id as BleHostProfileId, os)
                      : undefined
                  }
                  showAdvancedIds={studio.settings.showAdvancedIds}
                  onToggleAdvancedIds={() =>
                    studio.updateSettings({
                      showAdvancedIds: !studio.settings.showAdvancedIds
                    })
                  }
                  onUpdateBinding={binding =>
                    studio.updateKeyBinding(
                      selectedKeyConfig.id,
                      binding
                    )
                  }
                  onUpdateHoldBinding={binding =>
                    studio.updateKeyHoldBinding(
                      selectedKeyConfig.id,
                      binding
                    )
                  }
                  onResetSlotToDefault={slot =>
                    studio.resetSlotToDefault(studio.activeProfile.id, slot)
                  }
                  onClearSlot={slot =>
                    studio.clearSlot(studio.activeProfile.id, slot)
                  }
                  onUpdateAppearance={patch =>
                    studio.updateKeyAppearance(selectedKeyConfig.id, patch)
                  }
                  onResetAppearance={() =>
                    studio.resetKeyAppearance(selectedKeyConfig.id)
                  }
                  onToggleProfileMode={studio.toggleActiveProfile}
                  onSelectProfile={studio.selectProfile}
                  onSwitchBleHost={handleSwitchBleHost}
                  onTestBinding={binding => {
                    handleReviewBinding(binding);
                  }}
                  onStopRepeat={handleStopRepeat}
                  onOpenMacroBuilder={() => {
                    const isHold = isHoldSlot(selectedControl) && hasKeyHold;
                    const slot = isHold
                      ? (selectedControl as HardwareSlotId)
                      : KEY_TO_SLOT[selectedKeyConfig.id as ActionKeyId] || 'b1';
                    const bind = isHold
                      ? selectedKeyConfig.triggers.hold ?? { type: 'none', value: '' }
                      : selectedKeyConfig.triggers.tap;
                    handleOpenMacroBuilderForSlot(slot, bind);
                  }}
                />
              )
            )}
          </div>
        )}

        {activeSection === 'macros' && (
          <MacroEditorView
            profiles={studio.profiles}
            activeProfileId={studio.activeProfile.id}
            customMacros={studio.customMacros}
            keyboardLayout={studio.settings.keyboardLayout}
            connection={connection}
            activeRepeatJob={activeRepeatJob}
            externalTarget={externalMacroTarget}
            initialTargetSlot={selectedHardwareSlot}
            hostOsMap={studio.settings.hostOsMap}
            tvEnabled={studio.tvEnabled}
            showAdvancedIds={studio.settings.showAdvancedIds}
            onSaveMacro={studio.saveCustomMacro}
            onDeleteMacro={studio.deleteCustomMacro}
            onCleanUpDuplicateMacros={studio.cleanUpDuplicateMacros}
            onExportMacrosFile={studio.exportMacrosFile}
            onImportMacrosFile={studio.importMacrosFile}
            onAssignSlot={studio.assignSlotAction}
            onTestBinding={binding => {
              handleReviewBinding(binding);
            }}
            onStopRepeat={handleStopRepeat}
            onPullFromUsb={handlePullFromUsb}
            onJumpToControl={handleJumpToSlotControl}
            onToast={showToast}
          />
        )}

        {activeSection === 'library' && (
          <LibraryView
            profiles={studio.profiles}
            activeProfileId={studio.activeProfile.id}
            userPresets={studio.userPresets}
            customMacros={studio.customMacros}
            isConnected={connection.connected}
            capabilities={connection.telemetry?.capabilities}
            showAdvancedIds={studio.settings.showAdvancedIds}
            onPullFromUsb={handlePullFromUsb}
            onPushAllToUsb={handleSaveToDevice}
            onCopyHardwareProfile={studio.copyHardwareProfile}
            onAssignProfileSlots={studio.assignProfileSlots}
            onResetBothProfiles={studio.resetBothProfilesToDefault}
            onSaveUserSnapshot={studio.saveUserSnapshot}
            onDeleteUserSnapshot={studio.deleteUserSnapshot}
            onOpenMacros={() => setActiveSection('macros')}
            onApplyHardwareBackup={studio.applyHardwareBackup}
            onExportBackupFile={studio.exportHardwareBackupFile}
            onImportBackupFile={studio.importHardwareBackupFile}
          />
        )}

        {activeSection === 'settings' && (
          <SettingsView
            profiles={studio.profiles}
            settings={studio.settings}
            connection={connection}
            tvEnabled={studio.tvEnabled}
            onSyncTvEnabled={studio.setOfflineTvEnabled}
            syncStatus={studio.syncStatus}
            currentRev={studio.currentRev}
            currentDeviceId={studio.currentDeviceId}
            firmwareUpdate={firmwareUpdater.updateState}
            installProgress={firmwareUpdater.installProgress}
            isUploadingFirmware={firmwareUpdater.isUploadingFirmware}
            isFirmwareBannerDismissed={firmwareUpdater.isBannerDismissed}
            onDismissFirmwareBanner={firmwareUpdater.dismissUpdateBanner}
            onCheckFirmwareUpdate={firmwareUpdater.checkForUpdates}
            onUploadFirmwareToMacropad={firmwareUpdater.uploadFirmwareToMacropad}
            onUploadLocalFirmwareFile={firmwareUpdater.uploadLocalFirmwareFile}
            onUpdateSettings={studio.updateSettings}
            onSetHostOs={studio.setHostOs}
            onPullFromUsb={handlePullFromUsb}
            onSwitchBleHost={handleSwitchBleHost}
            onResetBothProfiles={studio.resetBothProfilesToDefault}
            onClearLocalCache={studio.clearLocalUnSyncedState}
            onOpenSetupWizard={handleOpenSetupWizard}
            onEnterHardwareSetupMode={handleEnterHardwareSetupMode}
            onExportBackupFile={studio.exportHardwareBackupFile}
            onImportBackupFile={studio.importHardwareBackupFile}
            onJumpToMotionSlot={slot =>
              handleJumpToSlotControl(studio.activeProfile.id, slot)
            }
            onOpenAbout={() => setAboutModalOpen(true)}
            onToast={showToast}
          />
        )}
      </div>

      {/* Mobile Bottom Navigation (< 640px / 380px viewport) */}
      <LeftSidebar
        variant="bottom"
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        soundEnabled={studio.settings.soundEnabled}
        onToggleSound={() =>
          studio.updateSettings({ soundEnabled: !studio.settings.soundEnabled })
        }
        resolvedTheme={resolvedTheme}
        onToggleTheme={handleToggleTheme}
        macroCount={studio.customMacros.length}
        hasFirmwareUpdate={hasFirmwareUpdateNotification}
      />

      {/* USB WebSerial & Demo Mode Connection Modal */}
      <UsbConnectModal
        isOpen={connectModalOpen}
        resolvedTheme={resolvedTheme}
        initialError={connectModalError}
        onClose={() => {
          setConnectModalOpen(false);
          setConnectModalError(null);
        }}
        connection={connection}
        onPullFromUsb={handlePullFromUsb}
        onOpenSetupWizard={handleOpenSetupWizard}
      />

      {/* Minimal Full-Screen Connection Overlay */}
      <ConnectOverlay
        isOpen={connectOverlayOpen}
        onClose={() => setConnectOverlayOpen(false)}
        onConnectSuccess={() => showToast('Connected to BertoPad via USB')}
        onStartDemo={handleStartDemoMode}
        resolvedTheme={resolvedTheme}
      />

      {/* Guided Hardware & Multi-OS Setup Wizard */}
      <SetupWizardModal
        isOpen={setupWizardOpen && !studio.conflictPrompt}
        triggerSource={setupWizardTrigger}
        connection={connection}
        profiles={studio.profiles}
        keyboardLayout={studio.settings.keyboardLayout}
        tvEnabled={studio.tvEnabled}
        onSetOfflineTvEnabled={studio.setOfflineTvEnabled}
        onClose={() => setSetupWizardOpen(false)}
        onConnectUsbPad={handleConnectUsbPad}
        onStartDemoSetup={handleStartDemoSetup}
        onSwitchBleHost={handleSwitchBleHost}
        onCompleteSetup={handleCompleteSetup}
        onToast={showToast}
      />

      {/* TopBar Copy Profile Diff Confirmation Modal */}
      <DiffConfirmModal
        isOpen={pendingCopyPair !== null}
        title={
          pendingCopyLabels
            ? `Copy ${pendingCopyLabels.srcLabel} → ${pendingCopyLabels.tgtLabel}?`
            : ''
        }
        description={
          pendingCopyLabels
            ? `All ${visibleSlots.length} controls on ${pendingCopyLabels.tgtLabel} will be overwritten with ${pendingCopyLabels.srcLabel}'s bindings.`
            : ''
        }
        confirmLabel={
          pendingCopyPair
            ? `Copy ${profileShortTag(pendingCopyPair.source)} → ${profileShortTag(
                pendingCopyPair.target
              )}`
            : 'Copy'
        }
        rows={topBarCopyDiffRows}
        onConfirm={() => {
          if (pendingCopyPair) {
            studio.copyHardwareProfile(pendingCopyPair.source, pendingCopyPair.target);
            setPendingCopyPair(null);
          }
        }}
        onCancel={() => setPendingCopyPair(null)}
      />

      {/* Unsynced Draft Conflict Modal ("Use website settings or pad settings?") */}
      <SyncConflictModal
        conflict={studio.conflictPrompt}
        onUseWebsite={studio.resolveConflictUseWebsite}
        onUsePad={studio.resolveConflictUsePad}
      />

      {/* All-Host Desk Reference Cheat Sheet Modal */}
      <CheatSheetModal
        isOpen={cheatSheetOpen}
        profiles={studio.profiles}
        activeProfileId={studio.activeProfile.id}
        tvEnabled={studio.tvEnabled}
        capabilities={connection.telemetry?.capabilities}
        onClose={() => setCheatSheetOpen(false)}
        onJumpToControl={handleJumpToSlotControl}
      />

      {/* Keyboard Shortcuts & Studio Controls HUD */}
      <KeyboardShortcutsModal
        isOpen={shortcutsModalOpen}
        onClose={() => setShortcutsModalOpen(false)}
      />

      {/* About & Open-Source Licenses Modal */}
      <AboutModal
        isOpen={aboutModalOpen}
        onClose={() => setAboutModalOpen(false)}
      />

      {pendingTest && (
        <MacroTestModal
          key={pendingTest.id}
          binding={pendingTest.binding}
          connection={connection}
          activeJob={activeRepeatJob}
          onClose={handleCloseTest}
          onRun={binding => {
            const resolve = pendingTestResolver.current;
            pendingTestResolver.current = null;
            setPendingTest(null);
            handleExecuteHardwareBinding(binding).then(sent => resolve?.(sent));
          }}
        />
      )}

      {/* Active Repeat Macro Floating Bar with Instant Stop */}
      {activeRepeatJob && !(pendingTest && activeRepeatJob.id.startsWith('sim-')) && (
        <div className="fixed bottom-16 sm:bottom-5 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-strong)] shadow-2xl text-xs max-w-[94vw]">
          <Repeat className="w-4 h-4 text-[var(--accent)] animate-spin shrink-0" />
          <div className="flex items-center gap-2 text-[var(--text-primary)] min-w-0">
            <span className="font-semibold truncate max-w-[140px] sm:max-w-[200px]">
              {activeRepeatJob.id.startsWith('sim-') ? 'Dry run · no output' : connection.transport === 'demo' ? 'Demo test' : 'Live · ' + activeRepeatJob.label}
            </span>
            <span className="text-[var(--text-muted)]" aria-hidden="true">
              ·
            </span>
            <span className="font-mono text-[var(--text-secondary)] tabular-nums shrink-0">
              {activeRepeatJob.activeStepIndex !== undefined
                ? `Step ${String(activeRepeatJob.activeStepIndex + 1).padStart(2, '0')}${
                    activeRepeatJob.activeStepPhase === 'delay' ? ' wait' : ''
                  }`
                : activeRepeatJob.totalIterations !== null
                ? `${activeRepeatJob.currentIteration}/${activeRepeatJob.totalIterations}`
                : `Cycle ${activeRepeatJob.currentIteration}`}
            </span>
            {activeRepeatJob.totalIterations !== 1 && (
              <>
                <span className="text-[var(--text-muted)] hidden sm:inline" aria-hidden="true">
                  ·
                </span>
                <span className="font-mono text-[var(--text-muted)] tabular-nums hidden sm:inline shrink-0">
                  {activeRepeatJob.totalIterations !== null
                    ? `${activeRepeatJob.currentIteration}/${activeRepeatJob.totalIterations}`
                    : `Cycle ${activeRepeatJob.currentIteration}`}
                </span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={handleStopRepeat}
            title="Stop macro sequence immediately (Esc)"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--accent-soft)] hover:opacity-90 border border-[var(--accent)] text-[var(--accent)] font-semibold transition-colors cursor-pointer shrink-0 whitespace-nowrap"
          >
            <Square className="w-3 h-3 fill-current" />
            <span>Stop (Esc)</span>
          </button>
        </div>
      )}

      {/* Toast Notification (Success / Error) */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-16 sm:bottom-5 right-3 sm:right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] border shadow-2xl text-xs font-medium max-w-[92vw] sm:max-w-md ${
            toast.variant === 'error'
              ? 'border-[var(--accent)] text-[var(--text-primary)]'
              : 'border-[var(--border-strong)] text-[var(--text-primary)]'
          }`}
        >
          {toast.variant === 'error' ? (
            <AlertCircle className="w-4 h-4 text-[var(--accent)] shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-[var(--accent)] shrink-0" />
          )}
          <span className="leading-snug">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
