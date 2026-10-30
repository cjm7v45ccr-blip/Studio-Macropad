import React from 'react';
import { CustomMacroItem, TextMacroRepeatConfig } from '../types/studio';
import {
  ParsedActionToken,
  getMacroCanonicalSignature,
  parseActionKeyValue
} from '../data/firmwareCatalog';

export interface PrefixTagTheme {
  bg: string;
  text: string;
  border: string;
}

const PREFIX_STYLE_MAP: Record<string, PrefixTagTheme> = {
  MEDIA: {
    bg: 'bg-sky-500/15',
    text: 'text-sky-700 dark:text-sky-300',
    border: 'border-sky-500/35'
  },
  KEY: {
    bg: 'bg-violet-500/15',
    text: 'text-violet-700 dark:text-violet-300',
    border: 'border-violet-500/35'
  },
  MACRO: {
    bg: 'bg-indigo-500/15',
    text: 'text-indigo-700 dark:text-indigo-300',
    border: 'border-indigo-500/35'
  },
  WIN: {
    bg: 'bg-blue-500/15',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-500/35'
  },
  BLE: {
    bg: 'bg-cyan-500/15',
    text: 'text-cyan-700 dark:text-cyan-300',
    border: 'border-cyan-500/35'
  },
  SHORTCUT: {
    bg: 'bg-amber-500/15',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-500/35'
  },
  TEXT: {
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-500/35'
  },
  TV: {
    bg: 'bg-teal-500/15',
    text: 'text-teal-700 dark:text-teal-300',
    border: 'border-teal-500/35'
  },
  TVKEY: {
    bg: 'bg-teal-500/15',
    text: 'text-teal-700 dark:text-teal-300',
    border: 'border-teal-500/35'
  },
  APP: {
    bg: 'bg-rose-500/15',
    text: 'text-rose-700 dark:text-rose-300',
    border: 'border-rose-500/35'
  },
  TVAPP: {
    bg: 'bg-rose-500/15',
    text: 'text-rose-700 dark:text-rose-300',
    border: 'border-rose-500/35'
  },
  WAIT: {
    bg: 'bg-slate-500/15',
    text: 'text-slate-700 dark:text-slate-300',
    border: 'border-slate-500/35'
  },
  DELAY: {
    bg: 'bg-slate-500/15',
    text: 'text-slate-700 dark:text-slate-300',
    border: 'border-slate-500/35'
  },
  SEQ: {
    bg: 'bg-fuchsia-500/15',
    text: 'text-fuchsia-700 dark:text-fuchsia-300',
    border: 'border-fuchsia-500/35'
  }
};

const DEFAULT_PREFIX_STYLE: PrefixTagTheme = {
  bg: 'bg-sky-500/15',
  text: 'text-sky-700 dark:text-sky-300',
  border: 'border-sky-500/35'
};

export function getPrefixTagStyle(prefix: string | null | undefined): PrefixTagTheme {
  if (!prefix) return DEFAULT_PREFIX_STYLE;
  return PREFIX_STYLE_MAP[prefix.toUpperCase()] || DEFAULT_PREFIX_STYLE;
}

interface ActionPrefixTagProps {
  prefix: string | null | undefined;
  size?: 'xs' | 'sm';
  className?: string;
}

export const ActionPrefixTag: React.FC<ActionPrefixTagProps> = () => {
  return null;
};

interface ParsedActionBadgeProps {
  action: string | undefined | null;
  repeatConfig?: TextMacroRepeatConfig;
  customMacros?: CustomMacroItem[];
  /**
   * Defaults to 'friendly' so raw IDs like PLAY_PAUSE and VOL_DOWN stay hidden
   * behind hover tooltips unless showRawId / labelMode='value' is requested.
   */
  labelMode?: 'value' | 'friendly';
  showRawId?: boolean;
  size?: 'xs' | 'sm';
  maxSteps?: number;
  className?: string;
  valueClassName?: string;
}

export const ParsedActionBadge: React.FC<ParsedActionBadgeProps> = ({
  action,
  repeatConfig,
  customMacros,
  labelMode = 'friendly',
  showRawId = false,
  size = 'xs',
  maxSteps = 2,
  className = '',
  valueClassName = ''
}) => {
  const parsed = parseActionKeyValue(action, repeatConfig);

  if (parsed.isUnassigned) {
    return (
      <span
        className={`text-[11px] text-[var(--text-muted)] truncate ${className}`}
      >
        Unassigned
      </span>
    );
  }

  const useRaw = showRawId || labelMode === 'value';
  const rawHoverTitle = action ? `${parsed.prettyLabel} (${action})` : undefined;

  if (!useRaw && customMacros && customMacros.length > 0 && action) {
    const sig = getMacroCanonicalSignature(action, repeatConfig);
    const matched = sig
      ? customMacros.find(
          m => getMacroCanonicalSignature(m.action, m.repeatConfig) === sig
        )
      : undefined;
    if (matched) {
      return (
        <span
          title={`${matched.name} (${action})`}
          className={`inline-flex items-center gap-1.5 min-w-0 max-w-full ${className}`}
        >
          <span
            className={`truncate text-[var(--text-primary)] ${
              size === 'sm' ? 'text-xs font-semibold' : 'text-[11px] font-medium'
            } ${valueClassName}`}
          >
            {matched.name}
          </span>
          {parsed.repeatBadge && (
            <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-semibold tabular-nums shrink-0">
              {parsed.repeatBadge}
            </span>
          )}
        </span>
      );
    }
  }

  const renderTokenLabel = (tok: ParsedActionToken) =>
    useRaw ? tok.value : tok.prettyValue;

  if (parsed.isMultiStep && parsed.tokens.length > 1) {
    const visible = parsed.tokens.slice(0, maxSteps);
    const remaining = parsed.tokens.length - visible.length;

    return (
      <span
        title={rawHoverTitle}
        className={`inline-flex items-center gap-1.5 min-w-0 max-w-full flex-wrap ${className}`}
      >
        {visible.map((tok, idx) => (
          <React.Fragment key={`${tok.rawAction}-${idx}`}>
            {idx > 0 && (
              <span
                aria-hidden="true"
                className="text-[10px] text-[var(--text-muted)] shrink-0"
              >
                →
              </span>
            )}
            <span className="inline-flex items-center gap-1 min-w-0 max-w-[160px]">
              <ActionPrefixTag prefix={tok.prefix} size={size} />
              <span
                className={`truncate text-[var(--text-primary)] ${
                  useRaw ? 'font-mono' : ''
                } ${
                  size === 'sm' ? 'text-xs font-medium' : 'text-[11px]'
                } ${valueClassName}`}
              >
                {renderTokenLabel(tok)}
              </span>
            </span>
          </React.Fragment>
        ))}
        {remaining > 0 && (
          <span className="text-[10px] text-[var(--text-muted)] tabular-nums shrink-0">
            +{remaining}
          </span>
        )}
        {parsed.repeatBadge && (
          <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-semibold tabular-nums shrink-0">
            {parsed.repeatBadge}
          </span>
        )}
      </span>
    );
  }

  const mainLabel = useRaw ? parsed.value : parsed.prettyLabel;

  return (
    <span
      title={rawHoverTitle}
      className={`inline-flex items-center gap-1.5 min-w-0 max-w-full ${className}`}
    >
      <ActionPrefixTag prefix={parsed.prefix} size={size} />
      <span
        className={`truncate text-[var(--text-primary)] ${
          useRaw ? 'font-mono' : ''
        } ${
          size === 'sm' ? 'text-xs font-semibold' : 'text-[11px] font-medium'
        } ${valueClassName}`}
      >
        {mainLabel}
      </span>
      {parsed.repeatBadge && (
        <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-semibold tabular-nums shrink-0">
          {parsed.repeatBadge}
        </span>
      )}
    </span>
  );
};
