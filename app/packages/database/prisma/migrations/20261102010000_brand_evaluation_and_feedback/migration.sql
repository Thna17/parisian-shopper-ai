-- CreateTable
CREATE TABLE "brand_feedback_records" (
    "id" UUID NOT NULL,
    "source_type" VARCHAR(50) NOT NULL,
    "content_job_id" UUID,
    "content_version_id" UUID,
    "original_text" TEXT NOT NULL,
    "revised_text" TEXT,
    "decision" VARCHAR(50) NOT NULL,
    "critique_notes" TEXT,
    "tone_flags" TEXT[],
    "reviewer_user_id" UUID,
    "dataset_version_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_feedback_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "brand_feedback_records_decision_created_at_idx" ON "brand_feedback_records"("decision", "created_at");

-- CreateIndex
CREATE INDEX "brand_feedback_records_dataset_version_id_idx" ON "brand_feedback_records"("dataset_version_id");

-- AddForeignKey
ALTER TABLE "brand_feedback_records" ADD CONSTRAINT "brand_feedback_records_dataset_version_id_fkey" FOREIGN KEY ("dataset_version_id") REFERENCES "brand_dataset_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
