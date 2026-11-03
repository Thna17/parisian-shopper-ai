-- AlterTable
ALTER TABLE "ai_budget_policies"
    ADD COLUMN "version" VARCHAR(20) NOT NULL DEFAULT '1.0.0',
    ADD COLUMN "scope_type" "BudgetScope" NOT NULL DEFAULT 'GLOBAL',
    ADD COLUMN "scope_id" VARCHAR(100) NOT NULL DEFAULT 'GLOBAL',
    ADD COLUMN "daily_ceiling" DECIMAL(12,4) NOT NULL DEFAULT 10.00,
    ADD COLUMN "per_operation_max" DECIMAL(12,4) NOT NULL DEFAULT 2.00,
    ADD COLUMN "enforce_hard_cap" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "max_daily_retries" INTEGER NOT NULL DEFAULT 3,
    ADD COLUMN "reservation_ttl_seconds" INTEGER NOT NULL DEFAULT 300,
    ADD COLUMN "rolling_quota_limits" JSONB,
    ADD COLUMN "allowed_providers" TEXT[] NOT NULL DEFAULT ARRAY['openai', 'codex_cli', 'fake']::TEXT[],
    ADD COLUMN "allowed_fallbacks" TEXT[] NOT NULL DEFAULT ARRAY['codex_cli', 'fake']::TEXT[],
    ADD COLUMN "approved_by_user_id" UUID;

-- CreateIndex
CREATE INDEX "ai_budget_policies_scope_idx" ON "ai_budget_policies"("scope_type", "scope_id");

-- CreateEnum
CREATE TYPE "ReservationLifecycleState" AS ENUM ('RESERVED', 'DISPATCHED', 'RELEASED', 'EXPIRED', 'HELD_FOR_RECONCILIATION', 'SETTLED');

-- CreateEnum
CREATE TYPE "ProviderAttemptOutcome" AS ENUM ('IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'CANCELLED_AFTER_DISPATCH', 'TIMED_OUT', 'UNKNOWN_OUTCOME');

-- CreateEnum
CREATE TYPE "RetryRelationship" AS ENUM ('INITIAL_ATTEMPT', 'RETRY_OF_FAILURE', 'NONE');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('RESERVATION_CREATED', 'RESERVATION_RELEASED', 'USAGE_COMMITTED', 'USAGE_CORRECTION', 'UNKNOWN_OUTCOME_HOLD', 'RECONCILIATION_CONFIRMED', 'RECONCILIATION_RELEASED');

-- CreateEnum
CREATE TYPE "AiModality" AS ENUM ('TEXT', 'IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "PricingUnit" AS ENUM ('PER_1K_TOKENS', 'PER_1M_TOKENS', 'PER_IMAGE', 'PER_VIDEO_SECOND', 'SUBSCRIPTION_FLAT');

-- CreateEnum
CREATE TYPE "PricingApprovalStatus" AS ENUM ('PROPOSED', 'APPROVED', 'SUPERSEDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EnvironmentTier" AS ENUM ('DEVELOPMENT', 'STAGING', 'PRODUCTION');

-- CreateTable
CREATE TABLE "usage_reservations" (
    "id" UUID NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "budget_policy_version_id" VARCHAR(100) NOT NULL,
    "user_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    "tenant_id" VARCHAR(100) NOT NULL DEFAULT 'parisian-shopper-default',
    "creative_job_id" UUID,
    "content_job_id" UUID,
    "campaign_id" UUID,
    "provider_id" VARCHAR(100) NOT NULL,
    "model_id" VARCHAR(100) NOT NULL,
    "estimated_cost" DECIMAL(12,4) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "capacity_units" INTEGER,
    "state" "ReservationLifecycleState" NOT NULL DEFAULT 'RESERVED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatched_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "closed_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "usage_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_attempts" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "provider_id" VARCHAR(100) NOT NULL,
    "model_id" VARCHAR(100) NOT NULL,
    "modality" "AiModality" NOT NULL,
    "provider_request_id" VARCHAR(200),
    "dispatched_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "operational_outcome" "ProviderAttemptOutcome" NOT NULL DEFAULT 'IN_PROGRESS',
    "retry_relationship" "RetryRelationship" NOT NULL DEFAULT 'INITIAL_ATTEMPT',
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "image_count" INTEGER,
    "resolution_tier" VARCHAR(100),
    "video_duration_seconds" INTEGER,
    "cancellation_reason" VARCHAR(255),
    "duration_ms" INTEGER,
    "safe_prompt_digest" VARCHAR(64) NOT NULL,
    "digest_algorithm" VARCHAR(32) NOT NULL DEFAULT 'HMAC-SHA256',
    "digest_key_version" VARCHAR(50) NOT NULL DEFAULT '2026-v1',
    "output_digest" VARCHAR(64),
    "error_code" VARCHAR(100),
    "error_message" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "provider_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_ledger_entries" (
    "id" UUID NOT NULL,
    "entry_type" "LedgerEntryType" NOT NULL,
    "reservation_id" UUID NOT NULL,
    "attempt_id" UUID,
    "settlement_key" VARCHAR(200) NOT NULL,
    "amount" DECIMAL(12,4) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "cost_knowledge" "CostKnowledgeState" NOT NULL DEFAULT 'ESTIMATED',
    "pricing_version_id" VARCHAR(100),
    "exchange_rate" DECIMAL(12,6),
    "exchange_rate_source" VARCHAR(100),
    "exchange_rate_source_record_id" VARCHAR(100),
    "exchange_rate_effective_at" TIMESTAMPTZ(3),
    "base_currency" VARCHAR(10),
    "quote_currency" VARCHAR(10),
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reconciliation_ref" VARCHAR(255),
    "correction_of_entry_id" UUID,
    "actor_user_id" UUID,
    "system_component" VARCHAR(100) NOT NULL DEFAULT 'usage-ledger-worker',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_pricing_versions" (
    "id" VARCHAR(100) NOT NULL,
    "provider_id" VARCHAR(100) NOT NULL,
    "model_id" VARCHAR(100) NOT NULL,
    "capability" VARCHAR(100) NOT NULL,
    "modality" "AiModality" NOT NULL,
    "pricing_unit" "PricingUnit" NOT NULL,
    "input_token_rate" DECIMAL(12,6),
    "output_token_rate" DECIMAL(12,6),
    "image_rate_by_resolution" JSONB,
    "video_rate_by_duration" JSONB,
    "subscription_rules" JSONB,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "source" VARCHAR(200) NOT NULL,
    "pricing_source_url" VARCHAR(500) NOT NULL,
    "source_retrieved_at" TIMESTAMPTZ(3) NOT NULL,
    "effective_from" TIMESTAMPTZ(3) NOT NULL,
    "effective_to" TIMESTAMPTZ(3),
    "approval_status" "PricingApprovalStatus" NOT NULL DEFAULT 'PROPOSED',
    "approved_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "provider_pricing_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_capability_registrations" (
    "id" VARCHAR(100) NOT NULL,
    "provider_id" VARCHAR(100) NOT NULL,
    "model_id" VARCHAR(100) NOT NULL,
    "modality" "AiModality" NOT NULL,
    "supported_capabilities" TEXT[] NOT NULL,
    "environment" "EnvironmentTier" NOT NULL DEFAULT 'DEVELOPMENT',
    "supports_idempotency" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "provider_capability_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usage_reservations_idempotency_key" ON "usage_reservations"("idempotency_key");

-- CreateIndex
CREATE INDEX "usage_reservations_state_expires_idx" ON "usage_reservations"("state", "expires_at");

-- CreateIndex
CREATE INDEX "usage_reservations_policy_created_idx" ON "usage_reservations"("budget_policy_version_id", "created_at");

-- CreateIndex
CREATE INDEX "usage_reservations_creative_job_idx" ON "usage_reservations"("creative_job_id");

-- CreateIndex
CREATE INDEX "usage_reservations_content_job_idx" ON "usage_reservations"("content_job_id");

-- CreateIndex
CREATE INDEX "usage_reservations_campaign_idx" ON "usage_reservations"("campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_attempts_reservation_attempt_key" ON "provider_attempts"("reservation_id", "attempt_number");

-- CreateIndex
CREATE INDEX "provider_attempts_outcome_created_idx" ON "provider_attempts"("operational_outcome", "created_at");

-- CreateIndex
CREATE INDEX "provider_attempts_provider_model_idx" ON "provider_attempts"("provider_id", "model_id", "created_at");

-- CreateIndex
CREATE INDEX "provider_attempts_prompt_digest_idx" ON "provider_attempts"("safe_prompt_digest");

-- CreateIndex
CREATE UNIQUE INDEX "usage_ledger_entries_settlement_key" ON "usage_ledger_entries"("settlement_key");

-- CreateIndex
CREATE INDEX "usage_ledger_entries_type_recorded_idx" ON "usage_ledger_entries"("entry_type", "recorded_at");

-- CreateIndex
CREATE INDEX "usage_ledger_entries_reservation_idx" ON "usage_ledger_entries"("reservation_id");

-- CreateIndex
CREATE INDEX "usage_ledger_entries_attempt_idx" ON "usage_ledger_entries"("attempt_id");

-- CreateIndex
CREATE INDEX "usage_ledger_entries_cost_knowledge_idx" ON "usage_ledger_entries"("cost_knowledge");

-- CreateIndex
CREATE INDEX "provider_pricing_versions_lookup_idx" ON "provider_pricing_versions"("provider_id", "model_id", "approval_status");

-- CreateIndex
CREATE INDEX "provider_pricing_versions_effective_idx" ON "provider_pricing_versions"("approval_status", "effective_from", "effective_to");

-- CreateIndex
CREATE UNIQUE INDEX "provider_capability_registrations_env_key" ON "provider_capability_registrations"("provider_id", "model_id", "environment");

-- CreateIndex
CREATE INDEX "provider_capability_registrations_active_modality_idx" ON "provider_capability_registrations"("active", "modality");

-- AddForeignKey
ALTER TABLE "provider_attempts" ADD CONSTRAINT "provider_attempts_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "usage_reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_ledger_entries" ADD CONSTRAINT "usage_ledger_entries_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "usage_reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_ledger_entries" ADD CONSTRAINT "usage_ledger_entries_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "provider_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_ledger_entries" ADD CONSTRAINT "usage_ledger_entries_correction_id_fkey" FOREIGN KEY ("correction_of_entry_id") REFERENCES "usage_ledger_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
