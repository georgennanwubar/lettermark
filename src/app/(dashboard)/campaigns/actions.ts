'use server';

/**
 * campaigns/actions.ts — Server actions for campaign mutations.
 *
 * Keeping these in the route folder (vs a global /actions) so each page
 * collocates the mutations it triggers — easier to follow.
 */

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { campaigns } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth/session';
import { emptyDocument } from '@/lib/email/blocks';
import { renderEmail } from '@/lib/email/render';
import { enqueueCampaign } from '@/lib/queue/sender';

export type ActionResult = { ok: boolean; error?: string; id?: number };

const createSchema = z.object({
  subject: z.string().min(1, 'Subject is required').max(998),
  type: z.enum(['standard', 'automation', 'autoresponder', 'rss', 'transactional']).default('standard'),
});

export async function createCampaign(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { account, user } = await requireAuth();
  const parsed = createSchema.safeParse({
    subject: formData.get('subject'),
    type: formData.get('type') || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const [row] = await db
    .insert(campaigns)
    .values({
      accountId: account.id,
      subject: parsed.data.subject,
      type: parsed.data.type,
      fromName: account.defaultFromName,
      fromEmail: account.defaultFromEmail,
      replyTo: account.defaultReplyTo,
      contentJson: emptyDocument(),
      createdBy: user.id,
    })
    .returning({ id: campaigns.id });

  revalidatePath('/campaigns');
  redirect(`/campaigns/${row.id}/edit`);
}

const updateSchema = z.object({
  id: z.coerce.number().int(),
  subject: z.string().max(998).optional(),
  preheader: z.string().max(255).optional(),
  fromName: z.string().max(191).optional(),
  fromEmail: z.string().email().max(191).optional(),
  replyTo: z.string().email().max(191).optional(),
  contentJson: z.any().optional(),
  trackOpens: z.boolean().optional(),
  trackClicks: z.boolean().optional(),
});

export async function updateCampaign(payload: z.infer<typeof updateSchema>): Promise<ActionResult> {
  const { account } = await requireAuth();
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: 'Invalid update payload' };

  const { id, contentJson, ...rest } = parsed.data;

  // Render fresh HTML if content changed
  let contentHtml: string | undefined;
  let contentText: string | undefined;
  if (contentJson) {
    const r = await renderEmail(contentJson);
    contentHtml = r.html;
    contentText = r.text;
  }

  await db
    .update(campaigns)
    .set({
      ...rest,
      ...(contentJson ? { contentJson, contentHtml, contentText } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(campaigns.id, id), eq(campaigns.accountId, account.id)));

  revalidatePath(`/campaigns/${id}`);
  revalidatePath(`/campaigns`);
  return { ok: true, id };
}

export async function sendCampaign(formData: FormData): Promise<void> {
  const { account } = await requireAuth();
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return;

  // Verify ownership
  const c = await db.query.campaigns.findFirst({
    where: and(eq(campaigns.id, id), eq(campaigns.accountId, account.id)),
  });
  if (!c) return;

  // Materialize the queue, then mark sending. Worker picks up the queued rows.
  const total = await enqueueCampaign(id);
  await db
    .update(campaigns)
    .set({ status: 'sending', totalRecipients: total, sentAt: null })
    .where(eq(campaigns.id, id));

  revalidatePath('/campaigns');
  redirect(`/campaigns/${id}`);
}

export async function deleteCampaign(formData: FormData): Promise<void> {
  const { account } = await requireAuth();
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return;
  await db.delete(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.accountId, account.id)));
  revalidatePath('/campaigns');
  redirect('/campaigns');
}
