/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, jest } from '@jest/globals';
import {
  type CreativeBrief,
  type GeneratedBackgroundAsset,
  BudgetExceededError,
  CircuitBreakerService,
  FakeCreativeProvider,
  type ReserveBudgetUseCase,
  type SettleReservationUseCase,
  type CancelReservationUseCase,
  type UsageReservationRecord,
} from '@parisian-shopper/application';

import { BudgetAwareCreativeProvider } from '../openai/budget-aware-creative-provider.js';
import type { OpenAiCreativeProvider } from '../openai/openai-creative-provider.js';

describe('BudgetAwareCreativeProvider', () => {
  const dummyBrief: CreativeBrief = {
    creativeJobId: 'cjob-001',
    contentVersionId: 'cver-001',
    briefText: 'Luxury perfume visual backdrop in Paris',
    stylePrompt: 'Haussmann architecture with golden hour lighting',
    targetWidth: 1024,
    targetHeight: 1024,
    creativeProfile: 'luxury_editorial',
    aspectRatio: '1:1',
  };

  const sampleSuccessBackground: GeneratedBackgroundAsset = {
    imageBuffer: Buffer.from('fake-bg-image-bytes'),
    mimeType: 'image/png',
    width: 1024,
    height: 1024,
    providerId: 'openai',
    model: 'dall-e-3',
    latencyMs: 120,
  };

  const sampleReservation: UsageReservationRecord = {
    id: 'res-img-001',
    idempotencyKey: 'idem-2',
    budgetPolicyVersionId: 'pol-001',
    userId: 'user-001',
    tenantId: 'tenant-001',
    providerId: 'openai',
    modelId: 'dall-e-3',
    estimatedCost: 0.04,
    currency: 'USD',
    state: 'RESERVED',
    expiresAt: new Date(Date.now() + 300_000),
    version: 1,
    createdAt: new Date(),
  };

  it('successfully executes live OpenAI creative dispatch and settles reservation when budget has headroom', async () => {
    const mockLiveProvider = {
      providerId: 'openai',
      generateBackground: jest
        .fn<OpenAiCreativeProvider['generateBackground']>()
        .mockResolvedValueOnce(sampleSuccessBackground),
    } as unknown as OpenAiCreativeProvider;

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

    const provider = new BudgetAwareCreativeProvider(
      mockLiveProvider,
      new FakeCreativeProvider({ allowFakeInProduction: true }),
      mockReserveUseCase,
      circuitBreaker,
      mockSettleUseCase,
    );

    const result = await provider.generateBackground(dummyBrief);

    expect(result.providerId).toBe('openai');
    expect(mockReserveUseCase.execute).toHaveBeenCalledTimes(1);
    expect(mockLiveProvider.generateBackground).toHaveBeenCalledTimes(1);
    expect(mockSettleUseCase.execute).toHaveBeenCalledTimes(1);
  });

  it('fails closed and falls back to deterministic generator when spend exceeds monthly cap ($20.00 USD)', async () => {
    const mockLiveProvider = {
      providerId: 'openai',
      generateBackground: jest.fn<OpenAiCreativeProvider['generateBackground']>(),
    } as unknown as OpenAiCreativeProvider;

    const mockReserveUseCase = {
      execute: jest
        .fn<ReserveBudgetUseCase['execute']>()
        .mockRejectedValueOnce(
          new BudgetExceededError(
            'Monthly budget ceiling exceeded: available headroom $0.0000 USD is less than required $0.0400 USD.',
          ),
        ),
    } as unknown as ReserveBudgetUseCase;

    const fallbackProvider = new FakeCreativeProvider({ allowFakeInProduction: true });
    const fallbackSpy = jest.spyOn(fallbackProvider, 'generateBackground');

    const provider = new BudgetAwareCreativeProvider(
      mockLiveProvider,
      fallbackProvider,
      mockReserveUseCase,
    );

    const result = await provider.generateBackground(dummyBrief);

    // Live provider must NEVER be called when budget is exceeded
    expect(mockLiveProvider.generateBackground).not.toHaveBeenCalled();
    // Deterministic fallback was called and returned valid output without throwing
    expect(fallbackSpy).toHaveBeenCalledTimes(1);
    expect(result.providerId).toBe('fake-creative-provider');
    expect(result.imageBuffer).toBeDefined();
  });

  it('fails closed and falls back to deterministic generator when circuit breaker is OPEN', async () => {
    const mockLiveProvider = {
      providerId: 'openai',
      generateBackground: jest.fn<OpenAiCreativeProvider['generateBackground']>(),
    } as unknown as OpenAiCreativeProvider;

    const circuitBreaker = new CircuitBreakerService({
      failureThreshold: 1,
      windowDurationMs: 60_000,
      probeIntervalMs: 60_000,
    });
    circuitBreaker.recordFailure('openai', 'IMAGE');

    const fallbackProvider = new FakeCreativeProvider({ allowFakeInProduction: true });
    const fallbackSpy = jest.spyOn(fallbackProvider, 'generateBackground');

    const provider = new BudgetAwareCreativeProvider(
      mockLiveProvider,
      fallbackProvider,
      undefined,
      circuitBreaker,
    );

    const result = await provider.generateBackground(dummyBrief);

    expect(mockLiveProvider.generateBackground).not.toHaveBeenCalled();
    expect(fallbackSpy).toHaveBeenCalledTimes(1);
    expect(result.providerId).toBe('fake-creative-provider');
  });

  it('retains the reservation and surfaces an uncertain dispatch failure without fallback', async () => {
    const mockLiveProvider = {
      providerId: 'openai',
      generateBackground: jest
        .fn<OpenAiCreativeProvider['generateBackground']>()
        .mockRejectedValueOnce(new Error('OpenAI DALL-E rate limit')),
    } as unknown as OpenAiCreativeProvider;

    const mockReserveUseCase = {
      execute: jest.fn<ReserveBudgetUseCase['execute']>().mockResolvedValueOnce({
        reservation: {
          ...sampleReservation,
          id: 'res-fail-img-001',
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

    const fallbackProvider = new FakeCreativeProvider({ allowFakeInProduction: true });
    const fallbackSpy = jest.spyOn(fallbackProvider, 'generateBackground');

    const provider = new BudgetAwareCreativeProvider(
      mockLiveProvider,
      fallbackProvider,
      mockReserveUseCase,
      circuitBreaker,
      undefined,
      mockCancelUseCase,
    );

    await expect(provider.generateBackground(dummyBrief)).rejects.toThrow(
      'OpenAI DALL-E rate limit',
    );

    expect(mockLiveProvider.generateBackground).toHaveBeenCalledTimes(1);
    expect(circuitSpy).toHaveBeenCalledWith('openai', 'IMAGE');
    expect(mockCancelUseCase.execute).not.toHaveBeenCalled();
    expect(fallbackSpy).not.toHaveBeenCalled();
  });
});
