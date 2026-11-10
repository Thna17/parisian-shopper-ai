-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED');

-- AlterTable
ALTER TABLE "visual_assets" ADD COLUMN     "scene_version_id" UUID;

-- CreateTable
CREATE TABLE "posts" (
    "id" UUID NOT NULL,
    "creator_user_id" UUID NOT NULL,
    "status" "PostStatus" NOT NULL DEFAULT 'DRAFT',
    "revision_number" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_revisions" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "author_user_id" UUID NOT NULL,
    "product_snapshot_id" UUID NOT NULL,
    "campaign_id" UUID,
    "brief" VARCHAR(2000) NOT NULL DEFAULT '',
    "channel" "ContentPlatform" NOT NULL,
    "language" "ContentLanguage" NOT NULL,
    "caption_version_id" UUID,
    "poster_version_id" UUID,
    "visual_asset_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_events" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "comment" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "posts_creator_user_id_updated_at_idx" ON "posts"("creator_user_id", "updated_at");

-- CreateIndex
CREATE INDEX "posts_status_updated_at_idx" ON "posts"("status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "post_revisions_post_id_revision_number_key" ON "post_revisions"("post_id", "revision_number");

-- CreateIndex
CREATE INDEX "post_events_post_id_created_at_idx" ON "post_events"("post_id", "created_at");

-- AddForeignKey
ALTER TABLE "visual_assets" ADD CONSTRAINT "visual_assets_scene_version_id_fkey" FOREIGN KEY ("scene_version_id") REFERENCES "creative_scene_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_creator_user_id_fkey" FOREIGN KEY ("creator_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_revisions" ADD CONSTRAINT "post_revisions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_revisions" ADD CONSTRAINT "post_revisions_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_revisions" ADD CONSTRAINT "post_revisions_product_snapshot_id_fkey" FOREIGN KEY ("product_snapshot_id") REFERENCES "product_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_revisions" ADD CONSTRAINT "post_revisions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_revisions" ADD CONSTRAINT "post_revisions_caption_version_id_fkey" FOREIGN KEY ("caption_version_id") REFERENCES "content_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_revisions" ADD CONSTRAINT "post_revisions_poster_version_id_fkey" FOREIGN KEY ("poster_version_id") REFERENCES "creative_scene_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_revisions" ADD CONSTRAINT "post_revisions_visual_asset_id_fkey" FOREIGN KEY ("visual_asset_id") REFERENCES "visual_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_events" ADD CONSTRAINT "post_events_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_events" ADD CONSTRAINT "post_events_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "post_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_events" ADD CONSTRAINT "post_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "posts" ADD CONSTRAINT "posts_revision_positive" CHECK ("revision_number" > 0);
ALTER TABLE "post_revisions" ADD CONSTRAINT "post_revisions_number_positive" CHECK ("revision_number" > 0);
ALTER TABLE "post_revisions" ADD CONSTRAINT "post_revisions_asset_requires_versions" CHECK ("visual_asset_id" IS NULL OR ("poster_version_id" IS NOT NULL AND "caption_version_id" IS NOT NULL));

CREATE FUNCTION reject_staff_post_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Post revisions and audit events are append-only';
END;
$$;
CREATE TRIGGER post_revision_append_only BEFORE UPDATE OR DELETE ON "post_revisions" FOR EACH ROW EXECUTE FUNCTION reject_staff_post_history_mutation();
CREATE TRIGGER post_event_append_only BEFORE UPDATE OR DELETE ON "post_events" FOR EACH ROW EXECUTE FUNCTION reject_staff_post_history_mutation();
