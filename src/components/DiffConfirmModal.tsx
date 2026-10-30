import React, { useState, useEffect } from 'react';
import { ArrowRight, AlertTriangle, GitCompareArrows, X } from 'lucide-react';
import { parseSingleActionKeyValue } from '../data/firmwareCatalog';
import { ParsedActionBadge } from './ActionTagBadge';

export interface DiffPreviewRow {
  id: string;
  slotLabel: string;
  beforeLabel: string;
  afterLabel: string;
  changed: boolean;
}

interface DiffConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: 'accent' | 'danger';
  requireWord?: string;
  rows?: DiffPreviewRow[];
  onConfirm: () => void;
  onCancel: () => void;
}

export const DiffConfirmModal: React.FC<DiffConfirmModalProps> = ({
  isOpen,
  title,
  description,
  confirmLabel,
  tone = 'accent',
  requireWord,
  rows = [],
  onConfirm,
  onCancel
}) => {
  const [typedWord, setTypedWord] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTypedWord('');
    }
  }, [isOpen, requireWord, title]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const canConfirm = requireWord ? typedWord.trim() === requireWord : true;
  const changedCount = rows.filter(r => r.changed).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="diff-confirm-modal-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-strong)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${
                tone === 'danger'
                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                  : 'bg-sky-500/15 border-sky-500/30 text-sky-400'
              }`}
            >
              {tone === 'danger' ? (
                <AlertTriangle className="w-4 h-4" />
              ) : (
                <GitCompareArrows className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0">
              <h3
                id="diff-confirm-modal-title"
                className="text-sm font-bold text-[var(--text-primary)]"
              >
                {title}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                {description}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {rows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                <span>Slot Changes Preview ({rows.length} controls)</span>
                <span className="font-mono tabular-nums">
                  {changedCount === 0
                    ? 'Already identical'
                    : `${changedCount} ${changedCount === 1 ? 'slot changes' : 'slots change'}`}
                </span>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                {rows.map(row => {
                  const beforeHasPrefix = Boolean(
                    parseSingleActionKeyValue(row.beforeLabel).prefix
                  );
                  const afterHasPrefix = Boolean(
                    parseSingleActionKeyValue(row.afterLabel).prefix
                  );
                  return (
                    <div
                      key={row.id}
                      className={`p-2.5 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 ${
                        row.changed
                          ? 'bg-[var(--bg-input)] border-[var(--border-strong)]'
                          : 'bg-[var(--bg-input)]/50 border-[var(--border-subtle)] opacity-70'
                      }`}
                    >
                      <span className="font-mono text-[11px] font-bold text-[var(--text-primary)] shrink-0">
                        {row.slotLabel}
                      </span>
                      <div className="flex items-center gap-1.5 text-[11px] font-mono flex-wrap min-w-0">
                        <span className="px-2 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--text-secondary)] truncate max-w-[175px] inline-flex items-center">
                          {beforeHasPrefix ? (
                            <ParsedActionBadge action={row.beforeLabel} maxSteps={1} />
                          ) : (
                            row.beforeLabel
                          )}
                        </span>
                        <ArrowRight className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                        <span
                          className={`px-2 py-0.5 rounded truncate max-w-[175px] inline-flex items-center ${
                            row.changed
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold'
                              : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'
                          }`}
                        >
                          {afterHasPrefix ? (
                            <ParsedActionBadge action={row.afterLabel} maxSteps={1} />
                          ) : (
                            row.afterLabel
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {requireWord && (
            <div className="space-y-1.5">
              <label
                htmlFor="diff-confirm-word-input"
                className="block text-xs font-medium text-[var(--text-secondary)]"
              >
                Type <span className="font-mono font-bold text-rose-400">{requireWord}</span> to
                confirm:
              </label>
              <input
                id="diff-confirm-word-input"
                type="text"
                autoFocus
                value={typedWord}
                onChange={e => setTypedWord(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && canConfirm) {
                    e.preventDefault();
                    onConfirm();
                  }
                }}
                placeholder={requireWord}
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-rose-400"
              />
            </div>
          )}

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canConfirm}
              onClick={onConfirm}
              style={
                tone === 'accent'
                  ? { backgroundColor: 'var(--accent)', color: '#FFFFFF' }
                  : undefined
              }
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:pointer-events-none ${
                tone === 'danger'
                  ? 'bg-rose-500 hover:bg-rose-600 text-white'
                  : 'hover:opacity-90'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
