CREATE TYPE "ProductStockStatus" AS ENUM (
    'in_stock',
    'low_stock',
    'out_of_stock',
    'preorder',
    'discontinued',
    'unknown'
);

CREATE TYPE "ProductLifecycleStatus" AS ENUM ('active', 'discontinued', 'deleted');

CREATE TABLE "product_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sku" VARCHAR(64) NOT NULL,
    "product_name" VARCHAR(300) NOT NULL,
    "brand" VARCHAR(120) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "price" DECIMAL(19,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "promo_price" DECIMAL(19,4),
    "discount" JSONB,
    "description" TEXT,
    "images" JSONB,
    "stock_status" "ProductStockStatus" NOT NULL,
    "product_url" VARCHAR(2048),
    "fragrance_notes" JSONB,
    "concentration" JSONB,
    "size" JSONB,
    "country_of_origin" JSONB,
    "similarity_claims" JSONB,
    "source_schema_version" VARCHAR(20) NOT NULL,
    "source_system" VARCHAR(100) NOT NULL,
    "source_record_id" VARCHAR(200),
    "source_version" VARCHAR(200),
    "source_updated_at" TIMESTAMPTZ(3) NOT NULL,
    "retrieved_at" TIMESTAMPTZ(3) NOT NULL,
    "source_etag" VARCHAR(500),
    "lifecycle_status" "ProductLifecycleStatus" NOT NULL,
    "snapshot_hash" CHAR(64) NOT NULL,
    "normalizer_version" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_snapshots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "product_snapshots_price_check" CHECK ("price" >= 0),
    CONSTRAINT "product_snapshots_promo_price_check" CHECK (
        "promo_price" IS NULL OR ("promo_price" >= 0 AND "promo_price" <= "price")
    ),
    CONSTRAINT "product_snapshots_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "product_snapshots_snapshot_hash_check" CHECK ("snapshot_hash" ~ '^[a-f0-9]{64}$')
);

CREATE INDEX "product_snapshots_sku_created_at_idx"
    ON "product_snapshots"("sku", "created_at");
CREATE INDEX "product_snapshots_snapshot_hash_idx"
    ON "product_snapshots"("snapshot_hash");
CREATE INDEX "product_snapshots_source_idx"
    ON "product_snapshots"("source_system", "source_record_id", "source_updated_at");

CREATE FUNCTION "reject_product_snapshot_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'product_snapshots are append-only';
END;
$$;

CREATE TRIGGER "product_snapshots_immutable"
BEFORE UPDATE OR DELETE ON "product_snapshots"
FOR EACH ROW EXECUTE FUNCTION "reject_product_snapshot_mutation"();
