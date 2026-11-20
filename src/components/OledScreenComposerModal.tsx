import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

const OVERLAY_OPTIONS = [
  { key: 'showHostBadge', label: 'Host Badge' },
  { key: 'showBleStatus', label: 'BLE Icon' },
  { key: 'showWifiStatus', label: 'Wi-Fi Icon' },
  { key: 'showLayerHint', label: 'Layer Hint' }
] as const;

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
  const [hoverPixel, setHoverPixel] = useState<{ x: number; y: number } | null>(null);

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

    const bg = draft.invertDisplay ? '#ECEAE4' : '#0C0F14';
    const fg = draft.invertDisplay ? '#0C0F14' : '#ECEAE4';

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

  const getPixelCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = Math.max(
      0,
      Math.min(OLED_WIDTH - 1, Math.floor(((clientX - rect.left) / rect.width) * OLED_WIDTH))
    );
    const y = Math.max(
      0,
      Math.min(OLED_HEIGHT - 1, Math.floor(((clientY - rect.top) / rect.height) * OLED_HEIGHT))
    );
    return { x, y };
  };

  const paintAtPointer = (clientX: number, clientY: number) => {
    const coords = getPixelCoords(clientX, clientY);
    if (!coords) return;
    setHoverPixel(coords);
    setLoadedImage(null);
    setDraft(prev => ({
      ...prev,
      enabled: true,
      bitmapBytesHex: setSsd1306Pixel(prev.bitmapBytesHex, coords.x, coords.y, drawMode === 'draw')
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

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="oled-composer-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#080A0D]/88 backdrop-blur-xl animate-in fade-in duration-150"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[90dvh] flex flex-col rounded-2xl studio-popover overflow-hidden animate-popover-in"
      >
        {/* Minimal Hairline Header */}
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Monitor className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
            <div className="min-w-0 flex items-baseline gap-2.5 flex-wrap">
              <h2
                id="oled-composer-title"
                className="text-sm font-semibold text-[var(--text-primary)] truncate"
              >
                128×64 OLED Composer
              </h2>
              <span className="font-mono text-[11px] text-[var(--text-muted)]">
                SSD1306 · 1-bit · bitmaps.h
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close OLED Screen Composer"
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Toolbar + Pixel Matrix */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <div
                  role="group"
                  aria-label="Drawing tool"
                  className="inline-flex items-center p-0.5 rounded-lg bg-[var(--bg-input)]"
                >
                  <button
                    type="button"
                    onClick={() => setDrawMode('draw')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                      drawMode === 'draw'
                        ? 'bg-[var(--bg-selected)] text-[var(--text-primary)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    <PenLine className="w-3.5 h-3.5" />
                    <span>Draw</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDrawMode('erase')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                      drawMode === 'erase'
                        ? 'bg-[var(--bg-selected)] text-[var(--text-primary)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    <Eraser className="w-3.5 h-3.5" />
                    <span>Erase</span>
                  </button>
                </div>

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
                  className="studio-btn flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-[var(--text-primary)] cursor-pointer"
                >
                  <ImagePlus className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                  <span>Import</span>
                </button>
                <button
                  type="button"
                  onClick={handleDrawSampleLogo}
                  className="studio-btn flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-[var(--text-primary)] cursor-pointer"
                >
                  <LayoutTemplate className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
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
                  className="px-2 py-1.5 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                >
                  Invert Pixels
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoadedImage(null);
                    setDraft(prev => ({ ...prev, bitmapBytesHex: blankSsd1306Hex() }));
                  }}
                  className="px-2 py-1.5 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            {loadedImage && (
              <div className="py-2.5 border-y border-[var(--border-subtle)] flex items-center justify-between gap-4 flex-wrap text-xs">
                <div className="flex items-center gap-3 flex-1 min-w-[200px]">
                  <span className="text-[var(--text-secondary)] whitespace-nowrap font-mono tabular-nums text-[11px]">
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
                <label className="flex items-center gap-2 text-[var(--text-primary)] text-[11px] cursor-pointer select-none">
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

            {/* Live 128x64 Pixel Matrix Bezel with High-Legibility Grid */}
            <div className="p-3.5 rounded-xl bg-[#090B0F] border border-[var(--border-subtle)] flex flex-col items-center gap-2">
              <div className="relative w-full aspect-[2/1] rounded-md overflow-hidden border border-[#ECEAE4]/20">
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
                    const coords = getPixelCoords(e.clientX, e.clientY);
                    if (coords) setHoverPixel(coords);
                    if (drawingRef.current) paintAtPointer(e.clientX, e.clientY);
                  }}
                  onPointerLeave={() => {
                    setHoverPixel(null);
                  }}
                  onPointerUp={() => {
                    drawingRef.current = false;
                  }}
                  onPointerCancel={() => {
                    drawingRef.current = false;
                  }}
                  className="block w-full h-full cursor-crosshair touch-none [image-rendering:pixelated]"
                />
                {/* Crisp 1px pixel matrix + 8px SSD1306 page grid */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0"
                  style={{
                    backgroundImage: draft.invertDisplay
                      ? 'linear-gradient(to right, rgba(12,15,20,0.09) 1px, transparent 1px), linear-gradient(to bottom, rgba(12,15,20,0.09) 1px, transparent 1px), linear-gradient(to right, rgba(12,15,20,0.19) 1px, transparent 1px), linear-gradient(to bottom, rgba(12,15,20,0.19) 1px, transparent 1px)'
                      : 'linear-gradient(to right, rgba(236,234,228,0.095) 1px, transparent 1px), linear-gradient(to bottom, rgba(236,234,228,0.095) 1px, transparent 1px), linear-gradient(to right, rgba(236,234,228,0.20) 1px, transparent 1px), linear-gradient(to bottom, rgba(236,234,228,0.20) 1px, transparent 1px)',
                    backgroundSize:
                      'calc(100% / 128) calc(100% / 64), calc(100% / 128) calc(100% / 64), calc(100% / 16) calc(100% / 8), calc(100% / 16) calc(100% / 8)'
                  }}
                />
              </div>
              <div className="flex items-center justify-between w-full font-mono text-[10px] text-[var(--text-muted)] tabular-nums">
                <span>128 × 64 px · 8×8 page grid · 1,024 B</span>
                <span>
                  {hoverPixel
                    ? `X ${String(hoverPixel.x).padStart(3, '0')} · Y ${String(hoverPixel.y).padStart(2, '0')}`
                    : `Click or drag to ${drawMode}`}
                </span>
              </div>
            </div>
          </div>

          {/* Unified Flat Hairline Settings Section */}
          <div className="divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
            {/* Row 1: Header Title + Invert OLED */}
            <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <label
                  htmlFor="oled-custom-title"
                  className="text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap shrink-0"
                >
                  Header Title
                </label>
                <input
                  id="oled-custom-title"
                  type="text"
                  maxLength={24}
                  value={draft.customName}
                  onChange={e => setDraft(prev => ({ ...prev, customName: e.target.value }))}
                  placeholder={`Default (${activeProfileName})`}
                  className="w-full max-w-[230px] px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)]"
                />
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={Boolean(draft.invertDisplay)}
                onClick={() =>
                  setDraft(prev => ({ ...prev, invertDisplay: !prev.invertDisplay }))
                }
                className="flex items-center gap-2.5 text-xs text-[var(--text-primary)] cursor-pointer select-none shrink-0"
              >
                <span className="text-[var(--text-secondary)]">Invert OLED</span>
                <span
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    draft.invertDisplay ? 'bg-[var(--text-primary)]' : 'bg-[var(--bg-input)] border border-[var(--border-subtle)]'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full transition-transform ${
                      draft.invertDisplay
                        ? 'translate-x-5 bg-[#0C0F14]'
                        : 'translate-x-0.5 bg-[var(--text-muted)]'
                    }`}
                  />
                </span>
              </button>
            </div>

            {/* Row 2: Status Overlay Master Toggle + Monochrome Sub-Options */}
            <div className="pt-3.5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-[var(--text-primary)]">
                    Status Overlay
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    {draft.enabled
                      ? 'Selected indicators render over the bitmap on hardware'
                      : 'Enable overlay to configure hardware status indicators'}
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(draft.enabled)}
                  aria-label="Enable Overlay"
                  onClick={() => setDraft(prev => ({ ...prev, enabled: !prev.enabled }))}
                  className="flex items-center gap-2 text-xs cursor-pointer select-none shrink-0"
                >
                  <span className="font-mono text-[10px] text-[var(--text-muted)]">
                    {draft.enabled ? 'On' : 'Off'}
                  </span>
                  <span
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      draft.enabled ? 'bg-[var(--accent)]' : 'bg-[var(--bg-input)] border border-[var(--border-subtle)]'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full transition-transform ${
                        draft.enabled
                          ? 'translate-x-5 bg-[#0C0F14]'
                          : 'translate-x-0.5 bg-[var(--text-muted)]'
                      }`}
                    />
                  </span>
                </button>
              </div>

              <div
                aria-disabled={!draft.enabled}
                className={`grid grid-cols-2 sm:grid-cols-4 gap-2 transition-opacity ${
                  draft.enabled ? 'opacity-100' : 'opacity-35 pointer-events-none select-none'
                }`}
              >
                {OVERLAY_OPTIONS.map(opt => {
                  const isChecked = Boolean(draft[opt.key]);
                  const showActive = draft.enabled && isChecked;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      disabled={!draft.enabled}
                      role="checkbox"
                      aria-checked={isChecked}
                      onClick={() =>
                        setDraft(prev => ({ ...prev, [opt.key]: !prev[opt.key] }))
                      }
                      className={`px-2.5 py-2 rounded-lg flex items-center gap-2 text-xs transition-colors cursor-pointer disabled:cursor-not-allowed ${
                        showActive
                          ? 'bg-[var(--bg-selected)] text-[var(--text-primary)]'
                          : 'bg-[var(--bg-input)]/50 text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                      }`}
                    >
                      <span
                        className={`w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors ${
                          showActive
                            ? 'bg-[var(--text-primary)] border-[var(--text-primary)] text-[#0C0F14]'
                            : 'border-[var(--border-strong)] bg-transparent text-transparent'
                        }`}
                      >
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </span>
                      <span className="truncate">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Clean Hairline Footer */}
        <div className="px-5 py-3.5 border-t border-[var(--border-subtle)] flex items-center justify-between gap-3 flex-wrap shrink-0">
          <button
            type="button"
            onClick={handleDownloadBitmapsHeader}
            className="studio-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
            <span>Export bitmaps.h</span>
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            {connection.connected && (
              <button
                type="button"
                disabled={pushing}
                onClick={handlePushToPad}
                className="studio-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-primary)] disabled:opacity-45 cursor-pointer whitespace-nowrap"
              >
                {pushing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                )}
                <span>Push to BertoPad</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleSaveAndClose}
              className="studio-cta flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save &amp; Preview</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
};
