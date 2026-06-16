# Architecture

## One-paragraph version

A Next.js App Router app with a thin server-action layer, a single Postgres
database accessed via Drizzle, and a long-running worker process that drains
a queue table and advances automation workflow runs. Email rendering uses
MJML in-process; delivery is provider-agnostic. All tracking URLs are
HMAC-signed; subscriber IDs in those URLs are opaque 32-char hashes, never
emails.

## Data model — important shapes

### Tenancy

`accounts` (workspaces) ← `account_members` → `users`. Single user can
belong to multiple accounts; for the MVP the UI picks the first membership.
All other tables carry an `account_id` for cheap scoping.

### Audience

- `subscribers` — one row per (account, email). `status` enum covers the
  full Mailster lifecycle (pending, subscribed, unsubscribed, hard_bounced,
  soft_bounced, complained).
- `lists` + `list_subscribers` — named subsets. Many-to-many.
- `tags` + `tag_subscribers` — flexible labels. Many-to-many.

### Campaigns

`campaigns` carry the editor's JSON (`content_json`), the rendered HTML
cache (`content_html`, `content_text`), audience targeting JSON
(`audience`: lists + tags + filter expression), and snapshot counters
(`sent_count`, `open_count`, …).

### Queue

`queue` — one row per pending (campaign, subscriber) send. `state` moves
`pending → sending → sent` or `→ failed`. The worker uses
`FOR UPDATE SKIP LOCKED` to claim rows safely.

### Tracking

Five append-only tables: `action_sent`, `action_opens`, `action_clicks`,
`action_bounces`, `action_unsubs`, `action_complaints`. No `account_id` —
filter via `EXISTS (SELECT 1 FROM campaigns ...)`. Each carries IP, UA,
country (best-effort from subscriber record).

### Automations

`workflows` store the graph as JSON. `workflow_runs` track each
subscriber's position; the runner advances all rows where `wait_until <= now`.

## Request flow examples

### "Send a campaign"

1. `POST /campaigns/:id/send` (server action `sendCampaign`).
2. `enqueueCampaign(id)` materializes `queue` rows using the campaign's
   compiled audience filter (`lib/segments/compile.ts` converts the JSON
   filter into a `WHERE` fragment).
3. Campaign status → `sending`. Worker takes over.
4. Worker claim batch → for each subscriber:
   - resolve merge tags from subscriber record
   - render once per campaign (cached), instrument HTML per recipient
   - call provider; record `send_log` + `action_sent`; bump counter
5. When the queue is empty for the campaign, status → `sent`.

### "Subscriber clicks a link"

1. Recipient clicks `<APP_URL>/api/track/click?c=…&s=…&l=…&t=…`.
2. Route verifies HMAC `c:s:l`, fetches `links` row, inserts `action_clicks`,
   bumps `campaigns.click_count` and `links.click_count`, then 302 to the
   real URL.

### "Provider reports a bounce"

1. Mailgun/SendGrid/etc. POSTs `/api/webhooks/<provider>`.
2. Handler verifies signature, normalizes the event, and calls
   `recordBounce({ email, hard, reason })`.
3. The shared helper writes `action_bounces`, updates subscriber status
   (3+ soft bounces → `soft_bounced`; permanent → `hard_bounced`), and
   bumps `campaigns.bounce_count`.

## Why these choices

- **Postgres for the queue.** A second store (Redis, RabbitMQ) is unjustified
  for a self-host product. `SKIP LOCKED` gives you most of what you'd want
  from a real broker and the data lives next to its referents.
- **MJML for rendering.** Email client HTML is its own dark art. MJML
  abstracts the table-based incantations and compiles to bulletproof HTML.
- **Structured-field editor, not WYSIWYG.** Email-safe WYSIWYG is brittle
  (every client strips and rewrites styles differently). A JSON block tree
  with field inspectors is more predictable and easier to extend.
- **Signed tracking URLs with opaque hashes.** Prevents tampering and avoids
  PII leakage through referer headers.
- **Server actions over REST.** All mutations colocate with the pages that
  trigger them. REST endpoints exist only where a non-browser caller needs
  them (webhooks, tracking pixels, subscribe endpoint for embed snippets).

## Things intentionally left for later

- **Visual automation builder.** The runner already supports the full graph
  language; a drag-drop UI is purely frontend.
- **Form field builder.** Same — the hosted page reads a JSON schema, the
  editor lets you edit that JSON directly.
- **Team management UI.** Multi-user accounts are in the data model;
  invitation flow is pending.
- **Domain authentication wizard.** DKIM/SPF setup requires per-provider
  integration; today the user does this in the provider's dashboard.
