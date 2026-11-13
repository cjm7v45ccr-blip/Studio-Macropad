import React, { useEffect } from 'react';
import { X, Mail, GitCommit, FileText, Cpu } from 'lucide-react';
import { STUDIO_VERSION, FIRMWARE_INO_FILENAME } from '../utils/version';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 dark:bg-black/75 backdrop-blur-md animate-panel-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-modal-title"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-xl bg-[var(--bg-panel)] border border-[var(--border-strong)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 id="about-modal-title" className="text-base font-bold text-[var(--text-primary)]">
                About BertoPad Studio
              </h2>
              <p className="text-xs font-mono text-[var(--text-muted)] tabular-nums">
                Studio {STUDIO_VERSION} · Firmware {FIRMWARE_INO_FILENAME}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close about dialog"
            className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-[var(--text-secondary)] leading-relaxed">
          {/* Overview */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Hardware Companion Studio</h3>
            <p>
              BertoPad Studio is the standalone companion app and Web Serial configuration suite for the ESP32 BertoPad hardware macro pad. Engineered with real-time NVS synchronization, 3-host Easy-Switch Bluetooth profiles, OLED HUD previews, GY-521 motion calibration, and timed multi-step macro sequencing.
            </p>
          </div>

          {/* Changelog */}
          <div className="space-y-2.5 p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
            <div className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
              <GitCommit className="w-4 h-4 text-[var(--accent)]" />
              <span>Release Highlights ({STUDIO_VERSION})</span>
            </div>
            <ul className="space-y-1.5 list-disc list-inside text-[11px] text-[var(--text-muted)]">
              <li>Bluetooth multi-host isolation across 3 Easy-Switch hosts with per-slot virtual MACs.</li>
              <li>Timed pairing window (120s), strict security host filtering, and per-slot host forgetting.</li>
              <li>GY-521 6-axis motion calibration and real-time 3D tactile chassis visualization.</li>
              <li>Full JSON workspace backup &amp; restore alongside live firmware OTA and Web Serial flashing.</li>
              <li>Dual-theme Light &amp; Dark studio surfaces with Web Audio tactile switch synthesis.</li>
            </ul>
          </div>

          {/* Licensing & Support */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-2">
              <div className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
                <FileText className="w-4 h-4 text-[var(--accent)]" />
                <span>Open-Source License</span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                Licensed under the MIT License. Copyright © 2026 BertoPad Engineering. Free for personal and commercial hardware use.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-2">
              <div className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
                <Mail className="w-4 h-4 text-[var(--accent)]" />
                <span>Support &amp; Contact</span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                Need engineering assistance or custom firmware support? Reach our team at{' '}
                <a href="mailto:support@bertopad.dev" className="text-[var(--accent)] hover:underline">
                  support@bertopad.dev
                </a>
                .
              </p>
            </div>
          </div>

          {/* Trademark Notes */}
          <div className="p-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-strong)] text-[10px] text-[var(--text-muted)] space-y-1">
            <div className="font-semibold text-[var(--text-secondary)]">Third-Party Trademark Notices</div>
            <p>
              Vizio SmartCast is a registered trademark of Vizio, Inc. Spotify is a registered trademark of Spotify AB. Apple and ⌘ are registered trademarks of Apple Inc. BertoPad is an independent hardware project and is not affiliated with, sponsored by, or endorsed by Vizio, Spotify, Apple, or any other third-party brand.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
          <span className="font-mono text-[10px] text-[var(--text-muted)]">
            BertoPad Studio · Open Hardware Companion
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }}
            className="px-4 py-1.5 rounded-xl font-semibold text-xs hover:opacity-90 transition-opacity cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
