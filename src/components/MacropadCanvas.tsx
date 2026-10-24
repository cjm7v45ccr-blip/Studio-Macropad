import React, { useState, useEffect, useRef } from 'react';
import {
  CanvasViewMode,
  ConflictWarning,
  ControlId,
  EncoderPlacement,
  KeyId,
  LayerConfig,
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
  LayoutGrid,
  Rows2
} from 'lucide-react';

interface MacropadCanvasProps {
  layer: LayerConfig;
  layers: LayerConfig[];
  activeLayerIndex: number;
  onSelectLayer: (idx: number) => void;
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
}

export const MacropadCanvas: React.FC<MacropadCanvasProps> = ({
  layer,
  layers,
  activeLayerIndex,
  onSelectLayer,
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
  hardwareEncoderSpin
}) => {
  const [pressedKeys, setPressedKeys] = useState<Set<KeyId>>(new Set());
  const [knobAngle, setKnobAngle] = useState(0);
  const [knobPressed, setKnobPressed] = useState(false);
  const [holdKnobToggle, setHoldKnobToggle] = useState(false);
  const [encoderBadge, setEncoderBadge] = useState<'CW' | 'CCW' | null>(null);
  const [liveEvents, setLiveEvents] = useState<LiveInputEvent[]>([]);

  const badgeTimerRef = useRef<number | null>(null);
  const holdTimerRef = useRef<Record<string, number>>({});
  const lastTapRef = useRef<Record<string, number>>({});

  const activeEncoderMode =
    layer.encoder.modes.find(m => m.id === layer.encoder.activeModeId) || layer.encoder.modes[0];

  // React to incoming USB hardware encoder turns
  useEffect(() => {
    if (!hardwareEncoderSpin) return;
    triggerEncoderTurn(hardwareEncoderSpin.dir, false);
  }, [hardwareEncoderSpin?.seq]);

  // Keyboard test shortcuts in Test View (1-5 for keys, [ and ] for encoder)
  useEffect(() => {
    if (viewMode !== 'test') return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const digitMatch = e.key >= '1' && e.key <= '5' ? Number(e.key) - 1 : -1;
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
      const digitMatch = e.key >= '1' && e.key <= '5' ? Number(e.key) - 1 : -1;
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
  }, [viewMode, layer, holdKnobToggle]);

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

    if (viewMode === 'test') {
      const keyCfg = layer.keys[kid];
      if (!keyCfg) return;
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
      if (!keyCfg) return;
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

  const handleKeyPointerDown = (kid: KeyId) => {
    onSelectControl(kid);
    triggerKeyPressDown(kid);
  };

  const handleKeyPointerUp = (kid: KeyId) => {
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
    onSelectControl('encoder');
    const dir = e.deltaY < 0 ? 'cw' : 'ccw';
    triggerEncoderTurn(dir, e.shiftKey || holdKnobToggle);
  };

  const conflictControlSet = new Set<ControlId>();
  conflicts.forEach(c => {
    conflictControlSet.add(c.controlA);
    conflictControlSet.add(c.controlB);
  });

  const renderOledReadout = (fullWidth: boolean) => (
    <div className={`flex flex-col gap-1.5 ${fullWidth ? 'w-full mb-4' : 'min-w-[144px] flex-1'}`}>
      <div className="px-3.5 py-2.5 rounded-xl bg-[#07080B] border border-white/10 shadow-inner space-y-1">
        <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-zinc-400">
          <span>{layer.name.toUpperCase().slice(0, 14)}</span>
          <span className="font-semibold text-zinc-200">
            {activeEncoderMode?.name.toUpperCase() || 'ENC'}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-mono text-zinc-100 truncate tabular-nums">
            {encoderBadge
              ? `DIAL · ${encoderBadge}`
              : pressedKeys.size > 0 || (hardwarePressedKeys && hardwarePressedKeys.size > 0)
              ? `ACTIVE · KEY ${Array.from(pressedKeys)[0]?.slice(1) || Array.from(hardwarePressedKeys || [])[0]?.slice(1)}`
              : viewMode === 'test'
              ? 'READY · 5-KEY'
              : '5 KEYS · 1 DIAL'}
          </span>
          {layer.encoder.modes.length > 1 && (
            <div className="flex items-center gap-1" title="Encoder Modes">
              {layer.encoder.modes.map(m => (
                <span
                  key={m.id}
                  className="w-1.5 h-1.5 rounded-full bg-zinc-200 transition-opacity"
                  style={{
                    opacity: m.id === activeEncoderMode?.id ? 0.95 : 0.22
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {viewMode === 'test' && (
        <button
          type="button"
          onClick={() => setHoldKnobToggle(v => !v)}
          style={
            holdKnobToggle
              ? { borderColor: 'var(--accent)', backgroundColor: 'rgba(var(--accent-rgb), 0.18)' }
              : undefined
          }
          className="px-2.5 py-1 rounded-lg bg-zinc-900/90 border border-white/10 text-[10px] font-mono text-zinc-300 hover:text-white cursor-pointer transition-colors whitespace-nowrap text-center"
          title="Simulate holding down the encoder while rotating"
        >
          {holdKnobToggle ? 'Holding Knob: ON' : 'Hold + Turn: OFF'}
        </button>
      )}
    </div>
  );

  const renderEncoderKnobControl = (compactCell: boolean) => {
    const isEncoderSelected = selectedControl === 'encoder';

    if (compactCell) {
      return (
        <div
          className="relative w-[92px] h-[92px] sm:w-[100px] sm:h-[100px] flex flex-col items-center justify-center"
          onWheel={handleEncoderWheel}
        >
          {/* Subtle CCW / CW Stepper Triggers */}
          <button
            type="button"
            onClick={() => {
              onSelectControl('encoder');
              triggerEncoderTurn('ccw', holdKnobToggle);
            }}
            className="absolute top-0.5 left-0.5 z-10 w-5 h-5 rounded-md bg-zinc-900/95 hover:bg-zinc-800 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
            title="Rotate Counter-Clockwise (or scroll wheel down)"
          >
            <RotateCcw className="w-2.5 h-2.5" />
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectControl('encoder');
              triggerEncoderTurn('cw', holdKnobToggle);
            }}
            className="absolute top-0.5 right-0.5 z-10 w-5 h-5 rounded-md bg-zinc-900/95 hover:bg-zinc-800 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
            title="Rotate Clockwise (or scroll wheel up)"
          >
            <RotateCw className="w-2.5 h-2.5" />
          </button>

          <button
            type="button"
            onClick={handleEncoderClick}
            style={
              isEncoderSelected
                ? {
                    boxShadow: `0 0 0 2px var(--accent), 0 0 18px rgba(var(--accent-rgb), 0.42)`
                  }
                : undefined
            }
            className={`relative w-[74px] h-[74px] sm:w-[80px] sm:h-[80px] rounded-full encoder-ring p-2 flex items-center justify-center cursor-pointer transition-transform duration-150 ${
              knobPressed || holdKnobToggle ? 'scale-95' : 'hover:scale-[1.03]'
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

          {encoderBadge && (
            <span
              style={{ backgroundColor: 'var(--accent)' }}
              className="absolute -bottom-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold text-white shadow-md pointer-events-none z-20"
            >
              {encoderBadge}
            </span>
          )}
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => {
            onSelectControl('encoder');
            triggerEncoderTurn('ccw', holdKnobToggle);
          }}
          className="w-7 h-7 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
          title="Rotate Counter-Clockwise (or scroll wheel down on knob)"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <div className="relative flex items-center justify-center" onWheel={handleEncoderWheel}>
          <button
            type="button"
            onClick={handleEncoderClick}
            style={
              isEncoderSelected
                ? {
                    boxShadow: `0 0 0 2px var(--accent), 0 0 20px rgba(var(--accent-rgb), 0.42)`
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
            onSelectControl('encoder');
            triggerEncoderTurn('cw', holdKnobToggle);
          }}
          className="w-7 h-7 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
          title="Rotate Clockwise (or scroll wheel up on knob)"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  };

  const renderKeycap = (kid: KeyId) => {
    const idx = ALL_KEY_IDS.indexOf(kid);
    const keyCfg = layer.keys[kid];
    if (!keyCfg) return null;

    const isPhysicallyDown = pressedKeys.has(kid) || Boolean(hardwarePressedKeys?.has(kid));
    const isSelected = selectedControl === kid;
    const hasConflict = conflictControlSet.has(kid);
    const hasSecondaryTriggers =
      keyCfg.triggers.hold.type !== 'none' ||
      keyCfg.triggers.double_tap.type !== 'none' ||
      keyCfg.triggers.tap_hold.type !== 'none';

    return (
      <button
        key={kid}
        type="button"
        onMouseDown={() => handleKeyPointerDown(kid)}
        onMouseUp={() => handleKeyPointerUp(kid)}
        onMouseLeave={() => {
          if (pressedKeys.has(kid)) handleKeyReleaseClean(kid);
        }}
        style={
          isSelected
            ? {
                borderColor: 'var(--accent)',
                boxShadow: `0 0 0 2px var(--accent), 0 0 18px rgba(var(--accent-rgb), 0.38), inset 0 1px 1px rgba(255,255,255,0.16)`
              }
            : {
                borderColor: isPhysicallyDown
                  ? 'rgba(255, 255, 255, 0.42)'
                  : 'rgba(255, 255, 255, 0.1)'
              }
        }
        className={`relative w-[92px] h-[92px] sm:w-[100px] sm:h-[100px] rounded-[13px] keycap-surface border flex flex-col items-center justify-between p-2.5 cursor-pointer group ${
          isPhysicallyDown ? 'keycap-depressed' : ''
        }`}
      >
        {/* Top Micro Row: Key Index + Multi-trigger / Conflict Indicator */}
        <div className="w-full flex items-center justify-between text-[10px] font-mono text-zinc-500 tabular-nums">
          <span className={isPhysicallyDown ? 'text-zinc-200 font-bold' : ''}>{idx + 1}</span>
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

        {onChangeViewMode && (
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
        )}

        {onChangeEncoderPlacement && (
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] ml-auto">
            <button
              type="button"
              onClick={() => onChangeEncoderPlacement('grid')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium cursor-pointer whitespace-nowrap ${
                encoderPlacement === 'grid'
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-semibold'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
              title="Compact 2×3 deck: 5 buttons + rotary encoder in top-right slot"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>2×3 Deck</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeEncoderPlacement('top')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium cursor-pointer whitespace-nowrap ${
                encoderPlacement === 'top'
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-semibold'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
              title="Place rotary encoder above the 5-key switch plate"
            >
              <Rows2 className="w-3.5 h-3.5" />
              <span>Top Dial</span>
            </button>
          </div>
        )}
      </div>

      {/* Center Hero: Top-Down Precision CNC 5-Button Macropad (No RGB) */}
      <div className="my-auto py-6 flex flex-col items-center">
        {/* USB Cable Top Port Detail */}
        <div className="w-14 h-2.5 rounded-t-md bg-zinc-800 border-x border-t border-white/15 shadow-inner" />

        <div className="chassis-shell rounded-[26px] p-6 w-[364px] sm:w-[396px] transition-all">
          {encoderPlacement === 'grid' ? (
            <>
              {/* Monochrome OLED Status Strip */}
              {renderOledReadout(true)}

              {/* Recessed 2×3 Switch Plate: [Key 1] [Key 2] [Encoder] / [Key 3] [Key 4] [Key 5] */}
              <div className="chassis-well rounded-2xl p-3.5">
                <div className="grid grid-cols-3 gap-3 place-items-center">
                  {renderKeycap('k1')}
                  {renderKeycap('k2')}
                  {renderEncoderKnobControl(true)}
                  {renderKeycap('k3')}
                  {renderKeycap('k4')}
                  {renderKeycap('k5')}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Upper Header: Monochrome OLED + Rotary Encoder */}
              <div className="flex items-center justify-between gap-4 pb-4 mb-4 border-b border-white/8">
                {renderOledReadout(false)}
                {renderEncoderKnobControl(false)}
              </div>

              {/* Recessed 5-Button Switch Plate: 3 on Top Row + 2 Centered on Bottom Row */}
              <div className="chassis-well rounded-2xl p-3.5 space-y-3">
                <div className="grid grid-cols-3 gap-3 place-items-center">
                  {renderKeycap('k1')}
                  {renderKeycap('k2')}
                  {renderKeycap('k3')}
                </div>
                <div className="flex items-center justify-center gap-3">
                  {renderKeycap('k4')}
                  {renderKeycap('k5')}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bottom Readout: Live Test Monitor in Test View, or Subtle Hint in Edit View */}
      <div className="w-full max-w-2xl">
        {viewMode === 'test' ? (
          <div className="rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[var(--text-primary)]">
                Live Input Debugger
              </span>
              <span className="text-[11px] font-mono text-[var(--text-muted)]">
                Press keys 1–5, [ / ] to spin dial, or click controls above
              </span>
            </div>
            {liveEvents.length === 0 ? (
              <div className="py-3 text-center text-xs text-[var(--text-muted)]">
                Press any of the 5 keycaps or rotate the encoder knob to inspect triggered actions in real time.
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
            <span>Click any of the 5 buttons or rotary encoder to edit</span>
            <span aria-hidden="true">·</span>
            <span>Scroll over encoder knob to test rotation</span>
            <span aria-hidden="true">·</span>
            <span>Switch to Test view to debug Hold & Double-tap</span>
          </div>
        )}
      </div>
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
