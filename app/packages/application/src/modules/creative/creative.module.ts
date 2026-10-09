import { Module } from '@nestjs/common';
import { AppConfigService } from '@parisian-shopper/config';

import { ASSET_STORAGE, type AssetStoragePort } from './application/asset-storage.port.js';
import { CREATIVE_PROVIDER, type CreativeProvider } from './application/creative-provider.port.js';
import { HERO_COMPOSITOR, type HeroCompositor } from './application/hero-compositor.port.js';
import { DiskAssetStorageAdapter } from './infrastructure/disk-asset-storage.adapter.js';
import { FakeCreativeProvider } from './infrastructure/fake-creative-provider.js';
import { SharpHeroCompositor } from './infrastructure/sharp-hero-compositor.adapter.js';

@Module({
  providers: [
    {
      provide: CREATIVE_PROVIDER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): CreativeProvider => {
        return new FakeCreativeProvider({
          isProduction: config.nodeEnvironment === 'production',
          allowFakeInProduction: config.creative.allowFakeInProduction,
        });
      },
    },
    {
      provide: ASSET_STORAGE,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): AssetStoragePort => {
        return new DiskAssetStorageAdapter({
          storageRoot: config.creative.storageRoot,
          maxBytes: config.creative.maxBytes,
        });
      },
    },
    {
      provide: HERO_COMPOSITOR,
      useFactory: (): HeroCompositor => {
        return new SharpHeroCompositor();
      },
    },
  ],
  exports: [CREATIVE_PROVIDER, ASSET_STORAGE, HERO_COMPOSITOR],
})
export class CreativeModule {}
