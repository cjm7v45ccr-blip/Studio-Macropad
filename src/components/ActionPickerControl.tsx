import React, { useState, useEffect, useRef } from 'react';
import {
  ActionBinding,
  ActionType,
  KeyboardLayoutId,
  MacroItem,
  MultiStepAction,
  StudioProfile
} from '../types/studio';
import {
  Keyboard,
  FileText,
  Zap,
  Music,
  Monitor,
  ExternalLink,
  MousePointerClick,
  Layers,
  Webhook,
  ListOrdered,
  CircleOff,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Play,
  Check
} from 'lucide-react';

interface ActionPickerControlProps {
  binding: ActionBinding;
  onChange: (next: ActionBinding) => void;
  macros: MacroItem[];
  profiles: StudioProfile[];
  keyboardLayout: KeyboardLayoutId;
  onNavigateToMacros?: () => void;
  onToast?: (msg: string) => void;
  compact?: boolean;
}

const ACTION_TYPES: { id: ActionType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'shortcut', label: 'Shortcut', icon: Keyboard },
  { id: 'text', label: 'Text', icon: FileText },
  { id: 'macro', label: 'Macro', icon: Zap },
  { id: 'media', label: 'Media', icon: Music },
  { id: 'system', label: 'System', icon: Monitor },
  { id: 'open', label: 'Open', icon: ExternalLink },
  { id: 'mouse', label: 'Mouse', icon: MousePointerClick },
  { id: 'layer', label: 'Layer', icon: Layers },
  { id: 'webhook', label: 'Webhook', icon: Webhook },
  { id: 'multi', label: 'Multi-Action', icon: ListOrdered },
  { id: 'none', label: 'Disabled', icon: CircleOff }
];

const MEDIA_OPTIONS = [
  'Play / Pause',
  'Next Track',
  'Previous Track',
  'Stop',
  'Mute',
  'Volume Up',
  'Volume Down'
];

const SYSTEM_OPTIONS = [
  'Volume Up',
  'Volume Down',
  'Brightness Up',
  'Brightness Down',
  'Lock Screen',
  'Screenshot',
  'Mission Control / Task View',
  'Sleep Display'
];

const QUICK_KEYS = ['Space', 'Enter', 'Tab', 'Escape', 'Backspace', 'F13', 'F14', 'F15', 'F16', '[', ']', 'ArrowLeft', 'ArrowRight'];

function mapKeyForLayout(code: string, key: string, layout: KeyboardLayoutId): string {
  if (layout === 'de_qwertz') {
    if (code === 'KeyY') return 'Z';
    if (code === 'KeyZ') return 'Y';
  }
  if (layout === 'fr_azerty') {
    if (code === 'KeyQ') return 'A';
    if (code === 'KeyA') return 'Q';
    if (code === 'KeyW') return 'Z';
    if (code === 'KeyZ') return 'W';
  }
  if (key === ' ') return 'Space';
  if (key.length === 1) return key.toUpperCase();
  return key;
}

export const ActionPickerControl: React.FC<ActionPickerControlProps> = ({
  binding,
  onChange,
  macros,
  profiles,
  keyboardLayout,
  onNavigateToMacros,
  onToast,
  compact = false
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [webhookTesting, setWebhookTesting] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<string | null>(null);
  const recorderRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isRecording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
        return;
      }

      const parts: string[] = [];
      if (e.metaKey) parts.push('Cmd');
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');

      const mappedKey = mapKeyForLayout(e.code, e.key, keyboardLayout);
      parts.push(mappedKey);

      onChange({
        ...binding,
        type: 'shortcut',
        value: parts.join('+')
      });
      setIsRecording(false);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isRecording, binding, keyboardLayout, onChange]);

  const handleSelectType = (nextType: ActionType) => {
    setIsRecording(false);
    if (nextType === binding.type) return;

    switch (nextType) {
      case 'shortcut':
        onChange({ type: 'shortcut', value: 'Cmd+C' });
        break;
      case 'text':
        onChange({ type: 'text', value: 'Hello from Studio Pad!' });
        break;
      case 'macro':
        onChange({ type: 'macro', value: macros[0]?.id || '' });
        break;
      case 'media':
        onChange({ type: 'media', value: 'Play / Pause' });
        break;
      case 'system':
        onChange({ type: 'system', value: 'Screenshot' });
        break;
      case 'open':
        onChange({ type: 'open', value: 'https://obsproject.com', meta: { openTargetType: 'url' } });
        break;
      case 'mouse':
        onChange({ type: 'mouse', value: 'left_click', meta: { mouseAction: 'left_click', mouseAmount: 3 } });
        break;
      case 'layer':
        onChange({ type: 'layer', value: '1', meta: { layerSwitchMode: 'toggle', targetLayerIndex: 1 } });
        break;
      case 'webhook':
        onChange({
          type: 'webhook',
          value: 'http://homeassistant.local:8123/api/webhook/studio_pad',
          meta: { webhookMethod: 'POST', webhookPayload: '{"state":"toggle"}' }
        });
        break;
      case 'multi':
        onChange({
          type: 'multi',
          value: 'sequence',
          meta: {
            multiSteps: [
              { id: 'ms-1', type: 'shortcut', value: 'Cmd+S', label: 'Save File', delayAfterMs: 100 },
              { id: 'ms-2', type: 'media', value: 'Play / Pause', label: 'Toggle Playback', delayAfterMs: 0 }
            ]
          }
        });
        break;
      default:
        onChange({ type: 'none', value: '' });
    }
  };

  const handleTestWebhook = async () => {
    if (!binding.value) return;
    setWebhookTesting(true);
    setWebhookStatus(null);
    try {
      const method = binding.meta?.webhookMethod || 'POST';
      await fetch(binding.value, {
        method,
        headers: method !== 'GET' ? { 'Content-Type': 'application/json' } : undefined,
        body: method !== 'GET' && binding.meta?.webhookPayload ? binding.meta.webhookPayload : undefined,
        mode: 'no-cors'
      });
      setWebhookStatus('Dispatched');
      onToast?.('Webhook request dispatched');
    } catch (_) {
      setWebhookStatus('Unreachable (check CORS/host)');
    } finally {
      setWebhookTesting(false);
    }
  };

  const addMultiStep = () => {
    const existing = binding.meta?.multiSteps || [];
    const nextStep: MultiStepAction = {
      id: `ms-${Date.now()}`,
      type: 'shortcut',
      value: 'Cmd+K',
      label: 'Shortcut Step',
      delayAfterMs: 80
    };
    onChange({
      ...binding,
      meta: { ...binding.meta, multiSteps: [...existing, nextStep] }
    });
  };

  const updateMultiStep = (id: string, patch: Partial<MultiStepAction>) => {
    const existing = binding.meta?.multiSteps || [];
    onChange({
      ...binding,
      meta: {
        ...binding.meta,
        multiSteps: existing.map(s => (s.id === id ? { ...s, ...patch } : s))
      }
    });
  };

  const moveMultiStep = (idx: number, dir: -1 | 1) => {
    const existing = [...(binding.meta?.multiSteps || [])];
    const target = idx + dir;
    if (target < 0 || target >= existing.length) return;
    const [removed] = existing.splice(idx, 1);
    existing.splice(target, 0, removed);
    onChange({
      ...binding,
      meta: { ...binding.meta, multiSteps: existing }
    });
  };

  const removeMultiStep = (id: string) => {
    const existing = binding.meta?.multiSteps || [];
    onChange({
      ...binding,
      meta: { ...binding.meta, multiSteps: existing.filter(s => s.id !== id) }
    });
  };

  return (
    <div className="space-y-3">
      {/* Action Category Grid */}
      <div>
        <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1.5">
          Action Type
        </label>
        <div className={`grid ${compact ? 'grid-cols-3' : 'grid-cols-3 sm:grid-cols-4'} gap-1.5`}>
          {ACTION_TYPES.map(item => {
            const Icon = item.icon;
            const active = binding.type === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectType(item.id)}
                style={
                  active
                    ? {
                        borderColor: 'var(--accent)',
                        backgroundColor: 'rgba(var(--accent-rgb), 0.14)',
                        color: 'var(--text-primary)'
                      }
                    : undefined
                }
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer whitespace-nowrap truncate ${
                  active
                    ? 'font-semibold'
                    : 'bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Contextual Action Configuration */}
      {binding.type === 'shortcut' && (
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-[var(--text-secondary)]">
              Keystroke Combination
            </span>
            <span className="text-[11px] font-mono text-[var(--text-muted)]">
              Layout: {keyboardLayout.replace('_', ' ').toUpperCase()}
            </span>
          </div>

          <button
            ref={recorderRef}
            type="button"
            onClick={() => setIsRecording(prev => !prev)}
            style={
              isRecording
                ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 2px rgba(var(--accent-rgb), 0.25)' }
                : undefined
            }
            className="w-full py-2.5 px-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-strong)] text-left flex items-center justify-between transition-all cursor-pointer"
          >
            <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">
              {isRecording ? 'Press keys on keyboard…' : binding.value || 'Click to record shortcut'}
            </span>
            <span
              className="text-[11px] font-medium px-2 py-0.5 rounded-md whitespace-nowrap"
              style={{
                backgroundColor: isRecording ? 'var(--accent)' : 'var(--bg-elevated)',
                color: isRecording ? '#FFFFFF' : 'var(--text-secondary)'
              }}
            >
              {isRecording ? 'Listening' : 'Record'}
            </span>
          </button>

          <div>
            <span className="block text-[11px] text-[var(--text-muted)] mb-1">Quick Assign Key</span>
            <div className="flex flex-wrap gap-1">
              {QUICK_KEYS.map(k => (
                <button
                  key={k}
                  type="button"
                  onClick={() => onChange({ ...binding, value: k })}
                  className="px-2 py-1 rounded-md bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] font-mono text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer transition-colors whitespace-nowrap"
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {binding.type === 'text' && (
        <div className="space-y-1.5 pt-1">
          <label className="block text-[11px] font-medium text-[var(--text-secondary)]">
            Text Snippet to Type
          </label>
          <textarea
            rows={3}
            value={binding.value}
            onChange={e => onChange({ ...binding, value: e.target.value })}
            placeholder="Enter boilerplate text, code snippet, or response…"
            className="w-full rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-[var(--accent)] px-3 py-2 text-xs font-mono text-[var(--text-primary)] focus:outline-none resize-none"
          />
        </div>
      )}

      {binding.type === 'macro' && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-medium text-[var(--text-secondary)]">
              Macro Sequence
            </label>
            {onNavigateToMacros && (
              <button
                type="button"
                onClick={onNavigateToMacros}
                style={{ color: 'var(--accent)' }}
                className="text-[11px] font-semibold hover:underline cursor-pointer whitespace-nowrap"
              >
                Open Macro Editor
              </button>
            )}
          </div>
          <select
            value={binding.value}
            onChange={e => onChange({ ...binding, value: e.target.value })}
            className="w-full rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
          >
            {macros.length === 0 && <option value="">No macros created yet</option>}
            {macros.map(m => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.steps.length} steps)
              </option>
            ))}
          </select>
        </div>
      )}

      {binding.type === 'media' && (
        <div className="space-y-1.5 pt-1">
          <label className="block text-[11px] font-medium text-[var(--text-secondary)]">
            Media Transport Command
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {MEDIA_OPTIONS.map(opt => {
              const selected = binding.value === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onChange({ ...binding, value: opt })}
                  style={
                    selected
                      ? { borderColor: 'var(--accent)', backgroundColor: 'rgba(var(--accent-rgb), 0.14)' }
                      : undefined
                  }
                  className="px-2.5 py-2 rounded-lg text-xs text-left border border-[var(--border-subtle)] bg-[var(--bg-input)] text-[var(--text-primary)] hover:border-[var(--border-strong)] cursor-pointer whitespace-nowrap truncate"
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {binding.type === 'system' && (
        <div className="space-y-1.5 pt-1">
          <label className="block text-[11px] font-medium text-[var(--text-secondary)]">
            OS System Action
          </label>
          <select
            value={binding.value}
            onChange={e => onChange({ ...binding, value: e.target.value })}
            className="w-full rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
          >
            {SYSTEM_OPTIONS.map(opt => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      )}

      {binding.type === 'open' && (
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)]">
            {(['app', 'file', 'url'] as const).map(targetType => {
              const active = (binding.meta?.openTargetType || 'url') === targetType;
              return (
                <button
                  key={targetType}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...binding,
                      meta: { ...binding.meta, openTargetType: targetType }
                    })
                  }
                  style={active ? { backgroundColor: 'var(--accent)', color: '#FFFFFF' } : undefined}
                  className={`flex-1 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    active ? 'font-semibold' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {targetType === 'app' ? 'Application' : targetType === 'file' ? 'File Path' : 'URL'}
                </button>
              );
            })}
          </div>
          <input
            type="text"
            value={binding.value}
            onChange={e => onChange({ ...binding, value: e.target.value })}
            placeholder={
              binding.meta?.openTargetType === 'app'
                ? 'e.g. /Applications/Figma.app or Spotify'
                : binding.meta?.openTargetType === 'file'
                ? 'e.g. ~/Documents/StudioNotes.md'
                : 'https://...'
            }
            className="w-full rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 py-2 text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
      )}

      {binding.type === 'mouse' && (
        <div className="space-y-2.5 pt-1">
          <label className="block text-[11px] font-medium text-[var(--text-secondary)]">
            Mouse Event
          </label>
          <select
            value={binding.meta?.mouseAction || 'left_click'}
            onChange={e =>
              onChange({
                ...binding,
                value: e.target.value,
                meta: { ...binding.meta, mouseAction: e.target.value as any }
              })
            }
            className="w-full rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
          >
            <option value="left_click">Left Click</option>
            <option value="right_click">Right Click</option>
            <option value="middle_click">Middle Click</option>
            <option value="double_click">Double Click</option>
            <option value="scroll_up">Scroll Up</option>
            <option value="scroll_down">Scroll Down</option>
            <option value="scroll_left">Scroll Left</option>
            <option value="scroll_right">Scroll Right</option>
            <option value="move_xy">Move Cursor (Delta X/Y)</option>
          </select>

          {(binding.meta?.mouseAction || '').startsWith('scroll_') && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-[var(--text-secondary)]">Scroll Lines</span>
              <input
                type="number"
                min={1}
                max={20}
                value={binding.meta?.mouseAmount ?? 3}
                onChange={e =>
                  onChange({
                    ...binding,
                    meta: { ...binding.meta, mouseAmount: Number(e.target.value) }
                  })
                }
                className="w-20 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-mono tabular-nums text-right text-[var(--text-primary)]"
              />
            </div>
          )}

          {binding.meta?.mouseAction === 'move_xy' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[11px] text-[var(--text-muted)] block mb-1">Delta X (px)</span>
                <input
                  type="number"
                  value={binding.meta?.mouseAmount ?? 50}
                  onChange={e =>
                    onChange({
                      ...binding,
                      meta: { ...binding.meta, mouseAmount: Number(e.target.value) }
                    })
                  }
                  className="w-full rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-2.5 py-1.5 text-xs font-mono tabular-nums text-[var(--text-primary)]"
                />
              </div>
              <div>
                <span className="text-[11px] text-[var(--text-muted)] block mb-1">Delta Y (px)</span>
                <input
                  type="number"
                  value={binding.meta?.mouseY ?? 0}
                  onChange={e =>
                    onChange({
                      ...binding,
                      meta: { ...binding.meta, mouseY: Number(e.target.value) }
                    })
                  }
                  className="w-full rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-2.5 py-1.5 text-xs font-mono tabular-nums text-[var(--text-primary)]"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {binding.type === 'layer' && (
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)]">
            {(
              [
                { id: 'momentary', label: 'Momentary' },
                { id: 'toggle', label: 'Toggle Layer' },
                { id: 'profile', label: 'Profile' }
              ] as const
            ).map(m => {
              const active = (binding.meta?.layerSwitchMode || 'toggle') === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...binding,
                      meta: { ...binding.meta, layerSwitchMode: m.id }
                    })
                  }
                  style={active ? { backgroundColor: 'var(--accent)', color: '#FFFFFF' } : undefined}
                  className={`flex-1 py-1 rounded-md text-[11px] font-medium cursor-pointer whitespace-nowrap ${
                    active ? 'font-semibold' : 'text-[var(--text-secondary)]'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          {(binding.meta?.layerSwitchMode || 'toggle') !== 'profile' ? (
            <div className="grid grid-cols-4 gap-1.5">
              {[0, 1, 2, 3].map(idx => {
                const selected = (binding.meta?.targetLayerIndex ?? 1) === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() =>
                      onChange({
                        ...binding,
                        value: String(idx),
                        meta: { ...binding.meta, targetLayerIndex: idx }
                      })
                    }
                    style={
                      selected
                        ? { borderColor: 'var(--accent)', backgroundColor: 'rgba(var(--accent-rgb), 0.15)' }
                        : undefined
                    }
                    className="py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                  >
                    Layer {idx + 1}
                  </button>
                );
              })}
            </div>
          ) : (
            <select
              value={binding.meta?.targetProfileId || profiles[0]?.id || ''}
              onChange={e =>
                onChange({
                  ...binding,
                  value: e.target.value,
                  meta: { ...binding.meta, targetProfileId: e.target.value }
                })
              }
              className="w-full rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-primary)]"
            >
              {profiles.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {binding.type === 'webhook' && (
        <div className="space-y-2.5 pt-1">
          <div className="flex gap-1.5">
            <select
              value={binding.meta?.webhookMethod || 'POST'}
              onChange={e =>
                onChange({
                  ...binding,
                  meta: { ...binding.meta, webhookMethod: e.target.value as any }
                })
              }
              className="rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] px-2.5 py-2 text-xs font-mono text-[var(--text-primary)]"
            >
              <option value="POST">POST</option>
              <option value="GET">GET</option>
              <option value="PUT">PUT</option>
            </select>
            <input
              type="text"
              value={binding.value}
              onChange={e => onChange({ ...binding, value: e.target.value })}
              placeholder="http://homeassistant.local:8123/api/webhook/..."
              className="flex-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 py-2 text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          {(binding.meta?.webhookMethod || 'POST') !== 'GET' && (
            <textarea
              rows={2}
              value={binding.meta?.webhookPayload || ''}
              onChange={e =>
                onChange({
                  ...binding,
                  meta: { ...binding.meta, webhookPayload: e.target.value }
                })
              }
              placeholder='{"entity_id": "light.studio_keylight"}'
              className="w-full rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-mono text-[var(--text-primary)] resize-none focus:outline-none focus:border-[var(--accent)]"
            />
          )}

          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-[var(--text-muted)]">
              {webhookStatus || 'OBS / Home Assistant / Script'}
            </span>
            <button
              type="button"
              onClick={handleTestWebhook}
              disabled={webhookTesting}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--bg-elevated)] hover:opacity-90 border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
            >
              {webhookStatus === 'Dispatched' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Play className="w-3 h-3" />}
              <span>{webhookTesting ? 'Sending…' : 'Test Webhook'}</span>
            </button>
          </div>
        </div>
      )}

      {binding.type === 'multi' && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-[var(--text-secondary)]">
              Sequential Steps ({(binding.meta?.multiSteps || []).length})
            </span>
            <button
              type="button"
              onClick={addMultiStep}
              style={{ color: 'var(--accent)' }}
              className="flex items-center gap-1 text-xs font-semibold hover:underline cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Step</span>
            </button>
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
            {(binding.meta?.multiSteps || []).map((step, idx) => (
              <div
                key={step.id}
                className="p-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-1.5"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-[var(--text-muted)] tabular-nums w-4">
                    {idx + 1}.
                  </span>
                  <select
                    value={step.type}
                    onChange={e => updateMultiStep(step.id, { type: e.target.value as any })}
                    className="rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] px-1.5 py-1 text-[11px] text-[var(--text-primary)]"
                  >
                    <option value="shortcut">Shortcut</option>
                    <option value="media">Media</option>
                    <option value="text">Text</option>
                    <option value="webhook">Webhook</option>
                  </select>
                  <input
                    type="text"
                    value={step.value}
                    onChange={e => updateMultiStep(step.id, { value: e.target.value })}
                    className="flex-1 min-w-0 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] px-2 py-1 text-[11px] font-mono text-[var(--text-primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => moveMultiStep(idx, -1)}
                    className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                    title="Move Up"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveMultiStep(idx, 1)}
                    className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                    title="Move Down"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeMultiStep(step.id)}
                    className="p-1 text-rose-400 hover:text-rose-300 cursor-pointer"
                    title="Remove Step"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex items-center justify-end gap-2 text-[11px] text-[var(--text-muted)]">
                  <span>Wait after:</span>
                  <input
                    type="number"
                    min={0}
                    max={5000}
                    step={10}
                    value={step.delayAfterMs}
                    onChange={e => updateMultiStep(step.id, { delayAfterMs: Number(e.target.value) })}
                    className="w-16 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] px-1.5 py-0.5 text-right font-mono tabular-nums text-[var(--text-primary)]"
                  />
                  <span className="font-mono">ms</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {binding.type === 'none' && (
        <p className="text-xs text-[var(--text-muted)] pt-1">
          This trigger is disabled and sends no output when activated.
        </p>
      )}
    </div>
  );
};
