import React, { useState } from 'react';
import {
  EncoderPlacement,
  KeyId,
  LayerConfig,
  LightingConfig,
  LightingEffect,
  MacroItem
} from '../types/studio';
import { MacropadCanvas } from './MacropadCanvas';
import { ALL_KEY_IDS } from '../data/presetTemplates';
import { usbHardware } from '../services/usbHardwareService';
import { Sparkles, Sun, Gauge, CheckSquare } from 'lucide-react';

interface LightingViewProps {
  layer: LayerConfig;
  layers: LayerConfig[];
  activeLayerIndex: number;
  onSelectLayer: (idx: number) => void;
  lighting: LightingConfig;
  onUpdateLighting: (next: LightingConfig) => void;
  encoderPlacement: EncoderPlacement;
  macros: MacroItem[];
}

const RGB_SWATCHES = [
  '#3B82F6',
  '#8B5CF6',
  '#06B6D4',
  '#10B981',
  '#22C55E',
  '#F59E0B',
  '#EF4444',
  '#EC4899',
  '#F43F5E',
  '#FFFFFF'
];

const EFFECTS: { id: LightingEffect; label: string; desc: string }[] = [
  { id: 'solid', label: 'Solid', desc: 'Static per-key RGB illumination' },
  { id: 'breathing', label: 'Breathing', desc: 'Smooth rhythmic pulse cycle' },
  { id: 'rainbow', label: 'Rainbow Wave', desc: 'Continuous full-spectrum hue sweep' },
  { id: 'reactive', label: 'Reactive', desc: 'Keys flare to full brightness on press' },
  { id: 'ripple', label: 'Ripple', desc: 'Color shockwave radiates across matrix on press' }
];

export const LightingView: React.FC<LightingViewProps> = ({
  layer,
  layers,
  activeLayerIndex,
  onSelectLayer,
  lighting,
  onUpdateLighting,
  encoderPlacement,
  macros
}) => {
  const [selectedKeys, setSelectedKeys] = useState<Set<KeyId>>(new Set(['k1']));
  const [paintBrushColor, setPaintBrushColor] = useState<string>(
    lighting.perKeyColors.k1 || '#3B82F6'
  );
  const [hexDraft, setHexDraft] = useState<string>(lighting.perKeyColors.k1 || '#3B82F6');

  const applyLightingChange = (next: LightingConfig) => {
    onUpdateLighting(next);
    usbHardware.streamLightingPreview(next);
  };

  const applyColorToTargets = (hex: string, targets: Set<KeyId>) => {
    const cleanHex = hex.startsWith('#') ? hex : `#${hex}`;
    setPaintBrushColor(cleanHex);
    setHexDraft(cleanHex);
    if (!/^#[0-9A-Fa-f]{6}$/.test(cleanHex)) return;

    const updatedPerKey = { ...lighting.perKeyColors };
    targets.forEach(k => {
      updatedPerKey[k] = cleanHex;
    });
    applyLightingChange({
      ...lighting,
      useLayerColor: false,
      perKeyColors: updatedPerKey
    });
  };

  const handlePaintKeyClick = (kid: KeyId, shiftKey: boolean) => {
    let nextSet: Set<KeyId>;
    if (shiftKey) {
      nextSet = new Set(selectedKeys);
      if (nextSet.has(kid) && nextSet.size > 1) nextSet.delete(kid);
      else nextSet.add(kid);
    } else {
      nextSet = new Set([kid]);
    }
    setSelectedKeys(nextSet);

    // Paint clicked key immediately with active swatch OR load its color if only 1
    const updatedPerKey = {
      ...lighting.perKeyColors,
      [kid]: paintBrushColor
    };
    applyLightingChange({
      ...lighting,
      useLayerColor: false,
      perKeyColors: updatedPerKey
    });
  };

  const handlePaintEncoder = () => {
    applyLightingChange({
      ...lighting,
      useLayerColor: false,
      encoderRingColor: paintBrushColor
    });
  };

  const handleSelectAllKeys = () => {
    const all = new Set<KeyId>(ALL_KEY_IDS);
    setSelectedKeys(all);
    applyColorToTargets(paintBrushColor, all);
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
      {/* Center Macropad Paint Canvas */}
      <MacropadCanvas
        layer={layer}
        layers={layers}
        activeLayerIndex={activeLayerIndex}
        onSelectLayer={onSelectLayer}
        lighting={lighting}
        selectedControl="k1"
        onSelectControl={() => {}}
        viewMode="edit"
        encoderPlacement={encoderPlacement}
        conflicts={[]}
        macros={macros}
        paintMode
        selectedPaintKeys={selectedKeys}
        onPaintKeyClick={handlePaintKeyClick}
        onPaintEncoderClick={handlePaintEncoder}
      />

      {/* Right Lighting Inspector */}
      <aside className="w-full lg:w-[390px] xl:w-[420px] shrink-0 bg-[var(--bg-panel)] border-l border-[var(--border-subtle)] p-5 overflow-y-auto space-y-6">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3.5">
          <div>
            <h2 className="text-sm font-bold text-[var(--text-primary)]">Per-Key RGB Lighting</h2>
            <p className="text-xs text-[var(--text-muted)]">
              Live hardware LED preview & per-switch color matrix
            </p>
          </div>
          <Sparkles className="w-4 h-4 text-[var(--accent)]" />
        </div>

        {/* Layer Color Sync Option */}
        <label className="p-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex items-center justify-between gap-3 cursor-pointer">
          <div>
            <span className="text-xs font-semibold text-[var(--text-primary)] block">
              Tint Pad to Active Layer Color
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">
              Automatically matches all LEDs to {layer.name} ({layer.color.toUpperCase()})
            </span>
          </div>
          <input
            type="checkbox"
            checked={lighting.useLayerColor}
            onChange={e =>
              applyLightingChange({
                ...lighting,
                useLayerColor: e.target.checked
              })
            }
            className="w-4 h-4 accent-[var(--accent)] cursor-pointer shrink-0"
          />
        </label>

        {/* Per-Key Color Swatches + Hex Input */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-primary)]">
              Paint Color ({selectedKeys.size} {selectedKeys.size === 1 ? 'key' : 'keys'} selected)
            </span>
            <button
              type="button"
              onClick={handleSelectAllKeys}
              style={{ color: 'var(--accent)' }}
              className="flex items-center gap-1 text-xs font-semibold hover:underline cursor-pointer whitespace-nowrap"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>Fill All Keys</span>
            </button>
          </div>

          <div className="grid grid-cols-5 gap-2">
            {RGB_SWATCHES.map(swatch => {
              const active = paintBrushColor.toUpperCase() === swatch.toUpperCase();
              return (
                <button
                  key={swatch}
                  type="button"
                  onClick={() => applyColorToTargets(swatch, selectedKeys)}
                  className={`h-8 rounded-lg border border-white/15 cursor-pointer transition-transform ${
                    active ? 'scale-105 ring-2 ring-white' : 'opacity-85 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: swatch }}
                  title={swatch}
                />
              );
            })}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="color"
              value={/^#[0-9A-Fa-f]{6}$/.test(paintBrushColor) ? paintBrushColor : '#3B82F6'}
              onChange={e => applyColorToTargets(e.target.value, selectedKeys)}
              className="w-9 h-9 rounded-lg bg-transparent border-0 cursor-pointer shrink-0"
            />
            <div className="flex-1 flex items-center rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 py-1.5">
              <span className="text-xs text-[var(--text-muted)] mr-2">HEX</span>
              <input
                type="text"
                maxLength={7}
                value={hexDraft}
                onChange={e => {
                  setHexDraft(e.target.value);
                  if (/^#?[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                    const normalized = e.target.value.startsWith('#')
                      ? e.target.value
                      : `#${e.target.value}`;
                    applyColorToTargets(normalized, selectedKeys);
                  }
                }}
                className="w-full bg-transparent font-mono text-xs uppercase text-[var(--text-primary)] focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Global Effects */}
        <div className="space-y-2">
          <span className="block text-xs font-semibold text-[var(--text-primary)]">
            Global Lighting Effect
          </span>
          <div className="space-y-1.5">
            {EFFECTS.map(eff => {
              const active = lighting.effect === eff.id;
              return (
                <button
                  key={eff.id}
                  type="button"
                  onClick={() => applyLightingChange({ ...lighting, effect: eff.id })}
                  style={
                    active
                      ? {
                          borderColor: 'var(--accent)',
                          backgroundColor: 'rgba(var(--accent-rgb), 0.14)'
                        }
                      : undefined
                  }
                  className="w-full p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-left flex items-center justify-between transition-colors cursor-pointer"
                >
                  <div>
                    <div className="text-xs font-semibold text-[var(--text-primary)]">
                      {eff.label}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">{eff.desc}</div>
                  </div>
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      active ? 'bg-[var(--accent)]' : 'bg-zinc-700'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* Brightness & Speed Sliders */}
        <div className="space-y-4 pt-2 border-t border-[var(--border-subtle)]">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium text-[var(--text-secondary)]">
                <Sun className="w-3.5 h-3.5" />
                <span>LED Brightness</span>
              </span>
              <span className="font-mono tabular-nums text-[var(--text-primary)]">
                {lighting.brightness}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={lighting.brightness}
              onChange={e =>
                applyLightingChange({ ...lighting, brightness: Number(e.target.value) })
              }
              className="w-full accent-[var(--accent)] cursor-pointer"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium text-[var(--text-secondary)]">
                <Gauge className="w-3.5 h-3.5" />
                <span>Effect Speed</span>
              </span>
              <span className="font-mono tabular-nums text-[var(--text-primary)]">
                {lighting.speed}%
              </span>
            </div>
            <input
              type="range"
              min={5}
              max={100}
              value={lighting.speed}
              onChange={e =>
                applyLightingChange({ ...lighting, speed: Number(e.target.value) })
              }
              className="w-full accent-[var(--accent)] cursor-pointer"
            />
          </div>
        </div>
      </aside>
    </div>
  );
};
