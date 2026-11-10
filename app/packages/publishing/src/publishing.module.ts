import { Module } from '@nestjs/common';
import { PUBLISHING_GATEWAY } from '@parisian-shopper/application';
import { AppConfigService } from '@parisian-shopper/config';
import { APPLICATION_LOGGER, type ApplicationLogger } from '@parisian-shopper/common';

import { MetaPublishingGateway } from './meta-publishing.gateway.js';

@Module({
  providers: [
    {
      provide: PUBLISHING_GATEWAY,
      inject: [AppConfigService, APPLICATION_LOGGER],
      useFactory: (
        config: AppConfigService,
        logger: ApplicationLogger,
      ): MetaPublishingGateway => {
        return new MetaPublishingGateway({
          graphApiVersion: config.meta.graphApiVersion,
          defaultAccessToken: config.meta.accessToken,
          defaultFacebookPageId: config.meta.facebookPageId,
          defaultInstagramAccountId: config.meta.instagramAccountId,
          fourEyesSecret: config.meta.fourEyesSecret,
          logger,
        });
      },
    },
    MetaPublishingGateway,
  ],
  exports: [PUBLISHING_GATEWAY, MetaPublishingGateway],
})
export class MetaPublishingModule {}
