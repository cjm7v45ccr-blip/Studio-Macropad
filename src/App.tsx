import React, { useState, useEffect, useCallback } from 'react';
import {
  CanvasViewMode,
  ControlId,
  DeviceConnectionInfo,
  KeyId,
  SidebarSection
} from './types/studio';
import { useStudioState } from './hooks/useStudioState';
import { usbHardware } from './services/usbHardwareService';
import { ALL_KEY_IDS } from './data/presetTemplates';
import { TopBar } from './components/TopBar';
import { LeftSidebar } from './components/LeftSidebar';
import { MacropadCanvas } from './components/MacropadCanvas';
import { ButtonInspector } from './components/ButtonInspector';
import { EncoderInspector } from './components/EncoderInspector';
import { MacroEditorView } from './components/MacroEditorView';
import { LibraryView } from './components/LibraryView';
import { SettingsView } from './components/SettingsView';
import { UsbConnectModal } from './components/UsbConnectModal';
import { CheckCircle2 } from 'lucide-react';

export default function App() {
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 2600);
    return () => clearTimeout(t);
  }, [toastMessage]);

  const studio = useStudioState(showToast);

  const [activeSection, setActiveSection] = useState<SidebarSection>('device');
  const [selectedControl, setSelectedControl] = useState<ControlId>('k1');
  const [viewMode, setViewMode] = useState<CanvasViewMode>('edit');
  const [connectModalOpen, setConnectModalOpen] = useState(false);

  const [connection, setConnection] = useState<DeviceConnectionInfo>(usbHardware.info);
  const [hardwarePressedKeys, setHardwarePressedKeys] = useState<Set<KeyId>>(new Set());
  const [hardwareEncoderSpin, setHardwareEncoderSpin] = useState<{
    dir: 'cw' | 'ccw';
    seq: number;
  } | null>(null);

  // Subscribe to physical USB hardware connection & live input reports
  useEffect(() => {
    const unsubConn = usbHardware.onConnectionChange(info => {
      setConnection(info);
    });

    const unsubKeys = usbHardware.onHardwareKey((kid, pressed) => {
      setHardwarePressedKeys(prev => {
        const next = new Set(prev);
        if (pressed) next.add(kid);
        else next.delete(kid);
        return next;
      });
    });

    const unsubEnc = usbHardware.onHardwareEncoder(ev => {
      if (ev.type === 'cw' || ev.type === 'ccw') {
        setHardwareEncoderSpin(prev => ({
          dir: ev.type as 'cw' | 'ccw',
          seq: (prev?.seq || 0) + 1
        }));
      }
    });

    const unsubConfig = usbHardware.onHardwareConfig(cfg => {
      if (cfg.mac_b1 || cfg.mac_b2 || cfg.mac_b3 || cfg.mac_b4 || cfg.mac_dial) {
        studio.syncHardwareBindings('Mac', {
          b1: cfg.mac_b1,
          b2: cfg.mac_b2,
          b3: cfg.mac_b3,
          b4: cfg.mac_b4,
          dial: cfg.mac_dial
        });
      }
      if (cfg.tv_b1 || cfg.tv_b2 || cfg.tv_b3 || cfg.tv_b4 || cfg.tv_dial) {
        studio.syncHardwareBindings('TV', {
          b1: cfg.tv_b1,
          b2: cfg.tv_b2,
          b3: cfg.tv_b3,
          b4: cfg.tv_b4,
          dial: cfg.tv_dial
        });
      }
      showToast('Detected & synced macros from hardware');
    });

    return () => {
      unsubConn();
      unsubKeys();
      unsubEnc();
      unsubConfig();
    };
  }, []);

  const handleSaveToDevice = async () => {
    const res = await usbHardware.saveConfigurationToDevice(
      studio.activeProfile,
      studio.settings
    );
    studio.setHasUnsavedChanges(false);
    showToast(res.syncedHardware ? 'Saved to device' : res.message);
  };

  const selectedKeyConfig =
    selectedControl !== 'encoder'
      ? studio.activeLayer.keys[selectedControl] || studio.activeLayer.keys.k1
      : null;

  const selectedKeyNumber =
    selectedControl !== 'encoder'
      ? ALL_KEY_IDS.indexOf(selectedControl) + 1
      : 1;

  return (
    <div className="h-screen w-screen overflow-hidden bg-[var(--bg-canvas)] text-[var(--text-primary)] flex flex-col">
      {/* Top Bar */}
      <TopBar
        connection={connection}
        onOpenConnectModal={() => setConnectModalOpen(true)}
        profiles={studio.profiles}
        activeProfile={studio.activeProfile}
        onSelectProfile={studio.selectProfile}
        onCreateProfile={studio.createProfile}
        onRenameProfile={studio.renameProfile}
        onDuplicateProfile={studio.duplicateProfile}
        onDeleteProfile={studio.deleteProfile}
        onSelectLayer={studio.selectLayer}
        onUpdateLayerMeta={studio.updateLayerMeta}
        hasUnsavedChanges={studio.hasUnsavedChanges}
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
          macroCount={studio.macros.length}
        />

        {activeSection === 'device' && (
          <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            <MacropadCanvas
              layer={studio.activeLayer}
              layers={studio.activeProfile.layers}
              activeLayerIndex={studio.activeProfile.activeLayerIndex}
              onSelectLayer={studio.selectLayer}
              selectedControl={selectedControl}
              onSelectControl={setSelectedControl}
              viewMode={viewMode}
              onChangeViewMode={setViewMode}
              encoderPlacement={studio.settings.encoderPlacement}
              onChangeEncoderPlacement={placement =>
                studio.updateSettings({ encoderPlacement: placement })
              }
              conflicts={studio.conflicts}
              macros={studio.macros}
              onCycleEncoderMode={studio.cycleEncoderMode}
              hardwarePressedKeys={hardwarePressedKeys}
              hardwareEncoderSpin={hardwareEncoderSpin}
            />

            {selectedControl === 'encoder' ? (
              <EncoderInspector
                encoder={studio.activeLayer.encoder}
                onUpdateEncoder={studio.updateEncoder}
                macros={studio.macros}
                profiles={studio.profiles}
                keyboardLayout={studio.settings.keyboardLayout}
                onNavigateToMacros={() => setActiveSection('macros')}
                onToast={showToast}
              />
            ) : (
              selectedKeyConfig && (
                <ButtonInspector
                  keyConfig={selectedKeyConfig}
                  keyNumber={selectedKeyNumber}
                  onUpdateTrigger={(trig, binding) =>
                    studio.updateKeyTrigger(selectedKeyConfig.id, trig, binding)
                  }
                  onUpdateAppearance={patch =>
                    studio.updateKeyAppearance(selectedKeyConfig.id, patch)
                  }
                  onUpdateAdvanced={patch =>
                    studio.updateKeyAdvanced(selectedKeyConfig.id, patch)
                  }
                  onResetKey={() => studio.resetKey(selectedKeyConfig.id)}
                  macros={studio.macros}
                  profiles={studio.profiles}
                  keyboardLayout={studio.settings.keyboardLayout}
                  conflicts={studio.conflicts}
                  globalDebounceMs={studio.settings.globalDebounceMs}
                  onNavigateToMacros={() => setActiveSection('macros')}
                  onToast={showToast}
                />
              )
            )}
          </main>
        )}

        {activeSection === 'macros' && (
          <MacroEditorView
            macros={studio.macros}
            folders={studio.macroFolders}
            onUpdateMacros={studio.updateMacros}
            onUpdateFolders={studio.updateMacroFolders}
            onToast={showToast}
          />
        )}

        {activeSection === 'library' && (
          <LibraryView
            activeProfile={studio.activeProfile}
            userPresets={studio.userPresets}
            onApplyProfileLayout={studio.applyTemplateToActiveProfile}
            onSaveUserPreset={studio.saveUserPreset}
            onDeleteUserPreset={studio.deleteUserPreset}
            onImportProfileJson={studio.importProfileJson}
            onToast={showToast}
          />
        )}

        {activeSection === 'settings' && (
          <SettingsView
            settings={studio.settings}
            connection={connection}
            onUpdateSettings={studio.updateSettings}
            onExportFullBackup={studio.exportFullBackup}
            onImportFullBackup={studio.importFullBackup}
            onFactoryReset={studio.factoryReset}
            onOpenConnectModal={() => setConnectModalOpen(true)}
            onToast={showToast}
          />
        )}
      </div>

      {/* USB Cable Connection Modal */}
      <UsbConnectModal
        isOpen={connectModalOpen}
        onClose={() => setConnectModalOpen(false)}
        connection={connection}
        onToast={showToast}
      />

      {/* Toast Confirmation */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-strong)] shadow-2xl text-xs font-semibold text-[var(--text-primary)]">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
