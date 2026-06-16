/**
 * Merge tag engine.
 *
 * Inspired by Mailster's placeholder.class.php — replaces {firstname}, {email},
 * {unsubscribe}, {webversion}, and account-specific custom-field tags with
 * subscriber-specific values at send time.
 *
 * Syntax supported:
 *   {tagname}                  → simple lookup
 *   {tagname | default}        → fallback if value is empty
 *   {firstname | "friend"}     → quoted defaults are allowed
 *   {date format="YYYY"}       → arg-style (only "date" uses this in v1)
 *   {if tag}…{/if}             → conditional block
 *   {if tag}…{else}…{/if}      → conditional with else
 *
 * Anything not recognised is left in place — we never throw inside a render.
 */

import type { Subscriber } from '@/lib/db/schema';

export interface MergeContext {
  subscriber: Pick<
    Subscriber,
    'id' | 'hash' | 'email' | 'firstName' | 'lastName' | 'customFields'
  >;
  campaignId?: number;
  /** Pre-built URLs the engine will splice in for `{unsubscribe}`, `{webversion}`, etc. */
  urls: {
    unsubscribe: string;
    profile: string;
    webversion: string;
    forward?: string;
  };
  /** Extras the caller wants exposed to templates */
  extra?: Record<string, unknown>;
}

// ─── Tag resolvers ─────────────────────────────────────────────────────────

type Resolver = (ctx: MergeContext, args?: Record<string, string>) => string;

const builtinTags: Record<string, Resolver> = {
  email: (c) => c.subscriber.email,
  firstname: (c) => c.subscriber.firstName ?? '',
  lastname: (c) => c.subscriber.lastName ?? '',
  fullname: (c) =>
    [c.subscriber.firstName, c.subscriber.lastName].filter(Boolean).join(' ').trim(),
  // System links — already formatted into ctx.urls
  unsubscribe: (c) => c.urls.unsubscribe,
  profile: (c) => c.urls.profile,
  webversion: (c) => c.urls.webversion,
  forward: (c) => c.urls.forward ?? '',
  // Dates
  date: (_c, args) => {
    const fmt = args?.format ?? 'YYYY-MM-DD';
    const d = new Date();
    return fmt
      .replace('YYYY', String(d.getFullYear()))
      .replace('MM', String(d.getMonth() + 1).padStart(2, '0'))
      .replace('DD', String(d.getDate()).padStart(2, '0'));
  },
  year: () => String(new Date().getFullYear()),
};

function resolveTag(name: string, ctx: MergeContext, args?: Record<string, string>): string | null {
  const lower = name.toLowerCase();
  const built = builtinTags[lower];
  if (built) return built(ctx, args);
  // Custom fields next
  const fields = ctx.subscriber.customFields ?? {};
  if (lower in fields) return String(fields[lower as keyof typeof fields] ?? '');
  // Extras passed by the caller
  if (ctx.extra && lower in ctx.extra) return String(ctx.extra[lower] ?? '');
  return null;
}

// ─── Parsing ───────────────────────────────────────────────────────────────

const TAG_RE = /\{([a-z0-9_]+)(\s*\|\s*(?:"([^"]*)"|'([^']*)'|([^}]+)))?(\s+([a-z]+="[^"]*"\s*)+)?\}/gi;
const COND_RE = /\{if\s+([a-z0-9_]+)\}([\s\S]*?)(?:\{else\}([\s\S]*?))?\{\/if\}/gi;

function parseArgs(raw: string | undefined): Record<string, string> | undefined {
  if (!raw) return undefined;
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(/(\w+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

/**
 * Replace merge tags in a string. Safe to call on any text or HTML payload —
 * we do not parse HTML so attribute placement is preserved.
 */
export function replaceMergeTags(input: string, ctx: MergeContext): string {
  if (!input) return input;

  // 1. Conditionals first so empty values render their {else} branch.
  let out = input.replace(COND_RE, (_, tag, ifBlock, elseBlock = '') => {
    const value = resolveTag(tag, ctx);
    return value && value.length > 0 ? ifBlock : elseBlock;
  });

  // 2. Single-tag replacements.
  out = out.replace(TAG_RE, (full, name, _g2, qDef, qDef2, plainDef, _g6) => {
    const args = parseArgs(_g6);
    const value = resolveTag(name, ctx, args);
    if (value && value.length > 0) return value;
    return qDef ?? qDef2 ?? plainDef ?? full; // leave unrecognised alone
  });

  return out;
}

/**
 * Return a list of all tags found in the input — useful for the editor's
 * "missing merge tags" warning.
 */
export function extractMergeTags(input: string): string[] {
  const found = new Set<string>();
  for (const m of input.matchAll(TAG_RE)) found.add(m[1].toLowerCase());
  for (const m of input.matchAll(COND_RE)) found.add(m[1].toLowerCase());
  return [...found];
}
