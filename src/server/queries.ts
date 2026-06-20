/**
 * server/queries.ts — Server-only data access helpers.
 *
 * All queries are scoped to an accountId (number, bigserial). Pages call these
 * after resolving auth via requireAuth() — authorization is enforced at the
 * boundary and never forgotten in a downstream call.
 *
 * Tracking tables (action_*) don't carry an account_id column; instead they
 * reference campaigns, and we filter by joining to campaigns.account_id.
 */
import "server-only";
import { db } from "@/lib/db";
import {
  subscribers,
  campaigns,
  lists,
  tags,
  actionSent,
  actionOpens,
  actionClicks,
  actionBounces,
  actionUnsubs,
  forms,
  workflows,
  queue,
  listSubscribers as listSubsTable,
} from "@/lib/db/schema";
import { and, eq, gte, sql, desc, count, notExists } from "drizzle-orm";

/* ----- Helpers -------------------------------------------------------------- */

/**
 * EXISTS subquery filtering tracking-table rows down to one account.
 * Used because the action_* tables only carry campaign_id.
 */
function inAccount(accountId: number) {
  return sql<boolean>`EXISTS (SELECT 1 FROM ${campaigns} c WHERE c.id = campaign_id AND c.account_id = ${accountId})`;
}

/* ----- Overview ------------------------------------------------------------- */

export async function getOverviewStats(accountId: number) {
  const since = new Date(Date.now() - 30 * 86400_000);

  const [sub] = await db
    .select({
      total: count(),
      active: sql<number>`COUNT(*) FILTER (WHERE ${subscribers.status} = 'subscribed')::int`,
      pending: sql<number>`COUNT(*) FILTER (WHERE ${subscribers.status} = 'pending')::int`,
      unsubscribed: sql<number>`COUNT(*) FILTER (WHERE ${subscribers.status} = 'unsubscribed')::int`,
    })
    .from(subscribers)
    .where(eq(subscribers.accountId, accountId));

  const [camp] = await db
    .select({
      total: count(),
      draft: sql<number>`COUNT(*) FILTER (WHERE ${campaigns.status} = 'draft')::int`,
      sending: sql<number>`COUNT(*) FILTER (WHERE ${campaigns.status} = 'sending')::int`,
      sent: sql<number>`COUNT(*) FILTER (WHERE ${campaigns.status} = 'sent')::int`,
    })
    .from(campaigns)
    .where(eq(campaigns.accountId, accountId));

  // Tracking aggregates: filter via EXISTS on campaigns
  const [sentLast30] = await db
    .select({ n: count() })
    .from(actionSent)
    .where(and(inAccount(accountId), gte(actionSent.occurredAt, since)));

  const [opensLast30] = await db
    .select({ n: count() })
    .from(actionOpens)
    .where(and(inAccount(accountId), gte(actionOpens.occurredAt, since)));

  const [clicksLast30] = await db
    .select({ n: count() })
    .from(actionClicks)
    .where(and(inAccount(accountId), gte(actionClicks.occurredAt, since)));

  return {
    subscribers: sub ?? { total: 0, active: 0, pending: 0, unsubscribed: 0 },
    campaigns: camp ?? { total: 0, draft: 0, sending: 0, sent: 0 },
    sentLast30: Number(sentLast30?.n ?? 0),
    opensLast30: Number(opensLast30?.n ?? 0),
    clicksLast30: Number(clicksLast30?.n ?? 0),
  };
}

export async function getGrowthSeries(accountId: number, days = 30) {
  const since = new Date(Date.now() - days * 86400_000);
  const added = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${subscribers.createdAt}), 'YYYY-MM-DD')`,
      n: count(),
    })
    .from(subscribers)
    .where(and(eq(subscribers.accountId, accountId), gte(subscribers.createdAt, since)))
    .groupBy(sql`date_trunc('day', ${subscribers.createdAt})`);

  const removed = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${actionUnsubs.occurredAt}), 'YYYY-MM-DD')`,
      n: count(),
    })
    .from(actionUnsubs)
    .where(and(inAccount(accountId), gte(actionUnsubs.occurredAt, since)))
    .groupBy(sql`date_trunc('day', ${actionUnsubs.occurredAt})`);

  // Zero-fill the full window
  const map = new Map<string, { day: string; added: number; removed: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000);
    const key = d.toISOString().slice(0, 10);
    map.set(key, { day: key, added: 0, removed: 0 });
  }
  for (const r of added) {
    const e = map.get(r.day);
    if (e) e.added = Number(r.n);
  }
  for (const r of removed) {
    const e = map.get(r.day);
    if (e) e.removed = Number(r.n);
  }
  return Array.from(map.values());
}

/* ----- Campaigns ------------------------------------------------------------ */

export async function getRecentCampaigns(accountId: number, limit = 5) {
  return db
    .select({
      id: campaigns.id,
      name: sql<string>`COALESCE(${campaigns.subject}, '(untitled)')`,  // we use subject as name
      subject: campaigns.subject,
      status: campaigns.status,
      type: campaigns.type,
      sentAt: campaigns.sentAt,
      scheduledAt: campaigns.scheduledFor,
      createdAt: campaigns.createdAt,
      totalRecipients: campaigns.totalRecipients,
      totalSent: campaigns.sentCount,
      totalOpens: campaigns.openCount,
      totalClicks: campaigns.clickCount,
    })
    .from(campaigns)
    .where(eq(campaigns.accountId, accountId))
    .orderBy(desc(campaigns.createdAt))
    .limit(limit);
}

export async function listCampaigns(accountId: number, opts: { status?: string; type?: string } = {}) {
  const conds = [eq(campaigns.accountId, accountId)];
  if (opts.status) conds.push(eq(campaigns.status, opts.status as any));
  if (opts.type) conds.push(eq(campaigns.type, opts.type as any));
  return db.select().from(campaigns).where(and(...conds)).orderBy(desc(campaigns.createdAt));
}

export async function getCampaign(accountId: number, id: number) {
  const [row] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.accountId, accountId), eq(campaigns.id, id)))
    .limit(1);
  return row ?? null;
}

export async function getCampaignAnalytics(accountId: number, campaignId: number) {
  const campaignFilter = and(
    eq(campaigns.id, campaignId),
    eq(campaigns.accountId, accountId),
  );
  const c = await db.query.campaigns.findFirst({ where: campaignFilter });
  if (!c) return null;

  // All actions are scoped by campaign_id (which is unique per account already).
  const [sent] = await db.select({ n: count() }).from(actionSent).where(eq(actionSent.campaignId, campaignId));
  const [opens] = await db
    .select({ n: count(), unique: sql<number>`COUNT(DISTINCT ${actionOpens.subscriberId})::int` })
    .from(actionOpens)
    .where(eq(actionOpens.campaignId, campaignId));
  const [clicks] = await db
    .select({ n: count(), unique: sql<number>`COUNT(DISTINCT ${actionClicks.subscriberId})::int` })
    .from(actionClicks)
    .where(eq(actionClicks.campaignId, campaignId));
  const [bounces] = await db.select({ n: count() }).from(actionBounces).where(eq(actionBounces.campaignId, campaignId));
  const [unsubs] = await db.select({ n: count() }).from(actionUnsubs).where(eq(actionUnsubs.campaignId, campaignId));
  const [pending] = await db
    .select({ n: count() })
    .from(queue)
    .where(and(eq(queue.campaignId, campaignId), eq(queue.state, "pending")));

  return {
    campaign: c,
    sent: Number(sent?.n ?? 0),
    opens: Number(opens?.n ?? 0),
    uniqueOpens: Number(opens?.unique ?? 0),
    clicks: Number(clicks?.n ?? 0),
    uniqueClicks: Number(clicks?.unique ?? 0),
    bounces: Number(bounces?.n ?? 0),
    unsubs: Number(unsubs?.n ?? 0),
    pending: Number(pending?.n ?? 0),
  };
}

/* ----- Subscribers ---------------------------------------------------------- */

export async function listSubscribers(
  accountId: number,
  opts: { limit?: number; offset?: number; status?: string; search?: string } = {},
) {
  const { limit = 50, offset = 0, status, search } = opts;
  const conds = [eq(subscribers.accountId, accountId)];
  if (status) conds.push(eq(subscribers.status, status as any));
  if (search) conds.push(sql`${subscribers.email} ILIKE ${`%${search}%`}`);

  const [rows, [total]] = await Promise.all([
    db.select().from(subscribers).where(and(...conds)).orderBy(desc(subscribers.createdAt)).limit(limit).offset(offset),
    db.select({ n: count() }).from(subscribers).where(and(...conds)),
  ]);

  return { rows, total: Number(total?.n ?? 0) };
}

export async function getRecentSubscribers(accountId: number, limit = 5) {
  return db
    .select()
    .from(subscribers)
    .where(eq(subscribers.accountId, accountId))
    .orderBy(desc(subscribers.createdAt))
    .limit(limit);
}

export async function getSubscriber(accountId: number, id: number) {
  return db.query.subscribers.findFirst({
    where: and(eq(subscribers.accountId, accountId), eq(subscribers.id, id)),
  });
}

/* ----- Lists / Tags / Forms / Workflows ------------------------------------- */

export async function listLists(accountId: number) {
  return db
    .select({
      id: lists.id,
      name: lists.name,
      description: lists.description,
      createdAt: lists.createdAt,
      subscriberCount: sql<number>`(SELECT COUNT(*)::int FROM list_subscribers ls WHERE ls.list_id = ${lists.id})`,
    })
    .from(lists)
    .where(eq(lists.accountId, accountId))
    .orderBy(desc(lists.createdAt));
}

export async function getList(accountId: number, listId: number) {
  const [row] = await db
    .select({
      id: lists.id,
      name: lists.name,
      slug: lists.slug,
      description: lists.description,
      createdAt: lists.createdAt,
      subscriberCount: sql<number>`(SELECT COUNT(*)::int FROM list_subscribers ls WHERE ls.list_id = ${lists.id})`,
    })
    .from(lists)
    .where(and(eq(lists.accountId, accountId), eq(lists.id, listId)))
    .limit(1);
  return row ?? null;
}

export async function getListMembers(accountId: number, listId: number) {
  return db
    .select({
      id: subscribers.id,
      email: subscribers.email,
      firstName: subscribers.firstName,
      lastName: subscribers.lastName,
      status: subscribers.status,
      addedAt: listSubsTable.addedAt,
    })
    .from(listSubsTable)
    .innerJoin(subscribers, eq(subscribers.id, listSubsTable.subscriberId))
    .where(and(eq(listSubsTable.listId, listId), eq(subscribers.accountId, accountId)))
    .orderBy(desc(listSubsTable.addedAt));
}

export async function getSubscribersNotInList(accountId: number, listId: number, search?: string) {
  const conds = [eq(subscribers.accountId, accountId)];
  if (search) conds.push(sql`(${subscribers.email} ILIKE ${`%${search}%`} OR ${subscribers.firstName} ILIKE ${`%${search}%`} OR ${subscribers.lastName} ILIKE ${`%${search}%`})`);

  return db
    .select({
      id: subscribers.id,
      email: subscribers.email,
      firstName: subscribers.firstName,
      lastName: subscribers.lastName,
      status: subscribers.status,
    })
    .from(subscribers)
    .where(
      and(
        ...conds,
        notExists(
          db.select({ x: sql`1` }).from(listSubsTable)
            .where(and(eq(listSubsTable.listId, listId), eq(listSubsTable.subscriberId, subscribers.id)))
        )
      )
    )
    .orderBy(subscribers.email)
    .limit(100);
}

export async function listTags(accountId: number) {
  return db
    .select({
      id: tags.id,
      name: tags.name,
      color: tags.color,
      createdAt: tags.createdAt,
      subscriberCount: sql<number>`(SELECT COUNT(*)::int FROM tag_subscribers ts WHERE ts.tag_id = ${tags.id})`,
    })
    .from(tags)
    .where(eq(tags.accountId, accountId))
    .orderBy(desc(tags.createdAt));
}

export async function listForms(accountId: number) {
  return db.select().from(forms).where(eq(forms.accountId, accountId)).orderBy(desc(forms.createdAt));
}

export async function listWorkflows(accountId: number) {
  return db.select().from(workflows).where(eq(workflows.accountId, accountId)).orderBy(desc(workflows.createdAt));
}
