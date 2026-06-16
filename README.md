# Postmark — Newsletter Platform

Self-hosted newsletter platform. Campaigns, automations, signup forms,
deep analytics. Modeled after [Mailster](https://mailster.co) but built as a
modern, standalone Next.js app — no WordPress required.

## Highlights

- **Block-based email editor** — structured-fields editor with live preview,
  10 block types, debounced server render via MJML for cross-client HTML.
- **Provider-agnostic delivery** — SMTP, Resend, Mailgun, SendGrid, Postmark,
  Amazon SES. One abstraction; swap providers per account.
- **Postgres-backed queue** — `FOR UPDATE SKIP LOCKED` semantics so multiple
  workers can drain in parallel without contention. No Redis.
- **Full tracking** — opens, clicks, bounces, complaints, unsubscribes.
  HMAC-signed URLs prevent tampering; per-link counters update inline.
- **Webhooks** — handlers for Mailgun, SendGrid, Postmark, SES (via SNS),
  Resend. Hard/soft bounces are differentiated and acted on per Mailster's
  policy (3 soft = treat as soft_bounced).
- **Automations** — workflow graph runner with triggers, delays, conditions,
  branches, send-campaign, add/remove tag, add/remove list.
- **Forms** — hosted landing pages, embeddable HTML, iframe snippets, with
  configurable double opt-in and field schemas.
- **Multi-tenant data model** — accounts, members, roles. Built so the data
  model can support team and SaaS use cases without a rewrite.

## Stack

| Layer    | Choice                                       |
|----------|----------------------------------------------|
| Framework | Next.js 15 (App Router) + React 19 + TS     |
| Styling   | Tailwind v3 + shadcn-style primitives + Radix UI |
| Database  | PostgreSQL 16 + Drizzle ORM                  |
| Queue     | Postgres (custom; pg-boss available)         |
| Email     | nodemailer (SMTP) + Resend/Mailgun/SendGrid/Postmark/SES |
| Templates | JSON block schema → MJML → HTML              |
| Auth      | Custom sessions + Argon2id                   |
| Charts    | Recharts                                     |

## Quick start (Docker, recommended)

```bash
cp .env.example .env
# Edit .env — set SESSION_SECRET, TRACKING_SECRET, and your email provider creds.

docker compose up -d --build
docker compose run --rm web pnpm db:migrate
docker compose run --rm web pnpm db:seed   # optional — demo data + login

# Visit http://localhost:3000
#   Email:    admin@example.com
#   Password: changeme123
```

## Local development

```bash
pnpm install
cp .env.example .env
# Start a Postgres instance (or `docker compose up postgres`)
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The queue worker is a separate process — run it in another shell:

```bash
pnpm queue:worker
```

Or trigger draining via cron HTTP:

```bash
# Every minute:
* * * * * curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/drain
* * * * * curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/automations
```

## Project layout

```
src/
├── app/
│   ├── (auth)/             Login & register
│   ├── (dashboard)/        Authenticated app (sidebar shell)
│   │   ├── dashboard       Overview
│   │   ├── campaigns       List, create, edit, analytics
│   │   ├── subscribers     List, detail, import (CSV)
│   │   ├── lists, tags     Audience organization
│   │   ├── forms           Signup forms (hosted + embed)
│   │   ├── automations     Workflow editor
│   │   ├── templates, analytics, settings
│   ├── (public)/           Subscribe/confirm/unsubscribe/archive (no auth)
│   └── api/
│       ├── auth/           (server actions — no REST needed)
│       ├── preview         Render editor doc to HTML
│       ├── subscribe       Form submission endpoint
│       ├── track/{open,click}
│       ├── webhooks/{mailgun,sendgrid,postmark,resend,ses}
│       └── cron/{drain,automations}
├── components/
│   ├── ui/                 Radix-based primitives (button, dialog, etc.)
│   ├── layout/             Sidebar, topbar
│   ├── dashboard/          Charts, status badges
│   └── editor/             Block-based campaign editor
├── lib/
│   ├── auth/               Sessions + Argon2id
│   ├── db/                 Drizzle schema + client
│   ├── email/              Providers, blocks, render (MJML), tracking
│   ├── queue/              Send pipeline (FOR UPDATE SKIP LOCKED)
│   ├── automation/         Workflow runner
│   ├── segments/           Filter compiler
│   └── utils/              cn, hash, formatters
├── server/                 server-only queries
└── hooks/
scripts/
├── migrate.ts              Apply Drizzle migrations
├── seed.ts                 Seed demo workspace
└── worker.ts               Long-running queue + automation worker
drizzle/                    Generated SQL migrations
docker/init.sql             Postgres extensions
```

## Configuration

Set environment variables (see `.env.example`):

- `DATABASE_URL` — Postgres connection string
- `APP_URL` — public URL of your app (used in tracking & confirm links)
- `SESSION_SECRET` — long random string for cookies
- `TRACKING_SECRET` — separate random string for tracking-URL HMACs
- `CRON_SECRET` — bearer token for `/api/cron/*` (when not using the worker)
- `MAIL_PROVIDER` — `smtp` | `resend` | `mailgun` | `sendgrid` | `postmark` | `ses`
- Provider-specific creds (`RESEND_API_KEY`, `SMTP_HOST`, etc.)

## Sending architecture

1. User clicks **Send** on a campaign.
2. `enqueueCampaign(campaignId)` materializes a `queue` row for every
   subscriber matching the campaign's audience (lists + tags + filters,
   compiled to SQL via `lib/segments/compile.ts`).
3. Workers (`scripts/worker.ts` or `/api/cron/drain`) pull pending rows with
   `FOR UPDATE SKIP LOCKED` so many workers can run concurrently.
4. For each row: render the campaign body, run merge tags against the
   subscriber, instrument tracking (open pixel + per-link redirects), send
   via the configured provider, log to `send_log`, insert `action_sent`.
5. On bounce/complaint, the provider's webhook fires; the handler updates
   subscriber status and inserts `action_bounces` / `action_complaints`.

## Why the schema looks the way it does

- **Action tables (`action_sent`, `action_opens`, …)** — append-only,
  partitioned by campaign for fast aggregation. No `account_id` column;
  filter via `EXISTS (SELECT 1 FROM campaigns WHERE …)`.
- **`subscribers.hash`** — opaque 32-char hex, used in tracking URLs so
  email addresses never appear in referer headers.
- **Snapshot counters on `campaigns`** — `sent_count`, `open_count`, etc. so
  list views never need an aggregate scan. Updated inline by webhook handlers
  and the worker.
- **Tags vs lists** — lists are exclusive "channels" (e.g. "Weekly Digest")
  with their own unsubscribe semantics; tags are flexible labels for
  segmentation.

## License

MIT.
