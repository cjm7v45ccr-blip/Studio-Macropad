import React from 'react';
import { Cpu, Download, FolderOpen, HelpCircle, X, CheckCircle2, ShieldCheck, ArrowRight, Upload } from 'lucide-react';

interface FirmwareBinGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FirmwareBinGuideModal: React.FC<FirmwareBinGuideModalProps> = ({
  isOpen,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-[var(--bg-panel)] border border-[var(--border-strong)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/15 text-sky-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">Adding & Naming Custom Firmware .bin Files</h2>
              <p className="text-xs text-[var(--text-muted)]">ESP32 Studio MacroPad Firmware Guide</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-[var(--text-secondary)] leading-relaxed">
          
          {/* Section 1: Naming */}
          <div className="space-y-2 p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
            <div className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
              <span className="w-5 h-5 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-[11px]">1</span>
              <span>How to Name Your .bin File</span>
            </div>
            <p>
              To ensure version detection and SHA-256 integrity verification work seamlessly, name your compiled ESP32 firmware binary using semantic versioning:
            </p>
            <div className="p-2.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-strong)] font-mono text-[11px] text-[var(--accent)]">
              StudioMacroPad_v4.6.0.bin
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">
              (You can also include edition suffixes like <code className="text-[var(--text-primary)]">_PRO.bin</code> or <code className="text-[var(--text-primary)]">_STABLE.bin</code>).
            </p>
          </div>

          {/* Section 2: Adding */}
          <div className="space-y-3 p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
            <div className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
              <span className="w-5 h-5 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-[11px]">2</span>
              <span>How to Add Your .bin File</span>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-start gap-2.5">
                <FolderOpen className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-[var(--text-primary)]">Method A: Place in Workspace /public/</span>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Drop your <code className="text-[var(--text-primary)]">firmware-vX.Y.Z.bin</code> file into the project&apos;s <code className="text-[var(--text-primary)]">public/</code> folder. The application automatically hashes and catalogs it via <code className="text-[var(--text-primary)]">/firmware-catalog.json</code>.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Upload className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-[var(--text-primary)]">Method B: Direct Local .bin Flash over USB</span>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    In <span className="text-[var(--text-primary)]">MacroPad Firmware Updates</span> (in Settings), click <span className="text-[var(--text-primary)]">Upload Local .bin</span> to pick any compiled binary from your computer and flash it directly over USB.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Pro tip */}
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-200">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-[11px]">
              Flashing updates over USB preserves your saved button macros, 3-host Bluetooth pairings, and Wi-Fi credentials automatically.
            </span>
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
          >
            Got It
          </button>
        </div>

      </div>
    </div>
  );
};
