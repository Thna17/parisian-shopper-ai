-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('DRAFT', 'READY', 'QUEUED', 'PROCESSING', 'PUBLISHED', 'FAILED', 'CANCELLED', 'UNKNOWN_OUTCOME');

-- CreateEnum
CREATE TYPE "PublicationChannel" AS ENUM ('TELEGRAM_CHANNEL', 'FACEBOOK_PAGE', 'INSTAGRAM', 'MANUAL_EXPORT');

-- CreateTable
CREATE TABLE "publications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "content_version_id" UUID NOT NULL,
    "creative_export_id" UUID,
    "destination_channel" "PublicationChannel" NOT NULL,
    "destination_account_id" VARCHAR(120),
    "requested_by_user_id" UUID NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "idempotency_key" VARCHAR(200) NOT NULL,
    "campaign_id" UUID,
    "scheduled_at" TIMESTAMPTZ(3),
    "published_at" TIMESTAMPTZ(3),
    "external_publication_id" VARCHAR(300),
    "cancellation_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publication_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "publication_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'PROCESSING',
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "provider_result" JSONB,
    "external_publication_id" VARCHAR(300),
    "error_code" VARCHAR(100),
    "error_message" VARCHAR(2000),
    "retry_eligible" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publication_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "publications_idempotency_key" ON "publications"("idempotency_key");

-- CreateIndex
CREATE INDEX "publications_status_created_at_idx" ON "publications"("status", "created_at");

-- CreateIndex
CREATE INDEX "publications_requested_by_created_at_idx" ON "publications"("requested_by_user_id", "created_at");

-- CreateIndex
CREATE INDEX "publications_content_version_id_idx" ON "publications"("content_version_id");

-- CreateIndex
CREATE INDEX "publications_campaign_id_idx" ON "publications"("campaign_id");

-- CreateIndex
CREATE INDEX "publications_channel_status_idx" ON "publications"("destination_channel", "status");

-- CreateIndex
CREATE UNIQUE INDEX "publication_attempts_pub_attempt_key" ON "publication_attempts"("publication_id", "attempt_number");

-- CreateIndex
CREATE INDEX "publication_attempts_pub_started_at_idx" ON "publication_attempts"("publication_id", "started_at");

-- CreateIndex
CREATE INDEX "publication_attempts_status_started_at_idx" ON "publication_attempts"("status", "started_at");

-- AddForeignKey
ALTER TABLE "publications" ADD CONSTRAINT "publications_content_version_id_fkey" FOREIGN KEY ("content_version_id") REFERENCES "content_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publications" ADD CONSTRAINT "publications_creative_export_id_fkey" FOREIGN KEY ("creative_export_id") REFERENCES "creative_exports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publications" ADD CONSTRAINT "publications_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publications" ADD CONSTRAINT "publications_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_attempts" ADD CONSTRAINT "publication_attempts_publication_id_fkey" FOREIGN KEY ("publication_id") REFERENCES "publications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
