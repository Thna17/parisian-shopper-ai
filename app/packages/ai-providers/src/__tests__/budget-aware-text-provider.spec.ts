/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, jest } from '@jest/globals';
import {
  type AIContext,
  type AITextGenerationResult,
  BudgetExceededError,
  CircuitBreakerService,
  FakeAITextProvider,
  PROMPT_CONTEXT_VERSION,
  type ReserveBudgetUseCase,
  type SettleReservationUseCase,
  type CancelReservationUseCase,
  type UsageReservationRecord,
} from '@parisian-shopper/application';

import { BudgetAwareTextProvider } from '../budget-aware-text-provider.js';
import type { OpenAITextProvider } from '../openai-text-provider.js';

describe('BudgetAwareTextProvider', () => {
  const dummyContext: AIContext = {
    version: PROMPT_CONTEXT_VERSION,
    systemRules: { trust: 'TRUSTED', data: [] },
    brandRules: {
      trust: 'TRUSTED',
      data: {
        language: [],
        tone: [],
        cta: [],
        promotion: [],
        perfumeClaims: [],
        platforms: {
          FACEBOOK: [],
          INSTAGRAM: [],
          TELEGRAM: [],
          GENERIC: [],
        },
        visualGuidance: [],
      },
    },
    contentStrategy: {
      trust: 'TRUSTED',
      data: {
        contentType: 'PRODUCT_SPOTLIGHT',
        objective: 'Brand awareness',
        instructions: [],
        constraints: [],
      },
    },
    productFacts: {
      trust: 'UNTRUSTED_DATA',
      data: {
        brand: 'Maison Imaginaire',
        product_name: 'Moonlit River',
        category: 'fragrance',
        sku: 'FIC-PERF-001',
        price: '38.00',
        currency: 'USD',
        stock_status: 'in_stock',
      },
    },
    request: {
      contentJobId: 'job-budget-001',
      language: 'EN',
      platform: 'INSTAGRAM',
    },
  };

  const sampleSuccessResult: AITextGenerationResult = {
    provider: 'openai',
    model: 'gpt-4o',
    providerRequestId: 'resp-openai-123',
    output: {
      headline: 'A Night by the Seine',
      khmer_caption: 'ក្លិនក្រអូបប្រណីតពីប៉ារីស',
      english_caption: 'Experience Parisian evening mist.',
      cta: 'Shop Now',
      hashtags: ['#ParisianShopper', '#Luxury'],
      creative_brief: 'Editorial feature',
      facts_used: [],
      warnings: [],
      missing_information: [],
    },
    usage: {
      inputTokens: 500,
      outputTokens: 200,
      totalTokens: 700,
    },
  };

  const sampleReservation: UsageReservationRecord = {
    id: 'res-text-001',
    idempotencyKey: 'idem-1',
    budgetPolicyVersionId: 'pol-001',
    userId: 'user-001',
    tenantId: 'tenant-001',
    providerId: 'openai',
    modelId: 'gpt-4o',
    estimatedCost: 0.03,
    currency: 'USD',
    state: 'RESERVED',
    expiresAt: new Date(Date.now() + 300_000),
    version: 1,
    createdAt: new Date(),
  };

  it('successfully executes live OpenAI dispatch and settles reservation when budget has headroom', async () => {
    const mockLiveProvider = {
      providerName: 'openai',
      model: 'gpt-4o',
      generate: jest
        .fn<OpenAITextProvider['generate']>()
        .mockResolvedValueOnce(sampleSuccessResult),
    } as unknown as OpenAITextProvider;

    const mockReserveUseCase = {
      execute: jest.fn<ReserveBudgetUseCase['execute']>().mockResolvedValueOnce({
        reservation: sampleReservation,
        quotaStatus: {} as never,
        event: {} as never,
      }),
    } as unknown as ReserveBudgetUseCase;

    const mockSettleUseCase = {
      execute: jest.fn<SettleReservationUseCase['execute']>().mockResolvedValueOnce({} as never),
    } as unknown as SettleReservationUseCase;

    const circuitBreaker = new CircuitBreakerService();

    const provider = new BudgetAwareTextProvider(
      mockLiveProvider,
      new FakeAITextProvider(),
      mockReserveUseCase,
      circuitBreaker,
      mockSettleUseCase,
    );

    const abortController = new AbortController();
    const result = await provider.generate(dummyContext, abortController.signal);

    expect(result.provider).toBe('openai');
    expect(result.output.headline).toBe('A Night by the Seine');
    expect(mockReserveUseCase.execute).toHaveBeenCalledTimes(1);
    expect(mockLiveProvider.generate).toHaveBeenCalledTimes(1);
    expect(mockSettleUseCase.execute).toHaveBeenCalledTimes(1);
  });

  it('fails closed and falls back to deterministic generator when spend exceeds monthly cap ($20.00 USD)', async () => {
    const mockLiveProvider = {
      providerName: 'openai',
      model: 'gpt-4o',
      generate: jest.fn<OpenAITextProvider['generate']>(),
    } as unknown as OpenAITextProvider;

    const mockReserveUseCase = {
      execute: jest
        .fn<ReserveBudgetUseCase['execute']>()
        .mockRejectedValueOnce(
          new BudgetExceededError(
            'Monthly budget ceiling exceeded: available headroom $0.0000 USD is less than required $0.0300 USD.',
          ),
        ),
    } as unknown as ReserveBudgetUseCase;

    const fallbackProvider = new FakeAITextProvider();
    const fallbackSpy = jest.spyOn(fallbackProvider, 'generate');

    const provider = new BudgetAwareTextProvider(
      mockLiveProvider,
      fallbackProvider,
      mockReserveUseCase,
    );

    const abortController = new AbortController();
    const result = await provider.generate(dummyContext, abortController.signal);

    // Live provider must NEVER be called when budget is exceeded
    expect(mockLiveProvider.generate).not.toHaveBeenCalled();
    // Deterministic fallback was called and returned valid output without throwing
    expect(fallbackSpy).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe('fake');
    expect(result.output).toBeDefined();
    expect(result.output.english_caption).toBeDefined();
  });

  it('fails closed and falls back to deterministic generator when circuit breaker is OPEN', async () => {
    const mockLiveProvider = {
      providerName: 'openai',
      model: 'gpt-4o',
      generate: jest.fn<OpenAITextProvider['generate']>(),
    } as unknown as OpenAITextProvider;

    const circuitBreaker = new CircuitBreakerService({
      failureThreshold: 1,
      windowDurationMs: 60_000,
      probeIntervalMs: 60_000,
    });
    // Trip circuit breaker
    circuitBreaker.recordFailure('openai', 'TEXT');

    const fallbackProvider = new FakeAITextProvider();
    const fallbackSpy = jest.spyOn(fallbackProvider, 'generate');

    const provider = new BudgetAwareTextProvider(
      mockLiveProvider,
      fallbackProvider,
      undefined,
      circuitBreaker,
    );

    const abortController = new AbortController();
    const result = await provider.generate(dummyContext, abortController.signal);

    expect(mockLiveProvider.generate).not.toHaveBeenCalled();
    expect(fallbackSpy).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe('fake');
  });

  it('cancels reservation, records circuit failure, and falls back to deterministic generator when live dispatch errors', async () => {
    const mockLiveProvider = {
      providerName: 'openai',
      model: 'gpt-4o',
      generate: jest
        .fn<OpenAITextProvider['generate']>()
        .mockRejectedValueOnce(new Error('OpenAI 503 Overloaded')),
    } as unknown as OpenAITextProvider;

    const mockReserveUseCase = {
      execute: jest.fn<ReserveBudgetUseCase['execute']>().mockResolvedValueOnce({
        reservation: {
          ...sampleReservation,
          id: 'res-fail-001',
        },
        quotaStatus: {} as never,
        event: {} as never,
      }),
    } as unknown as ReserveBudgetUseCase;

    const mockCancelUseCase = {
      execute: jest.fn<CancelReservationUseCase['execute']>().mockResolvedValueOnce({} as never),
    } as unknown as CancelReservationUseCase;

    const circuitBreaker = new CircuitBreakerService();
    const circuitSpy = jest.spyOn(circuitBreaker, 'recordFailure');

    const fallbackProvider = new FakeAITextProvider();
    const fallbackSpy = jest.spyOn(fallbackProvider, 'generate');

    const provider = new BudgetAwareTextProvider(
      mockLiveProvider,
      fallbackProvider,
      mockReserveUseCase,
      circuitBreaker,
      undefined,
      mockCancelUseCase,
    );

    const abortController = new AbortController();
    const result = await provider.generate(dummyContext, abortController.signal);

    expect(mockLiveProvider.generate).toHaveBeenCalledTimes(1);
    expect(circuitSpy).toHaveBeenCalledWith('openai', 'TEXT');
    expect(mockCancelUseCase.execute).toHaveBeenCalledTimes(1);
    expect(fallbackSpy).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe('fake');
  });
});
