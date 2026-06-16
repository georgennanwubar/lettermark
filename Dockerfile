# syntax=docker/dockerfile:1.6
#
# Dockerfile — multi-stage build for the Next.js app + worker.
#
# Build stage installs deps and produces the .next output.
# Runtime stage is a slim image with just node + the standalone bundle.
#
# The same image runs either the web server (`node server.js`) or the queue
# worker (`node scripts/worker.js`) — choose with the CMD in docker-compose.

ARG NODE_VERSION=20-bookworm-slim

# ─── Build stage ─────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS builder
WORKDIR /app

# pnpm via corepack
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Native deps for argon2 + mjml
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install

COPY . .
RUN pnpm build

# ─── Runtime stage ───────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

# Copy standalone output (smaller image)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Worker + migrations need the original src tree
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src ./src
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Non-root user
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000

# Default to running the web server. Override CMD for the worker:
#   docker run ... <image> node --experimental-strip-types scripts/worker.ts
CMD ["node", "server.js"]
