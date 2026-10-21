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
      // If browser doesn't support beforeinstallprompt yet, provide helpful download instruction
      setShowIOSGuide(true);
    }
  };

  return (
    <>
      <button
        onClick={handleInstallClick}
        disabled={downloading}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs transition-all cursor-pointer shadow-sm active:scale-95"
        title="Download and Install Studio MacroPad App"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Download App</span>
      </button>

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm rounded-2xl bg-[#0d1017] border border-slate-800 p-6 space-y-4 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-sky-400" />
                <h3 className="text-sm font-bold">Install Studio MacroPad</h3>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-slate-300">
              <p className="font-semibold text-slate-200">
                {isIOS ? 'Install on iOS Safari:' : 'Install as Desktop / Mobile App:'}
              </p>
              {isIOS ? (
                <ol className="list-decimal list-inside space-y-1 text-slate-400 font-mono">
                  <li>Tap the <strong className="text-sky-400">Share</strong> icon in your browser menu.</li>
                  <li>Scroll down and tap <strong className="text-sky-400">Add to Home Screen</strong>.</li>
                </ol>
              ) : (
                <ol className="list-decimal list-inside space-y-1 text-slate-400 font-mono">
                  <li>Open your browser menu (three dots / settings).</li>
                  <li>Select <strong className="text-sky-400">Install App</strong> or <strong className="text-sky-400">Add to Desktop</strong>.</li>
                </ol>
              )}
            </div>

            <button
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2 rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 font-bold text-xs cursor-pointer shadow-sm"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
};
