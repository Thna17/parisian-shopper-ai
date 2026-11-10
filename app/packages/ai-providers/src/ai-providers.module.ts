import { Global, Module } from '@nestjs/common';
import {
  AI_EXECUTION_POLICY,
  AI_TEXT_PROVIDER,
  POST_CAPTION_PROVIDER,
  CancelReservationUseCase,
  CircuitBreakerService,
  CONTENT_METRICS,
  ContentGenerationError,
  FakeAITextProvider,
  NoopContentMetrics,
  ReserveBudgetUseCase,
  SettleReservationUseCase,
  type AITextProvider,
} from '@parisian-shopper/application';
import { APPLICATION_LOGGER, type ApplicationLogger } from '@parisian-shopper/common';
import { AppConfigService, FeatureFlag, FeatureFlagService } from '@parisian-shopper/config';

import { BudgetAwareTextProvider } from './budget-aware-text-provider.js';
import { CodexCliTextProvider } from './codex-cli-text-provider.js';
import { OpenAITextProvider } from './openai-text-provider.js';

@Global()
@Module({
  providers: [
    {
      provide: POST_CAPTION_PROVIDER,
      inject: [AppConfigService, FeatureFlagService],
      useFactory: (config: AppConfigService, flags: FeatureFlagService): AITextProvider => {
        const unavailable = (providerName: string): AITextProvider => ({
          providerName,
          model: providerName,
          generate: () =>
            Promise.reject(
              new Error('Configure and enable a text provider before generating captions.'),
            ),
        });
        if (!flags.isEnabled(FeatureFlag.AI_TEXT_GENERATION)) return unavailable('disabled');
        if (config.ai.provider === 'fake') return new FakeAITextProvider();
        if (config.ai.provider === 'codex_cli')
          return new CodexCliTextProvider({
            timeoutMs: config.codexCli.textTimeoutMs,
            allowDevelopmentFallback: false,
          });
        if (!config.ai.openaiApiKey || !config.ai.openaiModel) return unavailable('unconfigured');
        return new OpenAITextProvider({
          apiKey: config.ai.openaiApiKey,
          model: config.ai.openaiModel,
          timeoutMs: config.ai.requestTimeoutMs,
          ...(config.ai.baseUrl ? { baseUrl: config.ai.baseUrl } : {}),
        });
      },
    },
    {
      provide: AI_TEXT_PROVIDER,
      inject: [
        AppConfigService,
        FeatureFlagService,
        { token: APPLICATION_LOGGER, optional: true },
        { token: ReserveBudgetUseCase, optional: true },
        { token: CircuitBreakerService, optional: true },
        { token: SettleReservationUseCase, optional: true },
        { token: CancelReservationUseCase, optional: true },
      ],
      useFactory: (
        config: AppConfigService,
        flags: FeatureFlagService,
        logger?: ApplicationLogger,
        reserveBudgetUseCase?: ReserveBudgetUseCase,
        circuitBreaker?: CircuitBreakerService,
        settleReservationUseCase?: SettleReservationUseCase,
        cancelReservationUseCase?: CancelReservationUseCase,
      ): AITextProvider => {
        if (!flags.isEnabled(FeatureFlag.AI_TEXT_GENERATION)) {
          return {
            providerName: 'disabled',
            model: 'disabled',
            generate: () =>
              Promise.reject(
                new ContentGenerationError({
                  code: 'AI_DISABLED',
                  publicMessage: 'AI text generation is disabled.',
                }),
              ),
          };
        }
        if (config.ai.provider === 'fake') return new FakeAITextProvider();
        if (config.ai.provider === 'codex_cli') {
          return new CodexCliTextProvider({
            timeoutMs: config.codexCli.textTimeoutMs,
          });
        }
        const apiKey = config.ai.openaiApiKey;
        const model = config.ai.openaiModel;
        if (!apiKey || !model)
          return {
            providerName: 'unconfigured',
            model: 'unconfigured',
            generate: () =>
              Promise.reject(
                new Error(
                  'OPENAI_API_KEY and OPENAI_MODEL are required. Ask an administrator to configure the text provider.',
                ),
              ),
          };

        const liveProvider = new OpenAITextProvider({
          apiKey,
          model,
          timeoutMs: config.ai.requestTimeoutMs,
          ...(config.ai.baseUrl === undefined ? {} : { baseUrl: config.ai.baseUrl }),
        });

        return new BudgetAwareTextProvider(
          liveProvider,
          new FakeAITextProvider(),
          reserveBudgetUseCase,
          circuitBreaker,
          settleReservationUseCase,
          cancelReservationUseCase,
          logger,
        );
      },
    },
    {
      provide: AI_EXECUTION_POLICY,
      inject: [AppConfigService],
      useFactory: (
        config: AppConfigService,
      ): { timeoutMs: number; attemptStaleAfterMs: number } => ({
        timeoutMs: config.ai.requestTimeoutMs,
        attemptStaleAfterMs: config.ai.attemptStaleAfterMs,
      }),
    },
    { provide: CONTENT_METRICS, useClass: NoopContentMetrics },
  ],
  exports: [POST_CAPTION_PROVIDER, AI_TEXT_PROVIDER, AI_EXECUTION_POLICY, CONTENT_METRICS],
})
export class AIProvidersModule {}
