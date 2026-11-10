-- Extend existing brand records; no historical approval or provenance backfill.
ALTER TABLE brand_profile_versions ADD COLUMN guidance JSONB, ADD COLUMN guidance_rule_version_id UUID, ADD COLUMN guidance_dataset_version_id UUID;
ALTER TABLE brand_source_archives ADD COLUMN source_url VARCHAR(2048), ADD COLUMN reference_group_id UUID, ADD COLUMN reference_version INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX brand_reference_version_key ON brand_source_archives(reference_group_id,reference_version);
ALTER TABLE brand_dataset_versions ADD COLUMN source_archive_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE post_revisions ADD COLUMN brand_snapshot JSONB;
CREATE TABLE brand_profile_approvals (
 id UUID PRIMARY KEY, profile_id UUID NOT NULL REFERENCES brand_profile_versions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 digest CHAR(64) NOT NULL, snapshot JSONB NOT NULL, actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT brand_profile_approval_digest_key UNIQUE(profile_id,digest)
);
CREATE TABLE brand_source_reviews (
 id UUID PRIMARY KEY, source_id UUID NOT NULL REFERENCES brand_source_archives(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 source_digest CHAR(64) NOT NULL, decision VARCHAR(20) NOT NULL, notes VARCHAR(1000) NOT NULL,
 media_snapshot JSONB NOT NULL, actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 sequence INTEGER NOT NULL, created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT brand_source_reviews_source_id_sequence_key UNIQUE(source_id,sequence)
);
CREATE TRIGGER preserve_brand_profile_approval BEFORE UPDATE OR DELETE ON brand_profile_approvals FOR EACH ROW EXECUTE FUNCTION reject_staff_post_history_mutation();
CREATE TRIGGER preserve_brand_source_review BEFORE UPDATE OR DELETE ON brand_source_reviews FOR EACH ROW EXECUTE FUNCTION reject_staff_post_history_mutation();
CREATE FUNCTION protect_brand_guidance_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Brand history cannot be deleted'; END IF;
 IF OLD.guidance IS NOT NULL AND (NEW.name,NEW.version_number,NEW.guidance,NEW.guidance_rule_version_id,NEW.guidance_dataset_version_id,NEW.language_policy,NEW.tone_rules,NEW.visual_aesthetic_rules,NEW.typography_rules,NEW.logo_rules,NEW.approved_example_ids,NEW.prohibited_patterns)
 IS DISTINCT FROM (OLD.name,OLD.version_number,OLD.guidance,OLD.guidance_rule_version_id,OLD.guidance_dataset_version_id,OLD.language_policy,OLD.tone_rules,OLD.visual_aesthetic_rules,OLD.typography_rules,OLD.logo_rules,OLD.approved_example_ids,OLD.prohibited_patterns)
 THEN RAISE EXCEPTION 'Create a new brand profile version instead of changing guidance'; END IF;
 IF NEW.guidance IS NOT NULL AND NEW.status='ACTIVE' AND NOT EXISTS (SELECT 1 FROM brand_profile_approvals WHERE profile_id=NEW.id) THEN RAISE EXCEPTION 'Explicit business approval is required'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_brand_guidance_version BEFORE UPDATE OR DELETE ON brand_profile_versions FOR EACH ROW EXECUTE FUNCTION protect_brand_guidance_version();
CREATE TRIGGER preserve_brand_source_archive BEFORE UPDATE OR DELETE ON brand_source_archives FOR EACH ROW EXECUTE FUNCTION reject_staff_post_history_mutation();

CREATE FUNCTION protect_brand_reference_collection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF cardinality(OLD.source_archive_ids)>0 AND (NEW.source_archive_ids,NEW.name,NEW.version_string) IS DISTINCT FROM (OLD.source_archive_ids,OLD.name,OLD.version_string) THEN RAISE EXCEPTION 'Create a new reference collection version'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_brand_reference_collection BEFORE UPDATE ON brand_dataset_versions FOR EACH ROW EXECUTE FUNCTION protect_brand_reference_collection();
