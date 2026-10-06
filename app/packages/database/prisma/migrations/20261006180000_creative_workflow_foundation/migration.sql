CREATE TYPE "CreativeJobStatus" AS ENUM (
  'REQUESTED',
  'GENERATING_BACKGROUND',
  'COMPOSITING',
  'VALIDATING',
  'READY_FOR_REVIEW',
  'REVISION_REQUESTED',
  'CREATIVE_APPROVED',
  'CREATIVE_REJECTED',
  'FAILED'
);

CREATE TYPE "VisualAssetRole" AS ENUM (
  'CANONICAL_PRODUCT',
  'GENERATED_BACKGROUND',
  'COMPOSITED_CREATIVE',
  'PREVIEW'
);

CREATE TYPE "VisualValidationStatus" AS ENUM (
  'PASSED',
  'PASSED_WITH_WARNINGS',
  'BLOCKED',
  'FAILED'
);

CREATE TYPE "CreativeRevisionType" AS ENUM (
  'EDIT',
  'REGENERATE'
);

CREATE TYPE "CreativeApprovalDecision" AS ENUM (
  'CREATIVE_APPROVED',
  'CREATIVE_REJECTED'
);

CREATE TABLE "creative_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "content_version_id" UUID NOT NULL,
  "product_snapshot_id" UUID NOT NULL,
  "brand_rule_version_id" UUID NOT NULL,
  "requested_by_user_id" UUID,
  "status" "CreativeJobStatus" NOT NULL DEFAULT 'REQUESTED',
  "target_platform" "ContentPlatform" NOT NULL DEFAULT 'GENERIC',
  "aspect_ratio" VARCHAR(20) NOT NULL DEFAULT '1:1',
  "creative_profile" VARCHAR(100) NOT NULL DEFAULT 'PARISIAN_LUXURY_ATELIER',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creative_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "creative_jobs_content_version_id_fkey" FOREIGN KEY ("content_version_id") REFERENCES "content_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "creative_jobs_product_snapshot_id_fkey" FOREIGN KEY ("product_snapshot_id") REFERENCES "product_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "creative_jobs_brand_rule_version_id_fkey" FOREIGN KEY ("brand_rule_version_id") REFERENCES "brand_rule_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "creative_jobs_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "creative_jobs_content_version_created_at_idx" ON "creative_jobs"("content_version_id", "created_at");
CREATE INDEX "creative_jobs_status_created_at_idx" ON "creative_jobs"("status", "created_at");
CREATE INDEX "creative_jobs_product_snapshot_id_idx" ON "creative_jobs"("product_snapshot_id");

CREATE TABLE "visual_assets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "creative_job_id" UUID NOT NULL,
  "version_number" INTEGER NOT NULL,
  "asset_role" "VisualAssetRole" NOT NULL DEFAULT 'COMPOSITED_CREATIVE',
  "mime_type" VARCHAR(50) NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "sha256" CHAR(64) NOT NULL,
  "storage_key" VARCHAR(300) NOT NULL,
  "provider" VARCHAR(100),
  "model" VARCHAR(200),
  "seed" BIGINT,
  "prompt_version" VARCHAR(100),
  "creative_brief_version" VARCHAR(100),
  "source_product_asset_digest" CHAR(64) NOT NULL,
  "background_asset_digest" CHAR(64),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "visual_assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "visual_assets_creative_job_id_fkey" FOREIGN KEY ("creative_job_id") REFERENCES "creative_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "visual_assets_positive_version" CHECK ("version_number" >= 1),
  CONSTRAINT "visual_assets_positive_dimensions" CHECK ("width" > 0 AND "height" > 0 AND "byte_size" > 0)
);

CREATE UNIQUE INDEX "visual_assets_job_version_key" ON "visual_assets"("creative_job_id", "version_number");
CREATE INDEX "visual_assets_job_created_at_idx" ON "visual_assets"("creative_job_id", "created_at");
CREATE INDEX "visual_assets_sha256_idx" ON "visual_assets"("sha256");

CREATE TABLE "visual_validation_results" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "visual_asset_id" UUID NOT NULL,
  "validator_version" VARCHAR(100) NOT NULL,
  "status" "VisualValidationStatus" NOT NULL,
  "finding_count" INTEGER NOT NULL,
  "blocking_count" INTEGER NOT NULL,
  "warning_count" INTEGER NOT NULL,
  "info_count" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "visual_validation_results_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "visual_validation_results_visual_asset_id_fkey" FOREIGN KEY ("visual_asset_id") REFERENCES "visual_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "visual_validation_results_nonnegative_counts" CHECK ("finding_count" >= 0 AND "blocking_count" >= 0 AND "warning_count" >= 0 AND "info_count" >= 0),
  CONSTRAINT "visual_validation_results_consistent_counts" CHECK ("finding_count" = "blocking_count" + "warning_count" + "info_count")
);

CREATE UNIQUE INDEX "visual_validation_results_asset_validator_key" ON "visual_validation_results"("visual_asset_id", "validator_version");
CREATE INDEX "visual_validation_results_asset_created_at_idx" ON "visual_validation_results"("visual_asset_id", "created_at");

CREATE TABLE "visual_validation_findings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "visual_validation_result_id" UUID NOT NULL,
  "field" VARCHAR(100) NOT NULL,
  "severity" "ValidationSeverity" NOT NULL,
  "code" VARCHAR(100) NOT NULL,
  "message" VARCHAR(1000) NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "visual_validation_findings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "visual_validation_findings_result_id_fkey" FOREIGN KEY ("visual_validation_result_id") REFERENCES "visual_validation_results"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "visual_validation_findings_result_severity_idx" ON "visual_validation_findings"("visual_validation_result_id", "severity");
CREATE INDEX "visual_validation_findings_code_idx" ON "visual_validation_findings"("code");

CREATE TABLE "creative_revision_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "creative_job_id" UUID NOT NULL,
  "source_visual_asset_id" UUID NOT NULL,
  "requested_by_user_id" UUID NOT NULL,
  "instruction" VARCHAR(1000),
  "type" "CreativeRevisionType" NOT NULL,
  "status" "RevisionRequestStatus" NOT NULL DEFAULT 'PENDING',
  "resulting_visual_asset_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creative_revision_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "creative_revision_requests_creative_job_id_fkey" FOREIGN KEY ("creative_job_id") REFERENCES "creative_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "creative_revision_requests_source_visual_asset_id_fkey" FOREIGN KEY ("source_visual_asset_id") REFERENCES "visual_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "creative_revision_requests_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "creative_revision_requests_resulting_visual_asset_id_fkey" FOREIGN KEY ("resulting_visual_asset_id") REFERENCES "visual_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "creative_revision_requests_resulting_version_key" ON "creative_revision_requests"("resulting_visual_asset_id");
CREATE INDEX "creative_revision_requests_job_created_at_idx" ON "creative_revision_requests"("creative_job_id", "created_at");
CREATE INDEX "creative_revision_requests_status_created_at_idx" ON "creative_revision_requests"("status", "created_at");
CREATE UNIQUE INDEX "creative_revision_requests_one_pending_per_job" ON "creative_revision_requests"("creative_job_id") WHERE "status" = 'PENDING';

CREATE TABLE "creative_approval_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "creative_job_id" UUID NOT NULL,
  "visual_asset_id" UUID NOT NULL,
  "approver_user_id" UUID NOT NULL,
  "decision" "CreativeApprovalDecision" NOT NULL,
  "comment" VARCHAR(1000),
  "visual_validation_result_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creative_approval_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "creative_approval_events_creative_job_id_fkey" FOREIGN KEY ("creative_job_id") REFERENCES "creative_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "creative_approval_events_visual_asset_id_fkey" FOREIGN KEY ("visual_asset_id") REFERENCES "visual_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "creative_approval_events_approver_user_id_fkey" FOREIGN KEY ("approver_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "creative_approval_events_visual_validation_result_id_fkey" FOREIGN KEY ("visual_validation_result_id") REFERENCES "visual_validation_results"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "creative_approval_events_job_created_at_idx" ON "creative_approval_events"("creative_job_id", "created_at");
CREATE INDEX "creative_approval_events_asset_created_at_idx" ON "creative_approval_events"("visual_asset_id", "created_at");
CREATE UNIQUE INDEX "creative_approval_events_single_approved_per_job" ON "creative_approval_events"("creative_job_id") WHERE "decision" = 'CREATIVE_APPROVED';
CREATE UNIQUE INDEX "creative_approval_events_single_rejected_per_job" ON "creative_approval_events"("creative_job_id") WHERE "decision" = 'CREATIVE_REJECTED';

-- Immutability database triggers
CREATE FUNCTION prevent_visual_asset_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'visual_assets are append-only'; END; $$;
CREATE TRIGGER visual_assets_append_only BEFORE UPDATE OR DELETE ON "visual_assets"
FOR EACH ROW EXECUTE FUNCTION prevent_visual_asset_mutation();

CREATE FUNCTION prevent_visual_validation_result_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'visual_validation_results are append-only'; END; $$;
CREATE TRIGGER visual_validation_results_append_only BEFORE UPDATE OR DELETE ON "visual_validation_results"
FOR EACH ROW EXECUTE FUNCTION prevent_visual_validation_result_mutation();

CREATE FUNCTION prevent_visual_validation_finding_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'visual_validation_findings are append-only'; END; $$;
CREATE TRIGGER visual_validation_findings_append_only BEFORE UPDATE OR DELETE ON "visual_validation_findings"
FOR EACH ROW EXECUTE FUNCTION prevent_visual_validation_finding_mutation();

CREATE FUNCTION prevent_creative_approval_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'creative_approval_events are append-only'; END; $$;
CREATE TRIGGER creative_approval_events_append_only BEFORE UPDATE OR DELETE ON "creative_approval_events"
FOR EACH ROW EXECUTE FUNCTION prevent_creative_approval_event_mutation();

CREATE FUNCTION prevent_creative_revision_request_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'creative_revision_requests cannot be deleted'; END; $$;
CREATE TRIGGER creative_revision_requests_no_delete BEFORE DELETE ON "creative_revision_requests"
FOR EACH ROW EXECUTE FUNCTION prevent_creative_revision_request_deletion();

CREATE FUNCTION prevent_creative_revision_request_core_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.creative_job_id IS DISTINCT FROM NEW.creative_job_id
     OR OLD.source_visual_asset_id IS DISTINCT FROM NEW.source_visual_asset_id
     OR OLD.requested_by_user_id IS DISTINCT FROM NEW.requested_by_user_id
     OR OLD.type IS DISTINCT FROM NEW.type
     OR OLD.instruction IS DISTINCT FROM NEW.instruction
     OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'creative_revision_requests core fields are immutable';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER creative_revision_requests_core_immutable BEFORE UPDATE ON "creative_revision_requests"
FOR EACH ROW EXECUTE FUNCTION prevent_creative_revision_request_core_mutation();
