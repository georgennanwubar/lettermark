'use server';

/**
 * /profile — Update preferences action.
 *
 * Re-validates the HMAC signature server-side (never trust the hidden form
 * fields alone) before writing anything.
 */
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { subscribers } from '@/lib/db/schema';
import { verifyTracking } from '@/lib/email/tracking';

export async function updateProfileAction(formData: FormData): Promise<void> {
  const hash = String(formData.get('hash') || '');
  const sig = String(formData.get('signature') || '');
  if (!hash || !sig || !verifyTracking(hash, sig)) return;

  const sub = await db.query.subscribers.findFirst({ where: eq(subscribers.hash, hash) });
  if (!sub) return;

  const firstName = (formData.get('firstName')?.toString() || '').slice(0, 191) || null;
  const lastName = (formData.get('lastName')?.toString() || '').slice(0, 191) || null;

  await db
    .update(subscribers)
    .set({ firstName, lastName, updatedAt: new Date() })
    .where(eq(subscribers.id, sub.id));

  redirect(`/profile?s=${hash}&t=${sig}&saved=1`);
}
