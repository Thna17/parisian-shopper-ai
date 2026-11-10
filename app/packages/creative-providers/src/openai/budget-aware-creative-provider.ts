import { randomUUID } from 'node:crypto';
import {
  type CreativeBrief,
  type CreativeProvider,
  type CreativeProviderOptions,
  type GeneratedBackgroundAsset,
  FakeCreativeProvider,
  type ReserveBudgetUseCase,
  type CircuitBreakerService,
  type SettleReservationUseCase,
  type CancelReservationUseCase,
} from '@parisian-shopper/application';
import { type ApplicationLogger } from '@parisian-shopper/common';
import { OpenAiCreativeProvider } from './openai-creative-provider.js';

export class BudgetAwareCreativeProvider
  extends OpenAiCreativeProvider
  implements CreativeProvider
{
  public override readonly providerId = 'openai-dalle-3' as const;

  public constructor(
    private readonly liveProvider: OpenAiCreativeProvider,
    private readonly fallbackProvider: FakeCreativeProvider = new FakeCreativeProvider({
      allowFakeInProduction: true,
    }),
    private readonly reserveBudgetUseCase?: ReserveBudgetUseCase,
    private readonly circuitBreakerService?: CircuitBreakerService,
    private readonly settleReservationUseCase?: SettleReservationUseCase,
    _cancelReservationUseCase?: CancelReservationUseCase,
    private readonly customLogger?: ApplicationLogger,
  ) {
    super({
      apiKey: 'budget-aware-virtual-key',
      ...(customLogger ? { logger: customLogger } : {}),
    });
  }

  public override async generateBackground(
    brief: CreativeBrief,
    options?: CreativeProviderOptions,
  ): Promise<GeneratedBackgroundAsset> {
    // 1. Circuit Breaker Pre-flight
    if (this.circuitBreakerService) {
      try {
        this.circuitBreakerService.assertHealthy('openai', 'IMAGE');
      } catch (cbErr) {
        this.customLogger?.warn?.(
          `Circuit breaker OPEN for openai IMAGE, failing closed on live paid dispatch and falling back to deterministic compositor: ${cbErr instanceof Error ? cbErr.message : String(cbErr)}`,
          { provider: 'openai', modality: 'IMAGE' },
        );
        return this.fallbackProvider.generateBackground(brief, options);
      }
    }

    // 2. W50 Budget Reservation Interceptor
    let reservationId: string | null = null;
    if (this.reserveBudgetUseCase) {
      try {
        const res = await this.reserveBudgetUseCase.execute({
          idempotencyKey: randomUUID(),
          providerId: 'openai',
          modelId: 'dall-e-3',
          estimatedCost: 0.04, // DALL-E 3 standard image ~$0.040 USD
          currency: 'USD',
          creativeJobId: brief.creativeJobId,
        });
        reservationId = res.reservation.id;
      } catch (budgetErr: unknown) {
        // Spend exceeds monthly cap ($20.00 USD), daily cap, or hard cap policy.
        // Fail closed immediately on live paid dispatch and fallback to local deterministic generator!
        this.customLogger?.warn?.(
          `Budget reservation rejected for openai IMAGE (${budgetErr instanceof Error ? budgetErr.message : String(budgetErr)}). Failing closed on live paid dispatch and falling back to deterministic Sharp hybrid compositor without interrupting staff workflows.`,
          { provider: 'openai', modality: 'IMAGE', error: String(budgetErr) },
        );
        return this.fallbackProvider.generateBackground(brief, options);
      }
    }

    // 3. Live Paid Dispatch to OpenAI
    try {
      const result = await this.liveProvider.generateBackground(brief, options);
      this.circuitBreakerService?.recordSuccess('openai', 'IMAGE');

      if (this.settleReservationUseCase && reservationId) {
        await this.settleReservationUseCase
          .execute({
            reservationId,
            attemptId: randomUUID(),
            settlementKey: randomUUID(),
            outcome: 'SUCCEEDED',
            actualCost: 0.04,
            imageCount: 1,
            resolutionTier: '1024x1024',
          })
          .catch((err: unknown) => {
            this.customLogger?.warn?.(
              `Failed to settle image reservation ${reservationId}: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
      }

      return result;
    } catch (dispatchErr: unknown) {
      this.circuitBreakerService?.recordFailure('openai', 'IMAGE');

      // A failed response can follow a successful billable dispatch. Do not
      // cancel the reservation or pretend a fallback is the requested image.
      this.customLogger?.warn?.(
        `Live OpenAI image dispatch failed; its outcome may be uncertain. Reservation was not cancelled.`,
      );
      throw dispatchErr;
    }
  }
}
