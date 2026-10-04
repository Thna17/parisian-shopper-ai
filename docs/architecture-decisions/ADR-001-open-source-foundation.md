# ADR-001: Choose the open-source application foundation

- **Status:** SUPERSEDED
- **Originally drafted:** 2026-10-03
- **Last updated:** 2026-10-04
- **Decision owners:** Parisian Shopper/Auralis management, engineering, and legal/licensing reviewer
- **Implementation gate:** Superseded by the clean-room decision in ADR-002

## Supersession record

On 2026-10-04, management approved **Option C — Clean-room Parisian Shopper application**. Postiz and the other repositories under `/research` remain research material only. No source code, mechanically translated implementation, or unique restricted implementation structure may be taken from them.

The canonical stack and current implementation gate are defined by [ADR-002](ADR-002-clean-room-application-stack.md). The remainder of this ADR is retained unchanged as the historical record of the alternatives, licensing gate, and reasoning that led to the clean-room decision.

## Context

Parisian Shopper needs a production system in which staff use Telegram to find products from an authoritative Product API, generate Khmer and English marketing copy, revise it, and approve or reject an exact version. Product facts must never be invented or silently changed. Revisions and approval events must be durable and auditable. The MVP must end at `APPROVED`; automatic publishing must remain unavailable server-side.

Repository research found that Postiz is the strongest technical foundation. It supplies a mature TypeScript application, PostgreSQL/Prisma, organizations and users, Temporal workflows, media, calendar, analytics, and official social-provider integrations.

Postiz is licensed under AGPL-3.0. At the time this ADR was proposed, management had not yet decided whether the business would accept AGPL obligations, seek alternative commercial terms, build independently, or investigate another permissive foundation. Management subsequently selected Option C; see the supersession record above.

Detailed evidence:

- [`../open-source-analysis.md`](../open-source-analysis.md)
- [`../licensing-decision.md`](../licensing-decision.md)
- [`../product-api-contract-draft.md`](../product-api-contract-draft.md)

## Decision drivers

1. Product facts must remain authoritative and deterministically validated.
2. Content and approval history must be immutable and auditable.
3. Telegram needs deep customization but must remain an interface adapter.
4. The future roadmap needs reliable official social integrations.
5. Company-specific source confidentiality and future commercialization may be strategic requirements.
6. The chosen license must be knowingly accepted and operationally supportable.
7. The foundation must have a credible maintenance and security path.
8. Automatic publishing must be impossible in MVP.

## Options under consideration

### OPTION A — Postiz fork under AGPL

Use Postiz as the application foundation and operate the derivative under an approved AGPL-3.0 compliance plan.

- Best technical speed and social-provider coverage.
- High license/compliance significance.
- Potential conflict with keeping covered company-specific modifications private.
- High migration cost if reconsidered after implementation.

### OPTION B — Postiz under a commercial/alternative license

Ask Postiz for written alternative terms that explicitly permit the intended source modification, private deployment, affiliate/contractor use, and future commercialization.

- Could preserve Postiz's technical advantages and private-code goals.
- Availability is not confirmed. The public Enterprise hosted/headless offering is not proof of an alternative source license.
- Creates contractual cost, renewal, termination, and vendor-dependency risks.

### OPTION C — Clean-room Parisian Shopper application

Use Postiz only as architectural inspiration and independently implement the system with permissively licensed components and official APIs. Do not copy Postiz AGPL source or code from unlicensed references.

- Strongest source-privacy, product-domain, and commercialization control.
- Highest initial engineering effort and slower route to later social features.
- Lowest foundation migration risk when boundaries are designed for the actual product.

### OPTION D — Another permissively licensed social-media foundation

Run a time-boxed discovery and proof of concept for a named MIT/Apache/BSD candidate.

- Might balance build speed and private-code goals.
- No already reviewed project is suitable as that foundation.
- Defers the decision and introduces new license, security, activity, and architecture diligence.

## Recommendations presented for decision

- **Technical recommendation:** Option A, provided management and legal/licensing review accept and operationalize AGPL compliance. If a suitable alternative source license is actually offered, Option B may become preferable.
- **Business/licensing-safe recommendation:** Option C while private company code and future commercialization are expected and AGPL has not been affirmatively accepted.

These recommendations intentionally differed. Management selected the business/licensing-safe recommendation, Option C, so this ADR is now `SUPERSEDED`.

## Historical non-decision

While this ADR was proposed, no foundation was authorized by it. The following restrictions remain applicable to the clean-room project:

- do not copy Postiz into `/app`;
- do not create a Postiz fork for application implementation;
- do not copy code or workflows from `research/`;
- do not start feature implementation until ADR-002 and the architecture readiness documents are accepted;
- do not contact or connect to the production Product API;
- do not enable social publishing.

Documentation, threat modeling, sanitized Product API contract review, and acceptance-test design may continue.

## Architecture invariants

These apply regardless of which option is chosen:

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

## Management record

The options presented to management were:

- **A:** accept an AGPL-based Postiz derivative and authorize creation of a compliance plan;
- **B:** authorize a Postiz commercial-license inquiry and wait for acceptable signed terms;
- **C:** authorize a clean-room Parisian application and its higher initial engineering budget;
- **D:** authorize a time-boxed discovery for another permissively licensed foundation.

The selected record is **C**. Before production deployment, management still must identify the accountable license owner and confirm the intended deployment/commercialization model.

The original decision record also requested:

- expected users and deployment model;
- whether source confidentiality is required;
- whether external SaaS, resale, white-labeling, affiliate use, or on-premise distribution is planned;
- the person accountable for licensing compliance.

## Historical status transition rules

- Change this ADR to **ACCEPTED** if Option A is approved with a documented compliance plan.
- Change it to **ACCEPTED** if Option B results in signed terms and Postiz remains the chosen foundation; reference the confidential contract decision without committing sensitive terms.
- Change it to **SUPERSEDED** if Option C is selected, and create a new ADR naming the clean-room stack.
- Keep it **PROPOSED** during Option D discovery; then mark it **SUPERSEDED** if another foundation is accepted or **REJECTED** if Postiz is explicitly ruled out without a replacement decision.

## Gate exit criteria

Under this ADR, application implementation could begin only after:

1. management records A, B, C, or D — **satisfied: C**;
2. required legal/licensing review is complete — **clean-room policy recorded; ongoing dependency review remains required**;
3. the relevant ADR status is no longer `PROPOSED` — **satisfied by ADR-002**;
4. the Product API owner approves field semantics and supplies sanitized fixtures;
5. the threat model and acceptance tests cover all twelve architecture invariants.
