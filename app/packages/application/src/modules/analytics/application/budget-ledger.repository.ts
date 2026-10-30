import type {
  AiBudgetPolicyRecord,
  AiCostReservationRecord,
  AiUsageRecordData,
  BudgetUtilizationResult,
  CostLedgerQuery,
  CreateBudgetPolicyInput,
  PaginatedCostLedger,
  ReconcileUsageInput,
  ReserveBudgetInput,
  SettleReservationInput,
  UnreconciledUsageRecord,
  UpdateBudgetPolicyInput,
} from '../domain/budget.types.js';

export const BUDGET_LEDGER_REPOSITORY = Symbol('BUDGET_LEDGER_REPOSITORY');

export interface BudgetLedgerRepository {
  getActivePolicy(scope?: string): Promise<AiBudgetPolicyRecord | null>;
  getPolicyById(id: string): Promise<AiBudgetPolicyRecord | null>;
  listPolicies(): Promise<readonly AiBudgetPolicyRecord[]>;
  createPolicy(input: CreateBudgetPolicyInput): Promise<AiBudgetPolicyRecord>;
  updatePolicy(id: string, input: UpdateBudgetPolicyInput): Promise<AiBudgetPolicyRecord>;
  getBudgetUtilization(
    policyId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<BudgetUtilizationResult>;
  reserveBudget(input: ReserveBudgetInput): Promise<AiCostReservationRecord>;
  settleReservation(input: SettleReservationInput): Promise<AiUsageRecordData>;
  releaseReservation(reservationId: string, reason?: string): Promise<void>;
  markUnreconciled(reservationId: string, reason: string): Promise<void>;
  listCostLedger(query: CostLedgerQuery): Promise<PaginatedCostLedger>;
  listUnreconciledUsage(): Promise<readonly UnreconciledUsageRecord[]>;
  reconcileUsage(recordId: string, input: ReconcileUsageInput): Promise<AiUsageRecordData>;
}
