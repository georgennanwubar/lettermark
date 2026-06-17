'use server';

/**
 * settings/actions.ts — Account settings + delivery (email provider) config.
 *
 * Storing provider credentials in the `emailProviders` table; the queue worker
 * reads from there when sending. The active provider is the most recently
 * updated one for each account (simple — a "default" flag could be added).
 */
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { accounts, emailProviders } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth/session';

const accountSchema = z.object({
  name: z.string().min(1).max(191),
  defaultFromName: z.string().max(191).optional().nullable(),
  defaultFromEmail: z.string().email().max(191).optional().nullable(),
  defaultReplyTo: z.string().email().max(191).optional().nullable(),
});

export type AccountActionState = { ok: boolean; error?: string };

export async function updateAccount(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const { account } = await requireAuth();
  const parsed = accountSchema.safeParse({
    name: formData.get('name'),
    defaultFromName: formData.get('defaultFromName') || null,
    defaultFromEmail: formData.get('defaultFromEmail') || null,
    defaultReplyTo: formData.get('defaultReplyTo') || null,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  await db
    .update(accounts)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(accounts.id, account.id));
  revalidatePath('/settings');
  return { ok: true };
}

const providerSchema = z.object({
  kind: z.enum(['smtp', 'resend', 'mailgun', 'sendgrid', 'postmark', 'ses']),
  name: z.string().min(1).max(191),
  credentials: z.record(z.string()),
});

export async function upsertProvider(payload: z.infer<typeof providerSchema>) {
  const { account } = await requireAuth();
  const parsed = providerSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: 'Invalid provider config' };

  // For the MVP we keep one provider per account; replace any existing.
  await db.delete(emailProviders).where(eq(emailProviders.accountId, account.id));
  await db.insert(emailProviders).values({
    accountId: account.id,
    kind: parsed.data.kind,
    name: parsed.data.name,
    credentials: parsed.data.credentials,
    isDefault: true,
  });
  revalidatePath('/settings');
  return { ok: true };
}
