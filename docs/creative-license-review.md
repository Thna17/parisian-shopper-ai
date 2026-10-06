# Creative Automation Dependency Licensing Review (Phase 2A)

**Document:** `/docs/creative-license-review.md`

**Status:** APPROVED DEPENDENCY EXCEPTION

**Classification:** MANAGEMENT APPROVAL RECORDED; LEGAL INTERPRETATION REMAINS OUT OF SCOPE

**Reviewer:** `HONG THAN BRATHNA — TECHNICALL DEVELOPER`

**Review date:** 2026-10-06

## 1. Scope and decision

Management approved narrowly scoped exceptions for the platform-specific libvips binaries required by the planned backend use of Sharp 0.33.5. The registered license is `LGPL-3.0-or-later`, as declared by each package's npm metadata.

The approved wording is:

> Approved dependency exception for backend use subject to documented LGPL obligations and re-review if deployment/distribution model changes.

This is an engineering compliance record, not legal advice or a conclusion about the obligations applicable to a future deployment or distribution. Sharp and the libvips packages are not currently installed; this change does not modify a package manifest or lockfile and does not begin compositor implementation.

## 2. Evidence reviewed

The current `app/pnpm-lock.yaml` contains neither `sharp` nor an `@img/sharp-libvips-*` package. Registry metadata for the planned `sharp@0.33.5` identifies these platform-specific libvips optional dependencies at package version `1.0.4`. Registry metadata for each selected binary declares `LGPL-3.0-or-later` and points to the `lovell/sharp-libvips` source repository.

The previous draft incorrectly treated the libvips ABI/version `8.15.x` as the npm package version. The exact npm package version selected by `sharp@0.33.5` is `1.0.4` for the targets below.

Evidence references:

- exact-version npm metadata: <https://www.npmjs.com/package/@img/sharp-libvips-darwin-arm64/v/1.0.4> (integrity `sha512-XblONe153h0O2zuFfTAbQYAX2JhYmDHeWikp1LM9Hul9gVPjFY427k6dFEcOL72O01QxQsWi761svJ/ev9xEDg==`)
- exact-version npm metadata: <https://www.npmjs.com/package/@img/sharp-libvips-linux-x64/v/1.0.4> (integrity `sha512-MmWmQ3iPFZr0Iev+BAgVMb3ZyC4KeFc3jFxnNbEPas60e1cIfevbtuyf9nDGIzOaW9PdnDciJm+wFFaTlj5xYw==`)
- source repository: <https://github.com/lovell/sharp-libvips>

## 3. Deployment target determination

| Use | Evidence in the repository/environment | Required package | Exception status |
|---|---|---|---|
| Developer platform | Current development host reports Darwin ARM64 | `@img/sharp-libvips-darwin-arm64@1.0.4` | Registered |
| CI platform | `.github/workflows/ci.yml` uses GitHub-hosted `ubuntu-latest` jobs; the current target is Ubuntu x64 | `@img/sharp-libvips-linux-x64@1.0.4` | Registered |
| Production deployment | ADR-002 specifies an OCI container on a conventional Linux company host, but the repository does not select CPU architecture, libc, base image, or a production Dockerfile | Not yet determinable | No production-specific exception registered |

No Darwin x64, Linux ARM64, Linux musl, Windows, or other platform package is approved by this decision. If production is fixed to glibc Linux x64 and still uses exactly version `1.0.4`, the registered Linux x64 package is already covered. Any different production target requires an exact package/version review and a separate registry update before installation or deployment.

## 4. Registered exceptions

The authoritative records are in `app/license-exceptions.json`:

| Package | Exact version | Recorded license | Scope |
|---|---:|---|---|
| `@img/sharp-libvips-darwin-arm64` | `1.0.4` | `LGPL-3.0-or-later` | Current Darwin ARM64 developer platform |
| `@img/sharp-libvips-linux-x64` | `1.0.4` | `LGPL-3.0-or-later` | Current Ubuntu x64 CI platform; reusable only for a production target that exactly matches this platform/package/version |

The exception records preserve the approval reason, evidence, obligations, and re-review triggers. They intentionally do not assert that backend use, dynamic linking, private deployment, or SaaS operation eliminates source, relinking, notice, installation-information, or other license obligations.

## 5. Obligations tracked for implementation and release

Before a build containing either binary is distributed or deployed, engineering and the appropriate reviewer must determine which obligations apply to the actual delivery model. At minimum, the project tracks these controls:

- preserve applicable license and copyright notices;
- retain the corresponding LGPL-3.0-or-later license text with a distribution containing the binary;
- identify the exact binary and source-version evidence in release materials;
- assess applicable library replacement, relinking, source, and installation-information requirements for the selected packaging model;
- re-review any package/version, linking, packaging, target-platform, or deployment/distribution change.

These controls describe compliance work to be evaluated; they do not resolve legal interpretation.

## 6. Related candidates outside this approval

This approval covers only the two exact libvips binary packages listed above. It does not approve background-removal models, model weights, commercial AI-provider terms, storage SDKs, other native binaries, or additional platform packages. Those dependencies remain subject to the normal dependency license policy and any required procurement/legal review.

## 7. Remaining legal and deployment assumptions

- The actual production CPU architecture, libc, base image, packaging, and distribution model are not yet recorded in the repository.
- Management approval of an exception is not a legal opinion about which LGPL obligations apply.
- A future deployment may constitute distribution or conveyance in ways that require additional compliance work; the delivery model must be reviewed before release.
- Commercial rights, indemnification, retention, and training terms for any future generative-image provider remain separate procurement/legal decisions.
- The reviewer value is recorded exactly as supplied for this decision: `HONG THAN BRATHNA — TECHNICALL DEVELOPER`.

## 8. Gate outcome

The license exception registration gate is complete for the current Darwin ARM64 development and Ubuntu x64 CI targets at package version `1.0.4`. Installing Sharp or implementing the compositor is explicitly outside this change. Production remains gated until its exact target is selected or confirmed to match the already registered Linux x64 package and version.
