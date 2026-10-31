-- CreateEnum
CREATE TYPE "BrandProfileStatus" AS ENUM ('DRAFT', 'BENCHMARKING', 'PENDING_SIGN_OFF', 'ACTIVE', 'RETIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "BrandSourceSystem" AS ENUM ('FACEBOOK', 'INSTAGRAM', 'BRAND_GUIDELINES', 'CAMPAIGN_COLLATERAL');

-- CreateEnum
CREATE TYPE "BrandDatasetStatus" AS ENUM ('CURATING', 'ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "brand_profile_versions" (
    "id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "status" "BrandProfileStatus" NOT NULL DEFAULT 'DRAFT',
    "evaluation_policy_id" VARCHAR(100) NOT NULL,
    "language_policy" JSONB NOT NULL,
    "tone_rules" JSONB NOT NULL,
    "visual_aesthetic_rules" JSONB NOT NULL,
    "typography_rules" JSONB NOT NULL,
    "logo_rules" JSONB NOT NULL,
    "approved_example_ids" TEXT[] NOT NULL,
    "prohibited_patterns" TEXT[] NOT NULL,
    "benchmark_report" JSONB,
    "approved_by_user_id" UUID NOT NULL,
    "activated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "brand_profile_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_source_archives" (
    "id" UUID NOT NULL,
    "source_system" "BrandSourceSystem" NOT NULL,
    "external_post_id" VARCHAR(120),
    "caption_text" TEXT NOT NULL,
    "sanitized_caption_text" TEXT NOT NULL,
    "copyright_declared" BOOLEAN NOT NULL DEFAULT false,
    "copyright_owner" VARCHAR(200) NOT NULL,
    "license_reference" VARCHAR(200) NOT NULL,
    "media_cas_keys" TEXT[] NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sha256_hex" VARCHAR(64) NOT NULL,
    "ingested_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_source_archives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_dataset_versions" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "version_string" VARCHAR(60) NOT NULL,
    "status" "BrandDatasetStatus" NOT NULL DEFAULT 'CURATING',
    "asset_count" INTEGER NOT NULL DEFAULT 0,
    "git_commit_hash" VARCHAR(64),
    "approved_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "brand_dataset_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "brand_profile_versions_status_created_at_idx" ON "brand_profile_versions"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "brand_profile_versions_name_version_key" ON "brand_profile_versions"("name", "version_number");

-- CreateIndex
CREATE INDEX "brand_source_archives_system_created_at_idx" ON "brand_source_archives"("source_system", "created_at");

-- CreateIndex
CREATE INDEX "brand_source_archives_sha256_idx" ON "brand_source_archives"("sha256_hex");

-- CreateIndex
CREATE UNIQUE INDEX "brand_dataset_versions_version_string_key" ON "brand_dataset_versions"("version_string");

-- CreateIndex
CREATE INDEX "brand_dataset_versions_status_created_at_idx" ON "brand_dataset_versions"("status", "created_at");
