import React, { useState, useEffect } from 'react';
import { Sun, Moon, SlidersHorizontal, Monitor } from 'lucide-react';

const LS = (k: string) => `bertopad.display.last_${k}`;
const remember = (k: 'dim' | 'off', v: number) => v > 0 && localStorage.setItem(LS(k), String(v));
const recall = (k: 'dim' | 'off', fallback: number) => Number(localStorage.getItem(LS(k))) || fallback;

export type DisplayState = { dim_s: number; off_s: number; contrast: number };
type Patch = Partial<{ dim: number; off: number; contrast: number }>;

interface DisplaySettingsProps {
  display?: DisplayState;
  supported: boolean;
  connected: boolean;
  send: (path: string, body: Patch) => Promise<void>;
}

export const DisplaySettings: React.FC<DisplaySettingsProps> = ({
  display,
  supported,
  connected,
  send,
}) => {
  const [contrastVal, setContrastVal] = useState<number>(display?.contrast ?? 255);
  const [dimVal, setDimVal] = useState<number>(
    display && display.dim_s > 0 ? display.dim_s : recall('dim', 60)
  );
  const [offVal, setOffVal] = useState<number>(
    display && display.off_s > 0 ? display.off_s : recall('off', 300)
  );

  useEffect(() => {
    if (!display) return;
    if (display.contrast !== undefined) {
      setContrastVal(display.contrast);
    }
    if (display.dim_s > 0) {
      setDimVal(display.dim_s);
    }
    if (display.off_s > 0) {
      setOffVal(display.off_s);
    }
  }, [display]);

  if (!supported || !display) return null;

  const apply = (p: Patch) => send('/api/display/set', p);
  const dimOn = display.dim_s > 0;
  const offOn = display.off_s > 0;

  const toggleDim = (on: boolean) => {
    if (!on) {
      remember('dim', display.dim_s);
    }
    const nextDim = on ? recall('dim', 60) : 0;
    setDimVal(nextDim > 0 ? nextDim : 60);
    apply({ dim: nextDim });
  };

  const toggleOff = (on: boolean) => {
    if (!on) {
      remember('off', display.off_s);
    }
    const nextOff = on ? recall('off', 300) : 0;
    setOffVal(nextOff > 0 ? nextOff : 300);
    apply({ off: nextOff });
  };

  const handleSetDim = (s: number) => {
    const clamped = Math.max(5, Math.min(36000, s));
    setDimVal(clamped);
    remember('dim', clamped);
    if (offOn && clamped >= display.off_s) {
      const newOff = clamped + 60;
      setOffVal(newOff);
      remember('off', newOff);
      apply({ dim: clamped, off: newOff });
    } else {
      apply({ dim: clamped });
    }
  };

  const handleSetOff = (s: number) => {
    const minAllowed = dimOn ? display.dim_s + 1 : 1;
    const clamped = Math.max(minAllowed, Math.min(36000, s));
    setOffVal(clamped);
    remember('off', clamped);
    apply({ off: clamped });
  };

  const handleContrastPointerUp = () => {
    apply({ contrast: contrastVal });
  };

  return (
    <div className="bg-[#1E2128] border border-[#2B2F3A] rounded-xl p-5 space-y-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#F2A33A]/10 flex items-center justify-center text-[#F2A33A]">
            <Monitor className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#ECEAE4]">Display & Power Management</h3>
            <p className="text-xs text-[#A3A6AD]">Configure screen dimming, sleep timeouts, and OLED contrast</p>
          </div>
        </div>
        {!connected && (
          <span className="text-xs text-[#A3A6AD] font-mono">
            Disconnected · Last known values
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
        {/* Dim Display */}
        <div className="space-y-3 p-4 bg-[#14161B] rounded-lg border border-[#2B2F3A]">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                disabled={!connected}
                checked={dimOn}
                onChange={(e) => toggleDim(e.target.checked)}
                className="w-4 h-4 rounded border-[#2B2F3A] text-[#F2A33A] focus:ring-[#F2A33A] bg-[#1E2128]"
              />
              <span className="text-sm font-medium text-[#ECEAE4] flex items-center gap-1.5">
                <Sun className="w-4 h-4 text-[#F2A33A]" /> Dim display after
              </span>
            </label>
            <span className="text-xs text-[#A3A6AD]">
              {dimOn ? `${display.dim_s}s` : 'Disabled'}
            </span>
          </div>

          {dimOn && (
            <div className="space-y-1.5 pl-6">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  disabled={!connected}
                  min={5}
                  max={36000}
                  value={dimVal}
                  onChange={(e) => setDimVal(Number(e.target.value))}
                  onBlur={(e) => handleSetDim(Number(e.target.value))}
                  className="w-28 bg-[#1E2128] border border-[#2B2F3A] rounded-md px-3 py-1.5 text-sm text-[#ECEAE4] focus:outline-none focus:border-[#F2A33A]"
                />
                <span className="text-xs text-[#A3A6AD]">seconds (5 - 36,000)</span>
              </div>
            </div>
          )}
        </div>

        {/* Turn Off Display */}
        <div className="space-y-3 p-4 bg-[#14161B] rounded-lg border border-[#2B2F3A]">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                disabled={!connected}
                checked={offOn}
                onChange={(e) => toggleOff(e.target.checked)}
                className="w-4 h-4 rounded border-[#2B2F3A] text-[#F2A33A] focus:ring-[#F2A33A] bg-[#1E2128]"
              />
              <span className="text-sm font-medium text-[#ECEAE4] flex items-center gap-1.5">
                <Moon className="w-4 h-4 text-[#F2A33A]" /> Turn display off after
              </span>
            </label>
            <span className="text-xs text-[#A3A6AD]">
              {offOn ? `${display.off_s}s` : 'Disabled'}
            </span>
          </div>

          {offOn && (
            <div className="space-y-1.5 pl-6">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  disabled={!connected}
                  min={1}
                  max={36000}
                  value={offVal}
                  onChange={(e) => setOffVal(Number(e.target.value))}
                  onBlur={(e) => handleSetOff(Number(e.target.value))}
                  className="w-28 bg-[#1E2128] border border-[#2B2F3A] rounded-md px-3 py-1.5 text-sm text-[#ECEAE4] focus:outline-none focus:border-[#F2A33A]"
                />
                <span className="text-xs text-[#A3A6AD]">seconds (must be &gt; dim)</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Contrast Slider */}
      <div className="p-4 bg-[#14161B] rounded-lg border border-[#2B2F3A] space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-[#ECEAE4] flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-[#F2A33A]" /> OLED Contrast
          </span>
          <span className="text-sm font-mono text-[#F2A33A] font-semibold">{contrastVal} / 255</span>
        </div>
        <input
          type="range"
          disabled={!connected}
          min={0}
          max={255}
          value={contrastVal}
          onChange={(e) => setContrastVal(Number(e.target.value))}
          onPointerUp={handleContrastPointerUp}
          onBlur={handleContrastPointerUp}
          className="w-full accent-[#F2A33A] bg-[#2B2F3A] h-2 rounded-lg cursor-pointer"
        />
        <div className="flex justify-between text-xs text-[#A3A6AD]">
          <span>0 (Off)</span>
          <span>128 (Medium)</span>
          <span>255 (Max)</span>
        </div>
      </div>

      <p className="text-xs text-[#A3A6AD] italic">
        Help text: “Any key, knob turn or notification wakes the screen. Setup mode never sleeps.”
      </p>
    </div>
  );
};
