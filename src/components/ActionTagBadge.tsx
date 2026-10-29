import React from 'react';
import { TextMacroRepeatConfig } from '../types/studio';
import {
  ParsedActionToken,
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
    text: "text-sky-300 [:root[data-theme='light']_&]:text-sky-700",
    border: 'border-sky-500/35'
  },
  KEY: {
    bg: 'bg-violet-500/15',
    text: "text-violet-300 [:root[data-theme='light']_&]:text-violet-700",
    border: 'border-violet-500/35'
  },
  MACRO: {
    bg: 'bg-indigo-500/15',
    text: "text-indigo-300 [:root[data-theme='light']_&]:text-indigo-700",
    border: 'border-indigo-500/35'
  },
  WIN: {
    bg: 'bg-blue-500/15',
    text: "text-blue-300 [:root[data-theme='light']_&]:text-blue-700",
    border: 'border-blue-500/35'
  },
  BLE: {
    bg: 'bg-cyan-500/15',
    text: "text-cyan-300 [:root[data-theme='light']_&]:text-cyan-700",
    border: 'border-cyan-500/35'
  },
  SHORTCUT: {
    bg: 'bg-amber-500/15',
    text: "text-amber-300 [:root[data-theme='light']_&]:text-amber-700",
    border: 'border-amber-500/35'
  },
  TEXT: {
    bg: 'bg-emerald-500/15',
    text: "text-emerald-300 [:root[data-theme='light']_&]:text-emerald-700",
    border: 'border-emerald-500/35'
  },
  TV: {
    bg: 'bg-teal-500/15',
    text: "text-teal-300 [:root[data-theme='light']_&]:text-teal-700",
    border: 'border-teal-500/35'
  },
  TVKEY: {
    bg: 'bg-teal-500/15',
    text: "text-teal-300 [:root[data-theme='light']_&]:text-teal-700",
    border: 'border-teal-500/35'
  },
  APP: {
    bg: 'bg-rose-500/15',
    text: "text-rose-300 [:root[data-theme='light']_&]:text-rose-700",
    border: 'border-rose-500/35'
  },
  TVAPP: {
    bg: 'bg-rose-500/15',
    text: "text-rose-300 [:root[data-theme='light']_&]:text-rose-700",
    border: 'border-rose-500/35'
  },
  WAIT: {
    bg: 'bg-slate-500/15',
    text: "text-slate-300 [:root[data-theme='light']_&]:text-slate-700",
    border: 'border-slate-500/35'
  },
  DELAY: {
    bg: 'bg-slate-500/15',
    text: "text-slate-300 [:root[data-theme='light']_&]:text-slate-700",
    border: 'border-slate-500/35'
  },
  SEQ: {
    bg: 'bg-fuchsia-500/15',
    text: "text-fuchsia-300 [:root[data-theme='light']_&]:text-fuchsia-700",
    border: 'border-fuchsia-500/35'
  }
};

const DEFAULT_PREFIX_STYLE: PrefixTagTheme = {
  bg: 'bg-sky-500/15',
  text: "text-sky-300 [:root[data-theme='light']_&]:text-sky-700",
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

/**
 * Stylized rectangular colored tag box for parsed 'KEY:VALUE' action prefixes
 * (e.g. MEDIA, KEY, MACRO, WIN, BLE, SHORTCUT, TEXT, TV, APP, WAIT).
 */
export const ActionPrefixTag: React.FC<ActionPrefixTagProps> = ({
  prefix,
  size = 'xs',
  className = ''
}) => {
  if (!prefix) return null;
  const upper = prefix.toUpperCase();
  const theme = getPrefixTagStyle(upper);
  const sizeClasses =
    size === 'sm'
      ? 'px-1.5 py-0.5 text-[10px]'
      : 'px-1.5 py-[2px] text-[9px]';

  return (
    <span
      className={`inline-flex items-center justify-center rounded-md border font-mono font-bold uppercase tracking-wider leading-none shrink-0 select-none ${sizeClasses} ${theme.bg} ${theme.text} ${theme.border} ${className}`}
    >
      {upper}
    </span>
  );
};

interface ParsedActionBadgeProps {
  action: string | undefined | null;
  repeatConfig?: TextMacroRepeatConfig;
  /**
   * 'value' renders the stripped value after ':' (e.g. [MEDIA] PLAY_PAUSE, [KEY] F15).
   * 'friendly' renders the human label alongside the tag (e.g. [MEDIA] Play / Pause).
   */
  labelMode?: 'value' | 'friendly';
  size?: 'xs' | 'sm';
  maxSteps?: number;
  className?: string;
  valueClassName?: string;
}

/**
 * Automatically parses 'KEY:VALUE' strings (and '||' multi-step sequences), removes the 'KEY:'
 * prefix, renders 'KEY' as a stylized colored tag box, and keeps the stripped value as the main label.
 */
export const ParsedActionBadge: React.FC<ParsedActionBadgeProps> = ({
  action,
  repeatConfig,
  labelMode = 'value',
  size = 'xs',
  maxSteps = 2,
  className = '',
  valueClassName = ''
}) => {
  const parsed = parseActionKeyValue(action, repeatConfig);

  if (parsed.isUnassigned) {
    return (
      <span
        className={`font-mono text-[11px] text-[var(--text-muted)] truncate ${className}`}
      >
        Unassigned
      </span>
    );
  }

  const renderTokenLabel = (tok: ParsedActionToken) =>
    labelMode === 'friendly' ? tok.prettyValue : tok.value;

  if (parsed.isMultiStep && parsed.tokens.length > 1) {
    const visible = parsed.tokens.slice(0, maxSteps);
    const remaining = parsed.tokens.length - visible.length;

    return (
      <span
        className={`inline-flex items-center gap-1.5 min-w-0 max-w-full flex-wrap ${className}`}
      >
        {visible.map((tok, idx) => (
          <React.Fragment key={`${tok.rawAction}-${idx}`}>
            {idx > 0 && (
              <span
                aria-hidden="true"
                className="text-[10px] text-[var(--text-muted)] font-mono shrink-0"
              >
                →
              </span>
            )}
            <span className="inline-flex items-center gap-1 min-w-0 max-w-[160px]">
              <ActionPrefixTag prefix={tok.prefix} size={size} />
              <span
                className={`font-mono truncate text-[var(--text-primary)] ${
                  size === 'sm' ? 'text-xs font-medium' : 'text-[10px]'
                } ${valueClassName}`}
              >
                {renderTokenLabel(tok)}
              </span>
            </span>
          </React.Fragment>
        ))}
        {remaining > 0 && (
          <span className="font-mono text-[10px] text-[var(--text-muted)] tabular-nums shrink-0">
            +{remaining}
          </span>
        )}
        {parsed.repeatBadge && (
          <span className="font-mono text-[10px] text-emerald-300 [:root[data-theme='light']_&]:text-emerald-700 font-semibold tabular-nums shrink-0">
            {parsed.repeatBadge}
          </span>
        )}
      </span>
    );
  }

  const mainLabel =
    labelMode === 'friendly' ? parsed.prettyLabel : parsed.value;

  return (
    <span
      className={`inline-flex items-center gap-1.5 min-w-0 max-w-full ${className}`}
    >
      <ActionPrefixTag prefix={parsed.prefix} size={size} />
      <span
        className={`font-mono truncate text-[var(--text-primary)] ${
          size === 'sm' ? 'text-xs font-semibold' : 'text-[10px] font-medium'
        } ${valueClassName}`}
      >
        {mainLabel}
      </span>
      {parsed.repeatBadge && (
        <span className="font-mono text-[10px] text-emerald-300 [:root[data-theme='light']_&]:text-emerald-700 font-semibold tabular-nums shrink-0">
          {parsed.repeatBadge}
        </span>
      )}
    </span>
  );
};
