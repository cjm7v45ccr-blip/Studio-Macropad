import React, { useState, useEffect, useRef } from 'react';
import {
  CanvasViewMode,
  ConflictWarning,
  ControlId,
  EncoderPlacement,
  KeyId,
  LayerConfig,
  LightingConfig,
  LiveInputEvent,
  MacroItem
} from '../types/studio';
import { KeycapIcon, summarizeAction } from '../data/iconRegistry';
import { ALL_KEY_IDS } from '../data/presetTemplates';
import { soundEngine } from '../services/soundEffects';
import {
  RotateCcw,
  RotateCw,
  AlertTriangle,
  SlidersHorizontal,
  Play,
  Columns2,
  Rows2
} from 'lucide-react';

interface MacropadCanvasProps {
  layer: LayerConfig;
  layers: LayerConfig[];
  activeLayerIndex: number;
  onSelectLayer: (idx: number) => void;
  lighting: LightingConfig;
  selectedControl: ControlId;
  onSelectControl: (id: ControlId) => void;
  viewMode: CanvasViewMode;
  onChangeViewMode?: (mode: CanvasViewMode) => void;
  encoderPlacement: EncoderPlacement;
  onChangeEncoderPlacement?: (placement: EncoderPlacement) => void;
  conflicts: ConflictWarning[];
  macros: MacroItem[];
  onCycleEncoderMode?: () => void;
  /** Live external hardware press state */
  hardwarePressedKeys?: Set<KeyId>;
  hardwareEncoderSpin?: { dir: 'cw' | 'ccw'; seq: number } | null;
  /** Lighting paint mode overrides */
  paintMode?: boolean;
  selectedPaintKeys?: Set<KeyId>;
  onPaintKeyClick?: (keyId: KeyId, shiftKey: boolean) => void;
  onPaintEncoderClick?: () => void;
}

const KEY_COORDS: Record<KeyId, [number, number]> = {
  k1: [0, 0],
  k2: [0, 1],
  k3: [0, 2],
  k4: [1, 0],
  k5: [1, 1],
  k6: [1, 2],
  k7: [2, 0],
  k8: [2, 1],
  k9: [2, 2]
};

export const MacropadCanvas: React.FC<MacropadCanvasProps> = ({
  layer,
  layers,
  activeLayerIndex,
  onSelectLayer,
  lighting,
  selectedControl,
  onSelectControl,
  viewMode,
  onChangeViewMode,
  encoderPlacement,
  onChangeEncoderPlacement,
  conflicts,
  macros,
  onCycleEncoderMode,
  hardwarePressedKeys,
  hardwareEncoderSpin,
  paintMode = false,
  selectedPaintKeys,
  onPaintKeyClick,
  onPaintEncoderClick
}) => {
  const [pressedKeys, setPressedKeys] = useState<Set<KeyId>>(new Set());
  const [rippleOrigin, setRippleOrigin] = useState<{ key: KeyId; time: number } | null>(null);
  const [knobAngle, setKnobAngle] = useState(0);
  const [knobPressed, setKnobPressed] = useState(false);
  const [holdKnobToggle, setHoldKnobToggle] = useState(false);
  const [encoderBadge, setEncoderBadge] = useState<'CW' | 'CCW' | null>(null);
  const [liveEvents, setLiveEvents] = useState<LiveInputEvent[]>([]);
  const [rippleTick, setRippleTick] = useState(0);

  const badgeTimerRef = useRef<number | null>(null);
  const holdTimerRef = useRef<Record<string, number>>({});
  const lastTapRef = useRef<Record<string, number>>({});

  const activeEncoderMode =
    layer.encoder.modes.find(m => m.id === layer.encoder.activeModeId) || layer.encoder.modes[0];

  // Animate ripple wave when active
  useEffect(() => {
    if (!rippleOrigin) return;
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - rippleOrigin.time;
      if (elapsed > 750) {
        setRippleOrigin(null);
      } else {
        setRippleTick(t => t + 1);
      }
    }, 45);
    return () => clearInterval(interval);
  }, [rippleOrigin]);

  // React to incoming USB hardware encoder turns
  useEffect(() => {
    if (!hardwareEncoderSpin) return;
    triggerEncoderTurn(hardwareEncoderSpin.dir, false);
  }, [hardwareEncoderSpin?.seq]);

  // Keyboard test shortcuts in Test View (1-9 for keys, [ and ] for encoder)
  useEffect(() => {
    if (viewMode !== 'test' || paintMode) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const digitMatch = e.key >= '1' && e.key <= '9' ? Number(e.key) - 1 : -1;
      if (digitMatch >= 0) {
        const kid = ALL_KEY_IDS[digitMatch];
        triggerKeyPressDown(kid);
      } else if (e.key === ']') {
        triggerEncoderTurn('cw', e.shiftKey || holdKnobToggle);
      } else if (e.key === '[') {
        triggerEncoderTurn('ccw', e.shiftKey || holdKnobToggle);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const digitMatch = e.key >= '1' && e.key <= '9' ? Number(e.key) - 1 : -1;
      if (digitMatch >= 0) {
        const kid = ALL_KEY_IDS[digitMatch];
        triggerKeyRelease(kid);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [viewMode, paintMode, layer, holdKnobToggle]);

  const appendLiveEvent = (controlLabel: string, triggerLabel: string, actionSummary: string) => {
    const now = new Date();
    const ts = now.toTimeString().split(' ')[0];
    setLiveEvents(prev => [
      {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: ts,
        controlLabel,
        triggerLabel,
        actionSummary
      },
      ...prev.slice(0, 5)
    ]);
  };

  const triggerKeyPressDown = (kid: KeyId) => {
    soundEngine.playKeyClick();
    setPressedKeys(prev => new Set(prev).add(kid));
    if (lighting.effect === 'ripple' || lighting.effect === 'reactive') {
      setRippleOrigin({ key: kid, time: Date.now() });
    }

    if (viewMode === 'test') {
      const keyCfg = layer.keys[kid];
      holdTimerRef.current[kid] = window.setTimeout(() => {
        delete holdTimerRef.current[kid];
        if (keyCfg.triggers.hold.type !== 'none') {
          appendLiveEvent(
            `Key ${kid.slice(1)} (${keyCfg.appearance.label})`,
            'Hold',
            summarizeAction(keyCfg.triggers.hold, macros)
          );
          if (keyCfg.triggers.hold.type === 'layer') {
            const idx = keyCfg.triggers.hold.meta?.targetLayerIndex ?? 0;
            onSelectLayer(idx);
          }
        }
      }, 420);
    }
  };

  const triggerKeyRelease = (kid: KeyId) => {
    setPressedKeys(prev => {
      const next = new Set(prev);
      next.delete(kid);
      return next;
    });

    if (viewMode === 'test') {
      const keyCfg = layer.keys[kid];
      if (holdTimerRef.current[kid]) {
        clearTimeout(holdTimerRef.current[kid]);
        delete holdTimerRef.current[kid];

        const now = Date.now();
        const prevTap = lastTapRef.current[kid] || 0;
        if (now - prevTap < 280 && keyCfg.triggers.double_tap.type !== 'none') {
          lastTapRef.current[kid] = 0;
          appendLiveEvent(
            `Key ${kid.slice(1)} (${keyCfg.appearance.label})`,
            'Double-Tap',
            summarizeAction(keyCfg.triggers.double_tap, macros)
          );
        } else {
          lastTapRef.current[kid] = now;
          appendLiveEvent(
            `Key ${kid.slice(1)} (${keyCfg.appearance.label})`,
            'Tap',
            summarizeAction(keyCfg.triggers.tap, macros)
          );
          if (keyCfg.triggers.tap.type === 'layer') {
            const idx = keyCfg.triggers.tap.meta?.targetLayerIndex ?? 0;
            onSelectLayer(idx);
          }
        }
      }
    }
  };

  const handleKeyPointerDown = (kid: KeyId, e: React.MouseEvent) => {
    if (paintMode) {
      onPaintKeyClick?.(kid, e.shiftKey);
      soundEngine.playKeyClick();
      setRippleOrigin({ key: kid, time: Date.now() });
      return;
    }

    onSelectControl(kid);
    triggerKeyPressDown(kid);
  };

  const handleKeyPointerUp = (kid: KeyId) => {
    if (paintMode) return;
    triggerKeyRelease(kid);
  };

  const triggerEncoderTurn = (rawDir: 'cw' | 'ccw', isHoldingKnob: boolean) => {
    const effectiveDir = layer.encoder.feel.invertDirection
      ? rawDir === 'cw'
        ? 'ccw'
        : 'cw'
      : rawDir;

    soundEngine.playDialTick();
    setKnobAngle(prev => prev + (rawDir === 'cw' ? 20 : -20));
    setEncoderBadge(effectiveDir === 'cw' ? 'CW' : 'CCW');

    if (badgeTimerRef.current) clearTimeout(badgeTimerRef.current);
    badgeTimerRef.current = window.setTimeout(() => setEncoderBadge(null), 650);

    if (viewMode === 'test' && activeEncoderMode) {
      const binding = isHoldingKnob
        ? activeEncoderMode.pressRotate[effectiveDir]
        : activeEncoderMode[effectiveDir];

      appendLiveEvent(
        `Encoder (${activeEncoderMode.name})`,
        isHoldingKnob ? `Press + ${effectiveDir.toUpperCase()}` : `Rotate ${effectiveDir.toUpperCase()}`,
        summarizeAction(binding, macros)
      );
    }
  };

  const handleEncoderClick = () => {
    if (paintMode) {
      onPaintEncoderClick?.();
      soundEngine.playKeyClick();
      return;
    }

    soundEngine.playKeyClick();
    onSelectControl('encoder');
    setKnobPressed(true);
    setTimeout(() => setKnobPressed(false), 160);

    if (viewMode === 'test') {
      if (layer.encoder.clickCyclesModes && onCycleEncoderMode) {
        onCycleEncoderMode();
        appendLiveEvent('Encoder', 'Click (Cycle Mode)', 'Switched active encoder mode');
      } else if (activeEncoderMode) {
        appendLiveEvent(
          `Encoder (${activeEncoderMode.name})`,
          'Press (Tap)',
          summarizeAction(activeEncoderMode.press.tap, macros)
        );
      }
    }
  };

  const handleEncoderWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!paintMode) {
      onSelectControl('encoder');
    }
    const dir = e.deltaY < 0 ? 'cw' : 'ccw';
    triggerEncoderTurn(dir, e.shiftKey || holdKnobToggle);
  };

  const computeKeyGlowColor = (kid: KeyId, isDown: boolean): { color: string; alpha: number } => {
    const brightnessScale = lighting.brightness / 100;
    const baseHex = lighting.useLayerColor ? layer.color : lighting.perKeyColors[kid] || '#3B82F6';

    if (brightnessScale <= 0.02) {
      return { color: baseHex, alpha: 0 };
    }

    if (lighting.effect === 'reactive') {
      return {
        color: baseHex,
        alpha: isDown ? Math.min(1, brightnessScale * 1.1) : brightnessScale * 0.22
      };
    }

    if (lighting.effect === 'ripple' && rippleOrigin) {
      void rippleTick;
      const [r0, c0] = KEY_COORDS[rippleOrigin.key];
      const [r1, c1] = KEY_COORDS[kid];
      const dist = Math.abs(r0 - r1) + Math.abs(c0 - c1);
      const elapsed = Date.now() - rippleOrigin.time;
      const waveRadius = (elapsed / 140) * (0.5 + lighting.speed / 100);
      const diff = Math.abs(dist - waveRadius);
      if (diff < 1.1) {
        const boost = (1.1 - diff) / 1.1;
        return { color: baseHex, alpha: Math.min(1, (0.2 + boost * 0.85) * brightnessScale) };
      }
      return { color: baseHex, alpha: 0.2 * brightnessScale };
    }

    return { color: baseHex, alpha: 0.72 * brightnessScale };
  };

  const animDurationSec = Math.max(0.8, 5.2 - (lighting.speed / 100) * 4.0).toFixed(2) + 's';

  const conflictControlSet = new Set<ControlId>();
  conflicts.forEach(c => {
    conflictControlSet.add(c.controlA);
    conflictControlSet.add(c.controlB);
  });

  const renderEncoderModule = () => {
    const isEncoderSelected = paintMode ? false : selectedControl === 'encoder';
    const ringHex = lighting.useLayerColor ? layer.color : lighting.encoderRingColor || '#3B82F6';

    return (
      <div
        className={`flex ${
          encoderPlacement === 'side'
            ? 'flex-col justify-between items-center py-2 px-3 border-l border-white/8'
            : 'items-center justify-between gap-4 pb-4 mb-4 border-b border-white/8'
        }`}
      >
        {/* Left/Top: Mode OLED Strip */}
        <div className="flex flex-col gap-1.5 min-w-[128px]">
          <div className="px-3 py-2 rounded-xl bg-[#07080B] border border-white/10 shadow-inner space-y-1">
            <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-zinc-400">
              <span>{layer.name.toUpperCase().slice(0, 12)}</span>
              <span
                className="font-semibold"
                style={{ color: activeEncoderMode?.color || layer.color }}
              >
                {activeEncoderMode?.name.toUpperCase() || 'ENC'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-mono text-zinc-200 truncate">
                {encoderBadge ? `TURN ${encoderBadge}` : viewMode === 'test' ? 'READY · LIVE' : 'CONFIG MODE'}
              </span>
              {layer.encoder.modes.length > 1 && (
                <div className="flex items-center gap-1">
                  {layer.encoder.modes.map(m => (
                    <span
                      key={m.id}
                      className="w-1.5 h-1.5 rounded-full transition-opacity"
                      style={{
                        backgroundColor: m.color,
                        opacity: m.id === activeEncoderMode?.id ? 1 : 0.25
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {viewMode === 'test' && !paintMode && (
            <button
              type="button"
              onClick={() => setHoldKnobToggle(v => !v)}
              style={
                holdKnobToggle
                  ? { borderColor: 'var(--accent)', backgroundColor: 'rgba(var(--accent-rgb), 0.18)' }
                  : undefined
              }
              className="px-2.5 py-1 rounded-lg bg-zinc-900/90 border border-white/10 text-[10px] font-mono text-zinc-300 hover:text-white cursor-pointer transition-colors whitespace-nowrap"
              title="Simulate holding down the encoder while rotating"
            >
              {holdKnobToggle ? 'Holding Knob: ON' : 'Hold + Turn: OFF'}
            </button>
          )}
        </div>

        {/* Rotary Encoder Knob + CW/CCW Steppers */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (!paintMode) onSelectControl('encoder');
              triggerEncoderTurn('ccw', holdKnobToggle);
            }}
            className="w-7 h-7 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
            title="Rotate Counter-Clockwise (or scroll wheel down on knob)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <div className="relative flex items-center justify-center" onWheel={handleEncoderWheel}>
            {/* Subtle LED Ring */}
            <div
              className={`absolute -inset-1.5 rounded-full blur-[6px] pointer-events-none transition-opacity duration-150 ${
                lighting.effect === 'breathing'
                  ? 'animate-rgb-breathe'
                  : lighting.effect === 'rainbow'
                  ? 'animate-rgb-rainbow'
                  : ''
              }`}
              style={{
                backgroundColor: ringHex,
                opacity: (lighting.brightness / 100) * 0.45,
                ['--rgb-duration' as any]: animDurationSec
              }}
            />

            {/* Selection Halo */}
            <button
              type="button"
              onClick={handleEncoderClick}
              style={
                isEncoderSelected
                  ? {
                      boxShadow: `0 0 0 2px var(--accent), 0 0 20px rgba(var(--accent-rgb), 0.45)`
                    }
                  : undefined
              }
              className={`relative w-[72px] h-[72px] rounded-full encoder-ring p-2 flex items-center justify-center cursor-pointer transition-transform duration-150 ${
                knobPressed || holdKnobToggle ? 'scale-95' : 'hover:scale-[1.02]'
              }`}
              title="Click to select Encoder · Scroll wheel to rotate"
            >
              <div
                className="w-full h-full rounded-full encoder-cap relative flex items-center justify-center transition-transform duration-150 ease-out"
                style={{ transform: `rotate(${knobAngle}deg)` }}
              >
                <span
                  className="absolute top-1.5 w-1.5 h-2.5 rounded-full"
                  style={{ backgroundColor: activeEncoderMode?.color || 'var(--accent)' }}
                />
              </div>
            </button>

            {/* Live CW / CCW Floating Indicator */}
            {encoderBadge && (
              <span
                style={{ backgroundColor: 'var(--accent)' }}
                className="absolute -top-2.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-white shadow-md pointer-events-none"
              >
                {encoderBadge}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              if (!paintMode) onSelectControl('encoder');
              triggerEncoderTurn('cw', holdKnobToggle);
            }}
            className="w-7 h-7 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
            title="Rotate Clockwise (or scroll wheel up on knob)"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-between p-4 sm:p-6 overflow-y-auto select-none">
      {/* Top Canvas Toolbar */}
      <div className="w-full max-w-2xl flex flex-wrap items-center justify-between gap-3">
        {/* Compact Layer Bar for viewports < xl */}
        <div className="flex xl:hidden items-center gap-1 p-1 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
          {layers.map((l, idx) => {
            const active = idx === activeLayerIndex;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => onSelectLayer(idx)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-semibold'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: l.color }} />
                <span>{l.name}</span>
              </button>
            );
          })}
        </div>

        {!paintMode && onChangeViewMode ? (
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => onChangeViewMode('edit')}
              style={
                viewMode === 'edit'
                  ? { backgroundColor: 'var(--accent)', color: '#FFFFFF' }
                  : undefined
              }
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                viewMode === 'edit'
                  ? 'font-semibold shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Edit view</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeViewMode('test')}
              style={
                viewMode === 'test'
                  ? { backgroundColor: 'var(--accent)', color: '#FFFFFF' }
                  : undefined
              }
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                viewMode === 'test'
                  ? 'font-semibold shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Play className="w-3.5 h-3.5" />
              <span>Test view</span>
            </button>
          </div>
        ) : (
          <div className="text-xs font-medium text-[var(--text-secondary)]">
            Click any keycap (Shift+Click for multi-select) to paint per-key RGB lighting
          </div>
        )}

        {onChangeEncoderPlacement && (
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] ml-auto">
            <button
              type="button"
              onClick={() => onChangeEncoderPlacement('top')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium cursor-pointer whitespace-nowrap ${
                encoderPlacement === 'top'
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-semibold'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
              title="Place rotary encoder above 3x3 key grid"
            >
              <Rows2 className="w-3.5 h-3.5" />
              <span>Top Dial</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeEncoderPlacement('side')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium cursor-pointer whitespace-nowrap ${
                encoderPlacement === 'side'
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-semibold'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
              title="Place rotary encoder beside 3x3 key grid"
            >
              <Columns2 className="w-3.5 h-3.5" />
              <span>Side Dial</span>
            </button>
          </div>
        )}
      </div>

      {/* Center Hero: Top-Down Precision CNC Macropad */}
      <div className="my-auto py-6 flex flex-col items-center">
        {/* USB Cable Top Port Detail */}
        <div className="w-14 h-2.5 rounded-t-md bg-zinc-800 border-x border-t border-white/15 shadow-inner" />

        <div
          className={`chassis-shell rounded-[26px] p-6 transition-all ${
            encoderPlacement === 'side' ? 'flex items-stretch gap-5' : 'w-[356px] sm:w-[388px]'
          }`}
        >
          {encoderPlacement === 'top' && renderEncoderModule()}

          {/* Recessed Switch Plate + 3x3 Keycap Grid */}
          <div className="chassis-well rounded-2xl p-3.5">
            <div className="grid grid-cols-3 gap-3">
              {ALL_KEY_IDS.map((kid, idx) => {
                const keyCfg = layer.keys[kid];
                const isPhysicallyDown = pressedKeys.has(kid) || Boolean(hardwarePressedKeys?.has(kid));
                const isSelected = paintMode
                  ? Boolean(selectedPaintKeys?.has(kid))
                  : selectedControl === kid;
                const hasConflict = conflictControlSet.has(kid);
                const hasSecondaryTriggers =
                  keyCfg.triggers.hold.type !== 'none' ||
                  keyCfg.triggers.double_tap.type !== 'none' ||
                  keyCfg.triggers.tap_hold.type !== 'none';

                const { color: rgbHex, alpha: rgbAlpha } = computeKeyGlowColor(kid, isPhysicallyDown);

                return (
                  <div key={kid} className="relative">
                    {/* Per-key RGB Backlight Underglow */}
                    <div
                      className={`absolute -inset-1 rounded-[14px] blur-[7px] pointer-events-none transition-opacity duration-150 ${
                        lighting.effect === 'breathing'
                          ? 'animate-rgb-breathe'
                          : lighting.effect === 'rainbow'
                          ? 'animate-rgb-rainbow'
                          : ''
                      }`}
                      style={{
                        backgroundColor: rgbHex,
                        opacity: rgbAlpha,
                        ['--rgb-duration' as any]: animDurationSec
                      }}
                    />

                    <button
                      type="button"
                      onMouseDown={e => handleKeyPointerDown(kid, e)}
                      onMouseUp={() => handleKeyPointerUp(kid)}
                      onMouseLeave={() => {
                        if (pressedKeys.has(kid)) handleKeyReleaseClean(kid);
                      }}
                      style={
                        isSelected
                          ? {
                              borderColor: 'var(--accent)',
                              boxShadow: `0 0 0 2px var(--accent), 0 0 18px rgba(var(--accent-rgb), 0.42), inset 0 1px 1px rgba(255,255,255,0.16)`
                            }
                          : {
                              borderColor: isPhysicallyDown ? rgbHex : 'rgba(255,255,255,0.1)'
                            }
                      }
                      className={`relative w-[88px] h-[88px] sm:w-[96px] sm:h-[96px] rounded-[13px] keycap-surface border flex flex-col items-center justify-between p-2.5 cursor-pointer group ${
                        isPhysicallyDown ? 'keycap-depressed' : ''
                      }`}
                    >
                      {/* Top Micro Row: Key Index + Multi-trigger / Conflict Indicator */}
                      <div className="w-full flex items-center justify-between text-[10px] font-mono text-zinc-500 tabular-nums">
                        <span>{idx + 1}</span>
                        <div className="flex items-center gap-1">
                          {hasConflict && (
                            <span title="Duplicate action conflict on this layer">
                              <AlertTriangle className="w-3 h-3 text-amber-400" />
                            </span>
                          )}
                          {hasSecondaryTriggers && (
                            <span
                              className="w-1.5 h-1.5 rounded-full bg-zinc-400"
                              title="Multiple triggers configured (Hold / Double-tap)"
                            />
                          )}
                        </div>
                      </div>

                      {/* Center Custom Icon */}
                      <div className="my-auto flex items-center justify-center transition-transform duration-150 group-hover:scale-105">
                        <KeycapIcon
                          icon={keyCfg.appearance.icon}
                          className="w-5 h-5 sm:w-6 sm:h-6"
                          style={{ color: keyCfg.appearance.labelColor || '#F3F4F6' }}
                        />
                      </div>

                      {/* Bottom Custom Label */}
                      <span
                        className="w-full text-center text-[11px] font-semibold truncate leading-tight"
                        style={{ color: keyCfg.appearance.labelColor || '#F3F4F6' }}
                      >
                        {keyCfg.appearance.label || `Key ${idx + 1}`}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {encoderPlacement === 'side' && renderEncoderModule()}
        </div>
      </div>

      {/* Bottom Readout: Live Test Monitor in Test View, or Subtle Hint in Edit View */}
      {!paintMode && (
        <div className="w-full max-w-2xl">
          {viewMode === 'test' ? (
            <div className="rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[var(--text-primary)]">
                  Live Input Debugger
                </span>
                <span className="text-[11px] font-mono text-[var(--text-muted)]">
                  Press keys 1–9, [ / ] to spin dial, or click controls above
                </span>
              </div>
              {liveEvents.length === 0 ? (
                <div className="py-3 text-center text-xs text-[var(--text-muted)]">
                  Press any keycap or rotate the encoder knob to inspect triggered actions in real time.
                </div>
              ) : (
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {liveEvents.map(ev => (
                    <div
                      key={ev.id}
                      className="flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums">
                          {ev.timestamp}
                        </span>
                        <span className="font-semibold text-[var(--text-primary)] whitespace-nowrap">
                          {ev.controlLabel}
                        </span>
                        <span className="text-[var(--text-muted)]">·</span>
                        <span
                          className="font-mono text-[11px] whitespace-nowrap"
                          style={{ color: 'var(--accent)' }}
                        >
                          {ev.triggerLabel}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-[var(--text-secondary)] truncate">
                        {ev.actionSummary}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-3 text-xs text-[var(--text-muted)]">
              <span>Click any keycap or rotary encoder to edit</span>
              <span aria-hidden="true">·</span>
              <span>Scroll over encoder knob to test rotation</span>
              <span aria-hidden="true">·</span>
              <span>Switch to Test view to debug Hold & Double-tap</span>
            </div>
          )}
        </div>
      )}
    </div>
  );

  function handleKeyReleaseClean(kid: KeyId) {
    if (holdTimerRef.current[kid]) {
      clearTimeout(holdTimerRef.current[kid]);
      delete holdTimerRef.current[kid];
    }
    setPressedKeys(prev => {
      const next = new Set(prev);
      next.delete(kid);
      return next;
    });
  }
};
