/**
 * Session-based auth without external dependencies.
 *
 * Why not NextAuth / Lucia / Better Auth?
 *   - This is a self-hosted app — adding an OAuth provider library when we
 *     only need email + password is overkill.
 *   - We get full control of cookie flags, session rotation, and the user
 *     onboarding flow.
 *
 * Sessions are server-side: a random token is stored in an httpOnly cookie
 * and looked up against the `sessions` table on every request. Tokens are
 * rotated on login and invalidated on logout.
 *
 * Passwords are hashed with Argon2id (memory-hard, OWASP-recommended).
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import argon2 from 'argon2';
import { db } from '@/lib/db';
import { users, sessions, accounts, accountMembers, type User, type Account } from '@/lib/db/schema';

const SESSION_COOKIE = 'newsletter_session';
const SESSION_DURATION_DAYS = 30;

// ─── Password hashing ─────────────────────────────────────────────────────

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

// ─── Session lifecycle ────────────────────────────────────────────────────

function newToken(): string {
  return randomBytes(32).toString('hex');
}

export async function createSession(userId: number): Promise<string> {
  const id = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ id, userId, expiresAt });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
  return id;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id) {
    await db.delete(sessions).where(eq(sessions.id, id));
  }
  jar.delete(SESSION_COOKIE);
}

/** Active user + their (current) account, or null. */
export interface AuthContext {
  user: User;
  account: Account;
  role: string;
}

export async function getAuth(): Promise<AuthContext | null> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (!id) return null;

  const sess = await db.query.sessions.findFirst({ where: eq(sessions.id, id) });
  if (!sess) return null;
  if (sess.expiresAt < new Date()) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, sess.userId) });
  if (!user) return null;

  // First account the user belongs to. (Multi-account switching can be added
  // later with another cookie or URL param.)
  const member = await db.query.accountMembers.findFirst({
    where: eq(accountMembers.userId, user.id),
  });
  if (!member) return null;
  const account = await db.query.accounts.findFirst({
    where: eq(accounts.id, member.accountId),
  });
  if (!account) return null;

  return { user, account, role: member.role };
}

/**
 * For use in server components / route handlers. Redirects to /login when
 * unauthenticated — using `redirect()` (which throws a NEXT_REDIRECT error
 * that Next handles internally) rather than throwing a generic error so users
 * get a clean redirect instead of a 500 page.
 */
export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuth();
  if (!ctx) redirect('/login');
  return ctx;
}
