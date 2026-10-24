-- CreateEnum
CREATE TYPE "FreshnessState" AS ENUM ('FRESH', 'AGING', 'STALE', 'INVALID', 'SOURCE_UNAVAILABLE');

-- CreateEnum
CREATE TYPE "RevalidationOutcome" AS ENUM ('FRESH', 'NON_MATERIAL_CHANGE', 'MATERIAL_CHANGE', 'SOURCE_UNAVAILABLE', 'PROMOTION_EXPIRED', 'OUT_OF_STOCK');

-- CreateEnum
CREATE TYPE "SourceAvailability" AS ENUM ('AVAILABLE', 'DEGRADED', 'UNREACHABLE');

-- CreateEnum
CREATE TYPE "PolicyLifecycleState" AS ENUM ('DRAFT', 'APPROVED', 'RETIRED');

-- AlterTable
ALTER TABLE "product_snapshots"
    ADD COLUMN "catalog_price_hash" CHAR(64),
    ADD COLUMN "campaign_price_hash" CHAR(64),
    ADD COLUMN "stock_hash" CHAR(64),
    ADD COLUMN "promotion_hash" CHAR(64),
    ADD COLUMN "permanent_facts_hash" CHAR(64),
    ADD COLUMN "visual_asset_hash" CHAR(64);

ALTER TABLE "product_snapshots"
    ADD CONSTRAINT "product_snapshots_catalog_price_hash_check" CHECK ("catalog_price_hash" IS NULL OR "catalog_price_hash" ~ '^[a-f0-9]{64}$'),
    ADD CONSTRAINT "product_snapshots_campaign_price_hash_check" CHECK ("campaign_price_hash" IS NULL OR "campaign_price_hash" ~ '^[a-f0-9]{64}$'),
    ADD CONSTRAINT "product_snapshots_stock_hash_check" CHECK ("stock_hash" IS NULL OR "stock_hash" ~ '^[a-f0-9]{64}$'),
    ADD CONSTRAINT "product_snapshots_promotion_hash_check" CHECK ("promotion_hash" IS NULL OR "promotion_hash" ~ '^[a-f0-9]{64}$'),
    ADD CONSTRAINT "product_snapshots_permanent_facts_hash_check" CHECK ("permanent_facts_hash" IS NULL OR "permanent_facts_hash" ~ '^[a-f0-9]{64}$'),
    ADD CONSTRAINT "product_snapshots_visual_asset_hash_check" CHECK ("visual_asset_hash" IS NULL OR "visual_asset_hash" ~ '^[a-f0-9]{64}$');

-- CreateTable
CREATE TABLE "freshness_policy_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "policy_id" VARCHAR(100) NOT NULL,
    "version" VARCHAR(50) NOT NULL,
    "stock_ttl_seconds" INTEGER NOT NULL,
    "catalog_price_ttl_seconds" INTEGER NOT NULL,
    "campaign_price_ttl_seconds" INTEGER NOT NULL,
    "promotion_ttl_seconds" INTEGER NOT NULL,
    "promotion_recheck_window_seconds" INTEGER NOT NULL,
    "permanent_facts_ttl_seconds" INTEGER NOT NULL,
    "hard_expiry_boundary_seconds" INTEGER NOT NULL,
    "policy_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "freshness_policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "freshness_policy_activations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sequence" BIGSERIAL NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "environment" VARCHAR(50) NOT NULL,
    "lifecycle_state" "PolicyLifecycleState" NOT NULL,
    "activated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_by" UUID,

    CONSTRAINT "freshness_policy_activations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_freshness_assessments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "snapshot_id" UUID NOT NULL,
    "evaluated_at" TIMESTAMPTZ(3) NOT NULL,
    "policy_id" VARCHAR(100) NOT NULL,
    "policy_version" VARCHAR(50) NOT NULL,
    "freshness_state" "FreshnessState" NOT NULL,
    "revalidation_outcome" "RevalidationOutcome" NOT NULL,
    "source_availability" "SourceAvailability" NOT NULL,
    "reason_codes" TEXT[] NOT NULL,
    "evidence" JSONB NOT NULL,
    "compared_snapshot_id" UUID,
    "actor_user_id" UUID,
    "idempotency_key" VARCHAR(200),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_freshness_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "freshness_policy_versions_policy_id_version_key" ON "freshness_policy_versions"("policy_id", "version");
CREATE INDEX "freshness_policy_activations_env_activated_seq_idx" ON "freshness_policy_activations"("environment", "activated_at", "sequence");
CREATE INDEX "freshness_policy_activations_env_state_idx" ON "freshness_policy_activations"("environment", "lifecycle_state");

-- CreateIndex
CREATE UNIQUE INDEX "product_freshness_assessments_idempotency_key_key" ON "product_freshness_assessments"("idempotency_key");
CREATE INDEX "product_freshness_assessments_snapshot_evaluated_idx" ON "product_freshness_assessments"("snapshot_id", "evaluated_at");
CREATE INDEX "product_freshness_assessments_policy_idx" ON "product_freshness_assessments"("policy_id", "policy_version");

-- AddForeignKey
ALTER TABLE "freshness_policy_activations" ADD CONSTRAINT "freshness_policy_activations_policy_version_id_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "freshness_policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "freshness_policy_activations" ADD CONSTRAINT "freshness_policy_activations_activated_by_fkey" FOREIGN KEY ("activated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_freshness_assessments" ADD CONSTRAINT "product_freshness_assessments_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "product_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_freshness_assessments" ADD CONSTRAINT "product_freshness_assessments_compared_snapshot_id_fkey" FOREIGN KEY ("compared_snapshot_id") REFERENCES "product_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_freshness_assessments" ADD CONSTRAINT "product_freshness_assessments_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Immutability triggers
CREATE FUNCTION "reject_product_freshness_assessment_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'product_freshness_assessments are append-only';
END;
$$;

CREATE TRIGGER "product_freshness_assessments_immutable"
BEFORE UPDATE OR DELETE ON "product_freshness_assessments"
FOR EACH ROW EXECUTE FUNCTION "reject_product_freshness_assessment_mutation"();

CREATE FUNCTION "reject_freshness_policy_version_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'freshness_policy_versions are append-only';
END;
$$;

CREATE TRIGGER "freshness_policy_versions_immutable"
BEFORE UPDATE OR DELETE ON "freshness_policy_versions"
FOR EACH ROW EXECUTE FUNCTION "reject_freshness_policy_version_mutation"();

CREATE FUNCTION "reject_freshness_policy_activation_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'freshness_policy_activations are append-only';
END;
$$;

CREATE TRIGGER "freshness_policy_activations_immutable"
BEFORE UPDATE OR DELETE ON "freshness_policy_activations"
FOR EACH ROW EXECUTE FUNCTION "reject_freshness_policy_activation_mutation"();
