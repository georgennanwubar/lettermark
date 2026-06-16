'use server';

/**
 * lists/actions.ts — Create / update / delete lists.
 */
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { lists } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth/session';

const createSchema = z.object({
  name: z.string().min(1).max(191),
  description: z.string().max(1000).optional().nullable(),
});

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'list';
}

export async function createList(_prev: any, formData: FormData) {
  const { account } = await requireAuth();
  const parsed = createSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') || null,
  });
  if (!parsed.success) return { ok: false, error: 'Name is required' };

  const slug = `${slugify(parsed.data.name)}-${Math.random().toString(36).slice(2, 5)}`;
  await db.insert(lists).values({
    accountId: account.id,
    name: parsed.data.name,
    slug,
    description: parsed.data.description,
  });
  revalidatePath('/lists');
  return { ok: true };
}

export async function deleteList(formData: FormData) {
  const { account } = await requireAuth();
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return;
  await db.delete(lists).where(and(eq(lists.accountId, account.id), eq(lists.id, id)));
  revalidatePath('/lists');
}
