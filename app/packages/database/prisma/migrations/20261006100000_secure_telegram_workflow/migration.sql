CREATE TYPE "TelegramCreateFlowStatus" AS ENUM ('SELECTING_CONTENT_TYPE', 'SELECTING_LANGUAGE', 'SELECTING_PLATFORM', 'COMPLETED', 'EXPIRED');
CREATE TYPE "TelegramNotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

INSERT INTO "roles" ("id", "code", "name", "description", "updated_at") VALUES
  ('10000000-0000-4000-8000-000000000001', 'VIEWER', 'Viewer', 'May search and view authorized content history.', CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000002', 'MARKETING_EDITOR', 'Marketing Editor', 'May create AI-assisted marketing drafts.', CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000003', 'MARKETING_APPROVER', 'Marketing Approver', 'Editor capabilities in Phase 1E; approval is reserved for Phase 1F.', CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000004', 'ADMIN', 'Administrator', 'Full Phase 1E Telegram access.', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "users" ("id", "display_name", "status", "updated_at")
VALUES ('10000000-0000-4000-8000-000000000000', 'Legacy workflow requester', 'DISABLED', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE "telegram_identities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "telegram_user_id" BIGINT NOT NULL,
  "user_id" UUID NOT NULL,
  "telegram_username" VARCHAR(64),
  "display_name" VARCHAR(200),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMPTZ(3),
  "disabled_at" TIMESTAMPTZ(3),
  CONSTRAINT "telegram_identities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "telegram_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "telegram_identities_telegram_user_id_key" ON "telegram_identities"("telegram_user_id");
CREATE INDEX "telegram_identities_user_id_idx" ON "telegram_identities"("user_id");

CREATE TABLE "inbound_telegram_updates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "telegram_update_id" BIGINT NOT NULL,
  "telegram_user_id" BIGINT,
  "update_type" VARCHAR(40) NOT NULL,
  "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inbound_telegram_updates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inbound_telegram_updates_update_id_key" ON "inbound_telegram_updates"("telegram_update_id");
CREATE INDEX "inbound_telegram_updates_received_at_idx" ON "inbound_telegram_updates"("received_at");

CREATE TABLE "telegram_create_flows" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "telegram_identity_id" UUID NOT NULL,
  "product_data" JSONB NOT NULL,
  "status" "TelegramCreateFlowStatus" NOT NULL DEFAULT 'SELECTING_CONTENT_TYPE',
  "content_type" "ContentType",
  "language" "ContentLanguage",
  "platform" "ContentPlatform",
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "completed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "telegram_create_flows_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "telegram_create_flows_identity_id_fkey" FOREIGN KEY ("telegram_identity_id") REFERENCES "telegram_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "telegram_create_flows_identity_created_at_idx" ON "telegram_create_flows"("telegram_identity_id", "created_at");
CREATE INDEX "telegram_create_flows_status_expires_at_idx" ON "telegram_create_flows"("status", "expires_at");

CREATE TABLE "telegram_action_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "token_hash" CHAR(64) NOT NULL,
  "telegram_identity_id" UUID NOT NULL,
  "action" VARCHAR(80) NOT NULL,
  "resource_id" VARCHAR(200) NOT NULL,
  "single_use" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "consumed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "telegram_action_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "telegram_action_tokens_identity_id_fkey" FOREIGN KEY ("telegram_identity_id") REFERENCES "telegram_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "telegram_action_tokens_hash_format" CHECK ("token_hash" ~ '^[a-f0-9]{64}$')
);
CREATE UNIQUE INDEX "telegram_action_tokens_token_hash_key" ON "telegram_action_tokens"("token_hash");
CREATE INDEX "telegram_action_tokens_identity_expires_at_idx" ON "telegram_action_tokens"("telegram_identity_id", "expires_at");

CREATE TABLE "telegram_notification_deliveries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "outbox_event_id" UUID NOT NULL,
  "telegram_identity_id" UUID NOT NULL,
  "status" "TelegramNotificationStatus" NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "last_error_code" VARCHAR(100),
  "sent_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "telegram_notification_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "telegram_notification_deliveries_attempt_count_nonnegative" CHECK ("attempt_count" >= 0),
  CONSTRAINT "telegram_notification_deliveries_outbox_event_id_fkey" FOREIGN KEY ("outbox_event_id") REFERENCES "outbox_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "telegram_notification_deliveries_identity_id_fkey" FOREIGN KEY ("telegram_identity_id") REFERENCES "telegram_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "telegram_notification_deliveries_outbox_event_id_key" ON "telegram_notification_deliveries"("outbox_event_id");
CREATE INDEX "telegram_notification_deliveries_status_updated_at_idx" ON "telegram_notification_deliveries"("status", "updated_at");

CREATE TABLE "telegram_rate_limit_buckets" (
  "telegram_identity_id" UUID NOT NULL,
  "action" VARCHAR(80) NOT NULL,
  "window_start" TIMESTAMPTZ(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "telegram_rate_limit_buckets_pkey" PRIMARY KEY ("telegram_identity_id", "action", "window_start"),
  CONSTRAINT "telegram_rate_limit_buckets_count_nonnegative" CHECK ("count" >= 0),
  CONSTRAINT "telegram_rate_limit_buckets_identity_id_fkey" FOREIGN KEY ("telegram_identity_id") REFERENCES "telegram_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "audit_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actor_user_id" UUID,
  "telegram_identity_id" UUID,
  "action" VARCHAR(120) NOT NULL,
  "resource_type" VARCHAR(100),
  "resource_id" VARCHAR(200),
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "audit_events_telegram_identity_id_fkey" FOREIGN KEY ("telegram_identity_id") REFERENCES "telegram_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "audit_events_actor_user_id_created_at_idx" ON "audit_events"("actor_user_id", "created_at");
CREATE INDEX "audit_events_action_created_at_idx" ON "audit_events"("action", "created_at");

ALTER TABLE "content_jobs" ADD COLUMN "requester_user_id" UUID;
ALTER TABLE "content_jobs" ADD COLUMN "telegram_create_flow_id" UUID;
UPDATE "content_jobs" SET "requester_user_id" = '10000000-0000-4000-8000-000000000000' WHERE "requester_user_id" IS NULL;
ALTER TABLE "content_jobs" ALTER COLUMN "requester_user_id" SET NOT NULL;
ALTER TABLE "content_jobs" ADD CONSTRAINT "content_jobs_requester_user_id_fkey" FOREIGN KEY ("requester_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "content_jobs" ADD CONSTRAINT "content_jobs_telegram_create_flow_id_fkey" FOREIGN KEY ("telegram_create_flow_id") REFERENCES "telegram_create_flows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "content_jobs_telegram_create_flow_id_key" ON "content_jobs"("telegram_create_flow_id");
CREATE INDEX "content_jobs_requester_user_id_created_at_idx" ON "content_jobs"("requester_user_id", "created_at");

CREATE FUNCTION prevent_inbound_telegram_update_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'inbound_telegram_updates are append-only'; END; $$;
CREATE TRIGGER inbound_telegram_updates_append_only BEFORE UPDATE OR DELETE ON "inbound_telegram_updates"
FOR EACH ROW EXECUTE FUNCTION prevent_inbound_telegram_update_mutation();

CREATE FUNCTION prevent_audit_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit_events are append-only'; END; $$;
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON "audit_events"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation();
