import { randomUUID } from 'node:crypto';
import {
  type AIContext,
  type AITextGenerationResult,
  type AITextProvider,
  FakeAITextProvider,
  type ReserveBudgetUseCase,
  type CircuitBreakerService,
  type SettleReservationUseCase,
  type CancelReservationUseCase,
} from '@parisian-shopper/application';
import { type ApplicationLogger } from '@parisian-shopper/common';
import { OpenAITextProvider } from './openai-text-provider.js';

export class BudgetAwareTextProvider extends OpenAITextProvider implements AITextProvider {
  public override readonly providerName = 'openai' as const;
  public override readonly model: string;

  public constructor(
    private readonly liveProvider: OpenAITextProvider,
    private readonly fallbackProvider: FakeAITextProvider = new FakeAITextProvider(),
    private readonly reserveBudgetUseCase?: ReserveBudgetUseCase,
    private readonly circuitBreaker?: CircuitBreakerService,
    private readonly settleReservationUseCase?: SettleReservationUseCase,
    private readonly cancelReservationUseCase?: CancelReservationUseCase,
    private readonly budgetLogger?: ApplicationLogger,
  ) {
    super({
      apiKey: 'budget-aware-virtual-key',
      model: liveProvider.model,
      timeoutMs: 60_000,
    });
    this.providerName = this.liveProvider.providerName;
    this.model = this.liveProvider.model;
  }

  public override async generate(
    context: AIContext,
    signal: AbortSignal,
  ): Promise<AITextGenerationResult> {
    // 1. Circuit Breaker Pre-flight
    if (this.circuitBreaker) {
      try {
        this.circuitBreaker.assertHealthy('openai', 'TEXT');
      } catch (cbErr) {
        this.budgetLogger?.warn?.(
          `Circuit breaker OPEN for openai TEXT, failing closed on live paid dispatch and falling back to deterministic generator: ${cbErr instanceof Error ? cbErr.message : String(cbErr)}`,
          { provider: 'openai', modality: 'TEXT' },
        );
        return this.fallbackProvider.generate(context, signal);
      }
    }

    // 2. W50 Budget Reservation Interceptor
    let reservationId: string | null = null;
    if (this.reserveBudgetUseCase) {
      try {
        const res = await this.reserveBudgetUseCase.execute({
          idempotencyKey: randomUUID(),
          providerId: 'openai',
          modelId: this.liveProvider.model,
          estimatedCost: 0.03, // $0.030 USD
          currency: 'USD',
          contentJobId: context.request.contentJobId,
        });
        reservationId = res.reservation.id;
      } catch (budgetErr) {
        // Spend exceeds monthly cap ($20.00 USD), daily cap, or hard cap policy.
        // Fail closed immediately on live paid dispatch and fallback to deterministic generator!
        this.budgetLogger?.warn?.(
          `Budget reservation rejected for openai TEXT (${budgetErr instanceof Error ? budgetErr.message : String(budgetErr)}). Failing closed on live paid dispatch and falling back to deterministic FakeAITextProvider without interrupting staff workflows.`,
          { provider: 'openai', modality: 'TEXT', error: String(budgetErr) },
        );
        return this.fallbackProvider.generate(context, signal);
      }
    }

    // 3. Live Paid Dispatch to OpenAI
    try {
      const result = await this.liveProvider.generate(context, signal);
      this.circuitBreaker?.recordSuccess('openai', 'TEXT');

      if (this.settleReservationUseCase && reservationId) {
        const tokens = result.usage?.totalTokens ?? 1500;
        const actualCost = Math.max(0.001, (tokens / 1000) * 0.005);
        await this.settleReservationUseCase
          .execute({
            reservationId,
            attemptId: randomUUID(),
            settlementKey: randomUUID(),
            outcome: 'SUCCEEDED',
            actualCost,
            inputTokens: result.usage?.inputTokens,
            outputTokens: result.usage?.outputTokens,
            providerRequestId: result.providerRequestId,
          })
          .catch((err: unknown) => {
            this.budgetLogger?.warn?.(
              `Failed to settle text reservation ${reservationId}: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
      }

      return result;
    } catch (dispatchErr) {
      this.circuitBreaker?.recordFailure('openai', 'TEXT');

      if (this.cancelReservationUseCase && reservationId) {
        await this.cancelReservationUseCase
          .execute({
            reservationId,
            reason: `OpenAI live dispatch failed: ${dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr)}`,
            actorUserId: '00000000-0000-0000-0000-000000000000',
          })
          .catch(() => undefined);
      }

      this.budgetLogger?.warn?.(
        `Live OpenAI text dispatch failed: ${dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr)}. Falling back to deterministic FakeAITextProvider.`,
      );
      return this.fallbackProvider.generate(context, signal);
    }
  }
}
