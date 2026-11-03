# ------------------------------------------------------------------------------
# Apps / Web Multi-stage Dockerfile
# Parisian Shopper AI — PILOT-001 / OPS-002 Staging Release
# ------------------------------------------------------------------------------

# --- 1. Build Stage ---
FROM node:22-alpine AS builder

WORKDIR /build

RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@12.9.1 --activate

# Copy root workspace manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json tsconfig.json ./

# Copy package manifests
COPY apps/web/package.json ./apps/web/

# Install web dependencies
RUN pnpm install --frozen-lockfile

# Copy web source code
COPY apps/web ./apps/web

# Build SPA distribution
RUN pnpm --filter @parisian-shopper/web build

# --- 2. Production Web Server Stage ---
FROM nginx:1.27-alpine AS runner

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy built SPA artifacts
COPY --from=builder /build/apps/web/dist /usr/share/nginx/html

# Copy custom nginx configuration with SPA fallback and security headers
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:80/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
