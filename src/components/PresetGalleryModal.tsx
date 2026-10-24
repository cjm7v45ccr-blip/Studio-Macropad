import React from 'react';
import { CURATED_PRESETS, ProfilePreset } from '../data/presetProfiles';
import { Sparkles, X, Check, Laptop, Tv } from 'lucide-react';
import { ProfileMode } from '../types/macropod';

interface PresetGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeMode: ProfileMode;
  onApplyPreset: (preset: ProfilePreset) => void;
}

export const PresetGalleryModal: React.FC<PresetGalleryModalProps> = ({
  isOpen,
  onClose,
  activeMode,
  onApplyPreset
}) => {
  if (!isOpen) return null;

  const filtered = CURATED_PRESETS.filter(p => p.mode === activeMode);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-xl rounded-2xl bg-[#0d1017] border border-slate-800 shadow-2xl p-6 space-y-4">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Curated Profile Packs</h3>
              <p className="text-[11px] text-slate-400">
                1-Click professional layouts for {activeMode === 'MAC' ? 'macOS & PC' : 'SmartCast TV'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Preset Cards List */}
        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
          {filtered.map(preset => (
            <div
              key={preset.id}
              className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 hover:border-sky-500/50 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-100">{preset.title}</span>
                  <span className="text-[10px] font-mono text-sky-400 px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-500/20">
                    {preset.subtitle}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 max-w-sm">
                  {preset.description}
                </p>
                <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500 pt-1">
                  <span>B1: {preset.bindings.b1.split(':')[1] || preset.bindings.b1}</span>
                  <span>·</span>
                  <span>B2: {preset.bindings.b2.split(':')[1] || preset.bindings.b2}</span>
                  <span>·</span>
                  <span>B3: {preset.bindings.b3.split(':')[1] || preset.bindings.b3}</span>
                  <span>·</span>
                  <span>B4: {preset.bindings.b4.split(':')[1] || preset.bindings.b4}</span>
                </div>
              </div>

              <button
                onClick={() => {
                  onApplyPreset(preset);
                  onClose();
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 font-bold text-xs cursor-pointer shadow-sm shrink-0"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Load Profile</span>
              </button>
            </div>
          ))}
        </div>

        {/* Footer info */}
        <div className="text-right pt-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-3.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
          >
            Cancel
          </button>
        </div>

      </div>
    </div>
  );
};
