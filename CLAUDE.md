# Handover note for Claude Code

This is a handover for the **Postmark newsletter platform** project. The codebase is in the `newsletter-app` zip. Put this file at the project root as `CLAUDE.md` so it's auto-loaded as context.

You are picking up an in-progress build that was paused before a first successful compile. Read this entire document before touching code. The README, ARCHITECTURE.md, and DEPLOYMENT.md are also worth a quick scan but they describe the *intended* state, not the current state.

---

## What this is

A self-hosted Mailster-inspired newsletter platform. Next.js 15 (App Router) + React 19 + TypeScript + PostgreSQL + Drizzle. Three runtime processes: web (Next.js), worker (long-running queue drainer + automation runner), and Postgres. Docker Compose orchestrates all three.

The full architectural pitch is in `ARCHITECTURE.md`. The two-line version: a JSON block-based email editor produces an `EmailDocument`, the worker materializes a `queue` row per recipient when you send, drains with `FOR UPDATE SKIP LOCKED`, and HMAC-signed tracking URLs record opens/clicks. Provider-agnostic delivery (SMTP/Resend/Mailgun/SendGrid/Postmark/SES).

## Current state

- **97 source files, ~115 total files** (incl. docs, configs, Docker, scripts).
- **Zero compile passes have been run.** The code is written but `pnpm typecheck` has not been executed. Expect a handful of small TS errors on first compile — see "Likely first-compile issues" below.
- **No Drizzle migrations have been generated.** The `drizzle/` directory is empty. `pnpm db:generate` needs to run once before `db:migrate` will do anything.
- **Schema is canonical and considered correct.** It's in `src/lib/db/schema.ts`. Several mid-build fixes were made to align query code with this schema; if you find a mismatch, **the schema wins**, fix the calling code.

## Start here (literal first commands)

```bash
# 1. Install deps
pnpm install   # or npm install if pnpm not available

# 2. Generate migrations from schema
pnpm db:generate

# 3. Start Postgres (Docker is easiest)
docker compose up -d postgres

# 4. Apply migrations
DATABASE_URL=postgres://newsletter:newsletter@localhost:5432/newsletter pnpm db:migrate

# 5. First sanity check: typecheck the project
pnpm typecheck 2>&1 | tee typecheck.log

# 6. Fix what surfaces. Then:
pnpm dev
```

After step 5 you will have a concrete list of things to fix. Don't speculate about what's broken before running typecheck — let the compiler tell you.

## Likely first-compile issues (in order of probability)

I haven't run the compiler, so this is informed guessing based on what I touched last. Check these first:

1. **`useActionState` return types.** I used React 19's `useActionState` everywhere with custom state shapes. The action signatures are `(prev, formData) => Promise<State>`. Some action files have an initial state with extra fields the consumer doesn't account for. Look at `src/app/(dashboard)/{lists,tags,forms,automations}/actions.ts` — the initial state cast `{ ok: false } as any` may need narrowing.

2. **`DropdownMenuItem asChild` with `<form>`.** In `src/components/layout/sidebar.tsx`, the sign-out dropdown item is:
   ```tsx
   <DropdownMenuItem destructive asChild>
     <form action={logoutAction}>
       <button type="submit">...</button>
     </form>
   </DropdownMenuItem>
   ```
   Radix `asChild` expects a single child element. A `<form>` containing a `<button>` may break ref forwarding. If it does, replace with a plain `<DropdownMenuItem onSelect>` that calls a client-side `formAction(logoutAction)` or a form outside the menu.

3. **Drizzle column name drift.** Several places use aliased query columns (e.g. `totalSent` aliased from `sentCount`). The schema's authoritative column names are:
   - Campaigns: `sentCount`, `openCount`, `clickCount`, `bounceCount`, `unsubscribeCount`, `scheduledFor` (NOT `scheduledAt`, `totalSent`, etc.)
   - Links: `clickCount` (NOT `clicks`)
   - Tracking tables (`actionSent/Opens/Clicks/Bounces/Unsubs/Complaints`): use `occurredAt`, NOT `createdAt`, and they have **no `accountId` column** — filter through `campaigns` via EXISTS.
   - All IDs are `bigint mode:'number'` — numbers, not UUID strings.
   - Subscriber status enum: `pending | subscribed | unsubscribed | hard_bounced | soft_bounced | complained`. Not "bounced" — distinguish hard/soft.

4. **`/api/track/open` Buffer/Uint8Array.** The pixel response wraps `Buffer` in `new Uint8Array(PIXEL)`. If Next.js complains, return `PIXEL` directly — different Next versions accept different body types.

5. **`useActionState` import.** Comes from `react`, not `react-dom`. Should be correct everywhere but worth confirming if you see "is not exported" errors.

6. **`next/font` + standalone output.** `next.config.mjs` has `output: 'standalone'`. If the Dockerfile build fails because static assets aren't copied, the `COPY --from=builder /app/.next/static` line needs to land before the static dir is created — should be fine but watch for it.

7. **`requireAuth()` redirect.** Lives in `src/lib/auth/session.ts`. Uses `redirect()` from `next/navigation` which throws `NEXT_REDIRECT`. Server components handle this fine; route handlers may need a try/catch around it or use `getAuth()` + manual 401 instead.

## Schema gotchas (memorize these)

The schema is in `src/lib/db/schema.ts`. The non-obvious bits that bit me repeatedly:

- **Tenancy filter for tracking tables**: there's no `account_id` on `action_*` tables. Use the helper in `src/server/queries.ts`:
  ```ts
  function inAccount(accountId: number) {
    return sql<boolean>`EXISTS (SELECT 1 FROM ${campaigns} c WHERE c.id = campaign_id AND c.account_id = ${accountId})`;
  }
  ```
- **`subscribers.hash`** is a 32-char hex used in tracking URLs. NOT derived from email — randomly generated via `generateSubscriberHash()` in `src/lib/utils/hash.ts`. This is deliberate (privacy).
- **`queue.state` transitions**: `pending → sending → sent` or `→ failed/skipped`. The worker uses `UPDATE … SET state='sending' WHERE state='pending' … FOR UPDATE SKIP LOCKED` to claim. Don't change this without understanding why.
- **Snapshot counters** on `campaigns` (`sentCount` etc.) are denormalized — they're bumped inline by the worker and webhook handlers. List views read these directly. Don't aggregate from `action_*` tables for list views; it'll be too slow at scale.

## Tracking URL signing (don't get this wrong)

`src/lib/email/tracking.ts` defines all signed URL schemes. Payloads:

| URL | Payload signed |
|---|---|
| `/api/track/open?c=&s=&t=` | `${campaignId}:${subscriberHash}` |
| `/api/track/click?c=&s=&l=&t=` | `${campaignId}:${subscriberHash}:${linkId}` |
| `/unsubscribe?c=&s=&t=` | `${campaignId ?? 0}:${subscriberHash}` |
| `/confirm?s=&f=&t=` | `confirm:${hash}:${formId}` |
| `/profile?s=&t=` | `${subscriberHash}` |

`signTracking(payload)` returns a 16-char hex HMAC-SHA256 truncated. `verifyTracking(payload, sig)` returns boolean. **The signature is on the payload string, NOT on the URL params themselves.** All route handlers reconstruct the payload from the params and call `verifyTracking`.

## What's complete vs intentionally stubbed

**Complete and shouldn't need rework:**
- All UI primitives (`src/components/ui/`)
- Auth: login, register, session, password hashing (Argon2id)
- Block-based email editor (`src/components/editor/campaign-editor.tsx`) — three-pane, live preview via debounced `/api/preview`
- MJML rendering pipeline (`src/lib/email/render.ts`)
- 6 email providers (`src/lib/email/providers/`)
- 5 webhook handlers (`src/app/api/webhooks/{mailgun,sendgrid,postmark,resend,ses}/route.ts`)
- Open + click tracking routes
- Subscribe endpoint with double opt-in + honeypot
- Public pages: confirm, unsubscribe, archive, hosted subscribe form
- Queue worker with SKIP LOCKED
- Automation runner (full graph language: delay, send-campaign, condition+branches, add/remove tag, add/remove list, end)
- Segment compiler (`src/lib/segments/compile.ts`)
- All dashboard pages (overview, campaigns CRUD + analytics, subscribers list/detail/CSV import, lists, tags, forms with embed snippets, automations, templates list, analytics, settings with provider config)
- Docker Compose with web + worker + postgres
- Seed script with demo account `admin@example.com / changeme123`

**Intentionally stubbed — both feed real backends:**
- **Automation builder**: JSON-editor only. The runner accepts the full graph format; a drag-drop UI is purely frontend work. Editor lives at `src/app/(dashboard)/automations/[id]/workflow-editor.tsx`.
- **Form field builder**: JSON-editor only. The hosted page renders from JSON schema. Editor at `src/app/(dashboard)/forms/[id]/settings-editor.tsx`.

**Not built, data model supports it:**
- Team/invite UI (the `account_members` table exists)
- Custom field definitions UI (table `subscriber_field_defs` exists)
- Visual segment builder (compiler exists, just no UI)

## How to add things without breaking the architecture

- **New page**: drop a `page.tsx` in `src/app/(dashboard)/<route>/`. Use `await requireAuth()` to get `{ user, account, role }`. Pass `account.id` (number) to a query in `src/server/queries.ts`.
- **New mutation**: add a server action in the route's `actions.ts`. Use `useActionState` on the client. See `src/app/(dashboard)/campaigns/actions.ts` for the pattern.
- **New API route**: under `src/app/api/`. Export `runtime = 'nodejs'` and `dynamic = 'force-dynamic'`. Use `getAuth()` for opt-in auth, or skip auth for public/tracking/webhook routes.
- **New email block type**: add to the union in `src/lib/email/blocks.ts`, the renderer in `src/lib/email/render.ts`, the inspector in `src/components/editor/campaign-editor.tsx`, and the default-attrs map. All four places.
- **New email provider**: implement the `EmailProvider` interface in a new file under `src/lib/email/providers/`, add to the union in `types.ts`, register in `providers/index.ts`. Add a UI entry in `src/app/(dashboard)/settings/delivery-form.tsx`.

## What NOT to do

- **Don't regenerate the schema** to "fix" the column-name mismatches I described. The schema is canonical; fix the calling code.
- **Don't switch ORMs** or "modernize" Drizzle usage. The queries are deliberately written with explicit SQL fragments for performance-critical paths (queue draining, tracking aggregates).
- **Don't add Redis** or another queue. The whole point of the Postgres-backed queue is one runtime dependency.
- **Don't replace the structured-fields editor with WYSIWYG.** Email-safe WYSIWYG is a rathole; the JSON block tree is the design.
- **Don't drop `serverExternalPackages`** in `next.config.mjs` — `mjml`, `argon2`, `pg`, `pg-boss`, `nodemailer` all need to stay external or the build breaks.

## Verification path (work through this in order)

1. `pnpm install`
2. `pnpm db:generate` (creates `drizzle/0000_<name>.sql` + meta)
3. `pnpm typecheck` — fix what surfaces
4. `pnpm db:migrate` (with Postgres running)
5. `pnpm db:seed`
6. `pnpm dev` — visit `http://localhost:3000`, sign in as `admin@example.com / changeme123`
7. Verify dashboard loads (stats, growth chart, recent campaigns table)
8. Open the demo campaign, save a small edit — preview iframe should update within ~400ms
9. Configure SMTP in `/settings` (use Mailtrap, Mailpit, or Ethereal for testing — don't fire real sends until you're sure)
10. Click Send on the demo campaign. Worker should drain it. Check `action_sent` table fills.
11. Open the test inbox: verify the email arrives with merge tags resolved, open pixel loads (`action_opens` row), click a tracked link (`action_clicks` row).
12. Submit the hosted form at `/subscribe/<formId>` for one of the seeded forms. Verify a confirm email goes out and `/confirm?...` flips status.
13. Hit `/unsubscribe?c=&s=&t=` from an email link — verify `subscribers.status` goes to `unsubscribed` and `action_unsubs` row lands.

If steps 1–13 work end-to-end, the MVP is verified. Anything beyond that (automation visual builder, team UI, segment UI) is additive.

## Files worth knowing about

- `src/lib/db/schema.ts` — the source of truth for the data model
- `src/lib/queue/sender.ts` — `enqueueCampaign()` + `drainOnce()`; the send pipeline
- `src/lib/email/render.ts` — block → MJML → HTML
- `src/lib/email/tracking.ts` — URL signing
- `src/lib/automation/runner.ts` — workflow graph executor
- `src/lib/segments/compile.ts` — filter JSON → SQL
- `src/server/queries.ts` — all server-only reads, scoped by accountId
- `src/components/editor/campaign-editor.tsx` — the block editor
- `scripts/worker.ts` — long-running drain + automation tick loop

## Final note

I was running into tool-call limits when I packaged this, which is why no compile pass happened. The code is written to a consistent style and the architecture is coherent — but it hasn't been exercised. Expect the first hour to be: install deps, generate migrations, run typecheck, fix 10–20 small errors, get to a green build. After that you should be able to develop normally.

If you find something that looks wrong, check this document first — I may have already noted it.

Good luck.
