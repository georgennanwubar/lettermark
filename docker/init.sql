-- docker/init.sql — Runs once on first Postgres container start.
-- Just enables common extensions. The schema itself is applied by
-- `pnpm db:migrate` (Drizzle).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
