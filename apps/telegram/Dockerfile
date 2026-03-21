FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ── Build stage ───────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

# Copy workspace manifests — enables layer caching for installs
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/telegram/package.json  ./apps/telegram/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/shared/package.json   ./packages/shared/package.json

RUN pnpm install --frozen-lockfile

# Copy source after install for better layer caching
COPY packages/ ./packages/
COPY apps/telegram/ ./apps/telegram/

# Generate Prisma client for linux-debian target
RUN pnpm --filter @xperise/database db:generate

# Build bot — tsup bundles @xperise/* inline; npm deps stay external
RUN pnpm --filter @xperise/telegram build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

# Reinstall only production deps in a clean layer
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/telegram/package.json  ./apps/telegram/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/shared/package.json   ./packages/shared/package.json

RUN pnpm install --frozen-lockfile --prod

# Copy generated Prisma engine files from builder (prisma CLI is a devDep)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy compiled bot
COPY --from=builder /app/apps/telegram/dist ./apps/telegram/dist

WORKDIR /app/apps/telegram
CMD ["node", "dist/index.js"]
