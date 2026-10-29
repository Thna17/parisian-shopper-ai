-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'PLANNED', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "objective" VARCHAR(500) NOT NULL,
    "description" VARCHAR(2000),
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "start_date" TIMESTAMPTZ(3),
    "end_date" TIMESTAMPTZ(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "campaigns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "campaign_products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "campaign_id" UUID NOT NULL,
    "product_snapshot_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_hero" BOOLEAN NOT NULL DEFAULT false,
    "notes" VARCHAR(1000),
    "target_promo_price" DECIMAL(10,2),
    "target_discount_percent" DECIMAL(5,2),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_products_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "campaign_products_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "campaign_products_product_snapshot_id_fkey" FOREIGN KEY ("product_snapshot_id") REFERENCES "product_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_code_key" ON "campaigns"("code");

-- CreateIndex
CREATE INDEX "campaigns_status_created_at_idx" ON "campaigns"("status", "created_at");

-- CreateIndex
CREATE INDEX "campaigns_created_by_created_at_idx" ON "campaigns"("created_by_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_products_campaign_id_product_snapshot_id_key" ON "campaign_products"("campaign_id", "product_snapshot_id");

-- CreateIndex
CREATE INDEX "campaign_products_campaign_id_sort_order_idx" ON "campaign_products"("campaign_id", "sort_order");
