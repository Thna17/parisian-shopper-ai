# Persistent staff posts

Implemented 2026-11-05.

## Staff routes

- `/posts` lists saved posts, with pagination and resumable links.
- `/posts/new` saves a product, brief, channel, language and optional campaign. Saving never invokes a provider or a queue.
- `/posts/:id` loads the saved Post and current revision from PostgreSQL. It shows the exact linked caption, poster version, saved image, product facts and campaign; missing work is identified explicitly.
- Older `/posts/:captionJobId` links fall back to the existing caption view. Existing `/content`, `/creative`, review and publishing URLs remain available.

## Persistence and safety

The additive `20261105120000_persistent_staff_posts` migration creates `posts`, `post_revisions`, and `post_events`. Existing records are not rewritten. Post revisions and events are append-only in PostgreSQL. Existing caption and poster decisions remain in their original tables and are included with the pinned versions.

Each edit saves a new immutable revision. Optimistic revision checks reject stale writes. Editing an approved Post returns it to DRAFT and records an approval-invalidation event. A submitted Post must first receive a request for changes before it can be edited.

Only the creator with editing permission can edit or submit a Post. Reviewers need both caption and creative approval permissions. The Post creator, all revision authors, and the requesters/authors of linked source work are excluded from approving their own work, including administrators. A second account used by the same person is not an independent human review.

Submission and approval require an exact caption/poster/image association and passing saved validation results. The Post review does not grant export permissions or replace the existing caption, creative approval, rights or publishing controls. No publishing endpoint is called by this workflow.

`visual_assets.scene_version_id` records which immutable scene version a saved render represents. New renders write this association. Historical images without this evidence cannot be linked as an exact Post render; render the scene again using the existing compositor. No historical asset metadata is rewritten.

The authenticated `/v1/posts/:id/image` endpoint checks Post access and serves the saved image with private/no-store headers. Owning a Post does not grant access to another user's private source caption or poster.

## Remaining integration work

This phase creates the persistent aggregate. Caption and poster generation are still reached through the existing tools; there is no automatic combined provider dispatch. Existing work must be explicitly linked to the Post. No historical Posts are backfilled automatically. A final Post approval does not automatically approve a standalone creative for export or publish anything.

## Verification

Policy tests cover ownership, source associations and transitions. Database integration tests apply all migrations to a disposable database and cover persistence, foreign/version mismatches, independent review, self-approval rejection, incomplete submissions, append-only history, reapproval after edit and concurrent/stale saves. Set `POST_TEST_ADMIN_DATABASE_URL` to a local PostgreSQL administrator URL to create a disposable `post_test_*` database, or run with Docker for Testcontainers. Tests only drop the disposable database they created.

Web tests cover creating a saved Post, direct loading of pinned captions and image, preserving associations when editing, and listing resumable posts. A local API smoke check saved one metadata-only verification draft and reloaded it without dispatching generation.

## Image generation follow-up

Persistent Posts now support a bundled generated caption/poster artifact through `PostRevision.generationId`, with a durable dispatch ledger and fake-provider verification. See [Post image generation](post-image-generation.md) for the exact configuration, one-request confirmation gate, restart/reconciliation behavior, and remaining live-provider/editor/export limitations. This supersedes the earlier statement that no generation route is connected; legacy caption/scene associations remain supported.

## Complete Post final review

The Post workspace now supports revision-specific caption editing and one final independent review. It freezes campaign context, binds decisions to a submission round, and preserves standalone approval history. See [Complete Post review](complete-post-review.md). This supersedes earlier notes that bundled caption editing was unavailable.
