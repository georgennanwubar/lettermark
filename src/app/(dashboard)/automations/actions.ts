'use server';

/**
 * automations/actions.ts — Create / update / activate workflows.
 *
 * Graph editing is JSON-based for the MVP. A drag-drop visual builder is the
 * obvious next step but the runner (lib/automation/runner.ts) already supports
 * the full graph format, so swapping in a builder later is purely a frontend
 * change.
 */
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { workflows } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth/session';

const STARTER_GRAPH = {
  triggers: [{ id: 'trig-1', type: 'signup', next: 'n-1' }],
  nodes: [
    { id: 'n-1', type: 'delay', config: { minutes: 5 }, next: 'n-2' },
    { id: 'n-2', type: 'end' },
  ],
};

const createSchema = z.object({
  name: z.string().min(1).max(191),
  description: z.string().max(1000).optional().nullable(),
});

export type WorkflowActionState = { ok: boolean; error?: string };

export async function createWorkflow(_prev: WorkflowActionState, formData: FormData): Promise<WorkflowActionState> {
  const { account } = await requireAuth();
  const parsed = createSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') || null,
  });
  if (!parsed.success) return { ok: false, error: 'Name is required' };

  const [row] = await db
    .insert(workflows)
    .values({
      accountId: account.id,
      name: parsed.data.name,
      description: parsed.data.description,
      status: 'draft',
      graph: STARTER_GRAPH,
    })
    .returning({ id: workflows.id });
  revalidatePath('/automations');
  redirect(`/automations/${row.id}`);
}

const updateSchema = z.object({
  id: z.coerce.number().int(),
  name: z.string().max(191).optional(),
  description: z.string().max(1000).nullable().optional(),
  status: z.enum(['draft', 'active', 'paused']).optional(),
  graph: z.any().optional(),
});

export async function updateWorkflow(payload: z.infer<typeof updateSchema>) {
  const { account } = await requireAuth();
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: 'Invalid update' };
  const { id, ...rest } = parsed.data;
  await db
    .update(workflows)
    .set({ ...rest, updatedAt: new Date() })
    .where(and(eq(workflows.id, id), eq(workflows.accountId, account.id)));
  revalidatePath(`/automations/${id}`);
  revalidatePath('/automations');
  return { ok: true };
}

export async function deleteWorkflow(formData: FormData) {
  const { account } = await requireAuth();
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return;
  await db.delete(workflows).where(and(eq(workflows.accountId, account.id), eq(workflows.id, id)));
  revalidatePath('/automations');
  redirect('/automations');
}
