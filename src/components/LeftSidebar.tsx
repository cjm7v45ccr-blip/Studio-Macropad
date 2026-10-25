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
  variant?: 'rail' | 'bottom';
}

const NAV_ITEMS: {
  id: SidebarSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'device', label: 'Device', icon: Grid3X3 },
  { id: 'macros', label: 'Macros', icon: Zap },
  { id: 'library', label: 'Presets', icon: Library },
  { id: 'settings', label: 'Settings', icon: Sliders }
];

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  activeSection,
  onSelectSection,
  soundEnabled,
  onToggleSound,
  macroCount,
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
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectSection(item.id)}
              style={
                active
                  ? {
                      backgroundColor: 'rgba(var(--accent-rgb), 0.14)',
                      color: 'var(--text-primary)',
                      borderColor: 'rgba(var(--accent-rgb), 0.35)'
                    }
                  : undefined
              }
              className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-xl text-[10px] border transition-all cursor-pointer whitespace-nowrap ${
                active
                  ? 'font-semibold'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${
                  active ? 'text-[var(--accent)]' : ''
                }`}
              />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <aside className="hidden sm:flex w-16 md:w-52 shrink-0 bg-[var(--bg-panel)] border-r border-[var(--border-subtle)] flex-col justify-between p-2.5 select-none">
      <nav aria-label="Primary navigation" className="space-y-1">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectSection(item.id)}
              style={
                active
                  ? {
                      backgroundColor: 'rgba(var(--accent-rgb), 0.14)',
                      color: 'var(--text-primary)',
                      borderColor: 'rgba(var(--accent-rgb), 0.35)'
                    }
                  : undefined
              }
              className={`w-full flex items-center justify-center md:justify-between gap-2.5 px-3 py-2.5 rounded-xl text-xs border transition-all cursor-pointer whitespace-nowrap ${
                active
                  ? 'font-semibold shadow-sm'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]'
              }`}
              title={item.label}
            >
              <span className="flex items-center gap-2.5">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    active ? 'text-[var(--accent)]' : ''
                  }`}
                />
                <span className="hidden md:inline">{item.label}</span>
              </span>
              {item.id === 'macros' && (
                <span className="hidden md:inline font-mono text-[11px] text-[var(--text-muted)] tabular-nums">
                  {macroCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
        <button
          type="button"
          onClick={onToggleSound}
          className="w-full flex items-center justify-center md:justify-between gap-2 px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap"
          title="Toggle mechanical switch & rotary detent sound"
        >
          <span className="flex items-center gap-2">
            {soundEnabled ? (
              <Volume2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
            )}
            <span className="hidden md:inline">Switch Audio</span>
          </span>
          <span className="hidden md:inline font-mono text-[10px] text-[var(--text-muted)]">
            {soundEnabled ? 'ON' : 'OFF'}
          </span>
        </button>
      </div>
    </aside>
  );
};
