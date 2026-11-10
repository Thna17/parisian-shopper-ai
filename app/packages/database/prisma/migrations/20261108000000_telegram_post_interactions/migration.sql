-- Extend the existing interaction store. Legacy IDs and review records remain unchanged.
ALTER TABLE telegram_pending_review_interactions
 ALTER COLUMN content_job_id DROP NOT NULL, ALTER COLUMN content_version_id DROP NOT NULL,
 ADD COLUMN field VARCHAR(40), ADD COLUMN intended_action VARCHAR(40), ADD COLUMN payload JSONB,
 ADD COLUMN actor_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
 ADD COLUMN post_id UUID REFERENCES posts(id) ON DELETE RESTRICT,
 ADD COLUMN post_revision_id UUID REFERENCES post_revisions(id) ON DELETE RESTRICT,
 ADD COLUMN expected_revision INTEGER, ADD COLUMN review_round INTEGER,
 ADD COLUMN claim_token UUID, ADD COLUMN claimed_until TIMESTAMPTZ(3);
ALTER TABLE telegram_pending_review_interactions ADD CONSTRAINT pending_target_scope CHECK (
 (post_id IS NULL AND post_revision_id IS NULL AND content_job_id IS NOT NULL AND content_version_id IS NOT NULL)
 OR (post_id IS NOT NULL AND post_revision_id IS NOT NULL AND actor_user_id IS NOT NULL AND expected_revision IS NOT NULL AND content_job_id IS NULL AND content_version_id IS NULL));
CREATE INDEX pending_post_identity_idx ON telegram_pending_review_interactions(telegram_identity_id,post_id,expires_at);
