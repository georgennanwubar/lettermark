'use server';

import { eq, sql } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { subscribers, actionUnsubs, campaigns } from '@/lib/db/schema';
import { verifyTracking } from '@/lib/email/tracking';

export async function unsubscribeAction(formData: FormData): Promise<void> {
  const hash = String(formData.get('hash') || '');
  const sig = String(formData.get('signature') || '');
  const campaignIdRaw = String(formData.get('campaignId') || '');
  const campaignId = campaignIdRaw ? Number(campaignIdRaw) : null;
  const reason = (formData.get('reason')?.toString() || '').slice(0, 1000) || null;

  if (!hash || !sig) return;
  if (!verifyTracking(`${campaignId ?? 0}:${hash}`, sig)) return;

  const sub = await db.query.subscribers.findFirst({ where: eq(subscribers.hash, hash) });
  if (!sub) return;

  await db
    .update(subscribers)
    .set({ status: 'unsubscribed', unsubscribeAt: new Date(), updatedAt: new Date() })
    .where(eq(subscribers.id, sub.id));

  await db.insert(actionUnsubs).values({
    campaignId: campaignId,
    subscriberId: sub.id,
    reason,
  });

  if (campaignId) {
    await db
      .update(campaigns)
      .set({ unsubscribeCount: sql`${campaigns.unsubscribeCount} + 1` })
      .where(eq(campaigns.id, campaignId));
  }

  redirect('/unsubscribe/done');
}
