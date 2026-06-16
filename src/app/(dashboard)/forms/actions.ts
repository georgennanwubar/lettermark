'use server';

/**
 * forms/actions.ts — Create, update, delete signup forms.
 *
 * The form's `schema` JSON drives both the hosted page and the embed.
 * Field types: email, text, hidden, checkbox.
 */
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { forms } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth/session';

const defaultSchema = {
  title: 'Subscribe',
  description: 'Get the latest updates in your inbox.',
  buttonLabel: 'Subscribe',
  fields: [
    { key: 'email', type: 'email', label: 'Email', required: true, placeholder: 'you@example.com' },
    { key: 'firstName', type: 'text', label: 'First name', required: false },
  ],
};

const createSchema = z.object({
  name: z.string().min(1).max(191),
  type: z.enum(['inline', 'popup', 'embedded', 'landing']).default('inline'),
  doubleOptIn: z.coerce.boolean().default(true),
});

export async function createForm(_prev: any, formData: FormData) {
  const { account } = await requireAuth();
  const parsed = createSchema.safeParse({
    name: formData.get('name'),
    type: formData.get('type') || 'inline',
    doubleOptIn: formData.get('doubleOptIn') === 'on',
  });
  if (!parsed.success) return { ok: false, error: 'Invalid input' };
  const [row] = await db
    .insert(forms)
    .values({
      accountId: account.id,
      name: parsed.data.name,
      type: parsed.data.type,
      schema: defaultSchema,
      doubleOptIn: parsed.data.doubleOptIn,
    })
    .returning({ id: forms.id });
  revalidatePath('/forms');
  redirect(`/forms/${row.id}`);
}

const updateSchema = z.object({
  id: z.coerce.number().int(),
  name: z.string().max(191).optional(),
  doubleOptIn: z.coerce.boolean().optional(),
  successUrl: z.string().optional().nullable(),
  confirmRedirectUrl: z.string().optional().nullable(),
  schema: z.any().optional(),
});

export async function updateForm(payload: z.infer<typeof updateSchema>) {
  const { account } = await requireAuth();
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: 'Invalid update' };
  const { id, ...rest } = parsed.data;
  await db
    .update(forms)
    .set({ ...rest, updatedAt: new Date() })
    .where(and(eq(forms.id, id), eq(forms.accountId, account.id)));
  revalidatePath(`/forms/${id}`);
  revalidatePath('/forms');
  return { ok: true };
}

export async function deleteForm(formData: FormData) {
  const { account } = await requireAuth();
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return;
  await db.delete(forms).where(and(eq(forms.accountId, account.id), eq(forms.id, id)));
  revalidatePath('/forms');
  redirect('/forms');
}
