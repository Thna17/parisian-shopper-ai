import { Global, Module } from '@nestjs/common';
import {
  CREATIVE_PROVIDER,
  CREATIVE_VIDEO_PROVIDER,
  type CreativeProvider,
  type CreativeVideoProvider,
  FakeCreativeProvider,
  HiggsfieldProviderError,
} from '@parisian-shopper/application';
import {
  APPLICATION_LOGGER,
  ApplicationError,
  type ApplicationLogger,
} from '@parisian-shopper/common';
import { AppConfigService, FeatureFlag, FeatureFlagService } from '@parisian-shopper/config';

import { CodexCliCreativeProvider } from './codex-cli/codex-cli-creative-provider.js';
import { OfficialHiggsfieldSdkClient } from './higgsfield-sdk-client.js';
import { HiggsfieldVideoProvider } from './higgsfield-video-provider.js';
import { OpenAiCreativeProvider } from './openai/openai-creative-provider.js';

class DisabledCreativeVideoProvider implements CreativeVideoProvider {
  public readonly providerId = 'disabled';

  public generateVideo(): Promise<never> {
    return Promise.reject(
      new HiggsfieldProviderError({
        code: 'HIGGSFIELD_PROVIDER_DISABLED',
        publicMessage: 'Higgsfield video generation is disabled.',
        retryClassification: 'PERMANENT_UNTIL_CONFIGURATION_CHANGE',
      }),
    );
  }
}

class DisabledCreativeProvider implements CreativeProvider {
  public readonly providerId = 'disabled';

  public generateBackground(): Promise<never> {
    return Promise.reject(
      new ApplicationError({
        code: 'AI_DISABLED',
        publicMessage: 'Creative image generation is disabled by feature flag.',
      }),
    );
  }
}

@Global()
@Module({
  providers: [
    {
      provide: CREATIVE_PROVIDER,
      inject: [AppConfigService, FeatureFlagService, APPLICATION_LOGGER],
      useFactory: (
        config: AppConfigService,
        flags: FeatureFlagService,
        logger: ApplicationLogger,
      ): CreativeProvider => {
        if (
          !flags.isEnabled(FeatureFlag.CREATIVE_GENERATION) ||
          !flags.isEnabled(FeatureFlag.AI_IMAGE_GENERATION)
        ) {
          return new DisabledCreativeProvider();
        }

        const provider = config.creative.provider;
        if (provider === 'fake') {
          return new FakeCreativeProvider({
            isProduction: config.nodeEnvironment === 'production',
            allowFakeInProduction: config.creative.allowFakeInProduction,
          });
        }

        if (provider === 'openai') {
          const apiKey = config.ai.openaiApiKey;
          if (!apiKey) {
            throw new Error('OPENAI_API_KEY is required when CREATIVE_PROVIDER=openai');
          }
          return new OpenAiCreativeProvider({
            apiKey,
            logger,
          });
        }

        if (provider === 'codex_cli') {
          if (config.nodeEnvironment === 'production') {
            throw new Error('Codex CLI creative provider is prohibited when NODE_ENV=production');
          }
          return new CodexCliCreativeProvider({
            timeoutMs: config.codexCli.imageTimeoutMs,
            maxConcurrency: config.codexCli.maxConcurrency,
            maxBytes: config.creative.maxBytes,
            logger,
          });
        }

        throw new Error(`Unsupported creative provider: ${String(provider)}`);
      },
    },
    {
      provide: CREATIVE_VIDEO_PROVIDER,
      inject: [AppConfigService, FeatureFlagService, APPLICATION_LOGGER],
      useFactory: (
        config: AppConfigService,
        flags: FeatureFlagService,
        logger: ApplicationLogger,
      ): CreativeVideoProvider => {
        if (
          !flags.isEnabled(FeatureFlag.CREATIVE_GENERATION) ||
          !flags.isEnabled(FeatureFlag.HIGGSFIELD_PROVIDER)
        ) {
          return new DisabledCreativeVideoProvider();
        }

        const credentials = config.higgsfield.credentials;
        if (credentials === undefined) {
          throw new Error('HF_CREDENTIALS is required for the enabled Higgsfield provider');
        }

        return new HiggsfieldVideoProvider(
          new OfficialHiggsfieldSdkClient({
            credentials,
            maxWaitMs: config.higgsfield.videoMaxWaitMs,
          }),
          {
            model: config.higgsfield.videoModel,
            maxWaitMs: config.higgsfield.videoMaxWaitMs,
            defaultGenerateAudio: config.higgsfield.generateAudio,
          },
          logger,
        );
      },
    },
  ],
  exports: [CREATIVE_PROVIDER, CREATIVE_VIDEO_PROVIDER],
})
export class CreativeProvidersModule {}
