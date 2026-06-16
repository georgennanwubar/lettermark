'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { tags } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth/session';

const createSchema = z.object({
  name: z.string().min(1).max(64),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export async function createTag(_prev: any, formData: FormData) {
  const { account } = await requireAuth();
  const parsed = createSchema.safeParse({
    name: formData.get('name'),
    color: formData.get('color') || undefined,
  });
  if (!parsed.success) return { ok: false, error: 'Name is required' };
  try {
    await db.insert(tags).values({
      accountId: account.id,
      name: parsed.data.name,
      color: parsed.data.color ?? null,
    });
  } catch (err: any) {
    if (String(err?.message).includes('duplicate')) return { ok: false, error: 'A tag with this name already exists.' };
    throw err;
  }
  revalidatePath('/tags');
  return { ok: true };
}

export async function deleteTag(formData: FormData) {
  const { account } = await requireAuth();
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return;
  await db.delete(tags).where(and(eq(tags.accountId, account.id), eq(tags.id, id)));
  revalidatePath('/tags');
}
