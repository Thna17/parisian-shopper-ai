# Native Runtime Targets & Package Manager Platform Resolution

**Document:** `/docs/native-runtime-targets.md`  
**Status:** WORKSPACE INFRASTRUCTURE MIGRATED TO PNPM 12.9.1 / PR 2A-2B UNBLOCKED FOR CONTROLLED NATIVE EVALUATION  
**Last Evaluated:** 2026-10-07  
**Evaluator:** `HONG THAN BRATHNA — TECHNICAL DEVELOPER`  

---

## 1. Executive Summary

This evaluation assessed upgrading the project's package manager (`pnpm 9.15.1`) to resolve native optional dependency platform filtering for `sharp@0.33.5`.

- **Old pnpm version:** `9.15.1`
- **Current repository pnpm version:** `12.9.1` (migrated in dedicated infrastructure PR; see `docs/package-manager-migration.md`)
- **Evaluation Status:** **WORKSPACE_INFRASTRUCTURE_UNBLOCKED**
- **Recommendation:** Workspace build-script lifecycle policies (`allowBuilds`) and configuration relocations are now fully resolved under `pnpm 12.9.1`. PR 2A-2B can now proceed in isolation with the approved native target matrix without risk of `linuxmusl` package pollution. Sharp remains NOT installed in this PR.

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

## 4. Why pnpm 12 / 11 Upgrades Cannot Be Applied to the Repository (Stop Conditions)

While pnpm 12.9.1 solved the native libc platform filtering problem in isolation, upgrading the repository to pnpm 12.9.1 violates **Stop Condition 3 ("current workspace breaks materially")**:

### 1. Breaking Change in Script Execution Policy (`allowBuilds` / `ERR_PNPM_IGNORED_BUILDS`)
In pnpm 10+, lifecycle build scripts (e.g. `install`, `postinstall`) are blocked by default for security. In pnpm 12, running `pnpm install` fails with `ERR_PNPM_IGNORED_BUILDS` for 11 critical workspace packages:
- `@parcel/watcher`
- `@prisma/client`
- `@prisma/engines`
- `@scarf/scarf`
- `cpu-features`
- `esbuild`
- `msgpackr-extract`
- `prisma`
- `protobufjs`
- `ssh2`
- `unrs-resolver`

In pnpm 9, the repository relied on `onlyBuiltDependencies` in `pnpm-workspace.yaml`. In pnpm 12, pnpm replaces this with `allowBuilds` and refuses to run builds unless explicitly approved or configured, causing frozen-lockfile and CI installs to break.

### 2. Breaking Change in Configuration Settings (`pnpm.overrides`)
In pnpm 11 and 12, the `"pnpm"` configuration field in root `package.json` is no longer supported and emits deprecation/breakage warnings:
`[WARN] The "pnpm" field in package.json is no longer read by pnpm. The following keys were ignored: "pnpm.overrides".`
The repository's override for `deepmerge-ts@8.0.0` would require relocation to `pnpm-workspace.yaml`.

### 3. Portable Lockfile vs Actual Installation
- Lockfile format in pnpm 12 uses v9 format with an updated structure and entries.
- While the portable lockfile records optional packages for multiple platforms in its index, pnpm 12 only installs packages matching the current host architecture and libc.
- However, because the package manager upgrade introduces extensive breaking changes across workspace build script permissions and configuration keys, the repository package manager pin cannot be updated in this evaluation PR without destabilizing the application stack.

---

## 5. Status of Native Targets

| Platform | Target Designation | Status | Supported by pnpm 9.15.1? | Supported by pnpm 12.9.1? |
| :--- | :--- | :--- | :--- | :--- |
| **Darwin ARM64** | Development | Supported & Approved | YES (only arm64 active) | YES |
| **Linux x64 glibc** | CI (`ubuntu-latest`) | Supported & Approved | NO (activates linuxmusl) | YES (correct libc filtering) |
| **Linux x64 musl** | Incompatible | UNAPPROVED | N/A (unintentionally installed on pnpm 9) | Skipped properly on pnpm 12 |
| **Production** | Unresolved | REQUIRES RE-REVIEW | UNRESOLVED | UNRESOLVED |

---

## 6. Current Recommendation

**REMAIN_BLOCKED**

1. Maintain package manager pin at `pnpm@9.15.1` for now.
2. Do **NOT** install `sharp@0.33.5` into `app/package.json` on `main`.
3. Do **NOT** implement `SharpHeroCompositor`.
4. PR 2A-2B remains blocked until either:
   - A dedicated infrastructure task establishes a full pnpm 12 migration plan (including `allowBuilds` policy for all 11 binary dependencies and relocating `pnpm.overrides` to `pnpm-workspace.yaml`), OR
   - An alternative approach for native graphics processing is approved.
