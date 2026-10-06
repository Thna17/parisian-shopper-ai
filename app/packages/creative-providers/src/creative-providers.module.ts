import { Global, Module } from '@nestjs/common';
import {
  CREATIVE_VIDEO_PROVIDER,
  type CreativeVideoProvider,
  HiggsfieldProviderError,
} from '@parisian-shopper/application';
import { APPLICATION_LOGGER, type ApplicationLogger } from '@parisian-shopper/common';
import { AppConfigService, FeatureFlag, FeatureFlagService } from '@parisian-shopper/config';

import { OfficialHiggsfieldSdkClient } from './higgsfield-sdk-client.js';
import { HiggsfieldVideoProvider } from './higgsfield-video-provider.js';

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

@Global()
@Module({
  providers: [
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
  exports: [CREATIVE_VIDEO_PROVIDER],
})
export class CreativeProvidersModule {}
