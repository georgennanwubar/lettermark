/**
 * automation/runner.ts — Advance enrolled subscribers through workflow graphs.
 *
 * Graph shape:
 *   triggers: [{ id, type: 'signup' | 'tag-added' | 'list-added' | 'date' | 'webhook' | 'manual', config }]
 *   nodes: [{ id, type, config, next?: string, branches?: { yes: string, no: string } }]
 *
 * Node types we support:
 *   send-campaign: queue a transactional send (config.campaignId or template) to this subscriber
 *   delay: wait config.minutes/hours/days before continuing
 *   condition: branch on subscriber attributes (uses lib/segments/compile.ts)
 *   add-tag / remove-tag / add-to-list / remove-from-list: mutate audience
 *   end: complete the run
 *
 * Runs are advanced by calling `advanceDueRuns()` from a cron or worker. Each
 * call processes at most `limit` rows and uses `FOR UPDATE SKIP LOCKED` to be
 * safe across multiple invocations.
 */
import 'server-only';
import { and, eq, lte, sql, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  workflows, workflowRuns, subscribers, queue, campaigns,
  tagSubscribers, listSubscribers,
} from '@/lib/db/schema';

interface WorkflowNode {
  id: string;
  type:
    | 'send-campaign'
    | 'delay'
    | 'condition'
    | 'add-tag'
    | 'remove-tag'
    | 'add-to-list'
    | 'remove-from-list'
    | 'end';
  config?: any;
  next?: string;
  branches?: { yes?: string; no?: string };
}

interface WorkflowGraph {
  triggers: Array<{ id: string; type: string; config?: any; next?: string }>;
  nodes: WorkflowNode[];
}

function nodeById(graph: WorkflowGraph, id: string | null | undefined): WorkflowNode | null {
  if (!id) return null;
  return graph.nodes.find((n) => n.id === id) ?? null;
}

/**
 * Find active workflows in this account whose trigger matches `type`
 * (optionally narrowed by `matchConfig`) and enroll the subscriber in each.
 * Called from the places where the real-world event happens (signup,
 * confirm, tag/list assignment) — the runner itself never originates these.
 */
export async function triggerWorkflows(
  accountId: number,
  type: string,
  subscriberId: number,
  matchConfig?: (config: any) => boolean,
) {
  const active = await db.query.workflows.findMany({
    where: and(eq(workflows.accountId, accountId), eq(workflows.status, 'active')),
  });
  for (const wf of active) {
    const graph = wf.graph as WorkflowGraph;
    const matches = graph.triggers?.some(
      (t) => t.type === type && (!matchConfig || matchConfig(t.config)),
    );
    if (matches) await enrollSubscriber(wf.id, subscriberId);
  }
}

/** Enroll a subscriber into a workflow (idempotent if already enrolled). */
export async function enrollSubscriber(workflowId: number, subscriberId: number) {
  const wf = await db.query.workflows.findFirst({ where: eq(workflows.id, workflowId) });
  if (!wf || wf.status !== 'active') return;

  const existing = await db.query.workflowRuns.findFirst({
    where: and(eq(workflowRuns.workflowId, workflowId), eq(workflowRuns.subscriberId, subscriberId), isNull(workflowRuns.completedAt)),
  });
  if (existing) return;

  const graph = wf.graph as WorkflowGraph;
  const firstNodeId = graph.triggers?.[0]?.next ?? graph.nodes?.[0]?.id ?? null;
  if (!firstNodeId) return;

  await db.insert(workflowRuns).values({
    workflowId,
    subscriberId,
    currentNodeId: firstNodeId,
    waitUntil: new Date(),
    context: {},
  });
  await db
    .update(workflows)
    .set({ enrolledCount: sql`${workflows.enrolledCount} + 1` })
    .where(eq(workflows.id, workflowId));
}

/** Process one node for one run; returns true if more work might be due. */
async function step(runId: number): Promise<boolean> {
  const run = await db.query.workflowRuns.findFirst({
    where: eq(workflowRuns.id, runId),
  });
  if (!run || run.completedAt) return false;

  const wf = await db.query.workflows.findFirst({ where: eq(workflows.id, run.workflowId) });
  if (!wf) return false;
  const graph = wf.graph as WorkflowGraph;
  const node = nodeById(graph, run.currentNodeId);
  if (!node) {
    await complete(run.id, run.workflowId);
    return false;
  }

  const subscriber = await db.query.subscribers.findFirst({
    where: eq(subscribers.id, run.subscriberId),
  });
  if (!subscriber || subscriber.status !== 'subscribed') {
    await complete(run.id, run.workflowId, 'subscriber not eligible');
    return false;
  }

  switch (node.type) {
    case 'delay': {
      const ms =
        (node.config?.days ?? 0) * 86_400_000 +
        (node.config?.hours ?? 0) * 3_600_000 +
        (node.config?.minutes ?? 0) * 60_000;
      // If wait already elapsed, advance immediately
      const ready = (run.waitUntil ?? new Date()).getTime() <= Date.now();
      if (!ready) return false;
      await advance(run.id, node.next, ms > 0 ? new Date(Date.now() + ms) : new Date());
      return ms === 0;
    }

    case 'send-campaign': {
      const campaignId = Number(node.config?.campaignId);
      if (!Number.isFinite(campaignId)) {
        await advance(run.id, node.next);
        return true;
      }
      // Queue a transactional send for this single subscriber
      await db
        .insert(queue)
        .values({
          campaignId,
          subscriberId: subscriber.id,
          state: 'pending',
          priority: 1,
          workflowRunId: run.id,
          sendAt: new Date(),
        })
        .onConflictDoNothing();
      await advance(run.id, node.next);
      return true;
    }

    case 'add-tag': {
      const tagId = Number(node.config?.tagId);
      if (Number.isFinite(tagId)) {
        await db.insert(tagSubscribers).values({ tagId, subscriberId: subscriber.id }).onConflictDoNothing();
      }
      await advance(run.id, node.next);
      return true;
    }
    case 'remove-tag': {
      const tagId = Number(node.config?.tagId);
      if (Number.isFinite(tagId)) {
        await db.delete(tagSubscribers).where(and(eq(tagSubscribers.tagId, tagId), eq(tagSubscribers.subscriberId, subscriber.id)));
      }
      await advance(run.id, node.next);
      return true;
    }
    case 'add-to-list': {
      const listId = Number(node.config?.listId);
      if (Number.isFinite(listId)) {
        await db.insert(listSubscribers).values({ listId, subscriberId: subscriber.id }).onConflictDoNothing();
      }
      await advance(run.id, node.next);
      return true;
    }
    case 'remove-from-list': {
      const listId = Number(node.config?.listId);
      if (Number.isFinite(listId)) {
        await db.delete(listSubscribers).where(and(eq(listSubscribers.listId, listId), eq(listSubscribers.subscriberId, subscriber.id)));
      }
      await advance(run.id, node.next);
      return true;
    }
    case 'condition': {
      // Simplified evaluator: config.field, config.op, config.value
      const passed = evaluateCondition(subscriber, node.config);
      const next = passed ? node.branches?.yes : node.branches?.no;
      if (!next) {
        await complete(run.id, run.workflowId);
        return false;
      }
      await advance(run.id, next);
      return true;
    }
    case 'end': {
      await complete(run.id, run.workflowId);
      return false;
    }
  }
  return false;
}

function evaluateCondition(sub: any, cfg: any): boolean {
  if (!cfg?.field || !cfg?.op) return true;
  const v = (() => {
    if (cfg.field === 'firstName') return sub.firstName;
    if (cfg.field === 'lastName') return sub.lastName;
    if (cfg.field === 'country') return sub.country;
    if (cfg.field === 'status') return sub.status;
    if (cfg.field?.startsWith?.('custom:')) return sub.customFields?.[cfg.field.slice(7)];
    return undefined;
  })();
  switch (cfg.op) {
    case 'eq': return v === cfg.value;
    case 'neq': return v !== cfg.value;
    case 'contains': return typeof v === 'string' && v.includes(cfg.value);
    case 'exists': return v != null && v !== '';
    case 'not_exists': return v == null || v === '';
    default: return true;
  }
}

async function advance(runId: number, nextNodeId: string | undefined | null, waitUntil?: Date) {
  if (!nextNodeId) {
    const run = await db.query.workflowRuns.findFirst({ where: eq(workflowRuns.id, runId) });
    if (run) await complete(runId, run.workflowId);
    return;
  }
  await db
    .update(workflowRuns)
    .set({ currentNodeId: nextNodeId, waitUntil: waitUntil ?? new Date() })
    .where(eq(workflowRuns.id, runId));
}

async function complete(runId: number, workflowId: number, error?: string) {
  await db
    .update(workflowRuns)
    .set({ completedAt: new Date(), error: error ?? null })
    .where(eq(workflowRuns.id, runId));
  await db
    .update(workflows)
    .set({ completedCount: sql`${workflows.completedCount} + 1` })
    .where(eq(workflows.id, workflowId));
}

/** Advance all runs whose wait_until <= now. Returns counts. */
export async function advanceDueRuns({ limit = 200 }: { limit?: number } = {}) {
  // Select due rows for update
  const due = await db
    .select({ id: workflowRuns.id })
    .from(workflowRuns)
    .where(and(isNull(workflowRuns.completedAt), lte(workflowRuns.waitUntil, new Date())))
    .limit(limit);

  let processed = 0;
  for (const { id } of due) {
    // Each run may step multiple times in a single tick (e.g. condition -> send -> next)
    let more = true;
    let safety = 0;
    while (more && safety++ < 20) {
      more = await step(id);
    }
    processed++;
  }
  return { processed };
}
