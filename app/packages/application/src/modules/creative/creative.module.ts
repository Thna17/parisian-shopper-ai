import { Module } from '@nestjs/common';
import { AppConfigService } from '@parisian-shopper/config';

import { ASSET_STORAGE, type AssetStoragePort } from './application/asset-storage.port.js';
import { CREATIVE_PROVIDER, type CreativeProvider } from './application/creative-provider.port.js';
import { HERO_COMPOSITOR, type HeroCompositor } from './application/hero-compositor.port.js';
import { DiskAssetStorageAdapter } from './infrastructure/disk-asset-storage.adapter.js';
import { FakeCreativeProvider } from './infrastructure/fake-creative-provider.js';
import { SharpHeroCompositor } from './infrastructure/sharp-hero-compositor.adapter.js';

import {
  DETERMINISTIC_VISUAL_VALIDATOR,
  DeterministicVisualValidator,
} from './domain/services/deterministic-visual-validator.js';
import {
  VISUAL_SAFETY_SCANNER,
  VisualSafetyScanner,
} from './domain/services/visual-safety-scanner.js';
import { GenerateCreativeUseCase } from './application/generate-creative.use-case.js';
import { ValidateCreativeUseCase } from './application/validate-creative.use-case.js';
import { ApproveCreativeUseCase } from './application/approve-creative.use-case.js';

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
    {
      provide: DETERMINISTIC_VISUAL_VALIDATOR,
      useFactory: (): DeterministicVisualValidator => {
        return new DeterministicVisualValidator();
      },
    },
    {
      provide: VISUAL_SAFETY_SCANNER,
      useFactory: (): VisualSafetyScanner => {
        return new VisualSafetyScanner();
      },
    },
    DeterministicVisualValidator,
    VisualSafetyScanner,
    GenerateCreativeUseCase,
    ValidateCreativeUseCase,
    ApproveCreativeUseCase,
  ],
  exports: [
    CREATIVE_PROVIDER,
    ASSET_STORAGE,
    HERO_COMPOSITOR,
    DETERMINISTIC_VISUAL_VALIDATOR,
    VISUAL_SAFETY_SCANNER,
    DeterministicVisualValidator,
    VisualSafetyScanner,
    GenerateCreativeUseCase,
    ValidateCreativeUseCase,
    ApproveCreativeUseCase,
  ],
})
export class CreativeModule {}

