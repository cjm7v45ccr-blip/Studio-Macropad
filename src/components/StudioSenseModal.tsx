import React, { useState, useEffect } from 'react';
import { Sparkles, Wand2, X, Check, ArrowRight, Loader2, Cpu, ShieldCheck } from 'lucide-react';
import { CustomMacroItem, MacroStepConfig } from '../types/studio';
import { ToastVariant } from '../hooks/useStudioState';

interface StudioSenseSuggestion {
  id: string;
  title: string;
  category: string;
  description: string;
  recommendedActions: { type: string; value?: string }[];
}

interface StudioSenseResponse {
  summary: string;
  suggestions: StudioSenseSuggestion[];
}

interface StudioSenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  customMacros: CustomMacroItem[];
  onApplySuggestion: (title: string, steps: Omit<MacroStepConfig, 'id'>[]) => void;
  onToast: (msg: string, variant?: ToastVariant) => void;
}

export const StudioSenseModal: React.FC<StudioSenseModalProps> = ({
  isOpen,
  onClose,
  customMacros,
  onApplySuggestion,
  onToast
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [data, setData] = useState<StudioSenseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStudioSenseAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/studio-sense/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          macros: customMacros.map(m => ({
            name: m.name,
            action: m.action
          })),
          userContext: 'ESP32 Studio MacroPad flagship controller running productivity & auth macros.'
        })
      });
      if (!res.ok) {
        throw new Error('Failed to communicate with Studio Sense AI');
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err?.message || 'Failed to analyze macro habits');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStudioSenseAnalysis();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-sense-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-[var(--bg-panel)] border border-[var(--border-strong)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[rgba(var(--accent-rgb),0.15)] text-[var(--accent)]">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="studio-sense-modal-title"
                className="text-base font-bold text-[var(--text-primary)]"
              >
                Studio Sense Workflow Assistant
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Analyzing your macro habits & suggesting high-value automations
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close Studio Sense modal"
            onClick={onClose}
            className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center space-y-4 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  Studio Sense is analyzing your macros…
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  Looking for login auto-fills, 2FA sequences, and timing optimizations.
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-200 space-y-3">
              <p className="text-xs font-semibold">{error}</p>
              <button
                type="button"
                onClick={fetchStudioSenseAnalysis}
                className="px-3.5 py-1.5 rounded-lg bg-rose-500/20 text-rose-700 dark:text-rose-200 text-xs font-semibold hover:bg-rose-500/30 transition-colors cursor-pointer whitespace-nowrap"
              >
                Retry Analysis
              </button>
            </div>
          ) : data ? (
            <div className="space-y-6">
              {/* Summary box */}
              <div className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-1">
                <div className="text-[11px] font-semibold text-[var(--accent)] tracking-wider uppercase">Habit Assessment</div>
                <p className="text-xs text-[var(--text-primary)] leading-relaxed">{data.summary}</p>
              </div>

              {/* Suggestions */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-[var(--text-secondary)] tracking-wider uppercase">Recommended Automations</h3>
                {data.suggestions?.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] transition-all space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-[rgba(var(--accent-rgb),0.12)] text-[var(--accent)] text-[10px] font-semibold font-mono">
                            {item.category || 'Workflow'}
                          </span>
                          <h4 className="text-sm font-bold text-[var(--text-primary)]">{item.title}</h4>
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{item.description}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const steps: Omit<MacroStepConfig, 'id'>[] = (item.recommendedActions || []).map(act => {
                            const t = (act.type || 'text').toLowerCase();
                            const isDelay = t === 'delay';
                            const isText = t === 'text';
                            return {
                              label: isText ? 'Type text' : isDelay ? 'Wait' : 'Key',
                              actionType: (isText ? 'text' : isDelay ? 'delay' : 'shortcut') as any,
                              value: act.value || '',
                              delayMs: isDelay ? parseInt(act.value || '500', 10) : 150,
                              repeatCount: 1
                            };
                          });
                          onApplySuggestion(item.title, steps);
                          onToast(`Applied Studio Sense automation: "${item.title}"`);
                          onClose();
                        }}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shrink-0"
                      >
                        <Wand2 className="w-3.5 h-3.5" />
                        <span>Apply & Edit</span>
                      </button>
                    </div>

                    {/* Step preview pills */}
                    {item.recommendedActions && item.recommendedActions.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-[var(--border-subtle)] text-[11px] font-mono">
                        <span className="text-[var(--text-muted)] text-[10px] uppercase font-sans">Actions:</span>
                        {item.recommendedActions.map((act, aIdx) => (
                          <span
                            key={aIdx}
                            className="px-2 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                          >
                            <span className="text-[var(--accent)] font-semibold">{act.type}</span>
                            {act.value ? `: ${act.value}` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-xs">
          <span className="text-[var(--text-muted)] tabular-nums">
            Studio Sense Workflow Analyzer · {customMacros.length} saved{' '}
            {customMacros.length === 1 ? 'macro' : 'macros'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-medium hover:bg-[var(--border-subtle)] transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
