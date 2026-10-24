import { Global, Module } from '@nestjs/common';
import {
  AI_EXECUTION_POLICY,
  AI_TEXT_PROVIDER,
  CONTENT_METRICS,
  ContentGenerationError,
  FakeAITextProvider,
  NoopContentMetrics,
  type AITextProvider,
} from '@parisian-shopper/application';
import { AppConfigService, FeatureFlag, FeatureFlagService } from '@parisian-shopper/config';

import { CodexCliTextProvider } from './codex-cli-text-provider.js';
import { OpenAITextProvider } from './openai-text-provider.js';

@Global()
@Module({
  providers: [
    {
      provide: AI_TEXT_PROVIDER,
      inject: [AppConfigService, FeatureFlagService],
      useFactory: (config: AppConfigService, flags: FeatureFlagService): AITextProvider => {
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
        if (apiKey === undefined)
          throw new Error('OPENAI_API_KEY is required for the OpenAI provider');
        if (model === undefined)
          throw new Error('OPENAI_MODEL is required for the OpenAI provider');
        return new OpenAITextProvider({
          apiKey,
          model,
          timeoutMs: config.ai.requestTimeoutMs,
          ...(config.ai.baseUrl === undefined ? {} : { baseUrl: config.ai.baseUrl }),
        });
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
  exports: [AI_TEXT_PROVIDER, AI_EXECUTION_POLICY, CONTENT_METRICS],
})
export class AIProvidersModule {}
