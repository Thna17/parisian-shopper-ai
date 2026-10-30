-- CreateEnum
CREATE TYPE "BudgetScope" AS ENUM ('GLOBAL', 'MONTHLY', 'CAMPAIGN');

-- CreateEnum
CREATE TYPE "BudgetPolicyStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'COMMITTED', 'RELEASED', 'EXPIRED', 'UNRECONCILED');

-- CreateEnum
CREATE TYPE "CostKnowledgeState" AS ENUM ('EXACT', 'ESTIMATED', 'ZERO_CONFIRMED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('SETTLED', 'PENDING_RECONCILIATION', 'DISPUTED', 'MANUALLY_RECONCILED');

-- CreateTable
CREATE TABLE "ai_budget_policies" (
    "id" UUID NOT NULL,
    "scope" "BudgetScope" NOT NULL DEFAULT 'MONTHLY',
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "monthly_ceiling" DECIMAL(10,2) NOT NULL,
    "per_request_ceiling" DECIMAL(10,4) NOT NULL DEFAULT 2.00,
    "soft_alert_threshold" DECIMAL(5,2) NOT NULL DEFAULT 80.00,
    "effective_from" TIMESTAMPTZ(3) NOT NULL,
    "effective_to" TIMESTAMPTZ(3),
    "status" "BudgetPolicyStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ai_budget_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_cost_reservations" (
    "id" UUID NOT NULL,
    "budget_policy_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "content_job_id" UUID,
    "creative_job_id" UUID,
    "generation_attempt_id" UUID,
    "reserved_amount" DECIMAL(19,6) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "settled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ai_cost_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_records" (
    "id" UUID NOT NULL,
    "reservation_id" UUID,
    "generation_attempt_id" UUID,
    "provider" VARCHAR(100) NOT NULL,
    "model" VARCHAR(200) NOT NULL,
    "provider_request_id" VARCHAR(200),
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "total_tokens" INTEGER,
    "estimated_cost" DECIMAL(19,6) NOT NULL,
    "confirmed_cost" DECIMAL(19,6),
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "cost_knowledge" "CostKnowledgeState" NOT NULL DEFAULT 'ESTIMATED',
    "reconciliation_status" "ReconciliationStatus" NOT NULL DEFAULT 'SETTLED',
    "reconciliation_notes" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settled_at" TIMESTAMPTZ(3),

    CONSTRAINT "ai_usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_budget_policies_status_effective_idx" ON "ai_budget_policies"("status", "effective_from", "effective_to");

-- CreateIndex
CREATE UNIQUE INDEX "ai_cost_reservations_idempotency_key" ON "ai_cost_reservations"("idempotency_key");

-- CreateIndex
CREATE INDEX "ai_cost_reservations_status_expires_idx" ON "ai_cost_reservations"("status", "expires_at");

-- CreateIndex
CREATE INDEX "ai_cost_reservations_policy_created_idx" ON "ai_cost_reservations"("budget_policy_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_cost_reservations_content_job_id_idx" ON "ai_cost_reservations"("content_job_id");

-- CreateIndex
CREATE INDEX "ai_cost_reservations_creative_job_id_idx" ON "ai_cost_reservations"("creative_job_id");

-- CreateIndex
CREATE INDEX "ai_usage_records_reconciliation_status_idx" ON "ai_usage_records"("reconciliation_status", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_records_provider_model_idx" ON "ai_usage_records"("provider", "model", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_records_reservation_id_idx" ON "ai_usage_records"("reservation_id");

-- AddForeignKey
ALTER TABLE "ai_budget_policies" ADD CONSTRAINT "ai_budget_policies_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_cost_reservations" ADD CONSTRAINT "ai_cost_reservations_budget_policy_id_fkey" FOREIGN KEY ("budget_policy_id") REFERENCES "ai_budget_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "ai_cost_reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
