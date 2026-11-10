# ------------------------------------------------------------------------------
# Apps / Worker Multi-stage Dockerfile
# Parisian Shopper AI — PILOT-001 / OPS-002 Staging Release
# ------------------------------------------------------------------------------

# --- 1. Dependencies and Build Stage ---
FROM node:22-alpine AS builder

WORKDIR /build

RUN apk add --no-cache libc6-compat python3 make g++ fontconfig-dev
RUN corepack enable && corepack prepare pnpm@12.9.1 --activate

# Copy root workspace manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json tsconfig.json ./

# Copy package manifests across monorepo
COPY packages/common/package.json ./packages/common/
COPY packages/config/package.json ./packages/config/
COPY packages/logger/package.json ./packages/logger/
COPY packages/database/package.json ./packages/database/
COPY packages/application/package.json ./packages/application/
COPY packages/ai-providers/package.json ./packages/ai-providers/
COPY packages/creative-providers/package.json ./packages/creative-providers/
COPY packages/jobs/package.json ./packages/jobs/
COPY packages/telegram/package.json ./packages/telegram/
COPY packages/codex-cli/package.json ./packages/codex-cli/
COPY apps/api/package.json ./apps/api/
COPY apps/worker/package.json ./apps/worker/
COPY apps/web/package.json ./apps/web/

# Install workspace dependencies
RUN pnpm install --frozen-lockfile

# Copy source trees and assets
COPY assets ./assets
COPY packages ./packages
COPY apps ./apps
COPY examples ./examples

# Generate Prisma Client & compile TypeScript
RUN pnpm --filter @parisian-shopper/database prisma:generate
RUN pnpm build

# --- 2. Production Runtime Stage ---
FROM node:22-alpine AS runner

WORKDIR /app

# Install runtime libraries for image processing/sharp/harfbuzz
RUN apk add --no-cache fontconfig freetype vips curl wget ca-certificates \
    && rm -rf /var/cache/apk/*

ENV NODE_ENV=production
ENV CREATIVE_ASSET_STORAGE_ROOT=/app/.data/assets

# Create asset storage directory and configure permissions for node user
RUN mkdir -p /app/.data/assets && chown -R node:node /app

# Copy dependency artifacts and compiled dist
COPY --chown=node:node --from=builder /build/node_modules ./node_modules
COPY --chown=node:node --from=builder /build/package.json ./package.json
COPY --chown=node:node --from=builder /build/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --chown=node:node --from=builder /build/assets ./assets
COPY --chown=node:node --from=builder /build/packages ./packages
COPY --chown=node:node --from=builder /build/apps/worker ./apps/worker

USER node

# Health check via process or worker health probe
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD ps aux | grep -v grep | grep -q "node apps/worker/dist/main.js" || exit 1

CMD ["node", "apps/worker/dist/main.js"]
