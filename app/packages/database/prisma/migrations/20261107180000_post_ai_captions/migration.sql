-- Additive caption dispatch and explicit brand-rule approvals. No historical rewrites.
CREATE TABLE post_caption_brand_approvals (
 id UUID PRIMARY KEY, brand_rule_version_id UUID NOT NULL REFERENCES brand_rule_versions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 rules_digest CHAR(64) NOT NULL, rules_snapshot JSONB NOT NULL,
 approved_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT post_caption_brand_digest_key UNIQUE(brand_rule_version_id,rules_digest)
);
CREATE TABLE post_caption_attempts (
 id UUID PRIMARY KEY, post_id UUID NOT NULL REFERENCES posts(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 source_revision_id UUID NOT NULL UNIQUE REFERENCES post_revisions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 source_revision_number INTEGER NOT NULL, requester_user_id UUID NOT NULL,
 brand_rule_version_id UUID, brand_rule_digest CHAR(64), method VARCHAR(20) NOT NULL,
 status VARCHAR(30) NOT NULL DEFAULT 'QUEUED', provider VARCHAR(40) NOT NULL, model VARCHAR(200) NOT NULL,
 context JSONB, output JSONB, validation JSONB, provenance JSONB, provider_request_id VARCHAR(200), error TEXT,
 deadline TIMESTAMPTZ(3) NOT NULL, created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX post_caption_attempts_post_id_status_idx ON post_caption_attempts(post_id,status);
ALTER TABLE post_revisions ADD COLUMN caption_generation_id UUID REFERENCES post_caption_attempts(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD COLUMN caption_provenance JSONB;
CREATE TRIGGER preserve_caption_brand_approval BEFORE UPDATE OR DELETE ON post_caption_brand_approvals FOR EACH ROW EXECUTE FUNCTION reject_staff_post_history_mutation();
CREATE FUNCTION protect_post_caption_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Caption attempts cannot be deleted'; END IF;
 IF OLD.status = 'COMPLETE' THEN RAISE EXCEPTION 'Completed captions are immutable'; END IF;
 IF (NEW.post_id,NEW.source_revision_id,NEW.source_revision_number,NEW.requester_user_id,NEW.brand_rule_version_id,NEW.brand_rule_digest,NEW.method,NEW.provider,NEW.model,NEW.context)
 IS DISTINCT FROM (OLD.post_id,OLD.source_revision_id,OLD.source_revision_number,OLD.requester_user_id,OLD.brand_rule_version_id,OLD.brand_rule_digest,OLD.method,OLD.provider,OLD.model,OLD.context)
 THEN RAISE EXCEPTION 'Caption request configuration is immutable'; END IF;
 IF OLD.output IS NOT NULL AND NEW.output IS DISTINCT FROM OLD.output THEN RAISE EXCEPTION 'Saved provider output is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_post_caption_attempt BEFORE UPDATE OR DELETE ON post_caption_attempts FOR EACH ROW EXECUTE FUNCTION protect_post_caption_attempt();
