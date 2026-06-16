/**
 * webhook-utils.ts — Shared helpers for ingesting provider webhooks.
 *
 * Each provider exposes a different webhook payload shape (and different
 * signing scheme). This module gives us the common bottleneck:
 *   recordBounce(email, hard?, reason?)
 *   recordComplaint(email, reason?)
 *
 * It updates the subscriber's status appropriately and inserts the
 * corresponding action_bounces / action_complaints row.
 */
import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  subscribers,
  actionBounces,
  actionComplaints,
  campaigns,
} from '@/lib/db/schema';

export async function recordBounce(opts: {
  email: string;
  accountId?: number; // narrow to one account if known
  campaignId?: number;
  hard?: boolean;
  reason?: string;
}) {
  const where = opts.accountId
    ? and(eq(subscribers.email, opts.email), eq(subscribers.accountId, opts.accountId))
    : eq(subscribers.email, opts.email);

  const matched = await db.query.subscribers.findMany({ where });
  for (const sub of matched) {
    await db.insert(actionBounces).values({
      campaignId: opts.campaignId ?? null,
      subscriberId: sub.id,
      hard: !!opts.hard,
      reason: opts.reason ?? null,
    });

    // Hard bounces and repeated soft bounces -> mark hard_bounced (Mailster-style).
    if (opts.hard) {
      await db
        .update(subscribers)
        .set({ status: 'hard_bounced', updatedAt: new Date() })
        .where(eq(subscribers.id, sub.id));
    } else {
      // Count soft bounces; after 3, treat as hard.
      const [{ n }] = await db
        .select({ n: sql<number>`COUNT(*)::int` })
        .from(actionBounces)
        .where(and(eq(actionBounces.subscriberId, sub.id), eq(actionBounces.hard, false)));
      if (Number(n) >= 3) {
        await db
          .update(subscribers)
          .set({ status: 'soft_bounced', updatedAt: new Date() })
          .where(eq(subscribers.id, sub.id));
      }
    }

    if (opts.campaignId) {
      await db
        .update(campaigns)
        .set({ bounceCount: sql`${campaigns.bounceCount} + 1` })
        .where(eq(campaigns.id, opts.campaignId));
    }
  }
}

export async function recordComplaint(opts: {
  email: string;
  accountId?: number;
  campaignId?: number;
  reason?: string;
}) {
  const where = opts.accountId
    ? and(eq(subscribers.email, opts.email), eq(subscribers.accountId, opts.accountId))
    : eq(subscribers.email, opts.email);
  const matched = await db.query.subscribers.findMany({ where });
  for (const sub of matched) {
    await db.insert(actionComplaints).values({
      campaignId: opts.campaignId ?? null,
      subscriberId: sub.id,
    });
    await db
      .update(subscribers)
      .set({ status: 'complained', updatedAt: new Date() })
      .where(eq(subscribers.id, sub.id));
  }
}
