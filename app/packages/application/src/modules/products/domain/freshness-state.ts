export const FreshnessState = {
  FRESH: 'FRESH',
  AGING: 'AGING',
  STALE: 'STALE',
  INVALID: 'INVALID',
  SOURCE_UNAVAILABLE: 'SOURCE_UNAVAILABLE',
} as const;

export type FreshnessState = (typeof FreshnessState)[keyof typeof FreshnessState];

export const RevalidationOutcome = {
  FRESH: 'FRESH',
  NON_MATERIAL_CHANGE: 'NON_MATERIAL_CHANGE',
  MATERIAL_CHANGE: 'MATERIAL_CHANGE',
  SOURCE_UNAVAILABLE: 'SOURCE_UNAVAILABLE',
  PROMOTION_EXPIRED: 'PROMOTION_EXPIRED',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
} as const;

export type RevalidationOutcome = (typeof RevalidationOutcome)[keyof typeof RevalidationOutcome];

export const SourceAvailability = {
  AVAILABLE: 'AVAILABLE',
  DEGRADED: 'DEGRADED',
  UNREACHABLE: 'UNREACHABLE',
} as const;

export type SourceAvailability = (typeof SourceAvailability)[keyof typeof SourceAvailability];

export const FreshnessReasonCode = {
  OK_FRESH: 'OK_FRESH',
  PRICE_STALE: 'PRICE_STALE',
  STOCK_STALE: 'STOCK_STALE',
  PROMOTION_STALE: 'PROMOTION_STALE',
  FACTS_STALE: 'FACTS_STALE',
  HARD_EXPIRY_EXCEEDED: 'HARD_EXPIRY_EXCEEDED',
  PROMOTION_EXPIRED: 'PROMOTION_EXPIRED',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  FACT_DRIFT_DETECTED: 'FACT_DRIFT_DETECTED',
  UPSTREAM_UNAVAILABLE: 'UPSTREAM_UNAVAILABLE',
  UPSTREAM_NOT_FOUND: 'UPSTREAM_NOT_FOUND',
  DISCONTINUED: 'DISCONTINUED',
  FRESHNESS_POLICY_MISSING: 'FRESHNESS_POLICY_MISSING',
  POLICY_NOT_APPROVED: 'POLICY_NOT_APPROVED',
  ASSESSMENT_MISSING: 'ASSESSMENT_MISSING',
  POLICY_VERSION_MISMATCH: 'POLICY_VERSION_MISMATCH',
  PUBLISHING_LOCKED_PENDING_W61: 'PUBLISHING_LOCKED_PENDING_W61',
} as const;

export type FreshnessReasonCode = (typeof FreshnessReasonCode)[keyof typeof FreshnessReasonCode];

export interface ProductFreshnessPresentation {
  readonly statusLabel: string;
  readonly warningMessage?: string | undefined;
  readonly freshnessState: FreshnessState;
  readonly revalidationOutcome: RevalidationOutcome;
  readonly sourceAvailability: SourceAvailability;
  readonly isUsableForDrafting: boolean;
  readonly isEligibleForFinalApproval: boolean;
  readonly isEligibleForExport: boolean;
  readonly isEligibleForPublishing: boolean;
}

export function formatFreshnessPresentation(
  state: FreshnessState,
  outcome: RevalidationOutcome,
  sourceAvailability: SourceAvailability,
  extraReason?: string,
): ProductFreshnessPresentation {
  if (
    sourceAvailability === SourceAvailability.UNREACHABLE ||
    state === FreshnessState.SOURCE_UNAVAILABLE
  ) {
    return {
      statusLabel: 'Provider temporarily unavailable',
      warningMessage:
        'Product catalog is temporarily unreachable. Your creative drafts are safely preserved. Approval and export will resume once catalog connectivity is restored.',
      freshnessState: FreshnessState.SOURCE_UNAVAILABLE,
      revalidationOutcome: outcome,
      sourceAvailability,
      isUsableForDrafting: true,
      isEligibleForFinalApproval: false,
      isEligibleForExport: false,
      isEligibleForPublishing: false,
    };
  }

  if (outcome === RevalidationOutcome.OUT_OF_STOCK) {
    return {
      statusLabel: 'Product out of stock',
      warningMessage: 'This product is currently out of stock. Approval and export are blocked.',
      freshnessState: state,
      revalidationOutcome: outcome,
      sourceAvailability,
      isUsableForDrafting: true,
      isEligibleForFinalApproval: false,
      isEligibleForExport: false,
      isEligibleForPublishing: false,
    };
  }

  if (outcome === RevalidationOutcome.PROMOTION_EXPIRED) {
    return {
      statusLabel: 'Promotion expired',
      warningMessage: 'The promotion for this product has expired. Commercial review is required.',
      freshnessState: state,
      revalidationOutcome: outcome,
      sourceAvailability,
      isUsableForDrafting: true,
      isEligibleForFinalApproval: false,
      isEligibleForExport: false,
      isEligibleForPublishing: false,
    };
  }

  if (outcome === RevalidationOutcome.MATERIAL_CHANGE) {
    return {
      statusLabel: 'Product facts changed and review required',
      warningMessage:
        extraReason ??
        'Product attributes or prices have changed upstream. Downstream creative review is required.',
      freshnessState: state,
      revalidationOutcome: outcome,
      sourceAvailability,
      isUsableForDrafting: true,
      isEligibleForFinalApproval: false,
      isEligibleForExport: false,
      isEligibleForPublishing: false,
    };
  }

  switch (state) {
    case FreshnessState.FRESH:
      return {
        statusLabel: 'Product facts verified and current',
        freshnessState: state,
        revalidationOutcome: outcome,
        sourceAvailability,
        isUsableForDrafting: true,
        isEligibleForFinalApproval: true,
        isEligibleForExport: true,
        isEligibleForPublishing: false, // Permanently fail-closed pending W61
      };
    case FreshnessState.AGING:
      return {
        statusLabel: 'Product facts aging',
        warningMessage:
          'Stock facts are aging. Permitted for drafting; synchronous recheck required before export.',
        freshnessState: state,
        revalidationOutcome: outcome,
        sourceAvailability,
        isUsableForDrafting: true,
        isEligibleForFinalApproval: false,
        isEligibleForExport: false,
        isEligibleForPublishing: false,
      };
    case FreshnessState.STALE:
      return {
        statusLabel: 'Product facts stale',
        warningMessage:
          'Commercial pricing or campaign facts are stale. Recheck required before approval or export.',
        freshnessState: state,
        revalidationOutcome: outcome,
        sourceAvailability,
        isUsableForDrafting: true,
        isEligibleForFinalApproval: false,
        isEligibleForExport: false,
        isEligibleForPublishing: false,
      };
    case FreshnessState.INVALID:
    default:
      return {
        statusLabel: 'Product facts invalid',
        warningMessage:
          'Product facts have exceeded maximum hard expiration or the SKU has been discontinued.',
        freshnessState: FreshnessState.INVALID,
        revalidationOutcome: outcome,
        sourceAvailability,
        isUsableForDrafting: false,
        isEligibleForFinalApproval: false,
        isEligibleForExport: false,
        isEligibleForPublishing: false,
      };
  }
}
