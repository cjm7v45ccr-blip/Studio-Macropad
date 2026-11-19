import React, { useEffect, useRef, useState } from 'react';
import { SidebarSection } from '../types/studio';
import { SoundProfile } from '../services/soundEffects';
import {
  Grid3X3,
  Zap,
  Library,
  Sliders,
  Volume2,
  VolumeX,
  Sun,
  Moon
} from 'lucide-react';

interface LeftSidebarProps {
  activeSection: SidebarSection;
  onSelectSection: (section: SidebarSection) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  soundProfile?: SoundProfile;
  onChangeSoundProfile?: (profile: SoundProfile) => void;
  resolvedTheme?: 'dark' | 'light';
  onToggleTheme?: () => void;
  macroCount: number;
  hasFirmwareUpdate?: boolean;
  variant?: 'rail' | 'bottom';
}

const NAV_ITEMS: {
  id: SidebarSection;
  label: string;
  tooltip: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'device', label: 'Device', tooltip: 'Configure BertoPad keys & knob', icon: Grid3X3 },
  { id: 'macros', label: 'Macros', tooltip: 'Macro Library & Sequence Builder', icon: Zap },
  { id: 'library', label: 'Profiles', tooltip: 'Profiles & Layout Presets', icon: Library },
  { id: 'settings', label: 'Settings', tooltip: 'Device Settings & Firmware', icon: Sliders }
];

const SOUND_PROFILES: { id: SoundProfile; label: string; desc: string }[] = [
  { id: 'thock', label: 'Thock', desc: 'Deep linear resonance' },
  { id: 'click', label: 'Click', desc: 'Crisp dual-stage snap' },
  { id: 'tactile', label: 'Tactile', desc: 'Classic damped bump' }
];

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  activeSection,
  onSelectSection,
  soundEnabled,
  onToggleSound,
  soundProfile = 'thock',
  onChangeSoundProfile,
  resolvedTheme = 'dark',
  onToggleTheme,
  hasFirmwareUpdate = false,
  variant = 'rail'
}) => {
  const [soundMenuOpen, setSoundMenuOpen] = useState(false);
  const soundPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!soundMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (soundPopoverRef.current && !soundPopoverRef.current.contains(e.target as Node)) {
        setSoundMenuOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSoundMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [soundMenuOpen]);

  if (variant === 'bottom') {
    return (
      <nav
        aria-label="Primary mobile navigation"
        className="sm:hidden shrink-0 studio-chrome border-t border-[var(--border-subtle)] px-2 py-1.5 grid grid-cols-4 gap-1 select-none z-20"
      >
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          const showDot = item.id === 'settings' && hasFirmwareUpdate;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectSection(item.id)}
              title={item.tooltip}
              className={`relative flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl text-[10px] transition-all duration-150 cursor-pointer whitespace-nowrap ${
                active
                  ? 'studio-pill-active text-[var(--text-primary)] font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span className="relative">
                <Icon
                  className={`w-4 h-4 shrink-0 transition-transform duration-150 ${
                    active ? 'text-[var(--accent)] scale-105' : ''
                  }`}
                />
                {showDot && (
                  <span
                    aria-label="Firmware update available"
                    className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-[var(--accent)]"
                  />
                )}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <aside className="hidden sm:flex w-[76px] shrink-0 studio-chrome border-r border-[var(--border-subtle)] flex-col items-center justify-between py-3.5 px-2 select-none z-30">
      <nav
        aria-label="Primary navigation"
        className="space-y-1.5 w-full flex flex-col items-center"
      >
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          const showDot = item.id === 'settings' && hasFirmwareUpdate;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectSection(item.id)}
              title={showDot ? `${item.tooltip} (Firmware update available)` : item.tooltip}
              className={`relative w-full py-2.5 px-1 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all duration-150 cursor-pointer whitespace-nowrap ${
                active
                  ? 'studio-pill-active text-[var(--text-primary)] font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]/50 font-medium'
              }`}
            >
              <span className="relative flex items-center justify-center">
                <Icon
                  className={`w-[17px] h-[17px] shrink-0 transition-transform duration-150 ${
                    active ? 'text-[var(--accent)] scale-105' : ''
                  }`}
                />
                {showDot && (
                  <span
                    aria-label="Firmware update available"
                    className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-[var(--accent)] ring-2 ring-[var(--bg-panel)]"
                  />
                )}
              </span>
              <span className="text-[10px] tracking-[0.01em] leading-none">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="pt-2.5 border-t border-[var(--border-subtle)] w-full flex flex-col items-center gap-1.5">
        {onToggleTheme && (
          <button
            type="button"
            onClick={onToggleTheme}
            className="w-full py-2 px-1 rounded-xl hover:bg-[var(--bg-input)] flex flex-col items-center justify-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap"
            title={
              resolvedTheme === 'dark'
                ? 'Switch to Light theme'
                : 'Switch to Dark theme'
            }
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="w-4 h-4 shrink-0" />
            ) : (
              <Moon className="w-4 h-4 shrink-0" />
            )}
            <span className="text-[10px] leading-none">
              {resolvedTheme === 'dark' ? 'Light' : 'Dark'}
            </span>
          </button>
        )}

        <div ref={soundPopoverRef} className="relative w-full">
          <button
            type="button"
            aria-expanded={soundMenuOpen}
            aria-haspopup="dialog"
            onClick={() => {
              if (onChangeSoundProfile) {
                setSoundMenuOpen(v => !v);
              } else {
                onToggleSound();
              }
            }}
            className={`w-full py-2 px-1 rounded-xl hover:bg-[var(--bg-input)] flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
              soundMenuOpen
                ? 'bg-[var(--bg-input)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            title={
              soundEnabled
                ? `Switch sound: On (${soundProfile}) — click to adjust`
                : 'Switch sound: Muted — click to unmute or change switch feel'
            }
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-[var(--accent)] shrink-0" />
            ) : (
              <VolumeX className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
            )}
            <span className="text-[10px] leading-none">Sound</span>
          </button>

          {soundMenuOpen && (
            <div
              role="dialog"
              aria-label="Switch sound preferences"
              className="absolute left-full bottom-0 ml-3 w-56 rounded-2xl studio-popover p-3 space-y-2.5 z-50 animate-popover-in"
            >
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--border-subtle)]">
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  Switch Sound
                </span>
                <button
                  type="button"
                  onClick={onToggleSound}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    soundEnabled
                      ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                      : 'bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {soundEnabled ? 'On' : 'Muted'}
                </button>
              </div>

              <div className="space-y-1">
                <div className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  Acoustic Profile
                </div>
                <div className="space-y-1">
                  {SOUND_PROFILES.map(opt => {
                    const active = soundProfile === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          onChangeSoundProfile?.(opt.id);
                          if (!soundEnabled) onToggleSound();
                        }}
                        className={`w-full px-2.5 py-1.5 rounded-xl text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          active
                            ? 'bg-[var(--accent-soft)] border border-[rgba(var(--accent-rgb),0.4)] text-[var(--text-primary)]'
                            : 'bg-[var(--bg-input)]/70 border border-transparent hover:border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        <span className="text-xs font-semibold">{opt.label}</span>
                        <span className="text-[10px] text-[var(--text-muted)]">{opt.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
