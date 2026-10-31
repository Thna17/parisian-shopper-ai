-- AlterTable
ALTER TABLE "creative_approval_events" ADD COLUMN "scene_version_id" UUID;

-- CreateIndex
CREATE INDEX "creative_approval_events_scene_version_created_at_idx" ON "creative_approval_events"("scene_version_id", "created_at");

-- AddForeignKey
ALTER TABLE "creative_approval_events" ADD CONSTRAINT "creative_approval_events_scene_version_id_fkey" FOREIGN KEY ("scene_version_id") REFERENCES "creative_scene_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
