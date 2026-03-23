FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ── Build stage ───────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

# Copy workspace manifests — enables layer caching for installs
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json      ./apps/api/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/shared/package.json   ./packages/shared/package.json

RUN pnpm install --frozen-lockfile

# Copy source after install for better layer caching
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

# Generate Prisma client for linux-debian target
RUN pnpm --filter @xperise/database db:generate

# Build API — tsup bundles to dist/
RUN pnpm --filter @xperise/api build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

# Reinstall only production deps in a clean layer
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json      ./apps/api/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/shared/package.json   ./packages/shared/package.json

RUN pnpm install --frozen-lockfile --prod

# Copy generated Prisma engine files from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy compiled API
COPY --from=builder /app/apps/api/dist ./apps/api/dist

WORKDIR /app/apps/api
CMD ["node", "dist/server.js"]
