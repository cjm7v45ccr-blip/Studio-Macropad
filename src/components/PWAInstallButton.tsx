import React, { useState, useEffect } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { CheckCircle2, Download, Laptop, Smartphone, X } from 'lucide-react';

interface PWAInstallButtonProps {
  showInstalledState?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  showInstalledState = false
}) => {
  const { isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!showGuide) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowGuide(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showGuide]);

  if (isInstalled) {
    if (!showInstalledState) return null;
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] whitespace-nowrap shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
        <span>Installed as App</span>
      </div>
    );
  }

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowGuide(true);
      return;
    }

    setDownloading(true);
    const success = await install();
    setDownloading(false);

    if (!success) {
      setShowGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        disabled={downloading}
        style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }}
        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl hover:opacity-90 font-semibold text-xs transition-all cursor-pointer shadow-sm active:scale-95 whitespace-nowrap shrink-0 disabled:opacity-50"
        title="Install BertoPad as a standalone macOS, Windows, or mobile app"
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>{downloading ? 'Installing…' : 'Install Desktop App'}</span>
      </button>

      {showGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-title"
          onClick={() => setShowGuide(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 dark:bg-black/75 backdrop-blur-sm animate-panel-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-strong)] p-6 space-y-4 shadow-2xl text-[var(--text-primary)]"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                {isIOS ? (
                  <Smartphone className="w-4 h-4 text-[var(--accent)] shrink-0" />
                ) : (
                  <Laptop className="w-4 h-4 text-[var(--accent)] shrink-0" />
                )}
                <h3 id="pwa-install-title" className="text-sm font-bold">
                  Install BertoPad App
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Close install instructions"
                className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-[var(--text-secondary)] leading-relaxed">
              <p className="font-semibold text-[var(--text-primary)]">
                {isIOS
                  ? 'Install on iPhone or iPad (Safari):'
                  : 'Install as a native macOS or Windows app:'}
              </p>
              {isIOS ? (
                <ol className="list-decimal list-inside space-y-1.5 text-[var(--text-muted)]">
                  <li>
                    Tap the <strong className="text-[var(--text-primary)]">Share</strong> button in Safari&apos;s toolbar.
                  </li>
                  <li>
                    Scroll down and select <strong className="text-[var(--text-primary)]">Add to Home Screen</strong>.
                  </li>
                </ol>
              ) : (
                <ol className="list-decimal list-inside space-y-1.5 text-[var(--text-muted)]">
                  <li>
                    Open BertoPad in <strong className="text-[var(--text-primary)]">Chrome</strong> or <strong className="text-[var(--text-primary)]">Edge</strong> on desktop (required for USB Web Serial).
                  </li>
                  <li>
                    Click the <strong className="text-[var(--text-primary)]">Install icon</strong> in the browser address bar, or open the browser menu and select <strong className="text-[var(--text-primary)]">Cast, save, and share → Install BertoPad</strong>.
                  </li>
                </ol>
              )}
              <p className="text-[11px] text-[var(--text-muted)] pt-1 border-t border-[var(--border-subtle)]">
                Once installed, BertoPad launches in its own dedicated window with offline workspace caching and direct USB serial access.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }}
              className="w-full py-2 rounded-xl hover:opacity-90 font-semibold text-xs cursor-pointer shadow-sm"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
};
