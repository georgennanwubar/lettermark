'use server';

/**
 * auth/actions.ts — Server actions for login, register, logout.
 *
 * Form state shape (AuthActionState) is designed to plug into React 19's
 * useActionState: actions receive (prevState, formData), and return either a
 * success marker (which causes a redirect before render) or an error object
 * with field-level details for inline rendering.
 */

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { users, accounts, accountMembers } from '@/lib/db/schema';
import {
  createSession,
  destroySession,
  hashPassword,
  verifyPassword,
} from '@/lib/auth/session';

export type AuthActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

const loginSchema = z.object({
  email: z.string().email('Enter a valid email').max(191),
  password: z.string().min(1, 'Password is required').max(128),
});

const registerSchema = z.object({
  email: z.string().email('Enter a valid email').max(191),
  password: z.string().min(8, 'At least 8 characters').max(128),
  name: z.string().min(1, 'Required').max(191),
  accountName: z.string().min(1, 'Required').max(191),
});

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'workspace'
  );
}

function zodToFieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path[0]?.toString();
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

export async function registerAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = registerSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    name: formData.get('name'),
    accountName: formData.get('accountName'),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: zodToFieldErrors(parsed.error) };
  }
  const { email, password, name, accountName } = parsed.data;

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) {
    return { ok: false, fieldErrors: { email: 'An account with this email already exists.' } };
  }

  const passwordHash = await hashPassword(password);

  const [user] = await db.insert(users).values({ email, passwordHash, name }).returning();

  // Slug collision handling — append a 4-char random suffix
  const slug = `${slugify(accountName)}-${Math.random().toString(36).slice(2, 6)}`;

  const [account] = await db
    .insert(accounts)
    .values({
      name: accountName,
      slug,
      defaultFromName: name,
      defaultFromEmail: email,
    })
    .returning();

  await db.insert(accountMembers).values({
    accountId: account.id,
    userId: user.id,
    role: 'owner',
  });

  await createSession(user.id);
  redirect('/dashboard');
}

export async function loginAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const user = await db.query.users.findFirst({ where: eq(users.email, parsed.data.email) });
  if (!user) return { ok: false, error: 'Incorrect email or password.' };

  const ok = await verifyPassword(user.passwordHash, parsed.data.password);
  if (!ok) return { ok: false, error: 'Incorrect email or password.' };

  await createSession(user.id);
  redirect('/dashboard');
}

export async function logoutAction() {
  await destroySession();
  redirect('/login');
}
