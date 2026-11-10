-- AlterTable
ALTER TABLE "post_revisions" ADD COLUMN     "generation_id" UUID;

-- CreateTable
CREATE TABLE "post_generations" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "source_revision_id" UUID NOT NULL,
    "source_revision_number" INTEGER NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'QUEUED',
    "provider" VARCHAR(30) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "settings" JSONB NOT NULL,
    "prompt" TEXT NOT NULL,
    "references" JSONB NOT NULL,
    "caption" JSONB,
    "provenance" JSONB,
    "authorization" JSONB,
    "request_id" VARCHAR(200),
    "estimated_cost_usd" DECIMAL(19,8),
    "actual_cost_usd" DECIMAL(19,8),
    "background_key" TEXT,
    "image_key" TEXT,
    "image_sha256" CHAR(64),
    "error" TEXT,
    "claim_token" UUID,
    "lease_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "post_generations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "post_generations_source_revision_id_key" ON "post_generations"("source_revision_id");

-- CreateIndex
CREATE INDEX "post_generations_status_lease_until_idx" ON "post_generations"("status", "lease_until");

-- AddForeignKey
ALTER TABLE "post_generations" ADD CONSTRAINT "post_generations_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_generations" ADD CONSTRAINT "post_generations_source_revision_id_fkey" FOREIGN KEY ("source_revision_id") REFERENCES "post_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_revisions" ADD CONSTRAINT "post_revisions_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "post_generations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Configuration and completed artifacts are immutable. Keep the ledger even after provider failures.
CREATE FUNCTION protect_post_generation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Generation history cannot be deleted'; END IF;
  IF OLD.status = 'COMPLETE' THEN RAISE EXCEPTION 'Completed generation is immutable'; END IF;
  IF (NEW.post_id, NEW.source_revision_id, NEW.source_revision_number, NEW.provider, NEW.model, NEW.settings, NEW.prompt, NEW.references)
     IS DISTINCT FROM (OLD.post_id, OLD.source_revision_id, OLD.source_revision_number, OLD.provider, OLD.model, OLD.settings, OLD.prompt, OLD.references)
     THEN RAISE EXCEPTION 'Generation configuration is immutable'; END IF;
  IF OLD.request_id IS NOT NULL AND NEW.request_id IS DISTINCT FROM OLD.request_id THEN RAISE EXCEPTION 'Provider request identity is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_post_generation BEFORE UPDATE OR DELETE ON post_generations FOR EACH ROW EXECUTE FUNCTION protect_post_generation();
CREATE UNIQUE INDEX post_generations_provider_request_key ON post_generations(provider, request_id) WHERE request_id IS NOT NULL;
