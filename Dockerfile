FROM node:22-slim
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Copy workspace manifests for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json       ./apps/api/package.json
COPY apps/telegram/package.json  ./apps/telegram/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/shared/package.json   ./packages/shared/package.json

RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
COPY apps/telegram/ ./apps/telegram/

# Generate Prisma client + build both apps
RUN pnpm --filter @xperise/database db:generate
RUN pnpm --filter @xperise/api build && pnpm --filter @xperise/telegram build

# Startup script
COPY start.sh ./start.sh
RUN chmod +x start.sh

CMD ["./start.sh"]
