-- Additive only. Historical revisions remain unchanged; plans belong to new immutable revisions.
ALTER TABLE post_revisions ADD COLUMN creation_plan JSONB;
ALTER TYPE "PostStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
