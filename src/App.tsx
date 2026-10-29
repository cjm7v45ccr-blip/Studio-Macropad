import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ActionBinding,
  ActiveRepeatJob,
  BleHostSlot,
  CanvasViewMode,
  ControlId,
  DeviceConnectionInfo,
  EncoderSubControlId,
  HardwareProfileId,
  HardwareSlotId,
  KeyId,
  SidebarSection,
  bleSlotToProfileId,
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
  HARDWARE_SLOTS,
  SLOT_LABELS,
  actionToMacroSteps,
  describeFirmwareAction,
  getActionTestAvailability,
  getMacroCanonicalSignature,
  requiresUsbSequenceExecution,
  suggestSmartMacroName
} from './data/firmwareCatalog';
import {
  ActionKeyId,
  ButtonSlotId,
  KEY_TO_SLOT,
  SLOT_TO_ACTION_KEY
} from './data/presetTemplates';
import { TopBar } from './components/TopBar';
import { LeftSidebar } from './components/LeftSidebar';
import { MacropadCanvas } from './components/MacropadCanvas';
import { ButtonInspector } from './components/ButtonInspector';
import { EncoderInspector } from './components/EncoderInspector';
import { MacroEditorExternalTarget, MacroEditorView } from './components/MacroEditorView';
import { GlobalMacroSearch } from './components/GlobalMacroSearch';
import { LibraryView } from './components/LibraryView';
import { SettingsView } from './components/SettingsView';
import { FirmwareUpdateBanner } from './components/FirmwareUpdaterCard';
import { UsbConnectModal } from './components/UsbConnectModal';
import { SetupWizardModal, WizardCompletionPayload } from './components/SetupWizardModal';
import { SyncConflictModal } from './components/SyncConflictModal';
import { DiffConfirmModal, DiffPreviewRow } from './components/DiffConfirmModal';
import { AlertCircle, CheckCircle2, Repeat, Square } from 'lucide-react';

export default function App() {
  const [toast, setToast] = useState<{
    message: string;
    variant: ToastVariant;
  } | null>(null);
  const [isSyncingUsb, setIsSyncingUsb] = useState(false);

  const showToast = useCallback((message: string, variant: ToastVariant = 'success') => {
    setToast({ message, variant });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3400);
    return () => clearTimeout(t);
  }, [toast]);

  const studio = useStudioState(showToast);

  const [activeSection, setActiveSection] = useState<SidebarSection>('device');
  const [selectedControl, setSelectedControl] = useState<ControlId>('k1');
  const [viewMode, setViewMode] = useState<CanvasViewMode>('edit');
  const [externalMacroTarget, setExternalMacroTarget] =
    useState<MacroEditorExternalTarget | null>(null);
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [connectModalError, setConnectModalError] = useState<string | null>(null);
  const [setupWizardOpen, setSetupWizardOpen] = useState(false);
  const [setupWizardTrigger, setSetupWizardTrigger] = useState<'hardware' | 'manual'>(
    'manual'
  );
  const [pendingCopyPair, setPendingCopyPair] = useState<{
    source: HardwareProfileId;
    target: HardwareProfileId;
  } | null>(null);

  const [connection, setConnection] = useState<DeviceConnectionInfo>(usbHardware.info);
  const [activeRepeatJob, setActiveRepeatJob] = useState<ActiveRepeatJob | null>(
    repeatMacroRunner.activeJob
  );

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

  const firmwareUpdater = useFirmwareUpdateCheck({
    connected: connection.connected,
    installedVersion: connection.firmwareVersion,
    autoCheckEnabled: studio.settings.autoCheckFirmwareUpdates,
    onExportBackupFile: studio.exportHardwareBackupFile,
    onToast: showToast,
    onUpdateAvailableToast: (release, installed) => {
      showToast(
        `New MacroPad update v${release.version} available (installed: ${installed})`
      );
    }
  });

  const hasFirmwareUpdateNotification =
    connection.connected &&
    firmwareUpdater.updateState.status === 'update_available' &&
    Boolean(firmwareUpdater.updateState.latestRelease);

  const handleStopRepeat = useCallback(() => {
    if (repeatMacroRunner.stop()) {
      showToast('Stopped repeat sequence');
    }
  }, [showToast]);

  const handleConnectUsbPad = useCallback(async () => {
    if (!usbHardware.browserSupportsWebSerial) {
      setConnectModalError(
        'Web Serial is not supported in this browser — open this site in Chrome or Edge on desktop over HTTPS, or try demo mode.'
      );
      setConnectModalOpen(true);
      return;
    }

    try {
      setConnectModalError(null);
      await usbHardware.connectWebSerial();
    } catch (err: any) {
      const msg =
        err?.message ||
        'Could not open USB port — close the Serial Monitor or any other serial tool holding the port.';
      setConnectModalError(msg);
      setConnectModalOpen(true);
      showToast(msg, 'error');
    }
  }, [showToast]);

  const handleStartDemoMode = useCallback(async () => {
    try {
      setConnectModalError(null);
      await usbHardware.connectDemoMode();
      setConnectModalOpen(false);
      showToast('Started Demo Mode — all 11 controls and settings are active');
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
      showToast('Demo MacroPad connected in Setup Mode');
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
          ? doneRes.message || 'Saved setup to MacroPad and exited Setup Mode'
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
      const avail = getActionTestAvailability(binding.value, connection);
      if (!avail.canTest) {
        showToast(
          avail.reason || 'Connect MacroPad via USB to test actions on hardware',
          'error'
        );
        return false;
      }

      if (binding.repeatConfig && requiresUsbSequenceExecution(binding.repeatConfig)) {
        repeatMacroRunner
          .runFromUiTest(binding.repeatConfig)
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
        showToast(res.message || `Switched to ${friendlyName} (Studio Pad ${slot})`);
      } catch (err: any) {
        showToast(err?.message || 'Could not switch Bluetooth host', 'error');
      }
    },
    [connection.connected, showToast, studio]
  );

  const isEncoderControlSelected =
    selectedControl === 'encoder' ||
    selectedControl === 'dial' ||
    selectedControl === 'enc_cw' ||
    selectedControl === 'enc_ccw';

  const selectedEncoderSubControl: EncoderSubControlId =
    selectedControl === 'enc_cw'
      ? 'enc_cw'
      : selectedControl === 'enc_ccw'
      ? 'enc_ccw'
      : 'dial';

  const selectedKeyConfig = !isEncoderControlSelected
    ? studio.activeLayer.keys[selectedControl as KeyId] ||
      studio.activeLayer.keys.k1
    : null;

  const selectedHardwareSlot: HardwareSlotId = isEncoderControlSelected
    ? selectedEncoderSubControl
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
      if (slot === 'dial' || slot === 'enc_cw' || slot === 'enc_ccw') {
        setSelectedControl(slot);
      } else {
        setSelectedControl(SLOT_TO_ACTION_KEY[slot as ButtonSlotId] || 'k1');
      }
      setActiveSection('device');
    },
    [studio]
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
    return HARDWARE_SLOTS.map(slot => ({
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
  }, [pendingCopyPair, pendingCopyLabels]);

  return (
    <div className="h-[100dvh] w-full max-w-[100vw] overflow-x-hidden overflow-y-hidden bg-[var(--bg-canvas)] text-[var(--text-primary)] flex flex-col">
      {/* Top Bar */}
      <TopBar
        connection={connection}
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
        onSelectProfile={studio.selectProfile}
        onRenameProfile={studio.renameProfile}
        onRequestCopyProfile={(source, target) =>
          setPendingCopyPair({ source, target })
        }
        canUndo={studio.canUndo}
        canRedo={studio.canRedo}
        onUndo={studio.undo}
        onRedo={studio.redo}
        onSaveToDevice={handleSaveToDevice}
        onSwitchBleHost={handleSwitchBleHost}
        onOpenSetupWizard={handleOpenSetupWizard}
        searchSlot={
          <GlobalMacroSearch
            profiles={studio.profiles}
            activeProfileId={studio.activeProfile.id}
            selectedControl={selectedControl}
            customMacros={studio.customMacros}
            connection={connection}
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
              handleExecuteHardwareBinding(binding);
            }}
          />
        }
      />

      {/* Global Firmware Update Notification Bar with Direct One-Click Upload */}
      {activeSection !== 'settings' && (
        <FirmwareUpdateBanner
          compact
          connection={connection}
          firmwareUpdate={firmwareUpdater.updateState}
          installProgress={firmwareUpdater.installProgress}
          isUploadingFirmware={firmwareUpdater.isUploadingFirmware}
          isFirmwareBannerDismissed={firmwareUpdater.isBannerDismissed}
          onDismissFirmwareBanner={firmwareUpdater.dismissUpdateBanner}
          onUploadToMacropad={() => {
            firmwareUpdater.uploadFirmwareToMacropad();
          }}
          onJumpToUpdater={() => {
            setActiveSection('settings');
            setTimeout(() => {
              document
                .getElementById('firmware-updater-card')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 60);
          }}
        />
      )}

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
          macroCount={studio.customMacros.length}
          hasFirmwareUpdate={hasFirmwareUpdateNotification}
        />

        {activeSection === 'device' && (
          <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden min-w-0">
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
              isSyncedWithHardware={studio.isSyncedWithHardware}
              onSelectControl={setSelectedControl}
              onChangeViewMode={setViewMode}
              onChangeEncoderPlacement={placement =>
                studio.updateSettings({ encoderPlacement: placement })
              }
              onToggleHardwareMode={studio.toggleActiveProfile}
              onSelectProfile={studio.selectProfile}
              onConnectUsbPad={handleConnectUsbPad}
              onStartDemoMode={handleStartDemoMode}
              onPullFromUsb={handlePullFromUsb}
              onExecuteHardwareBinding={handleExecuteHardwareBinding}
              onSwitchBleHost={handleSwitchBleHost}
              onOpenSetupWizard={handleOpenSetupWizard}
            />

            {isEncoderControlSelected ? (
              <EncoderInspector
                encoder={studio.activeLayer.encoder}
                selectedSubControl={selectedEncoderSubControl}
                onSelectSubControl={sub => setSelectedControl(sub)}
                activeProfileId={studio.activeProfile.id}
                activeProfileName={studio.activeProfile.name}
                customMacros={studio.customMacros}
                keyboardLayout={studio.settings.keyboardLayout}
                connection={connection}
                activeRepeatJob={activeRepeatJob}
                onUpdateSlot={studio.updateEncoderSlot}
                onResetSlotToDefault={slot =>
                  studio.resetSlotToDefault(studio.activeProfile.id, slot)
                }
                onApplyKnobSlots={(partial, msg, repeatOverrides) =>
                  studio.assignProfileSlots(
                    studio.activeProfile.id,
                    partial,
                    msg,
                    repeatOverrides
                  )
                }
                onUpdateColor={studio.updateEncoderColor}
                onTestBinding={binding => {
                  handleExecuteHardwareBinding(binding);
                }}
                onStopRepeat={handleStopRepeat}
                onOpenMacroBuilder={() => {
                  const activeBind =
                    selectedEncoderSubControl === 'dial'
                      ? studio.activeLayer.encoder.dial
                      : selectedEncoderSubControl === 'enc_cw'
                      ? studio.activeLayer.encoder.cw
                      : studio.activeLayer.encoder.ccw;
                  handleOpenMacroBuilderForSlot(selectedEncoderSubControl, activeBind);
                }}
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
                  onUpdateBinding={binding =>
                    studio.updateKeyBinding(
                      selectedKeyConfig.id,
                      binding
                    )
                  }
                  onResetSlotToDefault={slot =>
                    studio.resetSlotToDefault(studio.activeProfile.id, slot)
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
                    handleExecuteHardwareBinding(binding);
                  }}
                  onStopRepeat={handleStopRepeat}
                  onOpenMacroBuilder={() =>
                    handleOpenMacroBuilderForSlot(
                      KEY_TO_SLOT[selectedKeyConfig.id as ActionKeyId] || 'b1',
                      selectedKeyConfig.triggers.tap
                    )
                  }
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
            onSaveMacro={studio.saveCustomMacro}
            onDeleteMacro={studio.deleteCustomMacro}
            onCleanUpDuplicateMacros={studio.cleanUpDuplicateMacros}
            onExportMacrosFile={studio.exportMacrosFile}
            onImportMacrosFile={studio.importMacrosFile}
            onAssignSlot={studio.assignSlotAction}
            onTestBinding={binding => {
              handleExecuteHardwareBinding(binding);
            }}
            onStopRepeat={handleStopRepeat}
            onPullFromUsb={handlePullFromUsb}
            onJumpToControl={handleJumpToSlotControl}
          />
        )}

        {activeSection === 'library' && (
          <LibraryView
            profiles={studio.profiles}
            activeProfileId={studio.activeProfile.id}
            userPresets={studio.userPresets}
            customMacros={studio.customMacros}
            isConnected={connection.connected}
            onPullFromUsb={handlePullFromUsb}
            onPushAllToUsb={handleSaveToDevice}
            onCopyHardwareProfile={studio.copyHardwareProfile}
            onAssignProfileSlots={studio.assignProfileSlots}
            onResetBothProfiles={studio.resetBothProfilesToDefault}
            onSaveUserSnapshot={studio.saveUserSnapshot}
            onDeleteUserSnapshot={studio.deleteUserSnapshot}
            onDeleteMacro={studio.deleteCustomMacro}
            onCleanUpDuplicateMacros={studio.cleanUpDuplicateMacros}
            onExportMacrosFile={studio.exportMacrosFile}
            onImportMacrosFile={studio.importMacrosFile}
            onOpenInMacroEditor={payload => {
              setExternalMacroTarget({
                ...payload,
                requestId: Date.now()
              });
              setActiveSection('macros');
            }}
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
            onUpdateSettings={studio.updateSettings}
            onPullFromUsb={handlePullFromUsb}
            onSwitchBleHost={handleSwitchBleHost}
            onResetBothProfiles={studio.resetBothProfilesToDefault}
            onClearLocalCache={studio.clearLocalUnSyncedState}
            onOpenSetupWizard={handleOpenSetupWizard}
            onEnterHardwareSetupMode={handleEnterHardwareSetupMode}
            onExportBackupFile={studio.exportHardwareBackupFile}
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
        macroCount={studio.customMacros.length}
        hasFirmwareUpdate={hasFirmwareUpdateNotification}
      />

      {/* USB WebSerial & Demo Mode Connection Modal */}
      <UsbConnectModal
        isOpen={connectModalOpen}
        initialError={connectModalError}
        onClose={() => {
          setConnectModalOpen(false);
          setConnectModalError(null);
        }}
        connection={connection}
        onPullFromUsb={handlePullFromUsb}
        onOpenSetupWizard={handleOpenSetupWizard}
      />

      {/* Guided Hardware & Multi-OS Setup Wizard */}
      <SetupWizardModal
        isOpen={setupWizardOpen && !studio.conflictPrompt}
        triggerSource={setupWizardTrigger}
        connection={connection}
        profiles={studio.profiles}
        keyboardLayout={studio.settings.keyboardLayout}
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
            ? `All 11 controls on ${pendingCopyLabels.tgtLabel} will be overwritten with ${pendingCopyLabels.srcLabel}'s bindings.`
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

      {/* Active Repeat Macro Floating Bar with Instant Stop */}
      {activeRepeatJob && (
        <div className="fixed bottom-16 sm:bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-strong)] shadow-2xl text-xs max-w-[94vw]">
          <Repeat className="w-4 h-4 text-[var(--accent)] animate-spin shrink-0" />
          <div className="flex items-center gap-2 text-[var(--text-primary)] min-w-0">
            <span className="font-semibold truncate max-w-[140px] sm:max-w-[200px]">
              {activeRepeatJob.label}
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
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 font-semibold transition-colors cursor-pointer shrink-0"
          >
            <Square className="w-3 h-3 fill-current" />
            <span>Stop</span>
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
              ? 'border-rose-500/45 text-rose-200'
              : 'border-[var(--border-strong)] text-[var(--text-primary)]'
          }`}
        >
          {toast.variant === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span className="leading-snug">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
