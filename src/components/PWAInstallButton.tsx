import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Smartphone, X } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [downloading, setDownloading] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSGuide(true);
      return;
    }

    setDownloading(true);
    const success = await install();
    setDownloading(false);

    if (!success) {
      setShowIOSGuide(true);
    }
  };

  return (
    <>
      <button
        onClick={handleInstallClick}
        disabled={downloading}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:opacity-90 text-[var(--accent-contrast)] font-bold text-xs transition-all cursor-pointer shadow-sm active:scale-95 whitespace-nowrap shrink-0"
        title="Download and Install BertoPad App"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Download App</span>
      </button>

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-strong)] p-6 space-y-4 shadow-2xl text-[var(--text-primary)]">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-[var(--accent)]" />
                <h3 className="text-sm font-bold">Install BertoPad</h3>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-[var(--text-secondary)]">
              <p className="font-semibold text-[var(--text-primary)]">
                {isIOS ? 'Install on iOS Safari:' : 'Install as Desktop / Mobile App:'}
              </p>
              {isIOS ? (
                <ol className="list-decimal list-inside space-y-1 text-[var(--text-muted)] font-mono">
                  <li>Tap the <strong className="text-[var(--accent)]">Share</strong> icon in your browser menu.</li>
                  <li>Scroll down and tap <strong className="text-[var(--accent)]">Add to Home Screen</strong>.</li>
                </ol>
              ) : (
                <ol className="list-decimal list-inside space-y-1 text-[var(--text-muted)] font-mono">
                  <li>Open your browser menu (three dots / settings).</li>
                  <li>Select <strong className="text-[var(--accent)]">Install App</strong> or <strong className="text-[var(--accent)]">Add to Desktop</strong>.</li>
                </ol>
              )}
            </div>

            <button
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2 rounded-lg bg-[var(--accent)] hover:opacity-90 text-[var(--accent-contrast)] font-bold text-xs cursor-pointer shadow-sm"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
};
