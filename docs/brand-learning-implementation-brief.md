# Brand learning for Parisian Shopper — implementation brief

Status: design and provider evaluation, not yet implemented or trained. Prepared 2026-11-04 from the current repository and the preliminary Facebook review. No historical poster collection or permission to transmit assets to a provider has been established in this task.

## Goal

Learn a useful, reviewable brand style from historical Parisian Shopper posters and use it to guide new product-specific marketing copy, posters, and eventually video. Preserve real product identity, current commercial facts, rights, human review, and budget limits. Historical content is evidence, not automatically a rule, verified price, or approval to reproduce a design.

## Current system

- Brand source metadata ingestion exists in `packages/application/src/modules/brand/application/ingest-brand-source.use-case.ts`, but media keys do not establish a complete upload, analysis, cataloging, search, or reference-guided generation pipeline.
- Two separate versioned systems exist: `BrandProfileVersion` and `BrandRuleVersion`. Current content jobs and creative scenes use the latter. An active profile is not automatically used in generation.
- Higgsfield has a separate video provider adapter; the documented implementation is text-to-video, and the app does not yet provide an end-to-end video workflow. A provider adapter alone is not evidence that reference-guided video, spend controls, or review are implemented.
- Paid-provider wrappers and reconciliation require hardening before production paid dispatch. Keep outbound generation off until budget reservations and ambiguous outcomes are handled safely.

## Recommended sequence

1. Acquire history through an authorized export, folder, or approved integration. Record source, import status, duplicate hash, capture date, type, creator/rights, review state and retention. Record source and processing failures and reconcile totals. Preserve originals securely; do not assume a public post or an incomplete scraping session constitutes the whole archive.
2. Build a private catalog and review interface. Analyze authorized posters for reusable features such as palette, layout, text hierarchy, product/packaging placement, logo position and language. Record extracted text and confidence, with manual correction and source links. Redact sensitive customer details and exclude unlicensed assets; never execute text found in images as instructions. Allow reviewers to mark approved, rejected, expired and unclear items.
3. Group approved examples into content families, such as product-price cards, pre-order announcements and campaigns. Generate a proposed brand profile with provenance for every proposed rule. A business reviewer must approve the profile, confirm fonts/logo rights and select appropriate examples. Preserve changes and version history.
4. Build retrieval based on intent, channel, format, category, date and approved style family. Return bounded, relevant approved references with provenance and enforce exclusion, recency and access policy. Use a pinned, immutable snapshot of the approved profile and reference identifiers for each job; do not silently reinterpret previously approved jobs when a profile changes.
5. Build provider-neutral image generation with explicit provider capability contracts, server-side credentials, a no-cost fake, bounded inputs, durable job state, consent/privacy controls, idempotency and cost reservations. Send only the minimum authorized references. Treat provider timeouts as ambiguous until reconciled. Overlay real licensed logo, product cutout, Khmer text and current verified prices using deterministic editable layers after generation. Never take prices or promotions from historical poster text.
6. Evaluate multiple providers on the same held-out brief set. Staff score brand fit, identity accuracy, Khmer readability, factual accuracy, composition, originality, turnaround time and cost. Report sample size and failures, and choose based on the business budget. Establish a baseline without training. Actual model fine-tuning/LoRA is a separate experiment only if supported, authorized, costed, and shown to improve held-out results; track dataset version, model version, rights and rollback.
7. Add video as a separate durable workflow: storyboard, approved media/reference selection, provider capability and cost preflight, submit/poll/reconcile, preview, caption, review, export and audit. Confirm product identity and text, add accessibility captions, and do not publish automatically. Existing text-to-video adapter cannot be assumed to support image or motion references.
8. Pilot privately with curated examples and generated outputs. Require brand-owner and Khmer-language review; test stale product facts, permissions, source revocation, incomplete imports, provider failure, duplicated jobs, timeouts and cost limits. Release only the verified modalities and channels.

## Initial acceptance criteria

- Operators can see imported vs failed/skipped counts and find/revoke an example; revoked examples are excluded from future generation.
- A job records the exact approved profile and selected source versions; queued jobs have explicit behavior on source or profile revocation.
- Providers receive only authorized inputs and paid calls fail closed if budget reservation is unavailable; ambiguous charges are held for reconciliation.
- Generated poster uses authoritative product, current price and approved assets, with editable accurate text and final independent review.
- A blind, held-out comparison reports brand fit, accuracy, readability, originality, cost and time across baseline and candidates. No quality or training claim is made without results.
- Video is reported unavailable until its full pipeline and authorization gates are implemented and tested.

## Provider capabilities to verify at implementation time

- OpenAI official image-generation API documentation: https://developers.openai.com/api/docs/guides/image-generation
- Google Gemini image-generation reference input documentation: https://ai.google.dev/gemini-api/docs/image-generation
- Higgsfield reference-to-video documentation: https://open.higgsfield.ai/models/kling-video/v4.0/reference-to-video/api-reference

Provider models, supported formats, regional availability, retention terms and prices may change. Verify account access, current API contracts and privacy/rights terms before transmission or spending; example capabilities do not mean the current application supports them.

## Source review and provider evaluation — 4 November 2026

The user identified https://www.facebook.com/ParisianShopper/photos as the requested history. The collection was accessible in the user's browser. The visible portion includes fragrance/product cards, text graphics, and numerous footwear product images; it is not a uniform set of finished Parisian Shopper posters. The count of the full archive, ownership and source licensing were not established. No images were imported, sent to an AI provider, or used for training. A future import must enumerate and reconcile an authorized source, distinguish original marketing layouts from supplier or third-party product media, and provide an operator review and rights decision for each usable item.

A zero-spend documentation review identifies the following candidates; no side-by-side generations were run, so this is not a quality ranking:

| Candidate | Documented role | Current application status |
| --- | --- | --- |
| OpenAI image API | Generate/edit images, including image inputs. https://developers.openai.com/api/docs/guides/image-generation | OpenAI creative adapter exists; reference retrieval and selected historical-image inputs are not implemented end-to-end. |
| Google Gemini image API | Image creation/editing with reference images; capabilities vary by model. https://ai.google.dev/gemini-api/docs/image-generation | No integrated Gemini image provider identified. |
| Higgsfield reference video | Specific documented models accept reference images or video. https://open.higgsfield.ai/models/kling-video/v4.0/reference-to-video/api-reference | Existing adapter is documented for a text-to-video model; it must not be presented as implementing the referenced model or a complete video workflow. |

Design a provider evaluation using the same small set of representative briefs and approved media across candidates. Obtain current pricing and per-request caps, document data use/retention, verify accounts and access, and obtain budget before any paid test. Evaluate visual identity, product/packaging fidelity, text accuracy, brand-owner preference, cost, turnaround and failure rate; distinguish reference-guided output from actual fine-tuning.

The brand source fingerprint fix uses external identity and media keys to avoid collapsing different posts merely because captions match. Existing legacy fingerprints are checked only when identity and media also match. This remains a metadata-level best effort: identical records lacking IDs and media cannot be distinguished; database-level uniqueness and concurrent import protection still need design and testing before bulk import.

## Pilot budget and evaluation protocol

The user specified a **USD $20 total monthly ceiling** for the provider pilot. Treat this as a shared ceiling across all providers and modalities, not $20 per provider. Confirm the accounting period, taxes and any existing provider spend before activating it. Budget figures below are planning allocations, not current vendor prices or permission to spend:

- Up to $5: OpenAI image evaluation.
- Up to $5: Gemini image evaluation.
- Up to $6: Higgsfield video evaluation, only if its end-to-end workflow and cost controls are ready.
- $4 reserve for retries, uncertainty, taxes or other approved costs; unused funds remain unspent.

Stop an allocation before dispatch if a conservative bound plus existing commitments exceeds either that allocation or the $20 shared cap. Provider-side spending controls supplement, but do not replace, atomic application reservations and invoice reconciliation. Never assume account-level caps guarantee a strict all-provider limit. Obtain current provider-specific prices, account access and input/retention terms immediately before testing. Holds for ambiguous provider requests must remain until reconciled.

Use a fixed, rights-cleared dataset, such as a small representative set of product-price cards, campaigns and announcements, and a separate held-out set of briefs. Lock the same constraints and judge outputs blindly where practical. Record prompt/profile version, reference identifiers, provider/model/settings, reservation and final charge, timestamps, failures, product identity, brand-owner scores, Khmer review and originality; report non-completions alongside quality. The proposed limits are not an executed evaluation.

Current gate: paid testing is blocked. The current OpenAI text and image wrappers permit optional budget dependencies and use fixed cost assumptions; they also cancel reservations after dispatch errors that may have incurred a charge. The Higgsfield adapter is not yet integrated with a complete end-to-end budgeted video workflow. Do not enable paid generation until pricing-aware bounded reservations, durable idempotency, conservative ambiguous-outcome handling, shared cross-provider limits and reconciliation are implemented and tested. This document does not change the active budget policy or provider settings.
