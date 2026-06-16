/**
 * Segment compiler.
 *
 * Mailster's `conditions.class.php` lets users build complex audience filters
 * with AND/OR groups: e.g. "subscribed to list A AND (opened any campaign in
 * last 30d OR tagged 'vip')".
 *
 * We model the same as a JSON tree → compile to a parameterised SQL fragment
 * that can be appended to a SELECT. Stays read-only from user input by binding
 * every value through Drizzle's `sql.raw` carefully or using placeholders.
 *
 * Filter shape:
 *   {
 *     op: 'and' | 'or',
 *     rules: Array<Rule | FilterGroup>,
 *   }
 *
 *   Rule = {
 *     field: 'email' | 'firstName' | 'lastName' | 'status' | 'createdAt' |
 *            'country' | 'rating' | 'list' | 'tag' | 'opened' | 'clicked' |
 *            'custom:<key>',
 *     op: 'eq' | 'neq' | 'contains' | 'starts_with' | 'ends_with' |
 *         'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in' |
 *         'before' | 'after' | 'within_days',
 *     value: string | number | string[] | number[],
 *   }
 */

import { sql, type SQL } from 'drizzle-orm';

export type RuleOp =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'starts_with'
  | 'ends_with'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'not_in'
  | 'before'
  | 'after'
  | 'within_days';

export interface Rule {
  field: string;
  op: RuleOp;
  value: string | number | string[] | number[];
}

export interface FilterGroup {
  op: 'and' | 'or';
  rules: Array<Rule | FilterGroup>;
}

const ALLOWED_DIRECT_FIELDS = new Set([
  'email',
  'first_name',
  'last_name',
  'status',
  'created_at',
  'country',
  'rating',
  'timezone',
  'locale',
]);

function fieldColumn(field: string): { col: SQL; isJsonb?: boolean; isJoin?: string } | null {
  // Map camelCase rule fields to snake_case columns
  const snake = field.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
  if (ALLOWED_DIRECT_FIELDS.has(snake)) {
    return { col: sql.raw(`s."${snake}"`) };
  }
  if (snake === 'list' || snake === 'tag' || snake === 'opened' || snake === 'clicked') {
    return { col: sql.raw(`s.id`), isJoin: snake };
  }
  if (snake.startsWith('custom:')) {
    const key = snake.slice('custom:'.length).replace(/[^a-zA-Z0-9_]/g, '');
    if (!key) return null;
    return { col: sql.raw(`s.custom_fields->>'${key}'`), isJsonb: true };
  }
  return null;
}

function compileRule(rule: Rule): SQL | null {
  const f = fieldColumn(rule.field);
  if (!f) return null;

  // Join-style rules: existence checks against side tables.
  if (f.isJoin) {
    const v = rule.value;
    switch (f.isJoin) {
      case 'list':
        return sql`EXISTS (
          SELECT 1 FROM list_subscribers ls
          WHERE ls.subscriber_id = s.id
          AND ls.list_id = ANY(${Array.isArray(v) ? v : [v]}::bigint[])
        )`;
      case 'tag':
        return sql`EXISTS (
          SELECT 1 FROM tag_subscribers ts
          WHERE ts.subscriber_id = s.id
          AND ts.tag_id = ANY(${Array.isArray(v) ? v : [v]}::bigint[])
        )`;
      case 'opened':
        // Value = number of days to look back, or 0 = ever
        return sql`EXISTS (
          SELECT 1 FROM action_opens ao
          WHERE ao.subscriber_id = s.id
          ${Number(v) > 0 ? sql`AND ao.occurred_at >= NOW() - (${Number(v)} || ' days')::interval` : sql``}
        )`;
      case 'clicked':
        return sql`EXISTS (
          SELECT 1 FROM action_clicks ac
          WHERE ac.subscriber_id = s.id
          ${Number(v) > 0 ? sql`AND ac.occurred_at >= NOW() - (${Number(v)} || ' days')::interval` : sql``}
        )`;
    }
  }

  const col = f.col;
  switch (rule.op) {
    case 'eq':
      return sql`${col} = ${rule.value}`;
    case 'neq':
      return sql`${col} <> ${rule.value}`;
    case 'contains':
      return sql`${col} ILIKE ${'%' + String(rule.value) + '%'}`;
    case 'starts_with':
      return sql`${col} ILIKE ${String(rule.value) + '%'}`;
    case 'ends_with':
      return sql`${col} ILIKE ${'%' + String(rule.value)}`;
    case 'gt':
      return sql`${col} > ${rule.value}`;
    case 'gte':
      return sql`${col} >= ${rule.value}`;
    case 'lt':
      return sql`${col} < ${rule.value}`;
    case 'lte':
      return sql`${col} <= ${rule.value}`;
    case 'in':
      return sql`${col} = ANY(${Array.isArray(rule.value) ? rule.value : [rule.value]})`;
    case 'not_in':
      return sql`${col} <> ALL(${Array.isArray(rule.value) ? rule.value : [rule.value]})`;
    case 'before':
      return sql`${col} < ${rule.value}`;
    case 'after':
      return sql`${col} > ${rule.value}`;
    case 'within_days':
      return sql`${col} >= NOW() - (${Number(rule.value)} || ' days')::interval`;
    default:
      return null;
  }
}

/** Compile a filter group into a single SQL WHERE fragment. */
export function compileFilter(group: FilterGroup): SQL | null {
  const parts: SQL[] = [];
  for (const r of group.rules) {
    if ('rules' in r) {
      const inner = compileFilter(r);
      if (inner) parts.push(sql`(${inner})`);
    } else {
      const compiled = compileRule(r);
      if (compiled) parts.push(compiled);
    }
  }
  if (parts.length === 0) return null;
  const sep = group.op === 'or' ? sql` OR ` : sql` AND `;
  return parts.reduce((acc, p, i) => (i === 0 ? p : sql`${acc}${sep}${p}`));
}

/**
 * Convenience: count how many subscribers match a filter for an account.
 * The caller is responsible for prefixing the subscriber table as `s`.
 */
export async function countMatchingSubscribers(
  accountId: number,
  filter: FilterGroup | null,
  db: { execute: (q: SQL) => Promise<{ rows: Array<{ count: string }> }> }
): Promise<number> {
  const where = filter ? compileFilter(filter) : null;
  const res = await db.execute(sql`
    SELECT COUNT(*)::text AS count
    FROM subscribers s
    WHERE s.account_id = ${accountId}
      AND s.status = 'subscribed'
      ${where ? sql`AND (${where})` : sql``}
  `);
  return Number(res.rows[0]?.count ?? 0);
}
