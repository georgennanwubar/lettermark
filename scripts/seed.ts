/**
 * scripts/seed.ts — Seed a demo account with subscribers, lists, tags, and one
 * draft campaign so the dashboard isn't empty on a fresh install.
 *
 * Idempotent: re-running won't create duplicates beyond what existed before.
 * Credentials printed at the end — used for first login.
 */
import { Pool } from 'pg';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../src/lib/db/schema';

const DEMO_EMAIL = 'admin@example.com';
const DEMO_PASSWORD = 'changeme123';
const DEMO_NAME = 'Admin';
const DEMO_ACCOUNT = 'Demo Workspace';

const FIRST = ['Olivia', 'Liam', 'Noah', 'Emma', 'Ava', 'James', 'Sophia', 'Ethan', 'Mia', 'Lucas'];
const LAST = ['Smith', 'Johnson', 'Brown', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez'];
const COUNTRIES = ['US', 'GB', 'CA', 'AU', 'DE', 'FR', 'NG', 'BR', 'IN', 'JP'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomHash(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });

  // Demo user
  let user = await db.query.users.findFirst({ where: eq(schema.users.email, DEMO_EMAIL) });
  if (!user) {
    const hash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
    [user] = await db
      .insert(schema.users)
      .values({ email: DEMO_EMAIL, passwordHash: hash, name: DEMO_NAME })
      .returning();
    console.log(`Created demo user ${DEMO_EMAIL}`);
  } else {
    console.log(`User ${DEMO_EMAIL} already exists`);
  }

  // Account
  let account = await db.query.accounts.findFirst({ where: eq(schema.accounts.slug, 'demo') });
  if (!account) {
    [account] = await db
      .insert(schema.accounts)
      .values({
        name: DEMO_ACCOUNT,
        slug: 'demo',
        defaultFromName: 'Demo Team',
        defaultFromEmail: 'team@example.com',
      })
      .returning();
    await db.insert(schema.accountMembers).values({ accountId: account.id, userId: user.id, role: 'owner' });
    console.log(`Created demo account ${account.name}`);
  }

  // Lists
  const listNames = ['Weekly Digest', 'Product Updates', 'Onboarding'];
  const listIds: number[] = [];
  for (const name of listNames) {
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    let l = await db.query.lists.findFirst({ where: eq(schema.lists.slug, slug) });
    if (!l) {
      [l] = await db
        .insert(schema.lists)
        .values({ accountId: account.id, name, slug, description: `Auto-seeded: ${name}` })
        .returning();
    }
    listIds.push(l.id);
  }

  // Tags
  const tagPalette = [['vip', '#7c3aed'], ['active', '#10b981'], ['new', '#0ea5e9']];
  const tagIds: number[] = [];
  for (const [name, color] of tagPalette) {
    let t = await db.query.tags.findFirst({
      where: eq(schema.tags.name, name),
    });
    if (!t) {
      [t] = await db.insert(schema.tags).values({ accountId: account.id, name, color }).returning();
    }
    tagIds.push(t.id);
  }

  // Subscribers — only top up if there are fewer than 50
  const existing = await db.query.subscribers.findMany({
    where: eq(schema.subscribers.accountId, account.id),
    limit: 1,
  });
  const seedSubs = existing.length === 0;
  if (seedSubs) {
    console.log('Seeding 60 subscribers…');
    for (let i = 0; i < 60; i++) {
      const firstName = pick(FIRST);
      const lastName = pick(LAST);
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`;
      const country = pick(COUNTRIES);
      const status = i < 50 ? 'subscribed' : 'pending';
      const [sub] = await db
        .insert(schema.subscribers)
        .values({
          accountId: account.id,
          hash: randomHash(),
          email,
          firstName,
          lastName,
          country,
          status,
          signupAt: new Date(Date.now() - Math.random() * 30 * 86400_000),
          confirmAt: status === 'subscribed' ? new Date() : null,
        })
        .onConflictDoNothing()
        .returning();
      if (sub) {
        await db.insert(schema.listSubscribers).values({ listId: listIds[i % listIds.length], subscriberId: sub.id }).onConflictDoNothing();
        if (i % 7 === 0) {
          await db.insert(schema.tagSubscribers).values({ tagId: tagIds[0], subscriberId: sub.id }).onConflictDoNothing();
        }
      }
    }
  }

  // Draft campaign
  const existingCampaign = await db.query.campaigns.findFirst({ where: eq(schema.campaigns.accountId, account.id) });
  if (!existingCampaign) {
    await db.insert(schema.campaigns).values({
      accountId: account.id,
      subject: 'Welcome to the Demo Workspace 👋',
      preheader: 'A friendly hello from your demo newsletter',
      fromName: 'Demo Team',
      fromEmail: 'team@example.com',
      status: 'draft',
      type: 'standard',
      contentJson: {
        version: 1,
        root: {
          id: 'root', type: 'container',
          attrs: { backgroundColor: '#f4f4f5', contentBackgroundColor: '#ffffff', width: 600, preheader: 'A friendly hello' },
          children: [
            {
              id: 's-1', type: 'section', attrs: { paddingTop: 32, paddingBottom: 16, paddingLeft: 32, paddingRight: 32 },
              children: [
                { id: 'h-1', type: 'heading', attrs: { level: 1, text: 'Hi {firstname | "there"} 👋', align: 'left' } },
                { id: 't-1', type: 'text', attrs: { html: 'This is a demo campaign. Edit me!', align: 'left', fontSize: 16 } },
              ],
            },
          ],
        },
      },
      createdBy: user.id,
    });
    console.log('Created demo campaign');
  }

  console.log('\nSeed complete.');
  console.log(`\n  Login:  ${DEMO_EMAIL}`);
  console.log(`  Password: ${DEMO_PASSWORD}\n`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
