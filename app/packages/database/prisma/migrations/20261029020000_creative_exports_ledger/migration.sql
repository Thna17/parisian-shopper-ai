-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('SQUARE_1080', 'PORTRAIT_1080_1350', 'STORY_1080_1920');

-- CreateEnum
CREATE TYPE "ExportEncoding" AS ENUM ('PNG', 'JPEG');

-- CreateTable
CREATE TABLE "creative_exports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "creative_job_id" UUID NOT NULL,
    "visual_asset_id" UUID NOT NULL,
    "format" "ExportFormat" NOT NULL,
    "encoding" "ExportEncoding" NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "aspect_ratio" VARCHAR(20) NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "storage_key" VARCHAR(300) NOT NULL,
    "quality" INTEGER,
    "validation_status" VARCHAR(50) NOT NULL DEFAULT 'PASSED',
    "exported_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creative_exports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "creative_exports_asset_format_encoding_key" ON "creative_exports"("visual_asset_id", "format", "encoding");

-- CreateIndex
CREATE INDEX "creative_exports_job_created_at_idx" ON "creative_exports"("creative_job_id", "created_at");

-- CreateIndex
CREATE INDEX "creative_exports_asset_created_at_idx" ON "creative_exports"("visual_asset_id", "created_at");

-- CreateIndex
CREATE INDEX "creative_exports_sha256_idx" ON "creative_exports"("sha256");

-- AddForeignKey
ALTER TABLE "creative_exports" ADD CONSTRAINT "creative_exports_creative_job_id_fkey" FOREIGN KEY ("creative_job_id") REFERENCES "creative_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creative_exports" ADD CONSTRAINT "creative_exports_visual_asset_id_fkey" FOREIGN KEY ("visual_asset_id") REFERENCES "visual_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creative_exports" ADD CONSTRAINT "creative_exports_exported_by_user_id_fkey" FOREIGN KEY ("exported_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
