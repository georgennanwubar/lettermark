/**
 * Send queue.
 *
 * Mailster's queue table stores one row per (campaign × subscriber).
 * We do the same in our `queue` table — but on Postgres with `SELECT ... FOR
 * UPDATE SKIP LOCKED` so multiple workers can drain it safely without locks
 * fighting each other.
 *
 * Two entry points:
 *  - `enqueueCampaign(campaignId)` — materialises queue rows for one campaign
 *  - `drainOnce(opts)`            — pull a batch, send them, mark them
 *
 * The worker process (`scripts/worker.ts`) just calls `drainOnce()` in a loop.
 */

import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  campaigns,
  queue,
  subscribers,
  links as linksTable,
  actionSent,
  sendLog,
  listSubscribers,
  tagSubscribers,
  emailProviders,
} from '@/lib/db/schema';
import { renderEmail } from '@/lib/email/render';
import {
  instrumentHtml,
  openPixelUrl,
  unsubscribeUrl,
  profileUrl,
  webVersionUrl,
} from '@/lib/email/tracking';
import { replaceMergeTags } from '@/lib/email/merge-tags';
import { makeProvider, makeEnvProvider } from '@/lib/email/providers';
import type { EmailProvider, ProviderCredentials } from '@/lib/email/types';
import type { EmailDocument } from '@/lib/email/blocks';

// ─── Enqueue ───────────────────────────────────────────────────────────────

/**
 * Build queue rows for a campaign based on its `audience` JSON.
 * Returns the number of recipients queued.
 *
 * Idempotent: ON CONFLICT DO NOTHING on (campaign_id, subscriber_id).
 */
export async function enqueueCampaign(campaignId: number): Promise<number> {
  const camp = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  });
  if (!camp) throw new Error(`Campaign ${campaignId} not found`);
  if (!['draft', 'scheduled'].includes(camp.status)) {
    throw new Error(`Campaign ${campaignId} is in state ${camp.status}, cannot enqueue`);
  }

  const audience = camp.audience ?? {};
  const includeLists = audience.lists ?? [];
  const includeTags = audience.tags ?? [];
  const excludeLists = audience.excludeLists ?? [];
  const excludeTags = audience.excludeTags ?? [];

  // Build a subquery of eligible subscriber ids.
  // Subscriber must be `subscribed`, belong to the campaign's account, and
  // satisfy at least one list/tag include (or "everyone" if none specified).
  const recipientRows = await db.execute<{ id: number }>(sql`
    SELECT DISTINCT s.id
    FROM ${subscribers} s
    WHERE s.account_id = ${camp.accountId}
      AND s.status = 'subscribed'
      AND (
        ${includeLists.length === 0 && includeTags.length === 0}
        OR s.id IN (
          SELECT subscriber_id FROM ${listSubscribers}
          WHERE list_id = ANY(${includeLists}::bigint[])
          UNION
          SELECT subscriber_id FROM ${tagSubscribers}
          WHERE tag_id = ANY(${includeTags}::bigint[])
        )
      )
      AND s.id NOT IN (
        SELECT subscriber_id FROM ${listSubscribers}
        WHERE list_id = ANY(${excludeLists}::bigint[])
        UNION
        SELECT subscriber_id FROM ${tagSubscribers}
        WHERE tag_id = ANY(${excludeTags}::bigint[])
      )
  `);

  const ids = recipientRows.rows.map((r) => r.id);
  if (ids.length === 0) return 0;

  // Bulk insert in chunks (avoid Postgres parameter limits).
  const sendAt = camp.scheduledFor ?? new Date();
  const CHUNK = 2_000;
  let inserted = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const res = await db
      .insert(queue)
      .values(
        chunk.map((subscriberId) => ({
          campaignId,
          subscriberId,
          state: 'pending' as const,
          sendAt,
          priority: 0,
        }))
      )
      .onConflictDoNothing()
      .returning({ id: queue.id });
    inserted += res.length;
  }

  await db
    .update(campaigns)
    .set({ status: 'queued', totalRecipients: ids.length, updatedAt: new Date() })
    .where(eq(campaigns.id, campaignId));

  return inserted;
}

// ─── Worker ────────────────────────────────────────────────────────────────

const providerCache = new Map<string, EmailProvider>();

async function providerForCampaign(accountId: number): Promise<EmailProvider> {
  // Prefer account-configured default provider, fall back to env config.
  const provider = await db.query.emailProviders.findFirst({
    where: and(eq(emailProviders.accountId, accountId), eq(emailProviders.isDefault, true)),
  });
  if (!provider) return makeEnvProvider();
  const key = `acct:${accountId}:p:${provider.id}`;
  const cached = providerCache.get(key);
  if (cached) return cached;
  const made = makeProvider(provider.credentials as ProviderCredentials);
  providerCache.set(key, made);
  return made;
}

export interface DrainOptions {
  batchSize?: number;
  /** If set, only process queue items for this campaign — used by tests / preview */
  campaignId?: number;
}

export interface DrainResult {
  processed: number;
  sent: number;
  failed: number;
}

/**
 * Pull a batch of pending queue items and send them.
 * Returns once the batch is drained.
 */
export async function drainOnce(opts: DrainOptions = {}): Promise<DrainResult> {
  const batchSize = opts.batchSize ?? 50;

  // SKIP LOCKED is the magic: many workers can each grab a different slice
  // of the queue without ever blocking on a row lock.
  const claimedRows = await db.execute<{ id: number; campaign_id: number; subscriber_id: number }>(sql`
    UPDATE ${queue}
    SET state = 'sending', attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM ${queue}
      WHERE state = 'pending'
        AND send_at <= NOW()
        ${opts.campaignId ? sql`AND campaign_id = ${opts.campaignId}` : sql``}
      ORDER BY priority DESC, send_at ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, campaign_id, subscriber_id
  `);

  const claimed = claimedRows.rows;
  if (claimed.length === 0) return { processed: 0, sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  // Group by campaign so we render once per campaign and reuse the link map.
  const byCampaign = new Map<number, typeof claimed>();
  for (const row of claimed) {
    if (!byCampaign.has(row.campaign_id)) byCampaign.set(row.campaign_id, []);
    byCampaign.get(row.campaign_id)!.push(row);
  }

  for (const [campaignId, rows] of byCampaign) {
    const camp = await db.query.campaigns.findFirst({ where: eq(campaigns.id, campaignId) });
    if (!camp || !camp.contentJson) {
      failed += rows.length;
      await db
        .update(queue)
        .set({ state: 'failed', lastError: 'campaign missing or empty' })
        .where(inArray(queue.id, rows.map((r) => r.id)));
      continue;
    }

    // Render the campaign once into HTML/text with merge tags still inside.
    const rendered = renderEmail(camp.contentJson as EmailDocument);

    // Build / fetch link rows for the campaign so click-tracking IDs are stable.
    // (Naive version: regex every URL out of the HTML and upsert.)
    const urls = uniqueUrls(rendered.html);
    let linkRows = await db.query.links.findMany({
      where: eq(linksTable.campaignId, campaignId),
    });
    const knownUrls = new Set(linkRows.map((l) => l.url));
    const newUrls = urls.filter((u) => !knownUrls.has(u));
    if (newUrls.length > 0) {
      const inserted = await db
        .insert(linksTable)
        .values(newUrls.map((url) => ({ campaignId, url })))
        .returning();
      linkRows = [...linkRows, ...inserted];
    }
    const linkIdByUrl = new Map(linkRows.map((l) => [l.url, l.id]));

    const provider = await providerForCampaign(camp.accountId);

    for (const row of rows) {
      try {
        const sub = await db.query.subscribers.findFirst({
          where: eq(subscribers.id, row.subscriber_id),
        });
        if (!sub) {
          await db.update(queue).set({ state: 'skipped' }).where(eq(queue.id, row.id));
          failed++;
          continue;
        }
        if (sub.status !== 'subscribed') {
          await db
            .update(queue)
            .set({ state: 'skipped', lastError: `status=${sub.status}` })
            .where(eq(queue.id, row.id));
          continue;
        }

        // Per-subscriber instrumentation: rewrite links, add open pixel,
        // resolve merge tags.
        const tracked = instrumentHtml(
          rendered.html,
          campaignId,
          sub.hash,
          (u) => linkIdByUrl.get(u) ?? 0,
          { trackOpens: camp.trackOpens, trackClicks: camp.trackClicks }
        );

        const ctx = {
          subscriber: sub,
          campaignId,
          urls: {
            unsubscribe: unsubscribeUrl(campaignId, sub.hash),
            profile: profileUrl(sub.hash),
            webversion: webVersionUrl(campaignId, sub.hash),
          },
        };

        const finalHtml = replaceMergeTags(tracked.html, ctx);
        const finalText = replaceMergeTags(rendered.text, ctx);
        const finalSubject = replaceMergeTags(camp.subject, ctx);

        const result = await provider.send({
          from: {
            email: camp.fromEmail ?? process.env.MAIL_FROM_ADDRESS ?? 'noreply@example.com',
            name: camp.fromName ?? process.env.MAIL_FROM_NAME,
          },
          to: { email: sub.email, name: sub.firstName ?? undefined },
          replyTo: camp.replyTo ? { email: camp.replyTo } : undefined,
          subject: finalSubject,
          html: finalHtml,
          text: finalText,
          listUnsubscribe: `<${unsubscribeUrl(campaignId, sub.hash)}>`,
        });

        await db
          .update(queue)
          .set({
            state: result.success ? 'sent' : result.retryable ? 'pending' : 'failed',
            lastError: result.error,
            sentAt: result.success ? new Date() : undefined,
          })
          .where(eq(queue.id, row.id));

        await db.insert(sendLog).values({
          accountId: camp.accountId,
          campaignId,
          subscriberId: sub.id,
          messageId: result.providerMessageId,
          success: result.success,
          error: result.error,
        });

        if (result.success) {
          await db.insert(actionSent).values({ campaignId, subscriberId: sub.id });
          sent++;
        } else {
          failed++;
        }
      } catch (err) {
        failed++;
        await db
          .update(queue)
          .set({ state: 'failed', lastError: err instanceof Error ? err.message : String(err) })
          .where(eq(queue.id, row.id));
      }
    }

    // Update the campaign-level snapshot counters.
    await db
      .update(campaigns)
      .set({
        sentCount: sql`${campaigns.sentCount} + ${sent}`,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaignId));
  }

  // Mark campaigns finished if their queue is empty.
  await db.execute(sql`
    UPDATE ${campaigns}
    SET status = 'sent', sent_at = NOW()
    WHERE status IN ('queued', 'sending')
      AND NOT EXISTS (
        SELECT 1 FROM ${queue}
        WHERE campaign_id = ${campaigns}.id AND state IN ('pending', 'sending')
      )
  `);

  return { processed: claimed.length, sent, failed };
}

function uniqueUrls(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<a\s+[^>]*href=["']([^"']+)["']/gi)) {
    const url = m[1];
    if (/^(#|mailto:|tel:|javascript:)/i.test(url)) continue;
    if (/^\{[a-z]+\}$/i.test(url)) continue;
    out.add(url);
  }
  return [...out];
}
