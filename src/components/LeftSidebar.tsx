import React from 'react';
import { SidebarSection } from '../types/studio';
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
  { id: 'device', label: 'Device', tooltip: 'Configure MacroPad keys & knob', icon: Grid3X3 },
  { id: 'macros', label: 'Macros', tooltip: 'Macro Library & Sequence Builder', icon: Zap },
  { id: 'library', label: 'Profiles', tooltip: 'Profiles & Layout Presets', icon: Library },
  { id: 'settings', label: 'Settings', tooltip: 'Device Settings & Firmware', icon: Sliders }
];

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  activeSection,
  onSelectSection,
  soundEnabled,
  onToggleSound,
  resolvedTheme = 'dark',
  onToggleTheme,
  hasFirmwareUpdate = false,
  variant = 'rail'
}) => {
  if (variant === 'bottom') {
    return (
      <nav
        aria-label="Primary mobile navigation"
        className="sm:hidden shrink-0 bg-[var(--bg-panel)] border-t border-[var(--border-subtle)] px-2 py-1.5 grid grid-cols-4 gap-1 select-none z-20"
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
              className={`relative flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl text-[10px] transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-[rgba(var(--accent-rgb),0.14)] text-[var(--text-primary)] font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span className="relative">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    active ? 'text-[var(--accent)]' : ''
                  }`}
                />
                {showDot && (
                  <span
                    aria-label="Firmware update available"
                    className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-amber-400"
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
    <aside className="hidden sm:flex w-[74px] shrink-0 bg-[var(--bg-panel)] border-r border-[var(--border-subtle)] flex-col items-center justify-between py-3 px-1.5 select-none z-30">
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
              className={`relative w-full py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-[rgba(var(--accent-rgb),0.15)] text-[var(--text-primary)] font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] font-medium'
              }`}
            >
              <span className="relative flex items-center justify-center">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    active ? 'text-[var(--accent)]' : ''
                  }`}
                />
                {showDot && (
                  <span
                    aria-label="Firmware update available"
                    className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-[var(--bg-panel)]"
                  />
                )}
              </span>
              <span className="text-[10px] leading-none">{item.label}</span>
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

        <button
          type="button"
          onClick={onToggleSound}
          className="w-full py-2 px-1 rounded-xl hover:bg-[var(--bg-input)] flex flex-col items-center justify-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap"
          title={soundEnabled ? 'Key click audio: On (click to mute)' : 'Key click audio: Muted'}
        >
          {soundEnabled ? (
            <Volume2 className="w-4 h-4 text-[var(--accent)] shrink-0" />
          ) : (
            <VolumeX className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
          )}
          <span className="text-[10px] leading-none">Sound</span>
        </button>
      </div>
    </aside>
  );
};
