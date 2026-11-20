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
        {/* Minimal Hairline Header */}
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {tone === 'danger' ? (
                <AlertTriangle className="w-4 h-4 text-[var(--accent)] shrink-0" />
              ) : (
                <GitCompareArrows className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
              )}
              <h3
                id="diff-confirm-modal-title"
                className="text-sm font-semibold text-[var(--text-primary)] truncate"
              >
                {title}
              </h3>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              {description}
            </p>
          </div>

          <button
            type="button"
            onClick={onCancel}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
          {rows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                <span>Changes</span>
                <span className="tabular-nums">
                  {changedCount === 0
                    ? 'Already identical'
                    : `${changedCount} ${changedCount === 1 ? 'control' : 'controls'}`}
                </span>
              </div>

              {changedRows.length === 0 ? (
                <div className="py-3 border-t border-[var(--border-subtle)] text-xs text-[var(--text-muted)]">
                  All {rows.length} controls already match this layout.
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto divide-y divide-[var(--border-subtle)]/70 border-y border-[var(--border-subtle)] -mx-5 px-5">
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
                        className="py-2 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1.5"
                      >
                        <span className="font-mono text-[11px] font-medium text-[var(--text-secondary)] shrink-0">
                          {row.slotLabel}
                        </span>
                        <div className="flex items-center gap-2 text-[11px] min-w-0">
                          <span className="text-[var(--text-muted)] truncate max-w-[160px] inline-flex items-center">
                            {beforeHasPrefix ? (
                              <ParsedActionBadge action={row.beforeLabel} maxSteps={1} />
                            ) : (
                              row.beforeLabel
                            )}
                          </span>
                          <ArrowRight className="w-3 h-3 text-[var(--text-muted)]/60 shrink-0" />
                          <span className="text-[var(--text-primary)] font-medium truncate max-w-[160px] inline-flex items-center">
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
                Type <span className="font-mono font-semibold text-[var(--accent)]">{requireWord}</span> to
                confirm
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
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-strong)]"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="studio-btn px-3.5 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={onConfirm}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:pointer-events-none ${
              tone === 'danger'
                ? 'bg-[#D97706] hover:opacity-90 text-[#ECEAE4]'
                : 'studio-cta'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
};
