-- AlterTable
ALTER TABLE "content_jobs" ADD COLUMN "campaign_id" UUID;

-- CreateIndex
CREATE INDEX "content_jobs_campaign_id_idx" ON "content_jobs"("campaign_id");

-- AddForeignKey
ALTER TABLE "content_jobs" ADD CONSTRAINT "content_jobs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
