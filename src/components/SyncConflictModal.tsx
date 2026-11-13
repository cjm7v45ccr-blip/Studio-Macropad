import React from 'react';
import { SyncConflictState } from '../types/studio';
import { GitCompareArrows, Laptop, Cpu } from 'lucide-react';
import { parseSingleActionKeyValue } from '../data/firmwareCatalog';
import { ParsedActionBadge } from './ActionTagBadge';

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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sync-conflict-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-strong)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] border border-[rgba(var(--accent-rgb),0.3)] flex items-center justify-center text-[var(--accent)] shrink-0">
            <GitCompareArrows className="w-4 h-4" />
          </div>
          <div>
            <h3
              id="sync-conflict-modal-title"
              className="text-sm font-bold text-[var(--text-primary)]"
            >
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
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] tabular-nums">
                Differences ({conflict.diffs.length})
              </div>
              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                {conflict.diffs.map(item => {
                  const webHasPrefix = Boolean(
                    parseSingleActionKeyValue(item.websiteValue).prefix
                  );
                  const padHasPrefix = Boolean(
                    parseSingleActionKeyValue(item.padValue).prefix
                  );
                  return (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs space-y-2"
                    >
                      <div className="font-mono text-[11px] font-bold text-[var(--text-primary)]">
                        {item.label}
                      </div>
                      <div className="space-y-1.5 font-mono text-[11px]">
                        <div className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-subtle)] overflow-x-auto max-w-full flex items-center gap-2">
                          <span className="text-[10px] text-[var(--text-muted)] shrink-0 font-sans uppercase font-semibold">Web:</span>
                          {webHasPrefix ? (
                            <ParsedActionBadge action={item.websiteValue} size="xs" />
                          ) : (
                            <span className="whitespace-nowrap">{item.websiteValue}</span>
                          )}
                        </div>
                        <div className="px-2.5 py-1.5 rounded-lg bg-[var(--accent-soft)] text-[var(--text-primary)] border border-[rgba(var(--accent-rgb),0.3)] overflow-x-auto max-w-full flex items-center gap-2">
                          <span className="text-[10px] text-[var(--text-muted)] shrink-0 font-sans uppercase font-semibold">Pad:</span>
                          {padHasPrefix ? (
                            <ParsedActionBadge action={item.padValue} size="xs" />
                          ) : (
                            <span className="whitespace-nowrap">{item.padValue}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Your local draft was marked modified while unplugged. Choose whether to write your website draft (`Host 1–3` & `TV` profiles via `/api/profile/save`) or adopt the BertoPad’s current settings.
            </p>
          )}

          {/* Choice Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
            <button
              type="button"
              onClick={onUseWebsite}
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }}
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
              <Cpu className="w-4 h-4 text-[var(--accent)] shrink-0" />
              <span>Use Pad Settings</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
