import React, { useEffect } from 'react';
import { X, Command, Sparkles, Volume2 } from 'lucide-react';
import { soundEngine, SoundProfile } from '../services/soundEffects';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keys: string[];
  description: string;
  badge?: string;
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
      { keys: ['Alt', '1–3'], description: 'Quick-switch Device 1, 2, or 3 profile' }
    ]
  },
  {
    category: 'View & Studio Workspace',
    items: [
      { keys: ['3'], description: 'Toggle 3D Tactile view with real-time gyro tracking', badge: 'Flagship' },
      { keys: ['T'], description: 'Switch to Live Test feed mode' },
      { keys: ['E'], description: 'Switch to Edit & Configure mode' },
      { keys: ['?'], description: 'Toggle this Shortcuts reference HUD' }
    ]
  },
  {
    category: 'Studio Commands',
    items: [
      { keys: ['⌘/Ctrl', 'K'], description: 'Search all firmware actions and macros' },
      { keys: ['⌘/Ctrl', 'Z'], description: 'Undo last layout change' },
      { keys: ['⌘/Ctrl', '⇧', 'Z'], description: 'Redo previously undone change' },
      { keys: ['Esc'], description: 'Close any modal or stop active macro sequence' }
    ]
  }
];

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose
}) => {
  const [activeProfile, setActiveProfile] = React.useState<SoundProfile>(
    soundEngine.soundProfile
  );

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
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-hud-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-sm animate-panel-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl bg-[var(--bg-panel)] border border-[var(--border-strong)] p-5 sm:p-6 shadow-2xl space-y-5"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)] text-[var(--accent)] flex items-center justify-center shrink-0">
              <Command className="w-4 h-4" />
            </div>
            <div>
              <h2 id="shortcuts-hud-title" className="text-sm font-bold text-[var(--text-primary)]">
                Keyboard Shortcuts &amp; Studio Controls
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                Control the virtual pad and studio seamlessly from your keyboard
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts"
            className="p-1.5 rounded-xl hover:bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Acoustic Sound Switcher bar */}
        <div className="p-3 rounded-2xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-[var(--accent)] shrink-0" />
            <div className="text-xs">
              <span className="font-semibold text-[var(--text-primary)]">Acoustic Feedback: </span>
              <span className="text-[var(--text-secondary)]">Mechanical switch click synthesis</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {(['thock', 'click', 'tactile'] as const).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  soundEngine.setProfile(p);
                  setActiveProfile(p);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
                  activeProfile === p
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Shortcut Groups */}
        <div className="space-y-4">
          {SHORTCUT_GROUPS.map(group => (
            <div key={group.category} className="space-y-1.5">
              <h3 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider px-1">
                {group.category}
              </h3>
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] divide-y divide-[var(--border-subtle)] overflow-hidden">
                {group.items.map(item => (
                  <div
                    key={item.description}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs"
                  >
                    <span className="text-[var(--text-primary)] font-medium">
                      {item.description}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.badge && (
                        <span className="px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)] text-[10px] font-semibold">
                          {item.badge}
                        </span>
                      )}
                      <div className="flex items-center gap-1">
                        {item.keys.map(k => (
                          <kbd
                            key={k}
                            className="min-w-[22px] px-2 py-1 text-center rounded-lg bg-[var(--bg-panel)] border border-[var(--border-strong)] font-mono text-[11px] font-semibold text-[var(--text-primary)] shadow-2xs"
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer tip */}
        <div className="pt-2 text-center text-[11px] text-[var(--text-muted)]">
          Tip: Press <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-input)] font-mono text-[10px]">?</kbd> anytime to open this HUD
        </div>
      </div>
    </div>
  );
};
