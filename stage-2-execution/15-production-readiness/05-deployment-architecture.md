# STAGE 2 — PROMPT 15: DELIVERABLE 05
## PRODUCTION DEPLOYMENT TOPOLOGY & NETWORK SECURITY CONTROLS

**Architecture Model:** Hexagonal NestJS Core + BullMQ Distributed Queue + React 19 SPA + Reverse Proxy  
**Target Infrastructure:** Single-Node or Multi-Container Internal Hosting (Docker Compose / Cloud Containers)  
**Assessment Date:** November 2, 2026  

---

### 1. Recommended Production Topology

The Parisian Shopper AI platform is optimized for a cost-effective, high-reliability deployment tailored for an internal luxury retail team (5–20 concurrent users).

```mermaid
graph TD
    Client["Client Browsers (Staff HTTPS)"] -->|Port 443 TLS/SSL| Nginx["Nginx Reverse Proxy & SSL Termination"]
    
    subgraph DMZ["Internal Virtual Network (127.0.0.1 or Docker Network)"]
        Nginx -->|/ -> Static Files| Web["parisian-web (Nginx Alpine SPA, Port 80)"]
        Nginx -->|/v1/*, /health, /telegram| Api["parisian-api (Node.js NestJS, Port 3000)"]
        
        Api -->|Read/Write Pool| Postgres[("PostgreSQL 17.6 + pgvector")]
        Api -->|Enqueue / Sessions| Valkey[("Valkey 8.1.3 Cache & Queues")]
        
        Worker["parisian-worker (BullMQ Consumer)"] -->|Dequeue Tasks| Valkey
        Worker -->|Persist Artifacts| Postgres
        Worker -->|Read/Write Assets| Storage["Local / S3 Storage (.data/assets)"]
    end
```

#### Component Specifications
1. **Edge Reverse Proxy (Nginx):**
   - Terminates TLS/SSL certificates (Let's Encrypt / Certbot).
   - Routes static web bundle requests to the Web container.
   - Proxies `/v1/*`, `/health/*`, `/metrics`, and `/telegram/*` to NestJS on port 3000.
   - Enforces HTTP to HTTPS redirection.
2. **Web Container (`parisian-web`):**
   - Lightweight Nginx Alpine container serving Vite-built SPA bundle (`dist/index.html` + `dist/assets/*`).
   - Client-side routing fallback (`try_files $uri $uri/ /index.html;`).
3. **API Gateway (`parisian-api`):**
   - Node 22 / NestJS container handling HTTP requests, session validation, REST endpoints, and outbox event dispatch.
4. **Queue Worker (`parisian-worker`):**
   - Dedicated Node 22 process consuming BullMQ queues (`content-generation`, `content-validation`, `creative-generation`, `outbox-relay`).
   - Completely decoupled from the HTTP thread, ensuring that compute-intensive Sharp/HarfBuzz image rendering never blocks user web interactions.
5. **Database & Cache Infrastructure:**
   - PostgreSQL 17.6 with UTF-8, UTC timezone, and persistent volume storage.
   - Valkey 8.1.3 with AOF persistence enabled.

---

### 2. Network Security Controls & HTTP Headers (`SEC-005`)

Verified in `apps/api/src/bootstrap.ts` and middleware implementations:

| Header / Control | Implementation / Value | Security Protection Provided |
| :--- | :--- | :--- |
| **Strict-Transport-Security (HSTS)** | `max-age=15552000; includeSubDomains` | Enforces browser HTTPS-only communication; prevents SSL-stripping man-in-the-middle attacks. |
| **X-Frame-Options** | `DENY` | Prevents clickjacking by disabling embedding inside external iframes. |
| **X-Content-Type-Options** | `nosniff` | Prevents MIME-type sniffing exploits. |
| **Content-Security-Policy (CSP)** | `default-src 'self'; img-src 'self' data: blob:; script-src 'self'` | Prevents inline XSS script execution. |
| **Referrer-Policy** | `strict-origin-when-cross-origin` (and `no-referrer` on onboarding links) | Mitigates token and path leakage in cross-origin HTTP requests. |
| **CORS Access-Control** | Restricted strictly to `config.application.corsOrigins` | Blocks unauthorized third-party origins from reading authenticated API responses. |
| **Request Payload Size Limit** | `json({ limit: '10mb' })` | Prevents memory exhaustion / DoS via arbitrarily large HTTP payloads. |
| **Rate Limiting** | `express-rate-limit`: 100 requests / min per IP | Mitigates brute-force credential stuffing and API abuse. |
| **Private Render File Auth** | HMAC-SHA256 signed download tokens (5 min expiry) | Prevents unauthenticated access or enumeration of private poster exports. |

---

### 3. Step-by-Step Staging Deployment Runbook

#### Step 1: Environment Preparation
Create a dedicated deployment directory on the host and configure `/app/.env`:
```bash
# Core Database & Cache
DATABASE_URL="postgresql://parisian_user:STRONG_PASSWORD@postgres:5432/parisian_shopper?schema=public"
VALKEY_URL="redis://valkey:6379"

# Security & Sessions
SESSION_SECRET="GENERATE_64_CHAR_HEX_ENTROPY"
CORS_ORIGINS="https://staging.parisianshopper.com"
APP_ORIGIN="https://staging.parisianshopper.com"
NODE_ENV="production"

# Safe Modes for Staging Pilot
PAID_AI_DISABLED="true"
SOCIAL_PUBLISHING_DISABLED="true"
```

#### Step 2: Database Migration & Seeding
```bash
# Apply migrations cleanly
docker compose exec api pnpm --filter @parisian-shopper/database prisma:migrate:deploy

# Seed verified luxury perfume catalog fixtures
docker compose exec api node scripts/seed-demo-data.mjs
```

#### Step 3: Service Health Verification
```bash
# Check API liveness
curl -fsS http://localhost:3000/health/live

# Check PostgreSQL and Valkey readiness
curl -fsS http://localhost:3000/health/ready
```
Expected output: HTTP 200 `{"status":"ok"}`.
