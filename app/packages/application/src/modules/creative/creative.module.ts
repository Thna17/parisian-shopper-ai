import { Module } from '@nestjs/common';
import { AppConfigService } from '@parisian-shopper/config';

import { ASSET_STORAGE, type AssetStoragePort } from './application/asset-storage.port.js';
import { HERO_COMPOSITOR, type HeroCompositor } from './application/hero-compositor.port.js';
import { POSTER_COMPOSITOR, type PosterCompositor } from './application/poster-compositor.port.js';
import { DiskAssetStorageAdapter } from './infrastructure/disk-asset-storage.adapter.js';
import { SharpHeroCompositor } from './infrastructure/sharp-hero-compositor.adapter.js';
import { SharpPosterCompositor } from './infrastructure/sharp-poster-compositor.adapter.js';

import {
  DETERMINISTIC_VISUAL_VALIDATOR,
  DeterministicVisualValidator,
} from './domain/services/deterministic-visual-validator.js';
import {
  VISUAL_SAFETY_SCANNER,
  VisualSafetyScanner,
} from './domain/services/visual-safety-scanner.js';
import {
  PRODUCT_ASSET_VALIDATOR,
  ProductAssetValidator,
} from './domain/services/product-asset-validator.js';
import {
  BACKGROUND_QUALITY_VALIDATOR,
  BackgroundQualityValidator,
} from './domain/services/background-quality-validator.js';
import { GenerateCreativeUseCase } from './application/generate-creative.use-case.js';
import { ValidateCreativeUseCase } from './application/validate-creative.use-case.js';
import { ApproveCreativeUseCase } from './application/approve-creative.use-case.js';
import { RejectCreativeUseCase } from './application/reject-creative.use-case.js';
import { RelayoutPosterUseCase } from './application/relayout-poster.use-case.js';
import { RevisePosterUseCase } from './application/revise-poster.use-case.js';
import { ExportPosterUseCase } from './application/export-poster.use-case.js';
import { CreateInitialSceneUseCase } from './application/create-initial-scene.use-case.js';
import { ReviseSceneUseCase } from './application/revise-scene.use-case.js';
import { GetSceneVersionUseCase } from './application/get-scene-version.use-case.js';
import { SceneInvalidationService } from './application/scene-invalidation.service.js';
import {
  AuthoritativeSceneEvidenceVerifier,
  AUTHORITATIVE_SCENE_EVIDENCE_VERIFIER,
} from './application/services/authoritative-scene-evidence-verifier.js';
import { AuthModule } from '../auth/auth.module.js';
import { ProductsModule } from '../products/products.module.js';

@Module({
  imports: [AuthModule, ProductsModule],
  providers: [
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
      provide: POSTER_COMPOSITOR,
      useFactory: (): PosterCompositor => {
        return new SharpPosterCompositor();
      },
    },
    SharpPosterCompositor,
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
    {
      provide: PRODUCT_ASSET_VALIDATOR,
      useFactory: (): ProductAssetValidator => {
        return new ProductAssetValidator();
      },
    },
    ProductAssetValidator,
    {
      provide: BACKGROUND_QUALITY_VALIDATOR,
      useFactory: (): BackgroundQualityValidator => {
        return new BackgroundQualityValidator();
      },
    },
    BackgroundQualityValidator,
    DeterministicVisualValidator,
    VisualSafetyScanner,
    {
      provide: 'ALLOW_LEGACY_PRODUCT_ASSET_FALLBACK',
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): boolean => config.creative.allowLegacyProductAssetFallback,
    },
    GenerateCreativeUseCase,
    ValidateCreativeUseCase,
    ApproveCreativeUseCase,
    RejectCreativeUseCase,
    RelayoutPosterUseCase,
    RevisePosterUseCase,
    ExportPosterUseCase,
    CreateInitialSceneUseCase,
    ReviseSceneUseCase,
    GetSceneVersionUseCase,
    SceneInvalidationService,
    AuthoritativeSceneEvidenceVerifier,
    {
      provide: AUTHORITATIVE_SCENE_EVIDENCE_VERIFIER,
      useClass: AuthoritativeSceneEvidenceVerifier,
    },
  ],
  exports: [
    ASSET_STORAGE,
    HERO_COMPOSITOR,
    POSTER_COMPOSITOR,
    SharpPosterCompositor,
    DETERMINISTIC_VISUAL_VALIDATOR,
    VISUAL_SAFETY_SCANNER,
    PRODUCT_ASSET_VALIDATOR,
    ProductAssetValidator,
    BACKGROUND_QUALITY_VALIDATOR,
    BackgroundQualityValidator,
    DeterministicVisualValidator,
    VisualSafetyScanner,
    GenerateCreativeUseCase,
    ValidateCreativeUseCase,
    ApproveCreativeUseCase,
    RejectCreativeUseCase,
    RelayoutPosterUseCase,
    RevisePosterUseCase,
    ExportPosterUseCase,
    CreateInitialSceneUseCase,
    ReviseSceneUseCase,
    GetSceneVersionUseCase,
    SceneInvalidationService,
    AuthoritativeSceneEvidenceVerifier,
    AUTHORITATIVE_SCENE_EVIDENCE_VERIFIER,
  ],
})
export class CreativeModule {}
