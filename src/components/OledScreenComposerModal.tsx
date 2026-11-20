import React, { useEffect, useRef, useState } from 'react';
import {
  DeviceConnectionInfo,
  OledComposerConfig
} from '../types/studio';
import { ToastVariant } from '../hooks/useStudioState';
import { usbHardware } from '../services/usbHardwareService';
import {
  DEFAULT_OLED_COMPOSER_CONFIG,
  OLED_HEIGHT,
  OLED_WIDTH,
  blankSsd1306Hex,
  generateBitmapsHeader,
  getSsd1306Pixel,
  imageDataToSsd1306Hex,
  invertSsd1306Hex,
  normalizeSsd1306Hex,
  setSsd1306Pixel
} from '../utils/firmwareHeaderExport';
import {
  Check,
  Download,
  Eraser,
  ImagePlus,
  LayoutTemplate,
  Loader2,
  Monitor,
  PenLine,
  Send,
  X
} from 'lucide-react';

interface OledScreenComposerModalProps {
  isOpen: boolean;
  config?: OledComposerConfig;
  activeProfileName: string;
  connection: DeviceConnectionInfo;
  onSaveConfig: (next: OledComposerConfig) => void;
  onClose: () => void;
  onToast: (msg: string, variant?: ToastVariant) => void;
}

export const OledScreenComposerModal: React.FC<OledScreenComposerModalProps> = ({
  isOpen,
  config,
  activeProfileName,
  connection,
  onSaveConfig,
  onClose,
  onToast
}) => {
  const [draft, setDraft] = useState<OledComposerConfig>(() => ({
    ...DEFAULT_OLED_COMPOSER_CONFIG,
    ...(config || {}),
    bitmapBytesHex: normalizeSsd1306Hex(config?.bitmapBytesHex)
  }));
  const [drawMode, setDrawMode] = useState<'draw' | 'erase'>('draw');
  const [threshold, setThreshold] = useState<number>(128);
  const [dither, setDither] = useState<boolean>(true);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [pushing, setPushing] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const drawingRef = useRef<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    setDraft({
      ...DEFAULT_OLED_COMPOSER_CONFIG,
      ...(config || {}),
      bitmapBytesHex: normalizeSsd1306Hex(config?.bitmapBytesHex)
    });
  }, [isOpen, config]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  // Re-quantize imported image whenever threshold or dither changes
  useEffect(() => {
    if (!loadedImage) return;
    const offscreen = document.createElement('canvas');
    offscreen.width = OLED_WIDTH;
    offscreen.height = OLED_HEIGHT;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, OLED_WIDTH, OLED_HEIGHT);
    const scale = Math.min(OLED_WIDTH / loadedImage.width, OLED_HEIGHT / loadedImage.height);
    const drawW = Math.round(loadedImage.width * scale);
    const drawH = Math.round(loadedImage.height * scale);
    const dx = Math.floor((OLED_WIDTH - drawW) / 2);
    const dy = Math.floor((OLED_HEIGHT - drawH) / 2);
    ctx.drawImage(loadedImage, dx, dy, drawW, drawH);
    const imgData = ctx.getImageData(0, 0, OLED_WIDTH, OLED_HEIGHT);
    const hex = imageDataToSsd1306Hex(imgData.data, OLED_WIDTH, OLED_HEIGHT, threshold, dither);
    setDraft(prev => ({ ...prev, enabled: true, bitmapBytesHex: hex }));
  }, [loadedImage, threshold, dither]);

  // Paint current 128x64 buffer onto canvas
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bg = draft.invertDisplay ? '#ECEAE4' : '#080A0E';
    const fg = draft.invertDisplay ? '#080A0E' : '#ECEAE4';

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, OLED_WIDTH, OLED_HEIGHT);

    ctx.fillStyle = fg;
    for (let y = 0; y < OLED_HEIGHT; y++) {
      for (let x = 0; x < OLED_WIDTH; x++) {
        if (getSsd1306Pixel(draft.bitmapBytesHex, x, y)) {
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }, [isOpen, draft.bitmapBytesHex, draft.invertDisplay]);

  if (!isOpen) return null;

  const paintAtPointer = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = Math.max(0, Math.min(OLED_WIDTH - 1, Math.floor(((clientX - rect.left) / rect.width) * OLED_WIDTH)));
    const y = Math.max(0, Math.min(OLED_HEIGHT - 1, Math.floor(((clientY - rect.top) / rect.height) * OLED_HEIGHT)));
    setLoadedImage(null);
    setDraft(prev => ({
      ...prev,
      enabled: true,
      bitmapBytesHex: setSsd1306Pixel(prev.bitmapBytesHex, x, y, drawMode === 'draw')
    }));
  };

  const handleImportImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        setLoadedImage(img);
        onToast(`Converted ${file.name} to 128×64 monochrome OLED bitmap`);
      };
      img.onerror = () => onToast('Could not read image file', 'error');
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  };

  const handleDrawSampleLogo = () => {
    setLoadedImage(null);
    const offscreen = document.createElement('canvas');
    offscreen.width = OLED_WIDTH;
    offscreen.height = OLED_HEIGHT;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, OLED_WIDTH, OLED_HEIGHT);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, OLED_WIDTH - 4, OLED_HEIGHT - 4);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('BERTOPAD', 14, 28);
    ctx.font = '10px monospace';
    ctx.fillText(
      (draft.customName.trim() || activeProfileName || 'STUDIO').slice(0, 14).toUpperCase(),
      14,
      46
    );
    const imgData = ctx.getImageData(0, 0, OLED_WIDTH, OLED_HEIGHT);
    setDraft(prev => ({
      ...prev,
      enabled: true,
      bitmapBytesHex: imageDataToSsd1306Hex(imgData.data, OLED_WIDTH, OLED_HEIGHT, 128, false)
    }));
  };

  const handleDownloadBitmapsHeader = () => {
    const header = generateBitmapsHeader(draft);
    const blob = new Blob([header], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bitmaps.h';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onToast('Exported bitmaps.h for ESP32 firmware');
  };

  const handlePushToPad = async () => {
    setPushing(true);
    try {
      onSaveConfig(draft);
      const res = await usbHardware.pushOledComposer(draft);
      onToast(res.message, res.ok ? 'success' : 'error');
    } catch (err: any) {
      onToast(err?.message || 'Could not push OLED frame to pad', 'error');
    } finally {
      setPushing(false);
    }
  };

  const handleSaveAndClose = () => {
    onSaveConfig(draft);
    onToast('Saved OLED screen composition');
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="oled-composer-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#080A0D]/92 backdrop-blur-xl animate-panel-in"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-strong)] shadow-2xl"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[var(--bg-panel)]/95 backdrop-blur-md px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)] flex items-center justify-center shrink-0">
              <Monitor className="w-4 h-4 text-[var(--accent)]" />
            </div>
            <div className="min-w-0">
              <h2 id="oled-composer-title" className="text-sm font-bold text-[var(--text-primary)] truncate">
                128×64 SSD1306 OLED Screen Composer
              </h2>
              <p className="text-xs text-[var(--text-muted)] truncate">
                Design custom monochrome pixel art, configure status overlays, or export <span className="font-mono">bitmaps.h</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close OLED Screen Composer"
            className="w-8 h-8 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Interactive Pixel Matrix + Tool Palette */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setDrawMode('draw')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                    drawMode === 'draw'
                      ? 'bg-[var(--accent)] text-[var(--accent-contrast)] border-[var(--accent)]'
                      : 'bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                  }`}
                >
                  <PenLine className="w-3.5 h-3.5" />
                  <span>Draw</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDrawMode('erase')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                    drawMode === 'erase'
                      ? 'bg-[var(--accent)] text-[var(--accent-contrast)] border-[var(--accent)]'
                      : 'bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                  }`}
                >
                  <Eraser className="w-3.5 h-3.5" />
                  <span>Erase</span>
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleImportImage(file);
                      e.target.value = '';
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] cursor-pointer"
                >
                  <ImagePlus className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>Import Image</span>
                </button>
                <button
                  type="button"
                  onClick={handleDrawSampleLogo}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] cursor-pointer"
                >
                  <LayoutTemplate className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>Sample Badge</span>
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setLoadedImage(null);
                    setDraft(prev => ({
                      ...prev,
                      bitmapBytesHex: invertSsd1306Hex(prev.bitmapBytesHex)
                    }));
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] cursor-pointer"
                >
                  Invert Pixels
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoadedImage(null);
                    setDraft(prev => ({ ...prev, bitmapBytesHex: blankSsd1306Hex() }));
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            {loadedImage && (
              <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] flex items-center justify-between gap-4 flex-wrap text-xs">
                <div className="flex items-center gap-3 flex-1 min-w-[200px]">
                  <span className="text-[var(--text-secondary)] whitespace-nowrap font-mono tabular-nums">
                    Threshold {threshold}
                  </span>
                  <input
                    type="range"
                    min={32}
                    max={224}
                    value={threshold}
                    onChange={e => setThreshold(Number(e.target.value))}
                    className="flex-1 accent-[var(--accent)] cursor-pointer"
                  />
                </div>
                <label className="flex items-center gap-2 text-[var(--text-primary)] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={dither}
                    onChange={e => setDither(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  <span>Floyd-Steinberg Dither</span>
                </label>
              </div>
            )}

            {/* Live 128x64 Pixel Canvas */}
            <div className="p-4 rounded-2xl bg-[#111318] border border-[var(--border-strong)] flex flex-col items-center gap-2">
              <div className="relative w-full max-w-[512px] aspect-[2/1] rounded-lg overflow-hidden border border-[#ECEAE4]/25">
                <canvas
                  ref={canvasRef}
                  width={OLED_WIDTH}
                  height={OLED_HEIGHT}
                  onPointerDown={e => {
                    drawingRef.current = true;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    paintAtPointer(e.clientX, e.clientY);
                  }}
                  onPointerMove={e => {
                    if (drawingRef.current) paintAtPointer(e.clientX, e.clientY);
                  }}
                  onPointerUp={() => {
                    drawingRef.current = false;
                  }}
                  onPointerCancel={() => {
                    drawingRef.current = false;
                  }}
                  className="block w-full h-full cursor-crosshair touch-none [image-rendering:pixelated]"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0"
                  style={{
                    backgroundImage: draft.invertDisplay
                      ? 'linear-gradient(to right, rgba(8,10,14,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(8,10,14,0.06) 1px, transparent 1px), linear-gradient(to right, rgba(8,10,14,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(8,10,14,0.12) 1px, transparent 1px)'
                      : 'linear-gradient(to right, rgba(236,234,228,0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(236,234,228,0.045) 1px, transparent 1px), linear-gradient(to right, rgba(236,234,228,0.095) 1px, transparent 1px), linear-gradient(to bottom, rgba(236,234,228,0.095) 1px, transparent 1px)',
                    backgroundSize:
                      'calc(100% / 128) calc(100% / 64), calc(100% / 128) calc(100% / 64), calc(100% / 16) calc(100% / 8), calc(100% / 16) calc(100% / 8)'
                  }}
                />
              </div>
              <div className="flex items-center justify-between w-full max-w-[512px] font-mono text-[10px] text-[#A3A6AD] tabular-nums">
                <span>128 × 64 px · 1-bit SSD1306 Page Buffer (1,024 B)</span>
                <span>Click or drag to {drawMode}</span>
              </div>
            </div>
          </div>

          {/* Overlay & Preview Settings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-2">
              <label
                htmlFor="oled-custom-title"
                className="block text-xs font-semibold text-[var(--text-primary)]"
              >
                Custom OLED Header Title
              </label>
              <input
                id="oled-custom-title"
                type="text"
                maxLength={24}
                value={draft.customName}
                onChange={e => setDraft(prev => ({ ...prev, customName: e.target.value }))}
                placeholder={`Defaults to "${activeProfileName}"`}
                className="w-full px-3 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] grid grid-cols-2 gap-2 text-xs">
              {(
                [
                  { key: 'enabled', label: 'Enable Overlay', requiresOverlay: false },
                  { key: 'invertDisplay', label: 'Invert OLED', requiresOverlay: false },
                  { key: 'showHostBadge', label: 'Host Badge', requiresOverlay: true },
                  { key: 'showBleStatus', label: 'BLE Icon', requiresOverlay: true },
                  { key: 'showWifiStatus', label: 'Wi-Fi Icon', requiresOverlay: true },
                  { key: 'showLayerHint', label: 'Layer Hint', requiresOverlay: true }
                ] as const
              ).map(opt => {
                const isSubDimmed = opt.requiresOverlay && !draft.enabled;
                return (
                  <label
                    key={opt.key}
                    className={`flex items-center gap-2 select-none transition-opacity ${
                      isSubDimmed
                        ? 'opacity-40 text-[var(--text-muted)] cursor-not-allowed'
                        : 'text-[var(--text-primary)] cursor-pointer'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={isSubDimmed}
                      checked={Boolean(draft[opt.key])}
                      onChange={e =>
                        setDraft(prev => ({ ...prev, [opt.key]: e.target.checked }))
                      }
                      className="accent-[var(--accent)] disabled:cursor-not-allowed"
                    />
                    <span>{opt.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 z-10 bg-[var(--bg-panel)]/95 backdrop-blur-md px-5 py-3.5 border-t border-[var(--border-subtle)] flex items-center justify-between gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleDownloadBitmapsHeader}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>Export bitmaps.h</span>
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            {connection.connected && (
              <button
                type="button"
                disabled={pushing}
                onClick={handlePushToPad}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-45 cursor-pointer whitespace-nowrap"
              >
                {pushing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5 text-[var(--accent)]" />
                )}
                <span>Push to BertoPad</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleSaveAndClose}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold hover:opacity-90 cursor-pointer whitespace-nowrap"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save &amp; Preview</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
