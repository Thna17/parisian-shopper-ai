ALTER TYPE "ContentJobStatus" ADD VALUE IF NOT EXISTS 'UNDER_REVIEW';
ALTER TYPE "ContentJobStatus" ADD VALUE IF NOT EXISTS 'REVISION_REQUESTED';
ALTER TYPE "ContentJobStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "ContentJobStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

CREATE TYPE "RevisionRequestType" AS ENUM ('EDIT', 'REGENERATE');
CREATE TYPE "RevisionRequestStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'REJECTED');
CREATE TYPE "PendingReviewAction" AS ENUM ('EDIT', 'REJECT');

CREATE TABLE "revision_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "content_job_id" UUID NOT NULL,
  "source_content_version_id" UUID NOT NULL,
  "requested_by_user_id" UUID NOT NULL,
  "instruction" VARCHAR(1000),
  "type" "RevisionRequestType" NOT NULL,
  "status" "RevisionRequestStatus" NOT NULL DEFAULT 'PENDING',
  "resulting_content_version_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "revision_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "revision_requests_content_job_id_fkey" FOREIGN KEY ("content_job_id") REFERENCES "content_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "revision_requests_source_version_id_fkey" FOREIGN KEY ("source_content_version_id") REFERENCES "content_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "revision_requests_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "revision_requests_resulting_version_key" ON "revision_requests"("resulting_content_version_id");
CREATE INDEX "revision_requests_job_created_at_idx" ON "revision_requests"("content_job_id", "created_at");
CREATE INDEX "revision_requests_status_created_at_idx" ON "revision_requests"("status", "created_at");
CREATE UNIQUE INDEX "revision_requests_one_pending_per_job" ON "revision_requests"("content_job_id") WHERE "status" = 'PENDING';

ALTER TABLE "content_versions" ADD COLUMN "revision_request_id" UUID;
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_revision_request_id_fkey" FOREIGN KEY ("revision_request_id") REFERENCES "revision_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "content_versions_revision_request_id_idx" ON "content_versions"("revision_request_id");

ALTER TABLE "revision_requests" ADD CONSTRAINT "revision_requests_resulting_version_id_fkey" FOREIGN KEY ("resulting_content_version_id") REFERENCES "content_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "approval_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "content_job_id" UUID NOT NULL,
  "content_version_id" UUID NOT NULL,
  "approver_user_id" UUID NOT NULL,
  "decision" "ApprovalDecision" NOT NULL,
  "comment" VARCHAR(1000),
  "validation_result_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "approval_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "approval_events_content_job_id_fkey" FOREIGN KEY ("content_job_id") REFERENCES "content_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "approval_events_content_version_id_fkey" FOREIGN KEY ("content_version_id") REFERENCES "content_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "approval_events_approver_user_id_fkey" FOREIGN KEY ("approver_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "approval_events_validation_result_id_fkey" FOREIGN KEY ("validation_result_id") REFERENCES "validation_results"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "approval_events_job_created_at_idx" ON "approval_events"("content_job_id", "created_at");
CREATE INDEX "approval_events_version_created_at_idx" ON "approval_events"("content_version_id", "created_at");
CREATE UNIQUE INDEX "approval_events_single_approved_per_job" ON "approval_events"("content_job_id") WHERE "decision" = 'APPROVED';
CREATE UNIQUE INDEX "approval_events_single_rejected_per_job" ON "approval_events"("content_job_id") WHERE "decision" = 'REJECTED';

CREATE TABLE "telegram_pending_review_interactions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "telegram_identity_id" UUID NOT NULL,
  "content_job_id" UUID NOT NULL,
  "content_version_id" UUID NOT NULL,
  "action" "PendingReviewAction" NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "completed_at" TIMESTAMPTZ(3),
  "cancelled_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "telegram_pending_review_interactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "telegram_pending_review_interactions_identity_id_fkey" FOREIGN KEY ("telegram_identity_id") REFERENCES "telegram_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "telegram_pending_review_interactions_job_id_fkey" FOREIGN KEY ("content_job_id") REFERENCES "content_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "telegram_pending_review_interactions_version_id_fkey" FOREIGN KEY ("content_version_id") REFERENCES "content_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "telegram_pending_review_interactions_identity_expires_idx" ON "telegram_pending_review_interactions"("telegram_identity_id", "expires_at");

CREATE FUNCTION prevent_approval_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'approval_events are append-only'; END; $$;
CREATE TRIGGER approval_events_append_only BEFORE UPDATE OR DELETE ON "approval_events"
FOR EACH ROW EXECUTE FUNCTION prevent_approval_event_mutation();

CREATE FUNCTION prevent_revision_request_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'revision_requests cannot be deleted'; END; $$;
CREATE TRIGGER revision_requests_no_delete BEFORE DELETE ON "revision_requests"
FOR EACH ROW EXECUTE FUNCTION prevent_revision_request_deletion();

CREATE FUNCTION prevent_revision_request_core_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.content_job_id IS DISTINCT FROM NEW.content_job_id
     OR OLD.source_content_version_id IS DISTINCT FROM NEW.source_content_version_id
     OR OLD.requested_by_user_id IS DISTINCT FROM NEW.requested_by_user_id
     OR OLD.type IS DISTINCT FROM NEW.type
     OR OLD.instruction IS DISTINCT FROM NEW.instruction
     OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'revision_requests core fields are immutable';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER revision_requests_core_immutable BEFORE UPDATE ON "revision_requests"
FOR EACH ROW EXECUTE FUNCTION prevent_revision_request_core_mutation();
