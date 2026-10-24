# Native Runtime Targets & Package Manager Platform Resolution

**Document:** `/docs/native-runtime-targets.md`  
**Status:** PR 2A-2B COMPLETED & VERIFIED / SHARP 0.33.5 INSTALLED  
**Last Evaluated:** 2026-10-09  
**Evaluator:** `HONG THAN BRATHNA — TECHNICAL DEVELOPER`  

---

## 1. Executive Summary

Phase 2A (PR 2A-2B) successfully installed `sharp@0.33.5` and implemented `SharpHeroCompositor` following the workspace infrastructure migration to `pnpm 12.9.1`.

- **Package manager version:** `pnpm 12.9.1`
- **Installed Sharp version:** `sharp@0.33.5`
- **Darwin ARM64 runtime packages:** `@img/sharp-darwin-arm64@0.33.5`, `@img/sharp-libvips-darwin-arm64@1.0.4`
- **Linux x64 glibc runtime packages:** `@img/sharp-linux-x64@0.33.5`, `@img/sharp-libvips-linux-x64@1.0.4`
- **Linux musl packages:** Confirmed **NOT ACTIVE** on Linux x64 glibc.
- **Production Target Status:** **UNRESOLVED / REQUIRES RE-REVIEW**

---

## 2. Background and Core Problem

In `pnpm 9.15.1`, when installing `sharp@0.33.5` on a Linux x64 glibc system (e.g. Debian Bookworm or Ubuntu x64 CI), pnpm downloads and activates:
1. `@img/sharp-linux-x64@0.33.5`
2. `@img/sharp-libvips-linux-x64@1.0.4`
3. **`@img/sharp-linuxmusl-x64@0.33.5` (UNAPPROVED)**
4. **`@img/sharp-libvips-linuxmusl-x64@1.0.4` (UNAPPROVED)**

Because `scripts/check-licenses.mjs` executes `pnpm licenses list --json` (which reports actually installed and reachable packages in node_modules), the unapproved `linuxmusl` packages fail the strict dependency license policy since LGPL exceptions are registered strictly for Darwin ARM64 and Linux x64 glibc.

---

## 3. Platform Resolution Test Results

Evaluation in clean isolated environments yielded the following results across tested platforms:

### A. Darwin ARM64 Development Host (`macOS Sonoma / Apple Silicon`)
- **Node runtime:** `22.22.2`
- **pnpm 12.9.1 Active Packages:**
  - `@img/sharp-darwin-arm64@0.33.5` (Apache-2.0)
  - `@img/sharp-libvips-darwin-arm64@1.0.4` (LGPL-3.0-or-later — Approved Exception)
- **Incompatible packages activated:** NONE (`darwin-x64`, `linux-*`, `linuxmusl-*` were NOT installed or activated).
- **Runtime test:** `node -e "require('sharp')"` succeeded with libvips `8.15.3`.

### B. Linux x64 glibc Container (`Debian Bookworm slim / x86_64`)
- **Node runtime:** `22.22.2`
- **pnpm 12.9.1 Active Packages:**
  - `@img/sharp-linux-x64@0.33.5` (Apache-2.0)
  - `@img/sharp-libvips-linux-x64@1.0.4` (LGPL-3.0-or-later — Approved Exception)
- **Incompatible packages activated:** **NONE**.
- **`linuxmusl` activation:** **FALSE**. `@img/sharp-linuxmusl-x64` and `@img/sharp-libvips-linuxmusl-x64` were **NOT** downloaded, NOT installed, and NOT present in `pnpm licenses list`.
- **Runtime test:** `node -e "require('sharp')"` succeeded with libvips `8.15.3`.

### C. Linux x64 musl Negative Test (`Alpine Linux 3.20 / x86_64`)
- **pnpm 12.9.1 Active Packages:**
  - `@img/sharp-linuxmusl-x64@0.33.5`
  - `@img/sharp-libvips-linuxmusl-x64@1.0.4`
- **Incompatible packages activated:** `linux-x64` (glibc) was skipped.
- **Purpose:** Proved that pnpm 12 correctly discriminates libc between glibc and musl.

---

## 4. Resolution of Workspace Blockers & Migration to pnpm 12.9.1

Following the infrastructure migration PR (`chore/migrate-workspace-pnpm-12`), all workspace script execution blockers were formally addressed:
1. `allowBuilds` policy was explicitly approved in `app/pnpm-workspace.yaml` for legitimate dependencies (`@prisma/client`, `prisma`, `esbuild`, `msgpackr-extract`, `unrs-resolver`, `@parcel/watcher`, `protobufjs`).
2. Telemetry and unneeded install scripts (`@scarf/scarf`, `cpu-features`, `ssh2`) were reviewed and blocked/disallowed.
3. In PR 2A-2B, `sharp: true` was added to `allowBuilds` in `app/pnpm-workspace.yaml`.
4. `pnpm.overrides` was migrated to `pnpm-workspace.yaml`.

With pnpm 12.9.1 in place:
- Darwin ARM64 activates strictly `@img/sharp-darwin-arm64@0.33.5` and `@img/sharp-libvips-darwin-arm64@1.0.4`.
- Linux x64 glibc activates strictly `@img/sharp-linux-x64@0.33.5` and `@img/sharp-libvips-linux-x64@1.0.4`.
- Incompatible musl packages are completely excluded on glibc environments.

---

## 5. Status of Native Targets

| Platform | Target Designation | Status | Active Packages | License Status |
| :--- | :--- | :--- | :--- | :--- |
| **Darwin ARM64** | Development | Supported & Verified | `@img/sharp-darwin-arm64@0.33.5`<br>`@img/sharp-libvips-darwin-arm64@1.0.4` | Approved Exception |
| **Linux x64 glibc** | CI (`ubuntu-latest`) | Supported & Verified | `@img/sharp-linux-x64@0.33.5`<br>`@img/sharp-libvips-linux-x64@1.0.4` | Approved Exception |
| **Linux x64 musl** | Incompatible | UNAPPROVED | None (correctly omitted by pnpm 12.9.1) | N/A |
| **Production** | Unresolved | REQUIRES RE-REVIEW | UNRESOLVED | REQUIRES RE-REVIEW |

---

## 6. PR 2A-2B Completion Status

**COMPLETED & VERIFIED**

1. `sharp@0.33.5` is installed in `@parisian-shopper/application`.
2. Native platform resolution passes on both Darwin ARM64 and Linux x64 glibc.
3. Zero unapproved native packages are activated.
4. `SharpHeroCompositor` adapter is fully implemented and passes all unit, integration, and security checks.
5. Production target remains explicitly **UNRESOLVED / REQUIRES RE-REVIEW**.
