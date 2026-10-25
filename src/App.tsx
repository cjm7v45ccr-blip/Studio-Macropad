import React, { useState, useEffect, useCallback } from 'react';
import {
  CanvasViewMode,
  ControlId,
  DeviceConnectionInfo,
  SidebarSection
} from './types/studio';
import { useStudioState } from './hooks/useStudioState';
import { usbHardware } from './services/usbHardwareService';
import { describeFirmwareAction } from './data/firmwareCatalog';
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
import { CheckCircle2 } from 'lucide-react';

export default function App() {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSyncingUsb, setIsSyncingUsb] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 2800);
    return () => clearTimeout(t);
  }, [toastMessage]);

  const studio = useStudioState(showToast);

  const [activeSection, setActiveSection] = useState<SidebarSection>('device');
  const [selectedControl, setSelectedControl] = useState<ControlId>('k1');
  const [viewMode, setViewMode] = useState<CanvasViewMode>('edit');
  const [connectModalOpen, setConnectModalOpen] = useState(false);

  const [connection, setConnection] = useState<DeviceConnectionInfo>(usbHardware.info);

  // Subscribe to physical USB Serial connection & live event badge updates
  useEffect(() => {
    const unsubConn = usbHardware.onConnectionChange(info => {
      setConnection(info);
    });
    return () => {
      unsubConn();
    };
  }, []);

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
      setConnectModalOpen(true);
      return;
    }
    setIsSyncingUsb(true);
    try {
      await studio.pushAllToDeviceNow();
    } finally {
      setIsSyncingUsb(false);
    }
  }, [connection.connected, studio]);

  const handleExecuteHardwareAction = useCallback(
    async (actionStr: string): Promise<boolean> => {
      if (!connection.connected) {
        showToast('Connect MacroPad via USB to test actions on hardware');
        return false;
      }
      try {
        const res = await usbHardware.testAction(actionStr);
        showToast(
          res.message || `Executed ${describeFirmwareAction(actionStr).shortLabel} on MacroPad`
        );
        return true;
      } catch (err: any) {
        showToast(err?.message || 'Hardware could not run test action');
        return false;
      }
    },
    [connection.connected, showToast]
  );

  const selectedKeyConfig =
    selectedControl !== 'encoder'
      ? studio.activeLayer.keys[selectedControl] || studio.activeLayer.keys.k1
      : null;

  return (
    <div className="h-screen w-screen overflow-hidden bg-[var(--bg-canvas)] text-[var(--text-primary)] flex flex-col">
      {/* Top Bar */}
      <TopBar
        connection={connection}
        syncStatus={studio.syncStatus}
        currentRev={studio.currentRev}
        dirty={studio.dirty}
        isSyncingUsb={isSyncingUsb}
        onOpenConnectModal={() => setConnectModalOpen(true)}
        onPullFromUsb={handlePullFromUsb}
        profiles={studio.profiles}
        activeProfile={studio.activeProfile}
        onSelectProfile={studio.selectProfile}
        onRenameProfile={studio.renameProfile}
        onCopyProfile={studio.copyHardwareProfile}
        canUndo={studio.canUndo}
        canRedo={studio.canRedo}
        onUndo={studio.undo}
        onRedo={studio.redo}
        onSaveToDevice={handleSaveToDevice}
      />

      {/* Main Workspace Area: Left Sidebar + Active Section */}
      <div className="flex-1 flex overflow-hidden">
        <LeftSidebar
          activeSection={activeSection}
          onSelectSection={setActiveSection}
          soundEnabled={studio.settings.soundEnabled}
          onToggleSound={() =>
            studio.updateSettings({ soundEnabled: !studio.settings.soundEnabled })
          }
          macroCount={studio.customMacros.length}
        />

        {activeSection === 'device' && (
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            <MacropadCanvas
              activeProfileId={studio.activeProfile.id}
              activeProfileName={studio.activeProfile.name}
              layer={studio.activeLayer}
              selectedControl={selectedControl}
              viewMode={viewMode}
              encoderPlacement={studio.settings.encoderPlacement}
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
              onOpenConnectModal={() => setConnectModalOpen(true)}
              onPullFromUsb={handlePullFromUsb}
              onExecuteHardwareAction={handleExecuteHardwareAction}
            />

            {selectedControl === 'encoder' ? (
              <EncoderInspector
                encoder={studio.activeLayer.encoder}
                activeProfileId={studio.activeProfile.id}
                activeProfileName={studio.activeProfile.name}
                customMacros={studio.customMacros}
                keyboardLayout={studio.settings.keyboardLayout}
                isConnected={connection.connected}
                onUpdateSlot={studio.updateEncoderSlot}
                onUpdateColor={studio.updateEncoderColor}
                onTestAction={actionStr => {
                  handleExecuteHardwareAction(actionStr);
                }}
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
                  isConnected={connection.connected}
                  onUpdateBinding={binding =>
                    studio.updateKeyBinding(selectedControl, binding)
                  }
                  onUpdateAppearance={patch =>
                    studio.updateKeyAppearance(selectedControl, patch)
                  }
                  onResetAppearance={() =>
                    studio.resetKeyAppearance(selectedControl)
                  }
                  onToggleProfileMode={studio.toggleActiveProfile}
                  onTestAction={actionStr => {
                    handleExecuteHardwareAction(actionStr);
                  }}
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
            isConnected={connection.connected}
            onSaveMacro={studio.saveCustomMacro}
            onDeleteMacro={studio.deleteCustomMacro}
            onAssignSlot={studio.assignSlotAction}
            onTestAction={actionStr => {
              handleExecuteHardwareAction(actionStr);
            }}
            onPullFromUsb={handlePullFromUsb}
          />
        )}

        {activeSection === 'library' && (
          <LibraryView
            profiles={studio.profiles}
            userPresets={studio.userPresets}
            isConnected={connection.connected}
            isSyncedWithHardware={studio.isSyncedWithHardware}
            onPullFromUsb={handlePullFromUsb}
            onPushAllToUsb={handleSaveToDevice}
            onCopyHardwareProfile={studio.copyHardwareProfile}
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
            onClearLocalCache={studio.clearLocalUnSyncedState}
            onToast={showToast}
          />
        )}
      </div>

      {/* USB WebSerial Connection Modal */}
      <UsbConnectModal
        isOpen={connectModalOpen}
        onClose={() => setConnectModalOpen(false)}
        connection={connection}
        onPullFromUsb={handlePullFromUsb}
      />

      {/* Unsynced Draft Conflict Modal ("Use website settings or pad settings?") */}
      <SyncConflictModal
        conflict={studio.conflictPrompt}
        onUseWebsite={studio.resolveConflictUseWebsite}
        onUsePad={studio.resolveConflictUsePad}
      />

      {/* Minimal Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-strong)] shadow-2xl text-xs font-medium text-[var(--text-primary)]">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
