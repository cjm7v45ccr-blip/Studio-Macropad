import React from 'react';
import { SyncConflictState } from '../types/studio';
import { GitCompareArrows, Laptop, Cpu, ArrowRight } from 'lucide-react';

interface SyncConflictModalProps {
  conflict: SyncConflictState | null;
  onUseWebsite: () => void;
  onUsePad: () => void;
}

export const SyncConflictModal: React.FC<SyncConflictModalProps> = ({
  conflict,
  onUseWebsite,
  onUsePad
}) => {
  if (!conflict) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-strong)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <GitCompareArrows className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              Use website settings or pad settings?
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              You have unsynced offline edits for{' '}
              <span className="font-mono text-[var(--text-secondary)]">
                {conflict.deviceName}
              </span>{' '}
              (pad rev {conflict.padRev}).
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {conflict.diffs.length > 0 ? (
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Differences ({conflict.diffs.length})
              </div>
              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                {conflict.diffs.map(item => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs space-y-1"
                  >
                    <div className="font-mono text-[11px] font-bold text-[var(--text-primary)]">
                      {item.label}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] flex-wrap">
                      <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/25 font-mono">
                        Website: {item.websiteValue}
                      </span>
                      <ArrowRight className="w-3 h-3 text-[var(--text-muted)]" />
                      <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 font-mono">
                        Pad: {item.padValue}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Your local draft was marked modified while unplugged. Choose whether to write your website draft (`Host 1–3` & `TV` profiles via `/api/profile/save`) or adopt the MacroPad’s current settings.
            </p>
          )}

          {/* Choice Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
            <button
              type="button"
              onClick={onUseWebsite}
              style={{ backgroundColor: 'var(--accent)', color: '#FFFFFF' }}
              className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
            >
              <Laptop className="w-4 h-4 shrink-0" />
              <span>Use Website Settings</span>
            </button>

            <button
              type="button"
              onClick={onUsePad}
              className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <Cpu className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Use Pad Settings</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
