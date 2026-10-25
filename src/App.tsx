import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ActionBinding,
  ActiveRepeatJob,
  CanvasViewMode,
  ControlId,
  DeviceConnectionInfo,
  EncoderSubControlId,
  HardwareProfileId,
  KeyId,
  SidebarSection
} from './types/studio';
import {
  ToastVariant,
  extractProfileSlots,
  useStudioState
} from './hooks/useStudioState';
import { usbHardware } from './services/usbHardwareService';
import { repeatMacroRunner } from './services/repeatMacroRunner';
import {
  HARDWARE_SLOTS,
  SLOT_LABELS,
  describeFirmwareAction,
  getActionTestAvailability,
  requiresUsbSequenceExecution
} from './data/firmwareCatalog';
import { TopBar } from './components/TopBar';
import { LeftSidebar } from './components/LeftSidebar';
import { MacropadCanvas } from './components/MacropadCanvas';
import { ButtonInspector } from './components/ButtonInspector';
import { EncoderInspector } from './components/EncoderInspector';
import { MacroEditorView } from './components/MacroEditorView';
import { LibraryView } from './components/LibraryView';
import { SettingsView } from './components/SettingsView';
import { UsbConnectModal } from './components/UsbConnectModal';
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
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [connectModalError, setConnectModalError] = useState<string | null>(null);
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
    const unsubJob = repeatMacroRunner.onJobChange(job => {
      setActiveRepeatJob(job);
    });
    return () => {
      unsubConn();
      unsubJob();
    };
  }, []);

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

  const topBarCopyDiffRows: DiffPreviewRow[] = useMemo(() => {
    if (!pendingCopyPair) return [];
    const srcProf =
      studio.profiles.find(p => p.id === pendingCopyPair.source) || studio.profiles[0];
    const tgtProf =
      studio.profiles.find(p => p.id === pendingCopyPair.target) || studio.profiles[1];
    const srcSlots = extractProfileSlots(srcProf);
    const tgtSlots = extractProfileSlots(tgtProf);
    return HARDWARE_SLOTS.map(slot => ({
      id: `${pendingCopyPair.target}-${slot}`,
      slotLabel: `${pendingCopyPair.target} · ${SLOT_LABELS[slot].short}`,
      beforeLabel: tgtSlots[slot]
        ? describeFirmwareAction(tgtSlots[slot]).shortLabel
        : 'Unassigned',
      afterLabel: srcSlots[slot]
        ? describeFirmwareAction(srcSlots[slot]).shortLabel
        : 'Unassigned',
      changed: tgtSlots[slot] !== srcSlots[slot]
    }));
  }, [pendingCopyPair, studio.profiles]);

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
          macroCount={studio.customMacros.length}
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
              onConnectUsbPad={handleConnectUsbPad}
              onStartDemoMode={handleStartDemoMode}
              onPullFromUsb={handlePullFromUsb}
              onExecuteHardwareBinding={handleExecuteHardwareBinding}
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
                onOpenMacroBuilder={() => setActiveSection('macros')}
              />
            ) : (
              selectedKeyConfig && (
                <ButtonInspector
                  keyConfig={selectedKeyConfig}
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
                  onTestBinding={binding => {
                    handleExecuteHardwareBinding(binding);
                  }}
                  onStopRepeat={handleStopRepeat}
                  onOpenMacroBuilder={() => setActiveSection('macros')}
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
            onSaveMacro={studio.saveCustomMacro}
            onDeleteMacro={studio.deleteCustomMacro}
            onAssignSlot={studio.assignSlotAction}
            onTestBinding={binding => {
              handleExecuteHardwareBinding(binding);
            }}
            onStopRepeat={handleStopRepeat}
            onPullFromUsb={handlePullFromUsb}
          />
        )}

        {activeSection === 'library' && (
          <LibraryView
            profiles={studio.profiles}
            activeProfileId={studio.activeProfile.id}
            userPresets={studio.userPresets}
            isConnected={connection.connected}
            onPullFromUsb={handlePullFromUsb}
            onPushAllToUsb={handleSaveToDevice}
            onCopyHardwareProfile={studio.copyHardwareProfile}
            onAssignProfileSlots={studio.assignProfileSlots}
            onResetBothProfiles={studio.resetBothProfilesToDefault}
            onSaveUserSnapshot={studio.saveUserSnapshot}
            onDeleteUserSnapshot={studio.deleteUserSnapshot}
            onApplyHardwareBackup={studio.applyHardwareBackup}
            onExportBackupFile={studio.exportHardwareBackupFile}
            onImportBackupFile={studio.importHardwareBackupFile}
          />
        )}

        {activeSection === 'settings' && (
          <SettingsView
            settings={studio.settings}
            connection={connection}
            syncStatus={studio.syncStatus}
            currentRev={studio.currentRev}
            currentDeviceId={studio.currentDeviceId}
            onUpdateSettings={studio.updateSettings}
            onPullFromUsb={handlePullFromUsb}
            onResetBothProfiles={studio.resetBothProfilesToDefault}
            onClearLocalCache={studio.clearLocalUnSyncedState}
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
      />

      {/* TopBar Copy Profile Diff Confirmation Modal */}
      <DiffConfirmModal
        isOpen={pendingCopyPair !== null}
        title={
          pendingCopyPair
            ? `Copy ${pendingCopyPair.source} → ${pendingCopyPair.target}?`
            : ''
        }
        description={
          pendingCopyPair
            ? `All 11 controls on ${pendingCopyPair.target} will be overwritten with ${pendingCopyPair.source}'s bindings.`
            : ''
        }
        confirmLabel={
          pendingCopyPair
            ? `Copy ${pendingCopyPair.source} → ${pendingCopyPair.target}`
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
