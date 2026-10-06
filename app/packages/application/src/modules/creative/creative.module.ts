import { Module } from '@nestjs/common';
import { AppConfigService } from '@parisian-shopper/config';

import { ASSET_STORAGE, type AssetStoragePort } from './application/asset-storage.port.js';
import { CREATIVE_PROVIDER, type CreativeProvider } from './application/creative-provider.port.js';
import { DiskAssetStorageAdapter } from './infrastructure/disk-asset-storage.adapter.js';
import { FakeCreativeProvider } from './infrastructure/fake-creative-provider.js';

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
  ],
  exports: [CREATIVE_PROVIDER, ASSET_STORAGE],
})
export class CreativeModule {}
