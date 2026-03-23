FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ── Build stage ───────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

# Copy workspace manifests for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json       ./apps/api/package.json
COPY apps/telegram/package.json  ./apps/telegram/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/shared/package.json   ./packages/shared/package.json

RUN pnpm install --frozen-lockfile

# Copy all source
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
COPY apps/telegram/ ./apps/telegram/

# Generate Prisma client
RUN pnpm --filter @xperise/database db:generate

# Build both apps
RUN pnpm --filter @xperise/api build && pnpm --filter @xperise/telegram build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

# Production deps only
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json       ./apps/api/package.json
COPY apps/telegram/package.json  ./apps/telegram/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/shared/package.json   ./packages/shared/package.json

RUN pnpm install --frozen-lockfile --prod

# Prisma engine from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Compiled outputs
COPY --from=builder /app/apps/api/dist      ./apps/api/dist
COPY --from=builder /app/apps/telegram/dist ./apps/telegram/dist

# Startup script
COPY start.sh ./start.sh
RUN chmod +x start.sh

CMD ["./start.sh"]
