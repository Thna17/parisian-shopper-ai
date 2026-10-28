-- AlterEnum
ALTER TYPE "TelegramCreateFlowStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "TelegramCreateFlowStatus" ADD VALUE IF NOT EXISTS 'SELECTING_TEMPLATE';
ALTER TYPE "TelegramCreateFlowStatus" ADD VALUE IF NOT EXISTS 'CONFIRMING_GENERATION';

-- CreateEnum
CREATE TYPE "TelegramWorkflowMessageType" AS ENUM ('WIZARD_PROMPT', 'REVIEW_CARD', 'INPUT_PROMPT', 'VISUAL_REVIEW_CARD', 'INTERACTION_PROMPT');

-- CreateTable
CREATE TABLE "telegram_active_workflow_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "resource_key" VARCHAR(120) NOT NULL,
    "telegram_identity_id" UUID,
    "chat_id" VARCHAR(80),
    "message_id" INTEGER NOT NULL,
    "message_type" "TelegramWorkflowMessageType" NOT NULL DEFAULT 'WIZARD_PROMPT',
    "payload_metadata" JSONB,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_active_workflow_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "telegram_active_workflow_messages_identity_id_fkey" FOREIGN KEY ("telegram_identity_id") REFERENCES "telegram_identities"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "telegram_channel_publications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "creative_job_id" UUID NOT NULL,
    "visual_asset_id" UUID NOT NULL,
    "channel_id" VARCHAR(80) NOT NULL,
    "message_id" INTEGER NOT NULL,
    "published_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_channel_publications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "telegram_channel_publications_job_id_fkey" FOREIGN KEY ("creative_job_id") REFERENCES "creative_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "telegram_channel_publications_asset_id_fkey" FOREIGN KEY ("visual_asset_id") REFERENCES "visual_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "telegram_active_workflow_messages_resource_key" ON "telegram_active_workflow_messages"("resource_key");

-- CreateIndex
CREATE INDEX "telegram_active_workflow_messages_identity_updated_idx" ON "telegram_active_workflow_messages"("telegram_identity_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_channel_publications_job_id_key" ON "telegram_channel_publications"("creative_job_id");

-- CreateIndex
CREATE INDEX "telegram_channel_publications_channel_published_idx" ON "telegram_channel_publications"("channel_id", "published_at");
