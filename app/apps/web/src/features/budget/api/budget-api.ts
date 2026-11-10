import { apiClient } from '../../../services/api/api-client.js';
import type {
  ActiveBudgetReport,
  BudgetPolicyRecord,
  ListLedgerQuery,
  ListUnreconciledQuery,
  ProviderRoutingCapability,
  ReconcileReservationParams,
  RouteCapabilityQuery,
  UpdateBudgetPolicyParams,
  UsageLedgerEntryRecord,
  UsageReservationRecord,
} from '../types/budget.types.js';

export const budgetApi = {
  /**
   * Fetches active budget policy and real-time quota status report.
   * GET /v1/ai/budget/active
   */
  async getActivePolicy(): Promise<ActiveBudgetReport> {
    return apiClient.get<ActiveBudgetReport>('/v1/ai/budget/active');
  },

  /**
   * Lists all historical and active budget policies.
   * GET /v1/ai/budget/policies
   */
  async listPolicies(): Promise<readonly BudgetPolicyRecord[]> {
    return apiClient.get<readonly BudgetPolicyRecord[]>('/v1/ai/budget/policies');
  },

  /**
   * Updates an existing budget policy's ceilings, thresholds, and fallback rules.
   * PATCH /v1/ai/budget/policies/:id
   */
  async updatePolicy(id: string, params: UpdateBudgetPolicyParams): Promise<BudgetPolicyRecord> {
    return apiClient.patch<BudgetPolicyRecord>(`/v1/ai/budget/policies/${id}`, params);
  },

  /**
   * Retrieves paginated immutable usage ledger entries with audit trail.
   * GET /v1/ai/ledger/entries
   */
  async listLedgerEntries(params: ListLedgerQuery = {}): Promise<{
    readonly items: readonly UsageLedgerEntryRecord[];
    readonly total: number;
  }> {
    const searchParams = new URLSearchParams();
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit));
    if (params.offset !== undefined) searchParams.set('offset', String(params.offset));
    if (params.entryType) searchParams.set('entryType', params.entryType);
    if (params.reservationId) searchParams.set('reservationId', params.reservationId);

    const queryStr = searchParams.toString();
    const endpoint = `/v1/ai/ledger/entries${queryStr ? `?${queryStr}` : ''}`;
    return apiClient.get<{
      readonly items: readonly UsageLedgerEntryRecord[];
      readonly total: number;
    }>(endpoint);
  },

  /**
   * Lists reservations stuck in HELD_FOR_RECONCILIATION requiring financial sign-off.
   * GET /v1/ai/ledger/unreconciled
   */
  async listUnreconciled(
    params: ListUnreconciledQuery = {},
  ): Promise<readonly UsageReservationRecord[]> {
    const searchParams = new URLSearchParams();
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit));
    if (params.offset !== undefined) searchParams.set('offset', String(params.offset));

    const queryStr = searchParams.toString();
    const endpoint = `/v1/ai/ledger/unreconciled${queryStr ? `?${queryStr}` : ''}`;
    return apiClient.get<readonly UsageReservationRecord[]>(endpoint);
  },

  /**
   * Confirms upstream invoice billing or confirms zero-charge release for a held reservation.
   * POST /v1/ai/ledger/reconcile/:reservationId
   */
  async reconcileReservation(
    id: string,
    params: ReconcileReservationParams,
  ): Promise<UsageLedgerEntryRecord> {
    return apiClient.post<UsageLedgerEntryRecord>(`/v1/ai/ledger/reconcile/${id}`, params);
  },

  /**
   * Evaluates provider capability routing, cost projections, and health checks.
   * GET /v1/ai/router/capabilities
   */
  async getRouterCapabilities(
    params: RouteCapabilityQuery = {},
  ): Promise<ProviderRoutingCapability | Record<string, unknown>> {
    const searchParams = new URLSearchParams();
    if (params.modality) searchParams.set('modality', params.modality);
    if (params.capability) searchParams.set('capability', params.capability);
    if (params.preferredProviderId) {
      searchParams.set('preferredProviderId', params.preferredProviderId);
    }

    const queryStr = searchParams.toString();
    const endpoint = `/v1/ai/router/capabilities${queryStr ? `?${queryStr}` : ''}`;
    return apiClient.get<ProviderRoutingCapability | Record<string, unknown>>(endpoint);
  },
};
