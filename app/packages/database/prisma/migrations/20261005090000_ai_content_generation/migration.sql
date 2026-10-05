CREATE TYPE "BrandRuleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
CREATE TYPE "ContentType" AS ENUM ('PRODUCT_SPOTLIGHT', 'PROMOTION', 'SCENT_PYRAMID', 'EDUCATIONAL', 'ENGAGEMENT');
CREATE TYPE "ContentLanguage" AS ENUM ('KM', 'EN', 'BILINGUAL');
CREATE TYPE "ContentPlatform" AS ENUM ('FACEBOOK', 'INSTAGRAM', 'TELEGRAM', 'GENERIC');
CREATE TYPE "ContentJobStatus" AS ENUM ('REQUESTED', 'GENERATING', 'DRAFT', 'FAILED');
CREATE TYPE "GenerationAttemptStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT');

CREATE TABLE "brand_rule_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "name" VARCHAR(160) NOT NULL, "version" INTEGER NOT NULL,
  "status" "BrandRuleStatus" NOT NULL, "language_rules" JSONB NOT NULL, "tone_rules" JSONB NOT NULL,
  "cta_rules" JSONB NOT NULL, "promotion_rules" JSONB NOT NULL, "perfume_claim_rules" JSONB NOT NULL,
  "platform_rules" JSONB NOT NULL, "visual_guidance" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "activated_at" TIMESTAMPTZ(3),
  CONSTRAINT "brand_rule_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "brand_rule_versions_version_positive" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX "brand_rule_versions_name_version_key" ON "brand_rule_versions"("name", "version");
CREATE INDEX "brand_rule_versions_status_created_at_idx" ON "brand_rule_versions"("status", "created_at");

CREATE TABLE "content_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "product_snapshot_id" UUID NOT NULL, "brand_rule_version_id" UUID NOT NULL,
  "content_type" "ContentType" NOT NULL, "language" "ContentLanguage" NOT NULL, "platform" "ContentPlatform" NOT NULL,
  "campaign_context" VARCHAR(2000), "status" "ContentJobStatus" NOT NULL DEFAULT 'REQUESTED',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "content_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "content_jobs_product_snapshot_id_fkey" FOREIGN KEY ("product_snapshot_id") REFERENCES "product_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "content_jobs_brand_rule_version_id_fkey" FOREIGN KEY ("brand_rule_version_id") REFERENCES "brand_rule_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "content_jobs_status_created_at_idx" ON "content_jobs"("status", "created_at");
CREATE INDEX "content_jobs_product_snapshot_id_created_at_idx" ON "content_jobs"("product_snapshot_id", "created_at");

CREATE TABLE "generation_attempts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "content_job_id" UUID NOT NULL, "attempt_number" INTEGER NOT NULL,
  "provider" VARCHAR(100) NOT NULL, "model" VARCHAR(200) NOT NULL, "prompt_version" VARCHAR(100) NOT NULL,
  "status" "GenerationAttemptStatus" NOT NULL DEFAULT 'PENDING', "started_at" TIMESTAMPTZ(3) NOT NULL,
  "completed_at" TIMESTAMPTZ(3), "latency_ms" INTEGER, "input_token_count" INTEGER, "output_token_count" INTEGER,
  "total_token_count" INTEGER, "estimated_cost" DECIMAL(19,6), "error_code" VARCHAR(100), "error_metadata" JSONB,
  CONSTRAINT "generation_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "generation_attempts_content_job_id_fkey" FOREIGN KEY ("content_job_id") REFERENCES "content_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "generation_attempts_attempt_number_positive" CHECK ("attempt_number" > 0),
  CONSTRAINT "generation_attempts_latency_nonnegative" CHECK ("latency_ms" IS NULL OR "latency_ms" >= 0)
);
CREATE UNIQUE INDEX "generation_attempts_job_attempt_key" ON "generation_attempts"("content_job_id", "attempt_number");
CREATE INDEX "generation_attempts_status_started_at_idx" ON "generation_attempts"("status", "started_at");

CREATE TABLE "content_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "content_job_id" UUID NOT NULL, "version_number" INTEGER NOT NULL,
  "brand_rule_version_id" UUID NOT NULL, "product_snapshot_id" UUID NOT NULL, "generation_attempt_id" UUID NOT NULL,
  "provider" VARCHAR(100) NOT NULL, "model" VARCHAR(200) NOT NULL, "prompt_version" VARCHAR(100) NOT NULL,
  "structured_output" JSONB NOT NULL, "provider_metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "content_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "content_versions_content_job_id_fkey" FOREIGN KEY ("content_job_id") REFERENCES "content_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "content_versions_brand_rule_version_id_fkey" FOREIGN KEY ("brand_rule_version_id") REFERENCES "brand_rule_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "content_versions_product_snapshot_id_fkey" FOREIGN KEY ("product_snapshot_id") REFERENCES "product_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "content_versions_generation_attempt_id_fkey" FOREIGN KEY ("generation_attempt_id") REFERENCES "generation_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "content_versions_version_number_positive" CHECK ("version_number" > 0)
);
CREATE UNIQUE INDEX "content_versions_generation_attempt_id_key" ON "content_versions"("generation_attempt_id");
CREATE UNIQUE INDEX "content_versions_job_version_key" ON "content_versions"("content_job_id", "version_number");
CREATE INDEX "content_versions_product_snapshot_id_created_at_idx" ON "content_versions"("product_snapshot_id", "created_at");

CREATE FUNCTION prevent_brand_rule_version_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'brand_rule_versions are append-only'; END; $$;
CREATE TRIGGER brand_rule_versions_append_only BEFORE UPDATE OR DELETE ON "brand_rule_versions"
FOR EACH ROW EXECUTE FUNCTION prevent_brand_rule_version_mutation();

CREATE FUNCTION prevent_content_version_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'content_versions are append-only'; END; $$;
CREATE TRIGGER content_versions_append_only BEFORE UPDATE OR DELETE ON "content_versions"
FOR EACH ROW EXECUTE FUNCTION prevent_content_version_mutation();
