import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppConfigService } from './app-config.service.js';
import { validateEnvironment } from './environment.schema.js';
import { FeatureFlagService } from './feature-flags.js';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      expandVariables: false,
      isGlobal: true,
      validate: validateEnvironment,
    }),
  ],
  providers: [AppConfigService, FeatureFlagService],
  exports: [AppConfigService, FeatureFlagService],
})
export class AppConfigModule {}
