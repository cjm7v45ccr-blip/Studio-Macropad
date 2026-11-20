import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Command } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keys: string[];
  description: string;
}

const SHORTCUT_GROUPS: {
  category: string;
  items: ShortcutItem[];
}[] = [
  {
    category: 'Hardware & Keypad Inputs',
    items: [
      { keys: ['1', '…', '9'], description: 'Trigger macro keys K1 – K9 directly' },
      { keys: ['['], description: 'Rotate Knob 1 counter-clockwise (Left)' },
      { keys: [']'], description: 'Rotate Knob 1 clockwise (Right)' },
      { keys: ['Space'], description: 'Push Knob 1 (Dial button press)' },
      { keys: ['{'], description: 'Rotate Knob 2 counter-clockwise (Left)' },
      { keys: ['}'], description: 'Rotate Knob 2 clockwise (Right)' },
      { keys: ['Shift', 'Space'], description: 'Push Knob 2 (Dial button press)' },
      { keys: ['Alt', 'Wheel'], description: 'Hold + Turn either Knob on canvas' },
      { keys: ['Alt', '1–3'], description: 'Quick-switch Device 1, 2, or 3 profile' }
    ]
  },
  {
    category: 'Direct Pad Manipulation',
    items: [
      {
        keys: ['Drag Action'],
        description: 'Drag a macro or action from the Inspector onto any key or knob (CCW / Press / CW)'
      },
      { keys: ['Drag Key'], description: 'Swap two keycaps (Tap, Hold & Legend) on the pad' },
      { keys: ['Alt', 'Drag Key'], description: 'Copy a keycap binding & legend onto another key' },
      { keys: ['Shift', 'Click'], description: 'Multi-select keys for bulk actions or macro combining' },
      { keys: ['Drag Knob'], description: 'Scrub Knob 1 or Knob 2 continuously with velocity' },
      { keys: ['Right-Click'], description: 'Open quick menu on any key or knob (Press / CCW / CW)' }
    ]
  },
  {
    category: 'View & Studio Workspace',
    items: [
      { keys: ['3'], description: 'Toggle 3D Tactile view with real-time gyro tracking' },
      { keys: ['T'], description: 'Switch to Live Test feed mode' },
      { keys: ['E'], description: 'Switch to Edit & Configure mode' },
      { keys: ['?'], description: 'Toggle this Shortcuts reference HUD' }
    ]
  },
  {
    category: 'Command Palette & Macro Studio',
    items: [
      { keys: ['Cmd/Ctrl', 'K'], description: 'Open Global Macro & Action Command Palette' },
      { keys: ['Tab'], description: 'Cycle categories inside Command Palette' },
      { keys: ['Shift', 'Enter'], description: 'Open highlighted macro in Macro Studio' },
      { keys: ['Opt/Alt', 'Enter'], description: 'Dry-run / test highlighted macro immediately' },
      { keys: ['Cmd/Ctrl', 'Z'], description: 'Undo last layout or macro change' },
      { keys: ['Cmd/Ctrl', 'Shift', 'Z'], description: 'Redo previously undone change' },
      { keys: ['Esc'], description: 'Close active modal or stop running macro' }
    ]
  }
];

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose
}) => {
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

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-hud-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-[#080A0D]/80 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[90dvh] flex flex-col rounded-2xl studio-popover overflow-hidden animate-popover-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Minimal Hairline Header */}
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Command className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
            <div className="min-w-0">
              <h2 id="shortcuts-hud-title" className="text-sm font-semibold text-[var(--text-primary)] truncate">
                Keyboard Shortcuts &amp; Controls
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts"
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Shortcut Groups */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {SHORTCUT_GROUPS.map(group => (
            <div key={group.category} className="space-y-1">
              <h3 className="font-mono text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider pb-1">
                {group.category}
              </h3>
              <div className="divide-y divide-[var(--border-subtle)]/60 border-t border-[var(--border-subtle)]">
                {group.items.map(item => (
                  <div
                    key={item.description}
                    className="flex items-center justify-between gap-3 py-2 text-xs"
                  >
                    <span className="text-[var(--text-secondary)]">
                      {item.description}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.keys.map(k => (
                        <kbd
                          key={k}
                          className="min-w-[22px] px-1.5 py-0.5 text-center rounded-md studio-kbd font-mono text-[10px] font-medium text-[var(--text-primary)]"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer tip */}
        <div className="px-5 py-3 border-t border-[var(--border-subtle)] text-center text-[11px] text-[var(--text-muted)] shrink-0">
          Press <kbd className="px-1.5 py-0.5 rounded studio-kbd font-mono text-[10px] text-[var(--text-secondary)]">?</kbd> anytime to toggle this reference
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
};
