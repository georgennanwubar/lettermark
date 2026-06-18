# CLAUDE.md — Postmark Newsletter Platform

> **Session protocol:** At the end of every session, update this file, update `CHANGELOG.md`, and commit both with an accurate description.

---

## Last updated: 2026-06-18 (Session 4)

---

## What this is

A self-hosted Mailster-inspired newsletter platform. Next.js 16 (App Router) + React 19 + TypeScript + PostgreSQL + Drizzle ORM. Three runtime processes: web (Next.js), worker (queue drainer + automation runner), and Postgres.

The two-line architecture: a JSON block-based email editor produces an `EmailDocument`, the worker materialises a `queue` row per recipient when you send, drains with `FOR UPDATE SKIP LOCKED`, and HMAC-signed tracking URLs record opens/clicks. Provider-agnostic delivery (SMTP / Resend / Mailgun / SendGrid / Postmark / SES).

---

## Current state (2026-06-18, Session 4)

The app is **fully working** and now has the **Lettermark design system applied**. All compile errors and functional bugs were resolved in sessions 1–2. Session 3 applied the full design system. Session 4 fixed the campaign edit page 404.

- `pnpm typecheck` — zero errors
- `pnpm lint` — zero errors/warnings
- `pnpm build` — all 38 routes compile and emit
- `pnpm db:migrate` + `pnpm db:seed` — verified on live Postgres
- `pnpm dev` — starts in ~20s (Turbopack), serves on `http://localhost:3000`

**Design system:** Imported from [Lettermark Design System](https://claude.ai/design/p/3f5507eb-975a-410d-8e5b-d18730c37ef1) on Claude Design. Tokens, branding, sidebar, auth layout, and table/empty-state refinements all applied. The app is now named **Lettermark** throughout.

**Environment:** Developer is on Windows + WSL2. Project lives on `D:\Projects\NewsletterApp` (mounted at `/mnt/d/Projects/NewsletterApp` in WSL2). All commands are run from WSL2. IntelliJ IDEA is the IDE on Windows.

---

## Startup (run these every session)

```bash
# Start Postgres (WSL2)
sudo service postgresql start

# Start the dev server
cd /mnt/d/Projects/NewsletterApp
pnpm dev
```

Visit `http://localhost:3000` — login: `admin@example.com` / `changeme123`

**Worker** (second terminal — needed for email sending):
```bash
pnpm queue:worker
```

---

## First-time setup (one-off, already done — for reference only)

```bash
# Install Postgres in WSL2
sudo apt install -y postgresql
sudo service postgresql start
sudo -u postgres psql -c "CREATE USER newsletter WITH PASSWORD 'newsletter';"
sudo -u postgres psql -c "CREATE DATABASE newsletter OWNER newsletter;"

# Clone / open project
cd /mnt/d/Projects/NewsletterApp
cp .env.example .env          # DATABASE_URL is pre-configured for newsletter:newsletter

# Install dependencies (compiles argon2, esbuild via pnpm-workspace.yaml allowBuilds)
pnpm install

# Database
pnpm db:migrate
pnpm db:seed
```

---

## Next steps

These are the open items in rough priority order:

### 1. Configure an email provider and test a real send
The settings page (`/settings` → Delivery tab) lets you configure SMTP, Resend, Mailgun, SendGrid, Postmark, or SES. Until this is done, no emails will actually send. Use **Mailtrap** or **Mailpit** for local SMTP testing — don't fire real sends until you've verified the pipeline end-to-end.

End-to-end send verification checklist:
- Configure SMTP in `/settings`
- Click Send on the demo campaign
- Confirm `action_sent` table fills (worker drains the queue)
- Confirm email arrives in test inbox with merge tags resolved
- Confirm open pixel loads (`action_opens` row inserted)
- Confirm tracked link click records (`action_clicks` row inserted)

### 2. Test subscribe flow end-to-end
- Submit the hosted form at `/subscribe/<formId>`
- Confirm confirmation email goes out
- Click confirm link → `/confirm?...` → subscriber status flips to `subscribed`
- Check `/unsubscribe` from an email link flips status to `unsubscribed`

### 3. Add password reset flow
The `/forgot` link was removed from the login form because no reset route exists. The data model has no `password_reset_tokens` table yet. If this is needed, it requires:
- New table: `password_reset_tokens (id, user_id, token_hash, expires_at)`
- New routes: `/forgot` (request form) + `/reset` (set new password)
- Email send via the existing provider abstraction

### 4. Visual automation builder (nice-to-have)
The automation runner accepts the full graph format and works. The editor (`src/app/(dashboard)/automations/[id]/workflow-editor.tsx`) is currently JSON-only. A drag-drop visual builder is purely frontend work on top of the existing backend.

### 5. Visual segment builder (nice-to-have)
The segment compiler (`src/lib/segments/compile.ts`) translates a filter JSON tree to SQL and is complete. No UI exists for building segment rules — subscribers must be filtered manually or via list/tag.

### 6. Team / invite UI (nice-to-have)
The `account_members` table and role system exist. No invite flow or team management UI has been built.

---

## Architecture quick-reference

### Files worth knowing

| File | Purpose |
|---|---|
| `src/lib/db/schema.ts` | Source of truth for the data model |
| `src/lib/queue/sender.ts` | `enqueueCampaign()` + `drainOnce()` — the send pipeline |
| `src/lib/email/render.ts` | Block tree → MJML → HTML |
| `src/lib/email/tracking.ts` | HMAC URL signing for open/click/unsubscribe/confirm/profile |
| `src/lib/automation/runner.ts` | Workflow graph executor |
| `src/lib/segments/compile.ts` | Filter JSON → SQL WHERE clause |
| `src/server/queries.ts` | All server-only reads, scoped by `accountId` |
| `src/components/editor/campaign-editor.tsx` | Three-pane block editor with live MJML preview |
| `scripts/worker.ts` | Long-running drain + automation tick loop |

### Schema gotchas

- **Tracking tables have no `account_id`** — filter through `campaigns` via EXISTS. Helper in `src/server/queries.ts`.
- **`subscribers.hash`** is a random 32-char hex (not derived from email). Used in all tracking URLs for privacy.
- **`queue.state` transitions**: `pending → sending → sent | failed | skipped`. The worker claims rows with `FOR UPDATE SKIP LOCKED`.
- **Snapshot counters** on `campaigns` (`sentCount`, `openCount`, etc.) are denormalized. Read directly — don't aggregate from `action_*` at list-view scale.
- **Column names**: `sentCount` not `totalSent`; `scheduledFor` not `scheduledAt`; `clickCount` not `clicks`; `occurredAt` not `createdAt` on action tables.
- **All IDs are `bigint mode:'number'`** — numbers, not UUID strings.

### Tracking URL signing

All signed URLs use `signTracking(payload)` → 16-char hex HMAC-SHA256 truncated. The signature covers the payload string, not the raw URL params.

| URL | Payload |
|---|---|
| `/api/track/open?c=&s=&t=` | `${campaignId}:${subscriberHash}` |
| `/api/track/click?c=&s=&l=&t=` | `${campaignId}:${subscriberHash}:${linkId}` |
| `/unsubscribe?c=&s=&t=` | `${campaignId ?? 0}:${subscriberHash}` |
| `/confirm?s=&f=&t=` | `confirm:${hash}:${formId}` |
| `/profile?s=&t=` | `${subscriberHash}` |

### How to add things

- **New dashboard page**: `page.tsx` in `src/app/(dashboard)/<route>/`. Call `await requireAuth()` for `{ user, account, role }`.
- **New mutation**: server action in `actions.ts`, `useActionState` on the client. See `src/app/(dashboard)/campaigns/actions.ts` for the pattern.
- **New API route**: under `src/app/api/`. Export `runtime = 'nodejs'` and `dynamic = 'force-dynamic'`.
- **New email block type**: add to union in `blocks.ts`, renderer in `render.ts`, inspector in `campaign-editor.tsx`, and default-attrs map. All four places.
- **New email provider**: implement `EmailProvider` interface under `src/lib/email/providers/`, add to union in `types.ts`, register in `providers/index.ts`, add UI in `delivery-form.tsx`.

### What NOT to do

- Don't regenerate the schema to fix column-name mismatches — the schema is canonical, fix the calling code.
- Don't switch ORMs or rewrite Drizzle queries — explicit SQL fragments are intentional for performance.
- Don't add Redis — the Postgres-backed queue is a deliberate single-dependency design.
- Don't replace the block editor with WYSIWYG — email-safe WYSIWYG is a rathole.
- Don't drop `serverExternalPackages` in `next.config.mjs` — mjml, argon2, pg, pg-boss, nodemailer must stay external.
- Don't commit `.env` — it's gitignored and contains secrets.

---

## Session history

### Session 1 — 2026-06-16 (GOD MODE compile review)
Starting from an uncompiled codebase, fixed all issues to reach a green build and end-to-end browser verification. See `CHANGELOG.md` for full details.

### Session 2 — 2026-06-17 (startup fixes + dev environment setup)
Diagnosed and fixed exit-code-1 on `pnpm install` due to pnpm 11's default block on native build scripts. Fixed `.env` loading for operational scripts. Guided first-time WSL2 setup. See `CHANGELOG.md` for full details.

### Session 3 — 2026-06-17 (Lettermark design system implementation)
Imported the Lettermark Design System from Claude Design (`3f5507eb-975a-410d-8e5b-d18730c37ef1`). Applied full token set (Sapphire/Cloud/Abyss palette, 6px radius, design-system shadows), dark Abyss sidebar with correct interaction states, `<LettermarkIcon>` brand mark, redesigned auth layout (Cloud canvas + cloud motifs + large centered logo), Instrument Serif font, and table/analytics refinements. Renamed "Postmark" → "Lettermark" throughout. See `CHANGELOG.md` for full details.

### Session 4 — 2026-06-18 (fix campaign edit 404)
Fixed 404 on `/campaigns/[id]/edit`. Root cause: `getCampaign()` in `src/server/queries.ts` used `db.query.campaigns.findFirst()` (Drizzle relational API) which returned null — the underlying cause is WSL2's NTFS file watcher: the dev server from session 3 was stale and running an older compiled version of the query. Fixed by rewriting the query to use `db.select().from(campaigns).where(...)` (the same API used successfully by `listCampaigns`). Also documented the WSL2 NTFS inotify limitation: file changes to `/mnt/d/` are not propagated to the running dev server; a restart is required after file edits. See `CHANGELOG.md` for details.
