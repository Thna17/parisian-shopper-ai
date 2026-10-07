# Package Manager Migration: pnpm 9.15.1 to pnpm 12.9.1

**Document:** `/docs/package-manager-migration.md`  
**Status:** MIGRATED & VERIFIED  
**Date:** 2026-10-07  
**Author:** `HONG THAN BRATHNA — TECHNICAL DEVELOPER`  

---

## 1. Executive Summary

This PR executes a dedicated **Workspace Infrastructure Migration** from `pnpm 9.15.1` to `pnpm 12.9.1` without introducing Sharp, without implementing `SharpHeroCompositor`, and without altering application behavior.

The migration was motivated by findings in `docs/native-runtime-targets.md`, where `pnpm 9.15.1` failed to isolate native platform packages on Linux x64 glibc (inadvertently activating unsupported `linuxmusl` packages). `pnpm 12.9.1` solves native libc discrimination cleanly, but required explicit workspace infrastructure updates to accommodate breaking lifecycle script policies and configuration formats introduced in pnpm 10+.

All workspace test suites, code standards, frozen-lockfile installations across Darwin ARM64 and Linux x64 glibc, license checks, and security audits pass cleanly under pnpm 12.9.1.

---

## 2. Package Manager Version Changes

| Property | Previous Value | New Value | Notes |
| :--- | :--- | :--- | :--- |
| **Package Manager** | `pnpm@9.15.1` | `pnpm@12.9.1` | Exact pin in `app/package.json` |
| **Engines (`pnpm`)** | `9.15.1` | `12.9.1` | Strict engine constraint |
| **Engines (`node`)** | `22.22.2` | `22.22.2` | Unchanged (matches `app/.nvmrc`) |
| **CI Setup (`actions`)** | `version: 9.15.1` | `version: 12.9.1` | Updated in `.github/workflows/ci.yml` |
| **Lockfile Version** | `9.0` | `9.0` | Preserved portable lockfile structure |

---

## 3. Configuration Relocation: `pnpm.overrides`

In pnpm 11 and 12, pnpm strictly ignores `"pnpm"` configuration fields declared inside `package.json` (`[WARN] The "pnpm" field in package.json is no longer read by pnpm`).

- **Previous Location:** Root `app/package.json` -> `"pnpm": { "overrides": { "deepmerge-ts": "8.0.0" } }`
- **New Location:** Root `app/pnpm-workspace.yaml` -> `overrides: deepmerge-ts: 8.0.0`
- **Verification:** `corepack pnpm why deepmerge-ts` confirms that all workspace packages (notably `@prisma/config`) resolve strictly to `deepmerge-ts@8.0.0`.

---

## 4. Build Script Security Policy (`allowBuilds`)

In pnpm 12, arbitrary lifecycle build scripts (`preinstall`, `install`, `postinstall`) are blocked by default for supply chain security. The repository strictly rejects `dangerouslyAllowAllBuilds: true` or blanket approvals. Instead, every dependency requiring lifecycle execution was individually audited, resulting in an explicit, minimal allowlist/denylist in `app/pnpm-workspace.yaml`.

### 4.1 Approved Build Scripts (`true`)

1. **`@parcel/watcher`** (`true`)
   - **Type:** Dev dependency (transitive via `@jest/core` / Jest haste-map).
   - **Reason:** Requires postinstall step to bind prebuilt native file-watcher binaries or compile from source.
   - **License:** Apache-2.0.
2. **`@prisma/client`** (`true`)
   - **Type:** Production dependency.
   - **Reason:** Generates custom TypeScript database client and bindings.
   - **License:** Apache-2.0.
3. **`@prisma/engines`** (`true`)
   - **Type:** Production dependency.
   - **Reason:** Unpacks and verifies query engine binary for current platform/libc.
   - **License:** Apache-2.0.
4. **`prisma`** (`true`)
   - **Type:** Dev dependency.
   - **Reason:** Validates and downloads Prisma CLI engine binaries.
   - **License:** Apache-2.0.
5. **`esbuild`** (`true`)
   - **Type:** Dev dependency (via `tsx`).
   - **Reason:** Postinstall script downloads/links the platform-specific native `esbuild` executable.
   - **License:** MIT.
6. **`msgpackr-extract`** (`true`)
   - **Type:** Production dependency (optional accelerator for `bullmq`).
   - **Reason:** Optional native C++ accelerator via `node-gyp-build-optional-packages`.
   - **License:** MIT.
7. **`unrs-resolver`** (`true`)
   - **Type:** Dev dependency.
   - **Reason:** Module resolution helper postinstall link.
   - **License:** MIT.

### 4.2 Explicitly Denied Build Scripts (`false`)

1. **`@scarf/scarf`** (`false`)
   - **Chain:** `swagger-ui-dist` -> `@scarf/scarf` (via `@nestjs/swagger`).
   - **Audit finding:** Postinstall script performs telemetry/analytics tracking back to Scarf gateway. It is completely unnecessary for API spec generation or runtime serving.
   - **Action:** Explicitly denied (`false`). Telemetry script is completely blocked with zero functional impact.
2. **`cpu-features`** (`false`)
   - **Chain:** `testcontainers` -> `ssh2` -> `cpu-features`.
   - **Audit finding:** Native CPU feature inspection optional add-on for `ssh2`. `ssh2` provides a pure JavaScript fallback implementation when `cpu-features` is absent or unbuilt.
   - **Action:** Explicitly denied (`false`). Native build compilation is bypassed; tests run reliably on JS fallback.
3. **`ssh2`** (`false`)
   - **Chain:** `testcontainers` -> `ssh2`.
   - **Audit finding:** Attempts native compilation for crypto optimizations. Bundles a reliable pure JS fallback.
   - **Action:** Explicitly denied (`false`). Prevents unnecessary native compile steps during local/CI installs.
4. **`protobufjs`** (`false`)
   - **Chain:** Transitive dependency via tooling/APIs.
   - **Audit finding:** Postinstall script merely checks Node version strings and logs deprecation notices to stderr. Has no compile step.
   - **Action:** Explicitly denied (`false`). Eliminates unnecessary execution and stderr noise.

---

## 5. Verification Results

All tests and verification gates were executed under `pnpm 12.9.1` and `node 22.22.2`:

### 5.1 Local Host (Darwin ARM64)
- `corepack pnpm install --frozen-lockfile`: **PASS** (Zero warnings, zero build errors).
- `corepack pnpm format:check`: **PASS**
- `corepack pnpm lint`: **PASS**
- `corepack pnpm boundaries:check`: **PASS**
- `corepack pnpm db:generate`: **PASS** (Prisma client generated cleanly).
- `corepack pnpm prisma:validate`: **PASS**
- `corepack pnpm typecheck`: **PASS**
- `corepack pnpm test:unit`: **PASS** (29 suites, 225 tests).
- `corepack pnpm test:e2e`: **PASS** (2 suites, 5 tests).
- `corepack pnpm test:integration`: **PASS** (8 suites, 51 tests using real Docker Testcontainers Postgres & Valkey).
- `corepack pnpm build`: **PASS**
- `corepack pnpm license:check`: **PASS** (10 license categories, 0 unapproved packages).
- `corepack pnpm security:check`: **PASS** (0 vulnerabilities).

### 5.2 Containerized Host (Linux x64 glibc - Debian Bookworm Slim)
- `docker run --rm --platform linux/amd64 ... node:22.22.2-bookworm-slim`:
  - `pnpm install --frozen-lockfile`: **PASS**
  - Confirmed only approved build scripts executed (`@parcel/watcher`, `@prisma/engines`, `msgpackr-extract`, `esbuild`, `unrs-resolver`, `prisma`, `@prisma/client`).
  - Confirmed denied scripts (`@scarf/scarf`, `cpu-features`, `ssh2`, `protobufjs`) were skipped.

---

## 6. Strict Scope & Invariant Guarantees

1. **Sharp Absence:** Verified with `grep -rn "sharp" app/package.json app/pnpm-lock.yaml`. Output: `NO_SHARP_FOUND`. Sharp is **NOT** installed.
2. **SharpHeroCompositor:** Not implemented or modified.
3. **Higgsfield Client:** `@higgsfield/client@0.2.6` unchanged; no mocks, balance mutations, or contract changes.
4. **License Exceptions:** No license exceptions were added or altered in `app/license-exceptions.json`.
5. **Production Target Status:** Remains **UNRESOLVED / REQUIRES RE-REVIEW**.
