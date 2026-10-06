# Creative Automation Dependency Licensing Review (Phase 2A)

**Document:** `/docs/creative-license-review.md`  
**Status:** PROPOSED EXCEPTION REVIEW  
**Classification:** `TODO_LEGAL_CONFIRMATION`  
**Audience:** Legal Counsel, Architecture Board, Engineering Lead  

---

## 1. Purpose & Compliance Context

In accordance with [`/docs/dependency-license-policy.md`](dependency-license-policy.md), the Parisian Shopper AI platform enforces a strict **permissive-license-first** policy:
- **Default Permitted Licenses:** `MIT`, `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, `ISC`, `PostgreSQL`, `0BSD`, `BlueOak-1.0.0`, `CC0-1.0`, `Python-2.0`, `Unlicense`.
- **Automatic Failure:** `AGPL`, `GPL`, `SSPL`, `UNKNOWN`, `UNLICENSED`.
- **Manual Exception Required:** `LGPL`, `MPL`, source-available, Commons Clause, or ambiguous licenses.

Phase 2A introduces image compositing and storage requirements. This document audits every candidate library, analyzes linking characteristics, evaluates automated license check behavior, and drafts the necessary exception proposals.

**Crucial Policy Rule:** We do not describe any non-allowlisted dependency as "fully compliant" until management and legal counsel formally sign off on the documented exception in `app/license-exceptions.json`.

---

## 2. Dependency Audit & Candidate Analysis

### 2.1 Core Image Processing Engine: `sharp` & `libvips`

| Component | Target Version | Declared License | Linking / Distribution Characteristics | Policy Evaluation |
|---|---|---|---|---|
| **`sharp`** (npm package) | `^0.33.5` | `Apache-2.0` | Node.js C++ native addon interfacing with libvips. | Allowed by default under Apache-2.0. |
| **`@img/sharp-libvips-*`** (prebuilt binaries) | `^8.15.2` | `LGPL-3.0-or-later` | Dynamically linked precompiled C library runtime binaries. Loaded as a shared library (`.so`, `.dylib`, `.dll`) at runtime. Not statically linked into the Node.js application binary. | **Requires Documented Exception.** Fails automated check `pnpm license:check` without entry in `license-exceptions.json`. |

#### Technical Linking Characteristics:
- `sharp` interacts with `libvips` via dynamic shared library linking (`dlopen`).
- The application's proprietary TypeScript / JavaScript source code is not combined or statically compiled into `libvips`.
- Under LGPL-3.0 Section 4, conveyance of a combined work that uses an LGPL library is permitted if user relinking/replacement is supported, or through a shared library mechanism.
- In server-side SaaS environments where the software is executed as a backend service and not distributed as end-user client binaries, LGPL distribution obligations are typically not triggered.
- **Classification:** `TODO_LEGAL_CONFIRMATION` — Legal confirmation is required to ratify that server-side SaaS deployment of `@img/sharp-libvips-*` under LGPL-3.0-or-later does not impose reciprocal source disclosure on Parisian Shopper proprietary codebase.

---

### 2.2 Background Removal Candidates

| Candidate | License | Evaluation & Viability | Recommendation |
|---|---|---|---|
| **Client/Server AI Model (`@imgly/background-removal-node`)** | GPL-3.0 or Commercial Dual-License | **STRICTLY PROHIBITED.** GPL-3.0 triggers automatic check failure and violates project clean-room policy. | **REJECTED.** |
| **ONNX Runtime (`onnxruntime-node`) + RMBG-1.4** | MIT (runtime) / CC-BY-NC-4.0 (model) | CC-BY-NC prohibits commercial retail use unless model weights are commercially licensed. | **DEFERRED.** |
| **Catalog Photography Pre-Processing (Upstream / Manual)** | Proprietary / Catalog Source | Product images provided with alpha transparency or processed by approved vendor API. | **RECOMMENDED FOR PHASE 2A.** Zero local GPL/LGPL risk. |

---

### 2.3 Image Metadata & Vector Rendering

| Package | Version | License | Linking Characteristics | Policy Status |
|---|---|---|---|---|
| **`exif-reader`** (transitive with sharp) | `^1.0.3` | `MIT` | Pure JavaScript metadata parser. | Allowed by default (`MIT`). |
| **SVG Layout Engine** (built into Sharp) | Native | `LGPL-3.0-or-later` (via librsvg/libvips) | Dynamically linked inside libvips binary bundle. | Covered under the libvips exception proposal. |

---

### 2.4 Cloud Storage SDKs

| Package | Target Version | License | Status |
|---|---|---|---|
| **`@aws-sdk/client-s3`** | `^3.700.0` | `Apache-2.0` | Allowed by default (`Apache-2.0`). |
| **`minio`** (Node.js SDK) | `^8.0.0` | `Apache-2.0` | Allowed by default (`Apache-2.0`). |

---

## 3. Proposed Exception for `license-exceptions.json`

Before `sharp` and `@img/sharp-libvips-*` can be added to `package.json` in PR 2A-2, the following exception entry must be reviewed and approved:

```json
{
  "package": "@img/sharp-libvips-darwin-arm64",
  "versions": ["8.15.2"],
  "license": "LGPL-3.0-or-later",
  "reviewer": "TODO_LEGAL_CONFIRMATION",
  "reviewDate": "2026-10-06",
  "reason": "High-performance native image compositing and format transformation engine. Dynamically linked shared library executing solely within private backend server container; not distributed to client end-users.",
  "evidence": "https://github.com/lovell/sharp-libvips/blob/main/LICENSE",
  "obligations": "Maintain upstream copyright notices, retain LGPL-3.0 license text in deployment container metadata, and preserve dynamic linking mechanism allowing binary substitution.",
  "reReview": "Re-review upon major libvips version bump or if application packaging transitions to distributed client binaries."
}
```
*(Corresponding platform entries required for `darwin-x64`, `linux-x64`, and `linux-arm64` based on deployment target architectures).*

---

## 4. Generative AI Provider Legal & Procurement Separation

We strictly decouple engineering interfaces from procurement/legal sign-offs:

### Technical Engineering Criteria (Architecture Handled):
- TypeScript abstraction (`CreativeProvider` port) isolated in `@parisian-shopper/application`.
- Vendor-agnostic payload schemas and timeout boundaries.
- Full execution auditability (seed, prompt, model, tokens, latency).

### Procurement & Legal Criteria (`TODO_LEGAL_CONFIRMATION`):
1. **Commercial Rights of Output Media:**
   - Legal confirmation that generated visual assets can be used in commercial advertising across digital channels in all target operating jurisdictions.
2. **Copyright Indemnification:**
   - Determination of whether vendor contractual indemnification (e.g., OpenAI Enterprise Customer Agreement or Google Cloud Generative AI Indemnification) is a mandatory corporate requirement prior to public marketing use.
3. **Training Data Exclusions:**
   - Contractual guarantee that product images and proprietary brand prompts uploaded to the provider API are not retained for foundational model re-training.

---

## 5. Summary Action Items

1. [ ] **Legal Review:** Counsel review of LGPL-3.0 dynamic linking in private backend service.
2. [ ] **Exception Approval:** Formally ratify `license-exceptions.json` update prior to merging PR 2A-2.
3. [ ] **Model Terms Review:** Review terms of service for selected candidate provider prior to PR 2A-5.
