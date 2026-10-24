-- CreateEnum
CREATE TYPE "ProductAssetRole" AS ENUM ('ORIGINAL_SOURCE', 'HERO_CUTOUT', 'PACKAGING_FRONT', 'PACKAGING_BACK', 'DETAIL', 'SWATCH', 'MASK');

-- CreateEnum
CREATE TYPE "ProductAssetRightsState" AS ENUM ('UNKNOWN', 'VERIFIED', 'RESTRICTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ProductAssetApprovalDecision" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'RETIRED');

-- CreateEnum
CREATE TYPE "ProductAssetTransformType" AS ENUM ('BACKGROUND_REMOVAL', 'TRIM', 'RESIZE', 'COLOR_CORRECTION', 'OPTIMIZATION');

-- CreateEnum
CREATE TYPE "ProductAssetValidationStatus" AS ENUM ('PASS', 'PASS_WITH_WARNINGS', 'FAIL');

-- CreateTable
CREATE TABLE "product_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sha256" CHAR(64) NOT NULL,
    "storage_key" VARCHAR(300) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "format" VARCHAR(20) NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "pixel_count" INTEGER NOT NULL,
    "channels" INTEGER NOT NULL,
    "has_alpha" BOOLEAN NOT NULL,
    "transparency_ratio" DECIMAL(5,4) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_asset_registrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sequence" BIGSERIAL NOT NULL,
    "product_asset_id" UUID NOT NULL,
    "sku" VARCHAR(64) NOT NULL,
    "product_snapshot_id" UUID,
    "role" "ProductAssetRole" NOT NULL,
    "source_url" VARCHAR(2048),
    "source_system" VARCHAR(100) NOT NULL,
    "source_record_id" VARCHAR(255),
    "source_image_id" VARCHAR(255),
    "source_retrieved_at" TIMESTAMPTZ(3),
    "source_url_hash" CHAR(64),
    "source_etag" VARCHAR(255),
    "source_checksum" VARCHAR(128),
    "origin_system" VARCHAR(100),
    "correlation_id" VARCHAR(128),
    "replaces_registration_id" UUID,
    "rights_state" "ProductAssetRightsState" NOT NULL DEFAULT 'UNKNOWN',
    "rights_notes" VARCHAR(1000),
    "rights_expires_at" TIMESTAMPTZ(3),
    "metadata" JSONB,
    "registered_by_user_id" UUID,
    "registered_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_asset_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_asset_validation_assessments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sequence" BIGSERIAL NOT NULL,
    "product_asset_id" UUID NOT NULL,
    "validator_version" VARCHAR(100) NOT NULL,
    "status" "ProductAssetValidationStatus" NOT NULL DEFAULT 'PASS',
    "is_valid" BOOLEAN NOT NULL,
    "format" VARCHAR(20) NOT NULL,
    "has_alpha" BOOLEAN NOT NULL,
    "transparency_ratio" DECIMAL(5,4) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "pixel_count" INTEGER NOT NULL,
    "findings" TEXT[] NOT NULL,
    "reason_codes" VARCHAR(100)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(100)[],
    "assessed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_asset_validation_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_asset_approval_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sequence" BIGSERIAL NOT NULL,
    "product_asset_registration_id" UUID NOT NULL,
    "decision" "ProductAssetApprovalDecision" NOT NULL,
    "decided_by_user_id" UUID,
    "reason" VARCHAR(200),
    "notes" VARCHAR(1000),
    "validation_assessment_id" UUID,
    "decided_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_asset_approval_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_asset_rights_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sequence" BIGSERIAL NOT NULL,
    "product_asset_registration_id" UUID NOT NULL,
    "rights_state" "ProductAssetRightsState" NOT NULL,
    "source_reference" VARCHAR(500),
    "permitted_scope" VARCHAR(255),
    "territory" VARCHAR(100),
    "effective_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3),
    "verified_by_user_id" UUID,
    "reason" VARCHAR(500),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_asset_rights_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_asset_transforms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sequence" BIGSERIAL NOT NULL,
    "source_asset_id" UUID NOT NULL,
    "derived_asset_id" UUID NOT NULL,
    "transform_type" "ProductAssetTransformType" NOT NULL,
    "tool_name" VARCHAR(100) NOT NULL DEFAULT 'sharp',
    "tool_version" VARCHAR(100) NOT NULL DEFAULT '1.0.0',
    "parameters" JSONB NOT NULL,
    "parameters_sha256" CHAR(64) NOT NULL,
    "validation_assessment_id" UUID,
    "applied_by_user_id" UUID,
    "applied_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_asset_transforms_pkey" PRIMARY KEY ("id")
);

-- Unique & Indexes
CREATE UNIQUE INDEX "product_assets_sha256_key" ON "product_assets"("sha256");
CREATE INDEX "product_assets_created_at_idx" ON "product_assets"("created_at");
CREATE INDEX "product_assets_mime_type_idx" ON "product_assets"("mime_type");

CREATE INDEX "product_asset_registrations_sku_role_seq_idx" ON "product_asset_registrations"("sku", "role", "sequence" DESC);
CREATE INDEX "product_asset_registrations_sku_seq_idx" ON "product_asset_registrations"("sku", "sequence" DESC);
CREATE INDEX "product_asset_registrations_asset_idx" ON "product_asset_registrations"("product_asset_id");
CREATE INDEX "product_asset_registrations_rights_state_idx" ON "product_asset_registrations"("rights_state");

CREATE INDEX "product_asset_validation_assessments_asset_seq_idx" ON "product_asset_validation_assessments"("product_asset_id", "assessed_at", "sequence" DESC);
CREATE INDEX "product_asset_validation_assessments_valid_idx" ON "product_asset_validation_assessments"("is_valid");
CREATE INDEX "product_asset_validation_assessments_status_idx" ON "product_asset_validation_assessments"("status");

CREATE INDEX "product_asset_approval_events_registration_seq_idx" ON "product_asset_approval_events"("product_asset_registration_id", "sequence" DESC);
CREATE INDEX "product_asset_approval_events_decision_seq_idx" ON "product_asset_approval_events"("decision", "decided_at", "sequence" DESC);

CREATE INDEX "product_asset_rights_events_reg_effective_seq_idx" ON "product_asset_rights_events"("product_asset_registration_id", "effective_at", "sequence" DESC);
CREATE INDEX "product_asset_rights_events_state_effective_idx" ON "product_asset_rights_events"("rights_state", "effective_at");

CREATE INDEX "product_asset_transforms_source_idx" ON "product_asset_transforms"("source_asset_id");
CREATE INDEX "product_asset_transforms_derived_idx" ON "product_asset_transforms"("derived_asset_id");

-- Foreign Keys
ALTER TABLE "product_asset_registrations" ADD CONSTRAINT "product_asset_registrations_product_asset_id_fkey" FOREIGN KEY ("product_asset_id") REFERENCES "product_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_asset_registrations" ADD CONSTRAINT "product_asset_registrations_product_snapshot_id_fkey" FOREIGN KEY ("product_snapshot_id") REFERENCES "product_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "product_asset_registrations" ADD CONSTRAINT "product_asset_registrations_registered_by_user_id_fkey" FOREIGN KEY ("registered_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_asset_registrations" ADD CONSTRAINT "product_asset_registrations_replaces_fkey" FOREIGN KEY ("replaces_registration_id") REFERENCES "product_asset_registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "product_asset_validation_assessments" ADD CONSTRAINT "product_asset_validation_assessments_asset_id_fkey" FOREIGN KEY ("product_asset_id") REFERENCES "product_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_asset_approval_events" ADD CONSTRAINT "product_asset_approval_events_registration_id_fkey" FOREIGN KEY ("product_asset_registration_id") REFERENCES "product_asset_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_asset_approval_events" ADD CONSTRAINT "product_asset_approval_events_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_asset_approval_events" ADD CONSTRAINT "product_asset_approval_events_validation_assessment_id_fkey" FOREIGN KEY ("validation_assessment_id") REFERENCES "product_asset_validation_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_asset_rights_events" ADD CONSTRAINT "product_asset_rights_events_registration_id_fkey" FOREIGN KEY ("product_asset_registration_id") REFERENCES "product_asset_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_asset_rights_events" ADD CONSTRAINT "product_asset_rights_events_verified_by_user_id_fkey" FOREIGN KEY ("verified_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_asset_transforms" ADD CONSTRAINT "product_asset_transforms_source_asset_id_fkey" FOREIGN KEY ("source_asset_id") REFERENCES "product_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_asset_transforms" ADD CONSTRAINT "product_asset_transforms_derived_asset_id_fkey" FOREIGN KEY ("derived_asset_id") REFERENCES "product_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_asset_transforms" ADD CONSTRAINT "product_asset_transforms_applied_by_user_id_fkey" FOREIGN KEY ("applied_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_asset_transforms" ADD CONSTRAINT "product_asset_transforms_validation_assessment_id_fkey" FOREIGN KEY ("validation_assessment_id") REFERENCES "product_asset_validation_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Constraints
ALTER TABLE "product_assets"
    ADD CONSTRAINT "product_assets_sha256_check" CHECK ("sha256" ~ '^[a-f0-9]{64}$'),
    ADD CONSTRAINT "product_assets_byte_size_check" CHECK ("byte_size" > 0),
    ADD CONSTRAINT "product_assets_width_check" CHECK ("width" > 0),
    ADD CONSTRAINT "product_assets_height_check" CHECK ("height" > 0),
    ADD CONSTRAINT "product_assets_pixel_count_check" CHECK ("pixel_count" > 0),
    ADD CONSTRAINT "product_assets_transparency_ratio_check" CHECK ("transparency_ratio" >= 0 AND "transparency_ratio" <= 1);

ALTER TABLE "product_asset_validation_assessments"
    ADD CONSTRAINT "product_asset_validation_assessments_transparency_ratio_check" CHECK ("transparency_ratio" >= 0 AND "transparency_ratio" <= 1);

ALTER TABLE "product_asset_rights_events"
    ADD CONSTRAINT "product_asset_rights_events_effective_check" CHECK ("expires_at" IS NULL OR "effective_at" <= "expires_at");

-- Immutability triggers
CREATE FUNCTION "reject_product_asset_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'product_assets are immutable content-addressed records';
END;
$$;

CREATE TRIGGER "product_assets_immutable"
BEFORE UPDATE OR DELETE ON "product_assets"
FOR EACH ROW EXECUTE FUNCTION "reject_product_asset_mutation"();

CREATE FUNCTION "reject_product_asset_registration_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'product_asset_registrations are append-only';
END;
$$;

CREATE TRIGGER "product_asset_registrations_immutable"
BEFORE UPDATE OR DELETE ON "product_asset_registrations"
FOR EACH ROW EXECUTE FUNCTION "reject_product_asset_registration_mutation"();

CREATE FUNCTION "reject_product_asset_validation_assessment_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'product_asset_validation_assessments are append-only';
END;
$$;

CREATE TRIGGER "product_asset_validation_assessments_immutable"
BEFORE UPDATE OR DELETE ON "product_asset_validation_assessments"
FOR EACH ROW EXECUTE FUNCTION "reject_product_asset_validation_assessment_mutation"();

CREATE FUNCTION "reject_product_asset_approval_event_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'product_asset_approval_events are append-only';
END;
$$;

CREATE TRIGGER "product_asset_approval_events_immutable"
BEFORE UPDATE OR DELETE ON "product_asset_approval_events"
FOR EACH ROW EXECUTE FUNCTION "reject_product_asset_approval_event_mutation"();

CREATE FUNCTION "reject_product_asset_rights_event_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'product_asset_rights_events are append-only';
END;
$$;

CREATE TRIGGER "product_asset_rights_events_immutable"
BEFORE UPDATE OR DELETE ON "product_asset_rights_events"
FOR EACH ROW EXECUTE FUNCTION "reject_product_asset_rights_event_mutation"();

CREATE FUNCTION "reject_product_asset_transform_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'product_asset_transforms are append-only';
END;
$$;

CREATE TRIGGER "product_asset_transforms_immutable"
BEFORE UPDATE OR DELETE ON "product_asset_transforms"
FOR EACH ROW EXECUTE FUNCTION "reject_product_asset_transform_mutation"();
