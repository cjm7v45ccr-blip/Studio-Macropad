import React, { useState } from 'react';
import {
  AppWindow,
  Download,
  Copy,
  Check,
  ExternalLink,
  Laptop,
  Smartphone,
  Radio,
  Tv,
  X,
  Code,
  ShieldCheck,
  Layers,
  ArrowRight
} from 'lucide-react';
import { HardwareProfileId } from '../types/studio';

interface CompanionModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProfileId: HardwareProfileId;
  activeProfileName: string;
  onSelectProfile: (id: HardwareProfileId) => void;
  onToast: (msg: string) => void;
}

export const CompanionModal: React.FC<CompanionModalProps> = ({
  isOpen,
  onClose,
  activeProfileId,
  activeProfileName,
  onSelectProfile,
  onToast
}) => {
  const [activeTab, setActiveTab] = useState<'desktop' | 'mobile' | 'integrations'>('desktop');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  if (!isOpen) return null;

  const copySnippet = (text: string, id: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedCode(id);
    onToast('Copied script snippet to clipboard');
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const macosHelperScript = `#!/usr/bin/env bash
# BertoPad Studio Native Companion Helper (macOS)
# Listens to active frontmost application window changes and switches BertoPad profile
# Requirements: WebSerial or HTTP API enabled on pad

PAD_URL="http://192.168.1.50/api"
API_TOKEN="your-token-here"

echo "BertoPad macOS Companion running..."
prev_app=""

while true; do
  curr_app=$(osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true')
  if [ "$curr_app" != "$prev_app" ]; then
    prev_app="$curr_app"
    echo "Active App: $curr_app"
    case "$curr_app" in
      "Final Cut Pro"|"DaVinci Resolve"|"Premiere")
        slot="1" # Video editing profile
        ;;
      "Code"|"Terminal"|"iTerm2")
        slot="2" # Developer profile
        ;;
      "OBS"|"Discord")
        slot="3" # Streamer profile
        ;;
      *)
        slot="1"
        ;;
    esac
    curl -s -X POST "$PAD_URL/profile" -H "Authorization: Bearer $API_TOKEN" -H "Content-Type: application/json" -d "{\\"slot\\":$slot}" > /dev/null
  fi
  sleep 0.8
done`;

  const windowsHelperScript = `# BertoPad Studio Windows PowerShell Helper
# Auto-detects active foreground window process and syncs BertoPad host profile
$PadUrl = "http://192.168.1.50/api"
$ApiToken = "your-token-here"

Add-Type @"
  using System;
  using System.Runtime.InteropServices;
  public class Win32 {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int processId);
  }
"@

$prevProc = ""
Write-Host "BertoPad Windows Companion running..."

while ($true) {
  $hwnd = [Win32]::GetForegroundWindow()
  $procId = 0
  [Win32]::GetWindowThreadProcessId($hwnd, [ref]$procId) | Out-Null
  $proc = (Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName

  if ($proc -and $proc -ne $prevProc) {
    $prevProc = $proc
    Write-Host "Foreground: $proc"
    $slot = 1
    if ($proc -match "Code|devenv|cmd|powershell") { $slot = 2 }
    elseif ($proc -match "obs64|Discord") { $slot = 3 }

    try {
      Invoke-RestMethod -Uri "$PadUrl/profile" -Method Post -Headers @{ Authorization = "Bearer $ApiToken" } -Body (@{ slot = $slot } | ConvertTo-Json) -TimeoutSec 1 | Out-Null
    } catch {}
  }
  Start-Sleep -Milliseconds 800
}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="companion-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-strong)] shadow-2xl p-5 sm:p-6 space-y-5 max-h-[90dvh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)] shrink-0">
              <AppWindow className="w-5 h-5" />
            </div>
            <div>
              <h3 id="companion-modal-title" className="text-base font-bold text-[var(--text-primary)]">
                BertoPad Companion & Ecosystem
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                App-aware automatic profile switching, native menu-bar helpers, and mobile keypad
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('desktop')}
            className={`flex-1 py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'desktop'
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>Desktop App-Aware</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('mobile')}
            className={`flex-1 py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'mobile'
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Mobile Keypad PWA</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('integrations')}
            className={`flex-1 py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'integrations'
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>OBS & Home Assistant</span>
          </button>
        </div>

        {/* TAB 1: DESKTOP APP-AWARE */}
        {activeTab === 'desktop' && (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-1.5">
              <div className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Zero-Install Foreground Process Switching</span>
              </div>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                Stream Deck-style app awareness lets BertoPad auto-switch to your <strong>DaVinci/Premiere</strong> layout when you edit video, your <strong>VS Code</strong> profile when you write code, or your <strong>OBS/Discord</strong> setup when streaming.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[var(--text-primary)]">macOS Lightweight Helper (`bertopad-companion.sh`)</span>
                <button
                  type="button"
                  onClick={() => copySnippet(macosHelperScript, 'mac')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  {copiedCode === 'mac' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedCode === 'mac' ? 'Copied' : 'Copy Bash'}</span>
                </button>
              </div>
              <pre className="p-3 rounded-xl bg-black/60 border border-[var(--border-subtle)] font-mono text-[11px] text-[var(--text-secondary)] overflow-x-auto max-h-36">
                {macosHelperScript}
              </pre>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[var(--text-primary)]">Windows PowerShell Helper (`bertopad-companion.ps1`)</span>
                <button
                  type="button"
                  onClick={() => copySnippet(windowsHelperScript, 'win')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  {copiedCode === 'win' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedCode === 'win' ? 'Copied' : 'Copy PowerShell'}</span>
                </button>
              </div>
              <pre className="p-3 rounded-xl bg-black/60 border border-[var(--border-subtle)] font-mono text-[11px] text-[var(--text-secondary)] overflow-x-auto max-h-36">
                {windowsHelperScript}
              </pre>
            </div>
          </div>
        )}

        {/* TAB 2: MOBILE KEYPAD */}
        {activeTab === 'mobile' && (
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-2">
              <div className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-[var(--accent)]" />
                <span>Use Your Phone as a Secondary Wireless Keypad</span>
              </div>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                Open this app on your iPhone or Android phone via local Wi-Fi. Add BertoPad Studio to your Home Screen as an offline-first PWA to get full-screen tactile feedback, quick layout previews, and one-tap TV SmartCast controls from anywhere in the room.
              </p>
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => onSelectProfile('TV')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold cursor-pointer"
                >
                  <Tv className="w-3.5 h-3.5" />
                  <span>Switch to TV Profile</span>
                </button>
                <span className="text-[var(--text-muted)] text-[11px]">
                  Active: <strong>{activeProfileName}</strong>
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-2 text-[var(--text-muted)]">
              <span className="font-semibold text-[var(--text-primary)]">PWA Mobile Features:</span>
              <ul className="list-disc list-inside space-y-1">
                <li>Zero installation required — works straight from Safari or Chrome.</li>
                <li>Haptic mechanical sound simulation via Web Audio API.</li>
                <li>Local storage offline-first cache matches your physical pad configuration.</li>
              </ul>
            </div>
          </div>
        )}

        {/* TAB 3: INTEGRATIONS */}
        {activeTab === 'integrations' && (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-1.5">
              <div className="font-semibold text-[var(--text-primary)]">Stream Deck &amp; Broadcast Ecosystem</div>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                BertoPad uses standard USB HID media keys and auxiliary function keys (<span className="font-mono text-amber-400">F13 through F16</span>). These keys are recognized natively by:
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-1">
                <span className="font-semibold text-[var(--text-primary)]">OBS Studio / Streamlabs</span>
                <p className="text-[var(--text-muted)] text-[11px]">
                  Map scene transitions, mic mutes, and recording toggles directly to BertoPad keys without conflicting with standard typing keys.
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-1">
                <span className="font-semibold text-[var(--text-primary)]">Discord &amp; TeamSpeak</span>
                <p className="text-[var(--text-muted)] text-[11px]">
                  Bind global Push-To-Talk or Deafen to Knob 1 click (<span className="font-mono">F14</span>) or Dial 2 (<span className="font-mono">F15</span>).
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-1">
                <span className="font-semibold text-[var(--text-primary)]">Raycast / Alfred</span>
                <p className="text-[var(--text-muted)] text-[11px]">
                  Use auxiliary function keys to launch AI quick prompts, clipboard history, or window tiling managers instantly.
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-1">
                <span className="font-semibold text-[var(--text-primary)]">Home Assistant &amp; Webhooks</span>
                <p className="text-[var(--text-muted)] text-[11px]">
                  Send HTTP webhooks over pad Wi-Fi to trigger smart lights, desk lamps, or home automation scenes directly from the hardware.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
