import React from 'react';
import { SidebarSection } from '../types/studio';
import {
  Grid3X3,
  Zap,
  Library,
  Sliders,
  Volume2,
  VolumeX
} from 'lucide-react';

interface LeftSidebarProps {
  activeSection: SidebarSection;
  onSelectSection: (section: SidebarSection) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  macroCount: number;
  hasFirmwareUpdate?: boolean;
  variant?: 'rail' | 'bottom';
}

const NAV_ITEMS: {
  id: SidebarSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'device', label: 'Device', icon: Grid3X3 },
  { id: 'macros', label: 'Macros', icon: Zap },
  { id: 'library', label: 'Profiles', icon: Library },
  { id: 'settings', label: 'Settings', icon: Sliders }
];

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  activeSection,
  onSelectSection,
  soundEnabled,
  onToggleSound,
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
              style={
                active
                  ? {
                      backgroundColor: 'rgba(var(--accent-rgb), 0.16)',
                      color: 'var(--text-primary)',
                      borderColor: 'rgba(var(--accent-rgb), 0.4)'
                    }
                  : undefined
              }
              className={`relative flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl text-[10px] border transition-all cursor-pointer whitespace-nowrap ${
                active
                  ? 'font-semibold'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
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
    <aside className="hidden sm:flex w-16 shrink-0 bg-[var(--bg-panel)] border-r border-[var(--border-subtle)] flex-col items-center justify-between py-3 px-2 select-none z-30">
      <nav aria-label="Primary navigation" className="space-y-2.5 w-full flex flex-col items-center">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          const showDot = item.id === 'settings' && hasFirmwareUpdate;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectSection(item.id)}
              style={
                active
                  ? {
                      backgroundColor: 'rgba(var(--accent-rgb), 0.18)',
                      color: 'var(--text-primary)',
                      borderColor: 'rgba(var(--accent-rgb), 0.45)'
                    }
                  : undefined
              }
              className={`relative w-12 h-12 rounded-2xl flex items-center justify-center border transition-all cursor-pointer ${
                active
                  ? 'shadow-sm font-semibold'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]'
              }`}
              title={showDot ? `${item.label} (Firmware update available)` : item.label}
            >
              <span className="relative flex items-center justify-center">
                <Icon
                  className={`w-5 h-5 shrink-0 ${
                    active ? 'text-[var(--accent)]' : ''
                  }`}
                />
                {showDot && (
                  <span
                    aria-label="Firmware update available"
                    className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-[var(--bg-panel)]"
                  />
                )}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="pt-3 border-t border-[var(--border-subtle)] w-full flex flex-col items-center">
        <button
          type="button"
          onClick={onToggleSound}
          className="w-12 h-12 rounded-2xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          title={soundEnabled ? 'Switch Audio: ON' : 'Switch Audio: MUTED'}
        >
          {soundEnabled ? (
            <Volume2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <VolumeX className="w-5 h-5 text-[var(--text-muted)] shrink-0" />
          )}
        </button>
      </div>
    </aside>
  );
};
