# Deployment

Three supported topologies, ordered from simplest to most flexible.

## 1) Docker Compose (single host)

The repository ships with a `docker-compose.yml` that runs the web app, the
worker, and Postgres in one stack.

```bash
cp .env.example .env
# Fill in SESSION_SECRET, TRACKING_SECRET, APP_URL, and your provider creds.

docker compose up -d --build
docker compose run --rm web pnpm db:migrate
docker compose run --rm web pnpm db:seed   # optional
```

Behind a reverse proxy (Caddy, nginx, Traefik), terminate TLS and forward to
port 3000.

## 2) Vercel + external Postgres + cron HTTP

Best for low-volume / serverless use.

1. Deploy this repo to Vercel.
2. Set env vars (`DATABASE_URL`, `SESSION_SECRET`, `TRACKING_SECRET`, `APP_URL`,
   `CRON_SECRET`, provider creds).
3. Configure cron in Vercel's dashboard:
   - `*/1 * * * *` → `GET /api/cron/drain` (with the `Authorization` header)
   - `*/1 * * * *` → `GET /api/cron/automations`

Vercel functions cap at 60–300s; for accounts sending more than a few
thousand emails per minute, switch to topology 3.

## 3) Vercel/Cloudflare web + dedicated worker

Run the web app on a serverless platform and a small VM (Fly.io, Railway,
Hetzner) that just runs `pnpm queue:worker`. The worker connects to the same
Postgres and drains continuously. Vercel cron still serves as a safety net.

## Database migrations

```bash
# When you change schema.ts:
pnpm db:generate    # produces SQL in drizzle/
pnpm db:migrate     # applies it

# Or push without migration files (dev only):
pnpm db:push
```

## Provider setup

### SMTP
Common for self-host. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
`SMTP_SECURE`. Configure SPF + DKIM at your DNS provider.

### Resend / SendGrid / Postmark
API-key based. Verify your sending domain (DKIM) in the provider's dashboard.

### Mailgun
Set `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_REGION` (`us` or `eu`).
Add the webhook URL `<APP_URL>/api/webhooks/mailgun` in Mailgun's dashboard
and copy the signing key into `MAILGUN_WEBHOOK_SIGNING_KEY`.

### Amazon SES
Set IAM keys and region. Subscribe an SNS topic to bounce + complaint
notifications and point it at `<APP_URL>/api/webhooks/ses`.

## Cookie security

Cookies are `httpOnly`, `sameSite=lax`, and `secure` in production. If you
run behind a reverse proxy, ensure `NODE_ENV=production` and that the proxy
sets `X-Forwarded-Proto` so Next can detect HTTPS.

## Backups

Postgres is the single source of truth. Take regular `pg_dump` snapshots:

```bash
pg_dump --no-owner --no-acl -Fc $DATABASE_URL > backup-$(date +%F).dump
```

Subscriber data is irreplaceable; campaign content is not — back up the DB,
not the app.

## Scaling notes

- The queue uses `FOR UPDATE SKIP LOCKED` so you can run as many workers as
  CPUs without coordination. A worker can handle ~100 sends/sec depending on
  provider latency.
- Action tables (`action_sent`, `action_opens`, …) become hot under load.
  Partition by `(date_trunc('month', occurred_at))` once you cross ~50M rows.
- `links.click_count` and `campaigns.{sent,open,click}_count` are denormalized
  for fast list views; they tolerate small race-condition drift.

## Observability

- Worker logs to stdout with structured lines: `sent=N failed=N automations=N`.
- `send_log` keeps the last N attempts per provider (rotate manually).
- `action_*` tables can be analyzed with any BI tool — connect Metabase or
  Superset to the same Postgres for richer dashboards.
