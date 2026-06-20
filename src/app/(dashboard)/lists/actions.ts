'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { lists, listSubscribers, subscribers } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth/session';

const createSchema = z.object({
  name: z.string().min(1).max(191),
  description: z.string().max(1000).optional().nullable(),
});

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'list';
}

export type ListActionState = { ok: boolean; error?: string };

export async function createList(_prev: ListActionState, formData: FormData): Promise<ListActionState> {
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

const updateSchema = z.object({
  id: z.coerce.number().int(),
  name: z.string().min(1).max(191),
  description: z.string().max(1000).optional().nullable(),
});

export async function updateList(formData: FormData): Promise<void> {
  const { account } = await requireAuth();
  const parsed = updateSchema.safeParse({
    id: formData.get('id'),
    name: formData.get('name'),
    description: formData.get('description') || null,
  });
  if (!parsed.success) return;

  const { id, name, description } = parsed.data;
  await db
    .update(lists)
    .set({ name, description, updatedAt: new Date() })
    .where(and(eq(lists.accountId, account.id), eq(lists.id, id)));

  revalidatePath(`/lists/${id}`);
  revalidatePath('/lists');
}

export async function deleteList(formData: FormData) {
  const { account } = await requireAuth();
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return;
  await db.delete(lists).where(and(eq(lists.accountId, account.id), eq(lists.id, id)));
  revalidatePath('/lists');
}

export async function addToList(formData: FormData) {
  const { account } = await requireAuth();
  const listId = Number(formData.get('listId'));
  const subscriberId = Number(formData.get('subscriberId'));
  if (!Number.isFinite(listId) || !Number.isFinite(subscriberId)) return;

  // Verify subscriber belongs to account
  const [sub] = await db
    .select({ id: subscribers.id })
    .from(subscribers)
    .where(and(eq(subscribers.accountId, account.id), eq(subscribers.id, subscriberId)))
    .limit(1);
  if (!sub) return;

  // Verify list belongs to account
  const [list] = await db
    .select({ id: lists.id })
    .from(lists)
    .where(and(eq(lists.accountId, account.id), eq(lists.id, listId)))
    .limit(1);
  if (!list) return;

  await db.insert(listSubscribers).values({ listId, subscriberId }).onConflictDoNothing();
  revalidatePath(`/lists/${listId}`);
}

export async function removeFromList(formData: FormData) {
  const { account } = await requireAuth();
  const listId = Number(formData.get('listId'));
  const subscriberId = Number(formData.get('subscriberId'));
  if (!Number.isFinite(listId) || !Number.isFinite(subscriberId)) return;

  // Verify list belongs to account (security check)
  const [list] = await db
    .select({ id: lists.id })
    .from(lists)
    .where(and(eq(lists.accountId, account.id), eq(lists.id, listId)))
    .limit(1);
  if (!list) return;

  await db
    .delete(listSubscribers)
    .where(and(eq(listSubscribers.listId, listId), eq(listSubscribers.subscriberId, subscriberId)));
  revalidatePath(`/lists/${listId}`);
}
