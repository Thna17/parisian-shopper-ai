-- CreateTable: creative_scenes
CREATE TABLE "creative_scenes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "creative_job_id" UUID NOT NULL,
    "campaign_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "current_version_number" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creative_scenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable: creative_scene_versions
CREATE TABLE "creative_scene_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scene_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "parent_version_id" UUID,
    "aspect_ratio" VARCHAR(20) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "template_id" VARCHAR(100) NOT NULL,
    "template_version" VARCHAR(50) NOT NULL,
    "style_preset_id" VARCHAR(100),
    "language" VARCHAR(20) NOT NULL DEFAULT 'EN',
    "safe_margins" JSONB NOT NULL,
    "brand_profile_version_id" UUID NOT NULL,
    "source_content_version_id" UUID NOT NULL,
    "product_snapshot_id" UUID NOT NULL,
    "scene_hash" CHAR(64) NOT NULL,
    "dependency_hash" CHAR(64) NOT NULL,
    "change_reason" VARCHAR(500),
    "operation_code" VARCHAR(50),
    "requested_by_user_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creative_scene_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: scene_layers
CREATE TABLE "scene_layers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scene_version_id" UUID NOT NULL,
    "layer_key" VARCHAR(100) NOT NULL,
    "layer_group" VARCHAR(50) NOT NULL,
    "layer_type" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "z_index" INTEGER NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "opacity" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "blend_mode" VARCHAR(50) NOT NULL DEFAULT 'NORMAL',
    "bounds" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "payload_schema_version" INTEGER NOT NULL DEFAULT 1,
    "layer_hash" CHAR(64) NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scene_layers_pkey" PRIMARY KEY ("id")
);

-- CreateTable: layer_dependencies
CREATE TABLE "layer_dependencies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scene_version_id" UUID NOT NULL,
    "scene_layer_id" UUID,
    "dependency_type" VARCHAR(100) NOT NULL,
    "dependency_identifier" VARCHAR(255) NOT NULL,
    "evidence_identifier" VARCHAR(255),
    "immutable_digest" CHAR(64) NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "layer_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable: scene_version_states
CREATE TABLE "scene_version_states" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scene_version_id" UUID NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
    "is_export_eligible" BOOLEAN NOT NULL DEFAULT false,
    "invalidation_reason" VARCHAR(500),
    "invalidated_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scene_version_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable: scene_invalidation_events
CREATE TABLE "scene_invalidation_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scene_version_id" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "diverged_dependency_type" VARCHAR(100) NOT NULL,
    "expected_digest" CHAR(64) NOT NULL,
    "actual_digest" CHAR(64) NOT NULL,
    "recorded_by_user_id" UUID,
    "metadata" JSONB,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scene_invalidation_events_pkey" PRIMARY KEY ("id")
);

-- Indexes for creative_scenes
CREATE INDEX "creative_scenes_job_created_at_idx" ON "creative_scenes"("creative_job_id", "created_at");

-- Indexes for creative_scene_versions
CREATE UNIQUE INDEX "creative_scene_versions_scene_version_key" ON "creative_scene_versions"("scene_id", "version_number");
CREATE INDEX "creative_scene_versions_scene_created_at_idx" ON "creative_scene_versions"("scene_id", "created_at");
CREATE INDEX "creative_scene_versions_scene_hash_idx" ON "creative_scene_versions"("scene_hash");
CREATE INDEX "creative_scene_versions_dependency_hash_idx" ON "creative_scene_versions"("dependency_hash");
CREATE INDEX "creative_scene_versions_product_snapshot_id_idx" ON "creative_scene_versions"("product_snapshot_id");

-- Indexes for scene_layers
CREATE UNIQUE INDEX "scene_layers_id_version_id_uniq" ON "scene_layers"("id", "scene_version_id");
CREATE UNIQUE INDEX "scene_layers_version_key_uniq" ON "scene_layers"("scene_version_id", "layer_key");
CREATE UNIQUE INDEX "scene_layers_version_z_index_uniq" ON "scene_layers"("scene_version_id", "z_index");
CREATE UNIQUE INDEX "scene_layers_version_sort_order_uniq" ON "scene_layers"("scene_version_id", "sort_order");
CREATE INDEX "scene_layers_version_sort_idx" ON "scene_layers"("scene_version_id", "sort_order");
CREATE INDEX "scene_layers_hash_idx" ON "scene_layers"("layer_hash");

-- Indexes for layer_dependencies
CREATE UNIQUE INDEX "layer_deps_version_type_identifier_uniq" ON "layer_dependencies"("scene_version_id", "dependency_type", "dependency_identifier");
CREATE INDEX "layer_deps_version_sort_idx" ON "layer_dependencies"("scene_version_id", "sort_order");
CREATE INDEX "layer_deps_digest_idx" ON "layer_dependencies"("immutable_digest");

-- Indexes for scene_version_states
CREATE UNIQUE INDEX "scene_version_states_scene_version_id_key" ON "scene_version_states"("scene_version_id");
CREATE INDEX "scene_version_states_status_idx" ON "scene_version_states"("status");

-- Indexes for scene_invalidation_events
CREATE INDEX "scene_invalidation_events_version_recorded_at_idx" ON "scene_invalidation_events"("scene_version_id", "recorded_at");

-- Foreign Keys
ALTER TABLE "creative_scenes" ADD CONSTRAINT "creative_scenes_creative_job_id_fkey" FOREIGN KEY ("creative_job_id") REFERENCES "creative_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "creative_scene_versions" ADD CONSTRAINT "creative_scene_versions_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "creative_scenes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "creative_scene_versions" ADD CONSTRAINT "creative_scene_versions_parent_version_id_fkey" FOREIGN KEY ("parent_version_id") REFERENCES "creative_scene_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "creative_scene_versions" ADD CONSTRAINT "creative_scene_versions_content_version_id_fkey" FOREIGN KEY ("source_content_version_id") REFERENCES "content_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "creative_scene_versions" ADD CONSTRAINT "creative_scene_versions_product_snapshot_id_fkey" FOREIGN KEY ("product_snapshot_id") REFERENCES "product_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "creative_scene_versions" ADD CONSTRAINT "creative_scene_versions_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "scene_layers" ADD CONSTRAINT "scene_layers_scene_version_id_fkey" FOREIGN KEY ("scene_version_id") REFERENCES "creative_scene_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "layer_dependencies" ADD CONSTRAINT "layer_dependencies_scene_version_id_fkey" FOREIGN KEY ("scene_version_id") REFERENCES "creative_scene_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "layer_dependencies" ADD CONSTRAINT "layer_dependencies_layer_version_fkey" FOREIGN KEY ("scene_layer_id", "scene_version_id") REFERENCES "scene_layers"("id", "scene_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "scene_version_states" ADD CONSTRAINT "scene_version_states_scene_version_id_fkey" FOREIGN KEY ("scene_version_id") REFERENCES "creative_scene_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "scene_invalidation_events" ADD CONSTRAINT "scene_invalidation_events_scene_version_id_fkey" FOREIGN KEY ("scene_version_id") REFERENCES "creative_scene_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "scene_invalidation_events" ADD CONSTRAINT "scene_invalidation_events_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Immutability Function and Triggers
CREATE OR REPLACE FUNCTION prevent_immutable_row_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION '% is immutable: updates and deletes are prohibited', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_creative_scene_versions_immutable
BEFORE UPDATE OR DELETE ON "creative_scene_versions"
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_row_modification();

CREATE TRIGGER trg_scene_layers_immutable
BEFORE UPDATE OR DELETE ON "scene_layers"
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_row_modification();

CREATE TRIGGER trg_layer_dependencies_immutable
BEFORE UPDATE OR DELETE ON "layer_dependencies"
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_row_modification();

CREATE TRIGGER trg_scene_invalidation_events_immutable
BEFORE UPDATE OR DELETE ON "scene_invalidation_events"
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_row_modification();
