# Licensing and architecture decision gate

**Project:** Parisian Shopper AI Telegram Content System  
**Prepared:** 2026-10-04  
**Gate status:** **RESOLVED — management approved Option C on 2026-10-04**

> This document is an engineering and planning analysis, not legal advice. It separates confirmed repository facts from technical interpretation and identifies issues that require management and qualified legal review.

## Decision resolution

Management selected **Option C — Clean-room Parisian Shopper application**. Postiz and the repositories under `/research` are research references only; their source code is not an implementation input. [ADR-001](architecture-decisions/ADR-001-open-source-foundation.md) is `SUPERSEDED`, and [ADR-002](architecture-decisions/ADR-002-clean-room-application-stack.md) records the accepted permissively licensed stack.

This resolution preserves the analysis below as the historical licensing gate. Clean-room Phase 1A scaffolding may proceed after architecture review. A real Product API adapter remains gated on owner-confirmed semantics and sanitized fixtures.

## Evidence categories used in this document

- **Confirmed license text:** a fact directly supported by a license file, repository metadata, or an official publisher page.
- **Technical interpretation:** an engineering assessment of how a license choice affects likely architecture, delivery, and operations. It is not a legal conclusion.
- **Management/legal confirmation required:** a question whose answer depends on intended deployment, corporate policy, contracts, jurisdiction, or legal interpretation.

# 1. Current situation

The previous research selected Postiz as the preferred **technical** foundation because it is the only reviewed project with a mature application shell, PostgreSQL, organizations and users, Temporal workflows, scheduling, analytics, media management, and broad official social integrations. That selection was not treated as a final implementation decision before the business accepted a licensing path. Management subsequently selected the independent clean-room path described above.

## Confirmed repository licensing

| Repository | Confirmed local evidence | Reuse position for this project |
|---|---|---|
| Postiz | Root `LICENSE` contains GNU AGPL version 3; root `package.json` declares `AGPL-3.0`; README repeats AGPL-3.0 | May be used only under an approved AGPL compliance plan or a separately executed alternative agreement |
| NicheBot | Root `LICENSE` contains the MIT License | Code may be reused under MIT conditions, including retaining the copyright and permission notice; architectural fit still must be assessed |
| Muse | Root `LICENSE` contains the MIT License | Code may be reused under MIT conditions; clean-room adaptation is preferable where its Cloudflare-specific model does not fit |
| MAX2 | Root `LICENSE` contains the MIT License | Workflow/code may be reused under MIT conditions, subject to separate n8n runtime terms and technical review |
| Ngocphamnek/agent | No license file was found. The README says MIT and links to a missing `LICENSE` file | **Do not copy implementation code.** Seek a complete license grant and verify upstream-fork provenance first |
| ai-social-media-bot | No license file was found. The README contains only a short “MIT License” statement, not the MIT permission text | **Do not copy implementation code or import the workflow.** Seek a complete license grant first |

An absent or incomplete license does not place public source code in the public domain. From an engineering governance perspective, the safe default is that we have no dependable permission to reproduce, modify, merge, or distribute that implementation. We may study behavior, workflows, interfaces, and general ideas, then implement our own solution without copying protected expression.

## Confirmed information about alternative Postiz offerings

- The public Postiz repository and official product pages identify the self-hosted source as AGPL-3.0.
- Postiz offers a hosted cloud service.
- Postiz has an official [Enterprise offering](https://postiz.com/enterprise) described as a white-label/headless API service for SaaS integrations.
- No public repository text or official page reviewed for this gate confirms that Enterprise includes a proprietary or alternative license to modify and privately deploy the Postiz source code.
- The local Postiz contributor agreements consolidate broad rights with the project while also stating commitments concerning continued free/open licensing. They do not grant Parisian Shopper an alternative license.

Therefore **Option B is a commercial inquiry, not a currently available confirmed license path**. Management would need a written offer whose scope explicitly covers the intended source use, modifications, deployment, confidentiality, affiliates, contractors, resale, support, termination, and continued-use rights.

# 2. Postiz implications

## Confirmed AGPL mechanics relevant to engineering

The checked-out Postiz code is licensed under AGPL-3.0. The license text:

- permits running, studying, modifying, and sharing the covered work subject to its conditions;
- requires preservation of notices and licensing of covered derivative work under the AGPL when conveyed;
- defines “Corresponding Source” broadly enough to include source and material needed to generate, install, and run the covered work, subject to its definitions and exceptions;
- adds a network-interaction requirement in section 13: a modified version that supports remote network interaction must prominently offer those remote users an opportunity to receive the Corresponding Source of that version.

The [GNU AGPL text](https://www.gnu.org/licenses/agpl-3.0.en.html) and [GNU license FAQ](https://www.gnu.org/licenses/gpl-faq.html#UnreleasedModsAGPL) are useful primary references. How those provisions apply to the exact corporate and technical arrangement requires legal review.

## Practical engineering interpretation

| Scenario | Practical implication for planning | What is not yet a legal conclusion |
|---|---|---|
| **Modified source code** | A Postiz fork with Parisian-specific changes should be managed as an AGPL-covered derivative unless a different written license says otherwise. Preserve notices, modification history, build files, and a reproducible source package from day one | The exact boundary between covered modifications, linked modules, independent services, and mere aggregation |
| **Network deployment** | Postiz is a network application. If staff or customers remotely interact with a modified deployment, design for a prominent source-offer mechanism and an operational process to publish the correct corresponding source | Exactly which people qualify as remote users and which repositories/files are part of the corresponding source in the final topology |
| **Internal company use** | Purely internal deployment may be less commercially sensitive than public SaaS, but “internal” should not be used as shorthand for “no obligations.” Employees, contractors, group companies, franchisees, agencies, and external operators can create different facts | Whether a particular Auralis/Parisian user population, affiliate arrangement, or contractor access triggers particular obligations under applicable law |
| **External SaaS use** | A modified customer-facing Postiz service is the clearest engineering case for planning a source offer to network users. Private proprietary changes inside the covered application should be assumed at risk until counsel confirms otherwise | The precise scope of source that must be offered and whether separately deployed services are a combined work |
| **Distribution** | Shipping containers, on-premise packages, binaries, appliances, or source copies to another entity creates additional conveyance/distribution compliance work: license copy, notices, corresponding source, installation information where applicable, and downstream rights | Whether a particular affiliate or managed-service arrangement is internal operation or distribution/conveyance |
| **Source availability** | Maintain an exact mapping from deployed build to source commit, lockfiles, patches, build instructions, and source-offer URL. Do not wait until launch to reconstruct this | The final delivery method and retention period required for the intended distribution model |
| **Proprietary Parisian modules** | Code placed directly inside or tightly combined with the Postiz application may be difficult to keep private. Strong service/API boundaries can improve maintainability and factual isolation but are not a legal safe harbor by themselves | Whether any particular plug-in, library, frontend, database extension, or separate service is legally independent of the AGPL work |
| **Future resale/commercialization** | AGPL does not prohibit charging money, but customers/remote users may receive source rights to the covered work. This may conflict with a business model that depends on exclusive source or resale restrictions | Whether the planned product can meet its commercial goals under AGPL or needs negotiated rights |

## Questions requiring management/legal confirmation

1. Is Parisian Shopper/Auralis willing to publish the corresponding source of its modified Postiz deployment to users who are entitled to it?
2. Which users will access the system: direct employees only, contractors, affiliated companies, agencies, customers, franchisees, or the public?
3. Will the system ever be sold, licensed, white-labeled, hosted for third parties, or transferred as containers/on-premise software?
4. Which company-specific functionality must remain confidential, and is it expected to live inside the foundation or behind a separately designed service boundary?
5. Does counsel consider the proposed service boundaries legally independent for this deployment and jurisdiction?
6. Will Postiz offer a written alternative license, and does it cover source modification/private deployment rather than only access to its hosted Enterprise API?
7. Who will own AGPL compliance operations: notices, source publication, deployment-to-source mapping, third-party notices, and responding to source requests?

# 3. Architecture options

## Scoring method

Scores are directional estimates for decision-making, not delivery estimates.

- For **development speed, social publishing support, Telegram customization, AI customization, ability to keep code private, and ability to commercialize**, `10` is most favorable.
- For **engineering complexity, long-term maintenance burden, license risk, vendor lock-in, and migration risk**, `10` is the greatest burden or risk.
- Scores should be revisited after the Product API is known and, for Options B/D, after vendor/foundation discovery.

| Criterion | Option A: Postiz fork under AGPL | Option B: Postiz alternative license | Option C: Clean-room Parisian application | Option D: Another permissive foundation |
|---|---:|---:|---:|---:|
| Development speed | 9 | 9 | 5 | 6 |
| Engineering complexity | 6 | 6 | 9 | 7 |
| Long-term maintenance burden | 8 | 7 | 8 | 7 |
| Social publishing support | 10 | 10 | 5 | 7 |
| Telegram customization | 7 | 7 | 10 | 7 |
| AI customization | 8 | 8 | 10 | 8 |
| License risk | 9 | 3* | 2 | 4* |
| Vendor lock-in | 5 | 8 | 2 | 5 |
| Ability to keep company-specific code private | 2* | 9* | 10 | 8* |
| Ability to commercialize later | 5 | 9* | 10 | 8* |
| Estimated migration risk | 8 | 5 | 3 | 7 |

`*` depends on a signed contract or a fully reviewed candidate and its dependency licenses.

## OPTION A — Postiz fork under AGPL

**Description:** Fork Postiz, implement Parisian modules in that derivative, comply with AGPL-3.0, and plan source availability as part of delivery.

**Strengths**

- Fastest confirmed route to mature social publishing, scheduling, media, collaboration, analytics, and durable workflows.
- Strong upstream activity and a large user community.
- Avoids rebuilding platform features needed in later phases.

**Costs and risks**

- Management must accept an open-source compliance model for the covered deployment.
- Company-specific changes within the covered work may have to be made available to qualifying users.
- Rapid upstream development creates recurring merge, regression, and migration work.
- Moving away later is difficult because new domain code may become coupled to Postiz data models, UI, and Temporal workflows.

**Appropriate when:** speed and existing social integrations outweigh source confidentiality, and management/counsel approve the compliance plan.

## OPTION B — Postiz with a commercial/alternative license if available

**Description:** Negotiate written terms permitting the intended private modifications, deployments, and commercialization.

**Strengths**

- Potentially retains Option A's technical speed while protecting company-specific source.
- May include support, white-label features, provider approvals, or contractual assurances.

**Costs and risks**

- Availability is **not confirmed**. The publicly advertised Enterprise API/service is not evidence of an alternative source license.
- Creates pricing, renewal, termination, usage-limit, and vendor-dependency risks.
- Contract must address existing community contributions and confirm the licensor can grant the necessary rights to the entire codebase/version used.
- The agreement must distinguish hosted API access from rights to modify and privately deploy source.

**Appropriate when:** Postiz provides acceptable written terms after technical and legal diligence.

## OPTION C — Clean-room Parisian Shopper application

**Description:** Study Postiz's architecture and public behavior, but write an independent Parisian application without copying AGPL source. Use permissively licensed libraries/components and official provider APIs.

**Strengths**

- Best control over source confidentiality, product-specific design, Telegram UX, AI boundaries, and future commercialization.
- Can model immutable product snapshots, append-only revisions, and audit events directly instead of adapting a social scheduler's schema.
- Minimizes foundation-level copyleft and vendor lock-in when dependency governance is enforced.

**Costs and risks**

- Slowest initial route and greatest engineering effort.
- Authentication, administration, media, observability, social OAuth, scheduling, analytics, and provider maintenance must be built or integrated deliberately.
- “Clean room” requires provenance discipline: specifications and independently written code, no copying from Postiz or unlicensed references.

**Appropriate when:** source privacy and commercialization flexibility are strategic requirements, or management cannot accept AGPL.

## OPTION D — Another permissively licensed social-media foundation

**Description:** Run a new discovery process for an actively maintained MIT/Apache/BSD foundation with suitable social providers, then validate all first- and transitive-license obligations.

**Strengths**

- Could reduce build time compared with Option C while preserving more private-code flexibility than AGPL.
- May provide a narrower social integration layer without Postiz's full application footprint.

**Costs and risks**

- None of the already reviewed permissive repositories qualifies as a comparable foundation.
- Candidate discovery delays implementation and may still end with a partial, abandoned, or operationally weak project.
- License claims, contributor provenance, dependency licenses, API compliance, security, and maintenance must all be re-audited.
- Migration risk is high until a concrete candidate passes a proof of concept.

**Appropriate when:** management wants a foundation but rejects both AGPL and the clean-room cost, and accepts a time-boxed discovery phase.

# 4. Recommendation

## Technical recommendation

**Option A — Postiz fork under AGPL** remains the strongest purely technical recommendation. It provides the highest development speed and best future social-publishing coverage. This recommendation is conditional on management and legal acceptance of AGPL compliance and on designing company-specific boundaries with full awareness that service separation alone does not settle license scope.

If Postiz confirms an acceptable alternative source license in writing, **Option B** could become technically and commercially preferable, but no such license was confirmed during this gate.

## Business/licensing-safe recommendation

**Option C — Clean-room Parisian Shopper application** is the safest current recommendation when the business has not affirmatively accepted AGPL source obligations and wants to preserve company-specific code and commercialization flexibility.

Use Postiz only as architectural research. Select permissively licensed libraries individually, record their provenance, and implement the product/AI/approval domain independently. Official social APIs can be added after the MVP; they should not drive the first architecture because the MVP terminates at approval.

This recommendation deliberately trades initial speed for clearer ownership and licensing control. Management may instead choose Option A after informed acceptance, or Option B after obtaining a suitable signed agreement.

# 5. Decision required from management

> **We need to choose one of these approaches before implementation:**
>
> 1. Use Postiz and accept that the modified covered application will be managed under AGPL-3.0, including required source availability.
> 2. Ask Postiz for a commercial/alternative source license and proceed only if written terms meet our privacy, deployment, and resale needs.
> 3. Build our own clean-room application using permissive components, which is slower initially but best protects private company code and future commercialization.
> 4. Pause for a time-boxed search for another permissively licensed foundation; none of the projects already reviewed is suitable.
>
> **No application implementation should begin until management records one choice and legal review confirms any required license or compliance plan.** Product API contract work and architecture specifications may continue because they are independent of the foundation.

# 6. Product API prerequisites

The foundation choice does not change the requirement for an authoritative, sanitized Product API contract. The draft contract is in [`product-api-contract-draft.md`](product-api-contract-draft.md).

Before integration, Parisian Shopper/Auralis must confirm:

- field definitions, types, nullability, enumerations, and source ownership;
- whether prices include tax and how decimal precision is represented;
- promotion validity rules and whether `discount` is supplied or deterministically derived;
- stock-status semantics and freshness expectations;
- which fragrance notes, origin, and similarity claims are approved for marketing use;
- authentication, authorization, rate limits, pagination, timeouts, retries, versioning, and error contracts;
- stable product identifiers, update timestamps, ETag/version support, and image-host allowlists;
- sanitized non-production fixtures for contract tests.

No production API access is requested or authorized by this document.

# 7. Architecture invariants

These rules apply to every option and may not be weakened by framework or vendor choice:

1. The Parisian Shopper product database/API is the factual source of truth.
2. Product snapshots used for generation are immutable.
3. Content revisions are append-only.
4. Approval events are immutable and auditable.
5. AI cannot directly modify canonical product facts.
6. Deterministic validation runs before approval.
7. Telegram is an interface, not the business logic layer.
8. Telegram users are authenticated by numeric Telegram ID mapped to internal users.
9. `APPROVED` and `PUBLISHED` are separate states.
10. The MVP terminates at `APPROVED`.
11. Automatic publishing is disabled server-side.
12. Reference repositories with incompatible or missing licenses may be studied but not copied.

## Historical gate exit criteria

The original gate required the following. The foundation/licensing portion is now satisfied by Option C and ADR-002; Product API items remain an integration gate rather than a Phase 1A scaffolding gate:

- management selects Option A, B, C, or D — **satisfied: Option C**;
- legal/licensing review confirms the selected path where required;
- ADR-001 is changed from `PROPOSED` to `ACCEPTED`, `REJECTED`, or `SUPERSEDED` as appropriate — **satisfied: `SUPERSEDED`**;
- for Option B, a signed alternative license is available and its scope is summarized in a confidential decision record;
- for Option D, a named candidate has passed license, architecture, security, activity, and proof-of-concept gates;
- the Product API owner confirms the contract fields and supplies sanitized fixtures — **required before real adapter integration, not before Phase 1A**;
- implementation acceptance tests are specified for the twelve invariants — **satisfied by the MVP acceptance test plan**.
