import React, { useState } from 'react';
import {
  EncoderControlConfig,
  EncoderModeConfig,
  KeyboardLayoutId,
  MacroItem,
  StudioProfile
} from '../types/studio';
import { ActionPickerControl } from './ActionPickerControl';
import { emptyAction } from '../data/presetTemplates';
import {
  RotateCw,
  RotateCcw,
  Plus,
  Trash2,
  Sliders,
  Disc,
  MousePointerClick
} from 'lucide-react';

interface EncoderInspectorProps {
  encoder: EncoderControlConfig;
  onUpdateEncoder: (next: EncoderControlConfig) => void;
  macros: MacroItem[];
  profiles: StudioProfile[];
  keyboardLayout: KeyboardLayoutId;
  onNavigateToMacros: () => void;
  onToast: (msg: string) => void;
}

type EncoderInputSection = 'cw' | 'ccw' | 'press' | 'press_rotate' | 'feel';

const MODE_COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4'];

export const EncoderInspector: React.FC<EncoderInspectorProps> = ({
  encoder,
  onUpdateEncoder,
  macros,
  profiles,
  keyboardLayout,
  onNavigateToMacros,
  onToast
}) => {
  const [section, setSection] = useState<EncoderInputSection>('cw');
  const [pressTrigger, setPressTrigger] = useState<'tap' | 'hold' | 'double_tap'>('tap');
  const [pressRotateDir, setPressRotateDir] = useState<'cw' | 'ccw'>('cw');

  const activeMode =
    encoder.modes.find(m => m.id === encoder.activeModeId) || encoder.modes[0];

  const updateActiveMode = (patch: Partial<EncoderModeConfig>) => {
    if (!activeMode) return;
    onUpdateEncoder({
      ...encoder,
      modes: encoder.modes.map(m => (m.id === activeMode.id ? { ...m, ...patch } : m))
    });
  };

  const handleAddMode = () => {
    const idx = encoder.modes.length;
    const newMode: EncoderModeConfig = {
      id: `mode-${Date.now()}`,
      name: `Mode ${idx + 1}`,
      color: MODE_COLORS[idx % MODE_COLORS.length],
      cw: { type: 'shortcut', value: ']' },
      ccw: { type: 'shortcut', value: '[' },
      press: {
        tap: emptyAction(),
        hold: emptyAction(),
        double_tap: emptyAction()
      },
      pressRotate: {
        cw: emptyAction(),
        ccw: emptyAction()
      }
    };
    onUpdateEncoder({
      ...encoder,
      activeModeId: newMode.id,
      modes: [...encoder.modes, newMode]
    });
    onToast(`Added encoder mode "${newMode.name}"`);
  };

  const handleDeleteActiveMode = () => {
    if (encoder.modes.length <= 1 || !activeMode) return;
    const remaining = encoder.modes.filter(m => m.id !== activeMode.id);
    onUpdateEncoder({
      ...encoder,
      activeModeId: remaining[0].id,
      modes: remaining
    });
  };

  if (!activeMode) return null;

  return (
    <aside className="w-full lg:w-[390px] xl:w-[420px] shrink-0 bg-[var(--bg-panel)] border-l border-[var(--border-subtle)] flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-[var(--bg-input)] border border-[var(--border-strong)] flex items-center justify-center shrink-0">
            <Disc className="w-5 h-5" style={{ color: activeMode.color }} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              <span>Rotary Encoder</span>
              <span className="text-[var(--text-muted)]">·</span>
              <span className="font-mono text-xs" style={{ color: activeMode.color }}>
                {activeMode.name}
              </span>
            </div>
            <div className="text-[11px] text-[var(--text-muted)]">
              4-Input Detent Dial · {encoder.modes.length} {encoder.modes.length === 1 ? 'Mode' : 'Modes'}
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Encoder Modes Strip */}
        <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-primary)]">
              Encoder Modes
            </span>
            <button
              type="button"
              onClick={handleAddMode}
              style={{ color: 'var(--accent)' }}
              className="flex items-center gap-1 text-xs font-semibold hover:underline cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Mode</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {encoder.modes.map(m => {
              const isSelected = m.id === activeMode.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onUpdateEncoder({ ...encoder, activeModeId: m.id })}
                  style={
                    isSelected
                      ? {
                          borderColor: m.color,
                          backgroundColor: 'var(--bg-elevated)'
                        }
                      : undefined
                  }
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-colors cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? 'text-[var(--text-primary)] font-semibold'
                      : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
                  <span>{m.name}</span>
                </button>
              );
            })}
          </div>

          {/* Active Mode Name & Color */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              maxLength={16}
              value={activeMode.name}
              onChange={e => updateActiveMode({ name: e.target.value })}
              className="flex-1 min-w-0 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] px-2.5 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              placeholder="Mode name"
            />
            <input
              type="color"
              value={activeMode.color}
              onChange={e => updateActiveMode({ color: e.target.value })}
              className="w-7 h-7 rounded bg-transparent border-0 cursor-pointer shrink-0"
              title="Mode indicator color"
            />
            {encoder.modes.length > 1 && (
              <button
                type="button"
                onClick={handleDeleteActiveMode}
                className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                title="Remove this encoder mode"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <label className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)] cursor-pointer">
            <span className="text-xs text-[var(--text-secondary)]">
              Click knob to cycle through modes
            </span>
            <input
              type="checkbox"
              checked={encoder.clickCyclesModes}
              onChange={e => onUpdateEncoder({ ...encoder, clickCyclesModes: e.target.checked })}
              className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
            />
          </label>
        </div>

        {/* 4 Encoder Inputs + Feel Sub-section Selector */}
        <div>
          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1.5">
            Encoder Input Channel
          </label>
          <div className="grid grid-cols-5 gap-1 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
            {(
              [
                { id: 'cw', label: 'CW', icon: RotateCw },
                { id: 'ccw', label: 'CCW', icon: RotateCcw },
                { id: 'press', label: 'Press', icon: MousePointerClick },
                { id: 'press_rotate', label: 'Hold+Turn', icon: Disc },
                { id: 'feel', label: 'Feel', icon: Sliders }
              ] as const
            ).map(item => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  style={
                    active
                      ? { backgroundColor: 'var(--accent)', color: '#FFFFFF' }
                      : undefined
                  }
                  className={`flex flex-col items-center justify-center gap-1 py-1.5 px-1 rounded-lg text-[10px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    active ? 'font-semibold' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sub-section Content */}
        {section === 'cw' && (
          <div className="space-y-3">
            <div className="text-xs font-semibold text-[var(--text-primary)]">
              Rotate Clockwise ({activeMode.name})
            </div>
            <ActionPickerControl
              binding={activeMode.cw}
              onChange={next => updateActiveMode({ cw: next })}
              macros={macros}
              profiles={profiles}
              keyboardLayout={keyboardLayout}
              onNavigateToMacros={onNavigateToMacros}
              onToast={onToast}
              compact
            />
          </div>
        )}

        {section === 'ccw' && (
          <div className="space-y-3">
            <div className="text-xs font-semibold text-[var(--text-primary)]">
              Rotate Counter-Clockwise ({activeMode.name})
            </div>
            <ActionPickerControl
              binding={activeMode.ccw}
              onChange={next => updateActiveMode({ ccw: next })}
              macros={macros}
              profiles={profiles}
              keyboardLayout={keyboardLayout}
              onNavigateToMacros={onNavigateToMacros}
              onToast={onToast}
              compact
            />
          </div>
        )}

        {section === 'press' && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
              {(
                [
                  { id: 'tap', label: 'Tap' },
                  { id: 'hold', label: 'Hold' },
                  { id: 'double_tap', label: 'Double-tap' }
                ] as const
              ).map(t => {
                const active = pressTrigger === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setPressTrigger(t.id)}
                    style={
                      active
                        ? { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }
                        : undefined
                    }
                    className={`py-1.5 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap ${
                      active ? 'font-semibold' : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            {pressTrigger === 'tap' && encoder.clickCyclesModes && (
              <div className="p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
                Single click is currently set to cycle encoder modes. Disable "Click knob to cycle through modes" above to trigger a custom Tap action instead.
              </div>
            )}

            <ActionPickerControl
              binding={activeMode.press[pressTrigger]}
              onChange={next =>
                updateActiveMode({
                  press: { ...activeMode.press, [pressTrigger]: next }
                })
              }
              macros={macros}
              profiles={profiles}
              keyboardLayout={keyboardLayout}
              onNavigateToMacros={onNavigateToMacros}
              onToast={onToast}
              compact
            />
          </div>
        )}

        {section === 'press_rotate' && (
          <div className="space-y-3">
            <p className="text-xs text-[var(--text-muted)]">
              Secondary hidden layer: push and hold the knob down while turning for fine scrub, horizontal scroll, or brush hardness.
            </p>
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setPressRotateDir('cw')}
                style={
                  pressRotateDir === 'cw'
                    ? { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }
                    : undefined
                }
                className="py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                Hold + Rotate CW
              </button>
              <button
                type="button"
                onClick={() => setPressRotateDir('ccw')}
                style={
                  pressRotateDir === 'ccw'
                    ? { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }
                    : undefined
                }
                className="py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                Hold + Rotate CCW
              </button>
            </div>

            <ActionPickerControl
              binding={activeMode.pressRotate[pressRotateDir]}
              onChange={next =>
                updateActiveMode({
                  pressRotate: { ...activeMode.pressRotate, [pressRotateDir]: next }
                })
              }
              macros={macros}
              profiles={profiles}
              keyboardLayout={keyboardLayout}
              onNavigateToMacros={onNavigateToMacros}
              onToast={onToast}
              compact
            />
          </div>
        )}

        {section === 'feel' && (
          <div className="space-y-4">
            {/* Sensitivity */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-[var(--text-secondary)]">
                  Sensitivity (Detents per Action)
                </span>
                <span className="font-mono tabular-nums text-[var(--text-primary)]">
                  {encoder.feel.sensitivity} {encoder.feel.sensitivity === 1 ? 'step' : 'steps'}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={8}
                step={1}
                value={encoder.feel.sensitivity}
                onChange={e =>
                  onUpdateEncoder({
                    ...encoder,
                    feel: { ...encoder.feel, sensitivity: Number(e.target.value) }
                  })
                }
                className="w-full accent-[var(--accent)] cursor-pointer"
              />
              <p className="text-[11px] text-[var(--text-muted)]">
                Lower values respond on every single ratchet click; higher values prevent accidental triggers.
              </p>
            </div>

            {/* Acceleration */}
            <label className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-xs font-semibold text-[var(--text-primary)] block">
                  Dynamic Velocity Acceleration
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">
                  Spinning the knob rapidly multiplies step increments
                </span>
              </div>
              <input
                type="checkbox"
                checked={encoder.feel.acceleration}
                onChange={e =>
                  onUpdateEncoder({
                    ...encoder,
                    feel: { ...encoder.feel, acceleration: e.target.checked }
                  })
                }
                className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
              />
            </label>

            {/* Invert Direction */}
            <label className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-xs font-semibold text-[var(--text-primary)] block">
                  Invert Rotation Polarity
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">
                  Swaps Clockwise and Counter-Clockwise output directions
                </span>
              </div>
              <input
                type="checkbox"
                checked={encoder.feel.invertDirection}
                onChange={e =>
                  onUpdateEncoder({
                    ...encoder,
                    feel: { ...encoder.feel, invertDirection: e.target.checked }
                  })
                }
                className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
              />
            </label>
          </div>
        )}
      </div>
    </aside>
  );
};
