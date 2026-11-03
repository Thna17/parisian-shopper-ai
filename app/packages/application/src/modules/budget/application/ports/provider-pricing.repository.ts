import {
  type AiModality,
  type PricingApprovalStatus,
  type PricingUnit,
  type ProviderPricingVersionRecord,
} from '../../domain/budget.types.js';

export const PROVIDER_PRICING_REPOSITORY = Symbol('PROVIDER_PRICING_REPOSITORY');

export interface ProviderPricingVersionDraft {
  readonly id: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly capability: string;
  readonly modality: AiModality;
  readonly pricingUnit: PricingUnit;
  readonly inputTokenRate?: number | null | undefined;
  readonly outputTokenRate?: number | null | undefined;
  readonly imageRateByResolution?: Record<string, string | number> | null | undefined;
  readonly videoRateByDuration?: Record<string, string | number> | null | undefined;
  readonly subscriptionRules?: Record<string, unknown> | null | undefined;
  readonly currency?: string | undefined;
  readonly source: string;
  readonly pricingSourceUrl: string;
  readonly sourceRetrievedAt: Date;
  readonly effectiveFrom: Date;
  readonly effectiveTo?: Date | null | undefined;
  readonly approvalStatus?: PricingApprovalStatus | undefined;
  readonly approvedByUserId?: string | null | undefined;
}

export interface ProviderPricingRepository {
  findActivePricing(
    providerId: string,
    modelId: string,
    date?: Date,
  ): Promise<ProviderPricingVersionRecord | null>;

  createPricingVersion(draft: ProviderPricingVersionDraft): Promise<ProviderPricingVersionRecord>;

  listPricingVersions(providerId?: string): Promise<readonly ProviderPricingVersionRecord[]>;
}
