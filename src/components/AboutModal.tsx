import React from 'react';
import { X, ShieldCheck, Mail, GitCommit, FileText, ExternalLink, Cpu } from 'lucide-react';
import { STUDIO_VERSION, FIRMWARE_INO_FILENAME } from '../utils/version';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-modal-title"
    >
      <div className="relative w-full max-w-xl bg-[var(--bg-panel)] border border-[var(--border-strong)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-400/15 text-amber-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 id="about-modal-title" className="text-base font-bold text-[var(--text-primary)]">
                About BertoPad Studio
              </h2>
              <p className="text-xs font-mono text-[var(--text-muted)]">
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
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Professional Companion Software</h3>
            <p>
              BertoPad Studio is the high-performance companion app and web-based configuration suite for the ESP32 BertoPad hardware macro pad. Engineered with Web Serial integration, 3-host Easy-Switch Bluetooth profiles, OLED HUD previews, and smart macro sequencing.
            </p>
          </div>

          {/* Changelog */}
          <div className="space-y-2.5 p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
            <div className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
              <GitCommit className="w-4 h-4 text-amber-400" />
              <span>Recent Changelog ({STUDIO_VERSION})</span>
            </div>
            <ul className="space-y-1.5 list-disc list-inside text-[11px] text-[var(--text-muted)]">
              <li>Firmware v4.10.1: Bluetooth multi-host isolation with Easy-Switch virtual MAC addresses.</li>
              <li>Timed pairing mode (120s) with OLED pairing banner and host confirmation notifications.</li>
              <li>Strict security mode to block unknown Bluetooth hosts outside the pairing window.</li>
              <li>Per-profile Bluetooth host forgetting with fresh virtual MAC generation.</li>
              <li>Full Web Serial and HTTP API control for /api/ble (pair, disconnect, connect, forget).</li>
            </ul>
          </div>

          {/* Licensing & Support */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-2">
              <div className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
                <FileText className="w-4 h-4 text-amber-400" />
                <span>Open-Source License</span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                Licensed under the MIT License. Copyright © 2026 BertoPad Engineering. Free for personal and commercial hardware use.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-2">
              <div className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
                <Mail className="w-4 h-4 text-amber-400" />
                <span>Support &amp; Contact</span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                Need engineering assistance or custom firmware support? Reach our team at <a href="mailto:support@bertopad.dev" className="text-amber-400 hover:underline">support@bertopad.dev</a>.
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
            className="px-4 py-1.5 rounded-xl bg-amber-400 text-black font-semibold text-xs hover:bg-amber-300 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
