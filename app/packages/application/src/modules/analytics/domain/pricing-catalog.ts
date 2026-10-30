/**
 * Deterministic pricing catalog for AI providers and models.
 * Rates are expressed in USD.
 */
export interface ModelPricing {
  readonly inputTokenRatePerMillion: number;
  readonly outputTokenRatePerMillion: number;
  readonly flatRatePerCall?: number;
  readonly isZeroCost?: boolean;
}

const PRICING_CATALOG: Record<string, ModelPricing> = {
  // OpenAI Models
  'openai:gpt-4o': {
    inputTokenRatePerMillion: 2.5,
    outputTokenRatePerMillion: 10.0,
  },
  'openai:gpt-4o-mini': {
    inputTokenRatePerMillion: 0.15,
    outputTokenRatePerMillion: 0.6,
  },
  'openai:dall-e-3': {
    inputTokenRatePerMillion: 0,
    outputTokenRatePerMillion: 0,
    flatRatePerCall: 0.04,
  },

  // Local / CLI / Zero-cost engines
  'codex_cli:local': {
    inputTokenRatePerMillion: 0,
    outputTokenRatePerMillion: 0,
    isZeroCost: true,
  },
  'fake:fake-text': {
    inputTokenRatePerMillion: 0,
    outputTokenRatePerMillion: 0,
    isZeroCost: true,
  },
  'fake:fake-image': {
    inputTokenRatePerMillion: 0,
    outputTokenRatePerMillion: 0,
    isZeroCost: true,
  },
};

export class PricingCatalogService {
  /**
   * Calculates estimated cost based on provider, model, and token counts.
   * Returns exact USD amount rounded to 6 decimal places.
   */
  public static calculateCost(params: {
    provider: string;
    model: string;
    inputTokens?: number | null | undefined;
    outputTokens?: number | null | undefined;
  }): { cost: number; isZeroCost: boolean } {
    const key = `${params.provider.toLowerCase()}:${params.model.toLowerCase()}`;
    const pricing = PRICING_CATALOG[key] ?? {
      // Default fallback pricing for unknown cloud models
      inputTokenRatePerMillion: 2.5,
      outputTokenRatePerMillion: 10.0,
    };

    if (pricing.isZeroCost) {
      return { cost: 0, isZeroCost: true };
    }

    if (pricing.flatRatePerCall !== undefined && pricing.flatRatePerCall > 0) {
      return { cost: pricing.flatRatePerCall, isZeroCost: false };
    }

    const inputTokens = Math.max(0, params.inputTokens ?? 0);
    const outputTokens = Math.max(0, params.outputTokens ?? 0);

    const inputCost = (inputTokens / 1_000_000) * pricing.inputTokenRatePerMillion;
    const outputCost = (outputTokens / 1_000_000) * pricing.outputTokenRatePerMillion;

    // Use Decimal-level precision (micro-cents: 6 decimal places)
    const totalCost = Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
    return { cost: totalCost, isZeroCost: false };
  }

  /**
   * Estimates maximum reservation cost for a planned operation.
   * Content generation default: ~$0.05
   * Image/Creative background generation default: ~$0.10
   */
  public static estimateMaxReservationCost(
    operationType: 'CONTENT_COPY' | 'CREATIVE_IMAGE',
  ): number {
    if (operationType === 'CONTENT_COPY') {
      return 0.05;
    }
    return 0.1;
  }
}
