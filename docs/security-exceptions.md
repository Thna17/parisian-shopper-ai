# Security Exception Governance & Advisory Analysis (Phase 2A)

**Document:** `/docs/security-exceptions.md`  
**Status:** ACTIVE SECURITY EXCEPTIONS REGISTERED  
**Audience:** Security Engineers, Backend Architects, Infrastructure Leads  
**Related Documents:** [`/docs/creative-security.md`](creative-security.md), [`/docs/creative-license-review.md`](creative-license-review.md), [`/app/security-exceptions.json`](file:///Users/macbookpro/Desktop/Development/parisian-shopper-ai/app/security-exceptions.json)  
**Reviewer:** `HONG THAN BRATHNA — TECHNICAL DEVELOPER`  
**Review Date:** 2026-10-09  

---

## 1. Governance Policy & Fail-Closed Principles

Security findings reported by package manager audits (such as `pnpm audit`) must never be ignored silently or suppressed without engineering justification.

### Mandatory Exception Principles:
1. **No Silent Suppressions:** Every entry in `auditConfig.ignoreGhsas` in `app/pnpm-workspace.yaml` must have a corresponding, auditable record in `app/security-exceptions.json` and in this governance document.
2. **Fail-Closed Verification:** Automated security checks (`pnpm security:check` via `scripts/check-security.mjs`) enforce that any vulnerability not registered with an active exception causes immediate build and pipeline failure.
3. **Explicit Semantic Reporting:** Security reports distinguish between "0 unreviewed findings, N reviewed temporary exceptions" and "0 vulnerabilities". Reviewed exceptions are never labeled as "vulnerability-free".
4. **Temporary Acceptance Under Mitigations:** Suppressions are accepted strictly as "temporarily accepted under documented mitigations" with defined technical mitigations, residual risk assessments, and re-review conditions.
5. **Upgrade Precedence:** If an advisory is remotely exploitable, has no adequate mitigation, and has an upgrade path that does not break legal/licensing boundaries, the package must be upgraded immediately rather than suppressed.

---

## 2. Upstream Dependency Context: Sharp 0.33.5 & libvips 8.15.3

In Phase 2A PR 2A-2B, `sharp@0.33.5` was installed with native pre-built libvips binaries (`@img/sharp-libvips-darwin-arm64@1.0.4` and `@img/sharp-libvips-linux-x64@1.0.4`). These exact binary versions are covered by formal management license exceptions registered in `app/license-exceptions.json` and documented in `docs/creative-license-review.md`.

Sharp 0.33.5 bundles libvips `8.15.3` (with internal sub-dependencies `libheif` and `librsvg`). Subsequent upstream security advisories were filed against libvips and its loaders in newer Sharp releases (0.35.x). Upgrading to `sharp@0.35.x` is currently blocked because `sharp@0.35.x` requires newer native libvips binaries (1.1.x+), which are **not** approved under current licensing governance and would violate license compliance until a new license review cycle is executed.

Therefore, the 3 advisories below are evaluated individually and accepted temporarily under strict technical mitigations.

---

## 3. Registered Security Exceptions Analysis

### 3.1 GHSA-f88m-g3jw-g9cj: libvips Out-of-bounds Read & Integer Overflow

| Field | Detail |
| :--- | :--- |
| **Advisory ID** | `GHSA-f88m-g3jw-g9cj` |
| **Package** | `sharp` (transitive / bundled `libvips`) |
| **Affected Versions** | `<0.35.0` (Repository uses `0.33.5` with libvips `8.15.3`) |
| **Severity** | **High** (CVSS: 7.5) |
| **CVEs** | `CVE-2026-33327`, `CVE-2026-33328`, `CVE-2026-35590`, `CVE-2026-35591` |
| **Vulnerability Class** | Out-of-bounds Read / Integer Overflow in `libvips` core image loaders |
| **Attack Prerequisites** | Attacker supplies crafted image payload parsed by libvips decoders. |
| **Reachability Assessment** | **Materially Constrained.** The compositor decodes user-supplied and catalog images, which are ingested from trusted catalog snapshots and authenticated AI generation. Untrusted public uploads do not directly invoke the compositor. |
| **Technical Mitigations** | 1. **Format Restriction:** Only raster formats `image/png`, `image/webp`, and `image/jpeg` are permitted; exotic formats (TIFF, GIF, SVG, HEIF) are rejected before decoding.<br>2. **Byte Limit:** Maximum 15 MB per input buffer (`CreativeInputTooLargeError`).<br>3. **Decompression Bomb Limit:** Strict `limitInputPixels: 16777216` (16 MP) ceiling enforced at the libvips decoder level before allocating raster memory.<br>4. **Dimension Ceiling:** Maximum 4096 × 4096 px per axis.<br>5. **Static Image Constraint:** Multi-frame and animated images (`pages > 1`) are rejected.<br>6. **Process Isolation:** Compositing runs in isolated background workers, throttled to `concurrency(2)` and `cache({ memory: 128 })`. |
| **Residual Risk** | **Low.** A specially crafted PNG/JPEG crafted to trigger an integer overflow within the 16 MP limit could theoretically crash the background worker (denial of service). The worker process is isolated from HTTP endpoints and automatically recycles. No remote code execution vector has been demonstrated on sRGB PNG/JPEG raster decoding under these limits. |
| **Upgrade Availability** | Patched in `sharp@0.35.0+`. Currently blocked pending license review for libvips 8.16.x binaries. |
| **Reviewer** | `HONG THAN BRATHNA — TECHNICAL DEVELOPER` |
| **Review Date** | 2026-10-09 |
| **Re-Review Trigger** | Re-review upon Sharp upgrade or if image ingestion is opened to unauthenticated public uploads. |

---

### 3.2 GHSA-rgj7-g3m4-5g8c: Memory Corruption in libheif (AVIF/HEIF)

| Field | Detail |
| :--- | :--- |
| **Advisory ID** | `GHSA-rgj7-g3m4-5g8c` |
| **Package** | `sharp` (transitive / bundled `libheif`) |
| **Affected Versions** | `<0.35.4` (Repository uses `0.33.5`) |
| **Severity** | **High** (Upstream `libheif` Critical, Sharp rated High due to lack of network surface) |
| **CVE** | Upstream `libheif` memory corruption CVEs |
| **Vulnerability Class** | Memory corruption / heap overflow during HEIF/AVIF container parsing |
| **Attack Prerequisites** | Processing HEIF or AVIF formatted image files through `VipsForeignLoadHeif`. |
| **Reachability Assessment** | **UNREACHABLE (Mathematically Blocked).** |
| **Technical Mitigations** | 1. **Format Whitelist:** Application strictly allows `image/png`, `image/webp`, and `image/jpeg`. Any `.heic`, `.heif`, or `.avif` mime-type or file header is rejected before processing.<br>2. **Native Loader Block:** At compositor initialization, `sharp.block({ operation: ['VipsForeignLoadHeif'] })` is executed. This instructs libvips at the native C/C++ level to refuse registration and execution of the HEIF loader, making `libheif` code completely unreachable. |
| **Residual Risk** | **Negligible.** With `VipsForeignLoadHeif` natively blocked and application-level format validation in place, `libheif` code paths cannot be invoked. |
| **Upgrade Availability** | Patched in `sharp@0.35.4+`. Currently blocked pending license review for updated libvips binaries. |
| **Reviewer** | `HONG THAN BRATHNA — TECHNICAL DEVELOPER` |
| **Review Date** | 2026-10-09 |
| **Re-Review Trigger** | Re-review upon Sharp upgrade or if AVIF/HEIF support is ever requested. |

---

### 3.3 GHSA-wq5f-xc86-pv6w: Memory Corruption in librsvg (SVG Vector Graphics)

| Field | Detail |
| :--- | :--- |
| **Advisory ID** | `GHSA-wq5f-xc86-pv6w` |
| **Package** | `sharp` (transitive / bundled `librsvg`) |
| **Affected Versions** | `<0.35.5` (Repository uses `0.33.5`) |
| **Severity** | **High** (CVSS: 7.5) |
| **CVE** | `CVE-2026-96889` |
| **Vulnerability Class** | Memory corruption / resource exhaustion in `librsvg` vector XML parser |
| **Attack Prerequisites** | Processing SVG files through `VipsForeignLoadSvg`. |
| **Reachability Assessment** | **UNREACHABLE (Mathematically Blocked).** |
| **Technical Mitigations** | 1. **Format Whitelist:** Application strictly rejects SVG files (`CreativeUnsupportedImageFormatError`).<br>2. **Native Loader Block:** At compositor initialization, `sharp.block({ operation: ['VipsForeignLoadSvg'] })` is executed. This instructs libvips at the native C/C++ level to refuse registration and execution of the SVG loader, making `librsvg` code completely unreachable. |
| **Residual Risk** | **Negligible.** With `VipsForeignLoadSvg` natively blocked and SVG format rejected at the boundary, `librsvg` code paths cannot be invoked. |
| **Upgrade Availability** | Patched in `sharp@0.35.5+` (bundles librsvg 2.63.2). Currently blocked pending license review for updated libvips binaries. |
| **Reviewer** | `HONG THAN BRATHNA — TECHNICAL DEVELOPER` |
| **Review Date** | 2026-10-09 |
| **Re-Review Trigger** | Re-review upon Sharp upgrade or if SVG rendering is ever requested. |

---

## 4. Audit & Verification Workflow

The automated security gate is enforced in CI and local developer workflows:

```bash
pnpm security:check
```

This runs `app/scripts/check-security.mjs`, which:
1. Validates that every entry in `pnpm-workspace.yaml` `auditConfig.ignoreGhsas` exists in `app/security-exceptions.json`.
2. Validates all mandatory fields (`id`, `package`, `affectedVersion`, `severity`, `cve`, `vulnerabilityClass`, `attackPrerequisites`, `reason`, `reviewer`, `reviewDate`, `mitigations`, `residualRisk`, `upgradeTarget`, `reReview`).
3. Executes `pnpm audit --prod --json` and verifies that no unreviewed vulnerabilities exist.
4. Outputs:
   ```text
   PASS — 0 unreviewed findings, 3 reviewed temporary exceptions (GHSA-f88m-g3jw-g9cj, GHSA-rgj7-g3m4-5g8c, GHSA-wq5f-xc86-pv6w)
   ```
