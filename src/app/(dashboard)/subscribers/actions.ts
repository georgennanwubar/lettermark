'use server';

/**
 * subscribers/actions.ts — Create, update, delete subscribers + CSV import.
 */
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { subscribers } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth/session';
import { generateSubscriberHash } from '@/lib/utils/hash';

const createSchema = z.object({
  email: z.string().email(),
  firstName: z.string().max(191).optional().nullable(),
  lastName: z.string().max(191).optional().nullable(),
  status: z.enum(['pending', 'subscribed', 'unsubscribed']).default('subscribed'),
});

export type SubscriberActionState = { ok: boolean; error?: string };

export async function createSubscriber(
  _prev: SubscriberActionState,
  formData: FormData,
): Promise<SubscriberActionState> {
  const { account } = await requireAuth();
  const parsed = createSchema.safeParse({
    email: formData.get('email'),
    firstName: formData.get('firstName') || null,
    lastName: formData.get('lastName') || null,
    status: formData.get('status') || 'subscribed',
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await db.query.subscribers.findFirst({
    where: and(eq(subscribers.accountId, account.id), eq(subscribers.email, email)),
  });
  if (existing) {
    return { ok: false, error: 'This email is already on your list.' };
  }

  const [row] = await db
    .insert(subscribers)
    .values({
      accountId: account.id,
      hash: generateSubscriberHash(),
      email,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      status: parsed.data.status,
      signupAt: new Date(),
      confirmAt: parsed.data.status === 'subscribed' ? new Date() : null,
    })
    .returning();

  revalidatePath('/subscribers');
  redirect(`/subscribers/${row.id}`);
}

export async function deleteSubscriber(formData: FormData) {
  const { account } = await requireAuth();
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return;
  await db.delete(subscribers).where(and(eq(subscribers.accountId, account.id), eq(subscribers.id, id)));
  revalidatePath('/subscribers');
  redirect('/subscribers');
}

export async function unsubscribeSubscriber(formData: FormData) {
  const { account } = await requireAuth();
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return;
  await db
    .update(subscribers)
    .set({ status: 'unsubscribed', unsubscribeAt: new Date() })
    .where(and(eq(subscribers.accountId, account.id), eq(subscribers.id, id)));
  revalidatePath(`/subscribers/${id}`);
}

/**
 * Import from raw CSV text. Expected columns include "email" (required) and
 * any of: first_name/firstName, last_name/lastName, status. Header row required.
 */
export type ImportActionState = {
  ok: boolean;
  error?: string;
  inserted?: number;
  skipped?: number;
};

export async function importSubscribers(
  _prev: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const { account } = await requireAuth();
  const csv = String(formData.get('csv') || '').trim();
  if (!csv) return { ok: false, error: 'Paste some CSV data first.' };

  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { ok: false, error: 'Need at least a header row plus one record.' };

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const colIdx = (name: string) => header.findIndex((h) => h === name || h === name.replace(/_/g, ''));
  const emailIdx = colIdx('email');
  if (emailIdx < 0) return { ok: false, error: 'CSV must include an "email" column.' };

  const firstNameIdx = Math.max(colIdx('first_name'), colIdx('firstname'));
  const lastNameIdx = Math.max(colIdx('last_name'), colIdx('lastname'));
  const statusIdx = colIdx('status');

  let inserted = 0;
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const email = fields[emailIdx]?.toLowerCase()?.trim();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      skipped++;
      continue;
    }
    const existing = await db.query.subscribers.findFirst({
      where: and(eq(subscribers.accountId, account.id), eq(subscribers.email, email)),
    });
    if (existing) {
      skipped++;
      continue;
    }
    const status =
      statusIdx >= 0 && ['pending', 'subscribed', 'unsubscribed'].includes(fields[statusIdx])
        ? (fields[statusIdx] as any)
        : 'subscribed';
    await db.insert(subscribers).values({
      accountId: account.id,
      hash: generateSubscriberHash(),
      email,
      firstName: firstNameIdx >= 0 ? fields[firstNameIdx] || null : null,
      lastName: lastNameIdx >= 0 ? fields[lastNameIdx] || null : null,
      status,
      signupAt: new Date(),
      confirmAt: status === 'subscribed' ? new Date() : null,
    });
    inserted++;
  }
  revalidatePath('/subscribers');
  return { ok: true, inserted, skipped };
}

function parseCsvLine(line: string): string[] {
  // Minimal CSV parsing: handles quoted fields with embedded commas.
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === ',') {
        out.push(cur.trim());
        cur = '';
      } else if (ch === '"' && cur === '') {
        inQuotes = true;
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur.trim());
  return out;
}
