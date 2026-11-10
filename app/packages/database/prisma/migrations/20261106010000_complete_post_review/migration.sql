-- Additive: legacy approvals and existing Post versions/decisions remain untouched.
ALTER TABLE posts ADD COLUMN review_round INTEGER NOT NULL DEFAULT 0 CHECK (review_round >= 0);
ALTER TABLE post_revisions ADD COLUMN caption_draft JSONB, ADD COLUMN caption_validation JSONB;
ALTER TABLE post_events ADD COLUMN review_round INTEGER CHECK (review_round >= 0);
ALTER TABLE post_events ADD COLUMN validation_snapshot JSONB;
ALTER TABLE post_revisions ADD COLUMN campaign_snapshot JSONB;
