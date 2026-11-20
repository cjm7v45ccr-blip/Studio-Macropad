import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  const changedRows = rows.filter(
    r =>
      r.changed &&
      r.beforeLabel.trim().toLowerCase() !== r.afterLabel.trim().toLowerCase()
  );
  const changedCount = changedRows.length;

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#080A0D]/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="diff-confirm-modal-title"
      onClick={onCancel}
    >
      <div
        className="studio-popover w-full max-w-lg max-h-[90dvh] flex flex-col rounded-2xl overflow-hidden animate-popover-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--accent)]"
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
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {rows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                <span>Slot Changes Preview</span>
                <span className="font-mono tabular-nums">
                  {changedCount === 0
                    ? 'Already identical'
                    : `${changedCount} ${changedCount === 1 ? 'slot changes' : 'slots change'}`}
                </span>
              </div>

              {changedRows.length === 0 ? (
                <div className="px-3 py-2.5 rounded-lg bg-[var(--bg-input)] text-xs text-[var(--text-secondary)]">
                  All {rows.length} controls already match this layout.
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)]/40">
                  {changedRows.map(row => {
                    const beforeHasPrefix = Boolean(
                      parseSingleActionKeyValue(row.beforeLabel).prefix
                    );
                    const afterHasPrefix = Boolean(
                      parseSingleActionKeyValue(row.afterLabel).prefix
                    );
                    return (
                      <div
                        key={row.id}
                        className="px-3 py-2 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1.5"
                      >
                        <span className="font-mono text-[11px] font-semibold text-[var(--text-primary)] shrink-0">
                          {row.slotLabel}
                        </span>
                        <div className="flex items-center gap-1.5 text-[11px] font-mono flex-wrap min-w-0">
                          <span className="text-[var(--text-muted)] truncate max-w-[175px] inline-flex items-center">
                            {beforeHasPrefix ? (
                              <ParsedActionBadge action={row.beforeLabel} maxSteps={1} />
                            ) : (
                              row.beforeLabel
                            )}
                          </span>
                          <ArrowRight className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                          <span className="text-[var(--text-primary)] font-semibold truncate max-w-[175px] inline-flex items-center">
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
              )}
            </div>
          )}

          {requireWord && (
            <div className="space-y-1.5">
              <label
                htmlFor="diff-confirm-word-input"
                className="block text-xs font-medium text-[var(--text-secondary)]"
              >
                Type <span className="font-mono font-bold text-[var(--accent)]">{requireWord}</span> to
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
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
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
                  ? { backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }
                  : undefined
              }
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:pointer-events-none ${
                tone === 'danger'
                  ? 'bg-[#D97706] hover:opacity-90 text-[#ECEAE4]'
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

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
};
