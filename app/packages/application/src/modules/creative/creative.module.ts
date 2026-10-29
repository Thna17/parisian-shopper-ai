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
import {
  HARD_VISUAL_GATES_ENGINE,
  HardVisualGatesEngine,
} from './domain/services/hard-visual-gates.engine.js';
import { SOFT_AESTHETIC_SCORER } from './domain/services/soft-aesthetic-scorer.port.js';
import { SoftAestheticScorer } from './domain/services/soft-aesthetic-scorer.engine.js';
import { GenerateCreativeUseCase } from './application/generate-creative.use-case.js';
import { ValidateCreativeUseCase } from './application/validate-creative.use-case.js';
import { ApproveCreativeUseCase } from './application/approve-creative.use-case.js';
import { RejectCreativeUseCase } from './application/reject-creative.use-case.js';
import { RelayoutPosterUseCase } from './application/relayout-poster.use-case.js';
import { RevisePosterUseCase } from './application/revise-poster.use-case.js';
import { ExportPosterUseCase } from './application/export-poster.use-case.js';
import {
  ExportDownloadTokenService,
  EXPORT_DOWNLOAD_TOKEN_SERVICE,
  EXPORT_DOWNLOAD_TOKEN_CONFIG,
  type ExportDownloadTokenConfig,
} from './application/export-download-token.service.js';
import { CreateInitialSceneUseCase } from './application/create-initial-scene.use-case.js';
import { ReviseSceneUseCase } from './application/revise-scene.use-case.js';
import { GetSceneVersionUseCase } from './application/get-scene-version.use-case.js';
import { SceneInvalidationService } from './application/scene-invalidation.service.js';
import {
  AuthoritativeSceneEvidenceVerifier,
  AUTHORITATIVE_SCENE_EVIDENCE_VERIFIER,
} from './application/services/authoritative-scene-evidence-verifier.js';
import { ListCreativeProjectsUseCase } from './application/list-creative-projects.use-case.js';
import { GetCreativeProjectDetailUseCase } from './application/get-creative-project-detail.use-case.js';
import { CreateCreativeProjectUseCase } from './application/create-creative-project.use-case.js';
import { ValidateCreativeProjectUseCase } from './application/validate-creative-project.use-case.js';
import { RenderCreativePreviewUseCase } from './application/render-creative-preview.use-case.js';
import { AuthModule } from '../auth/auth.module.js';
import { ProductsModule } from '../products/products.module.js';
import { ContentModule } from '../content/content.module.js';
import { BrandModule } from '../brand/brand.module.js';

@Module({
  imports: [AuthModule, ProductsModule, ContentModule, BrandModule],
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
      provide: HARD_VISUAL_GATES_ENGINE,
      useFactory: (): HardVisualGatesEngine => {
        return new HardVisualGatesEngine();
      },
    },
    HardVisualGatesEngine,
    {
      provide: SOFT_AESTHETIC_SCORER,
      useFactory: (): SoftAestheticScorer => {
        return new SoftAestheticScorer();
      },
    },
    SoftAestheticScorer,
    {
      provide: 'ALLOW_LEGACY_PRODUCT_ASSET_FALLBACK',
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): boolean =>
        config.creative.allowLegacyProductAssetFallback,
    },
    GenerateCreativeUseCase,
    ValidateCreativeUseCase,
    ApproveCreativeUseCase,
    RejectCreativeUseCase,
    RelayoutPosterUseCase,
    RevisePosterUseCase,
    ExportPosterUseCase,
    {
      provide: EXPORT_DOWNLOAD_TOKEN_CONFIG,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): ExportDownloadTokenConfig => ({
        secret: config.creative.exportDownloadTokenSecret,
        ttlSeconds: config.creative.exportDownloadTokenTtlSeconds,
      }),
    },
    ExportDownloadTokenService,
    {
      provide: EXPORT_DOWNLOAD_TOKEN_SERVICE,
      useClass: ExportDownloadTokenService,
    },
    CreateInitialSceneUseCase,
    ReviseSceneUseCase,
    GetSceneVersionUseCase,
    SceneInvalidationService,
    AuthoritativeSceneEvidenceVerifier,
    {
      provide: AUTHORITATIVE_SCENE_EVIDENCE_VERIFIER,
      useClass: AuthoritativeSceneEvidenceVerifier,
    },
    ListCreativeProjectsUseCase,
    GetCreativeProjectDetailUseCase,
    CreateCreativeProjectUseCase,
    ValidateCreativeProjectUseCase,
    RenderCreativePreviewUseCase,
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
    HARD_VISUAL_GATES_ENGINE,
    HardVisualGatesEngine,
    SOFT_AESTHETIC_SCORER,
    SoftAestheticScorer,
    GenerateCreativeUseCase,
    ValidateCreativeUseCase,
    ApproveCreativeUseCase,
    RejectCreativeUseCase,
    RelayoutPosterUseCase,
    RevisePosterUseCase,
    ExportPosterUseCase,
    {
      provide: EXPORT_DOWNLOAD_TOKEN_CONFIG,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): ExportDownloadTokenConfig => ({
        secret: config.creative.exportDownloadTokenSecret,
        ttlSeconds: config.creative.exportDownloadTokenTtlSeconds,
      }),
    },
    ExportDownloadTokenService,
    {
      provide: EXPORT_DOWNLOAD_TOKEN_SERVICE,
      useClass: ExportDownloadTokenService,
    },
    CreateInitialSceneUseCase,
    ReviseSceneUseCase,
    GetSceneVersionUseCase,
    SceneInvalidationService,
    AuthoritativeSceneEvidenceVerifier,
    AUTHORITATIVE_SCENE_EVIDENCE_VERIFIER,
    ListCreativeProjectsUseCase,
    GetCreativeProjectDetailUseCase,
    CreateCreativeProjectUseCase,
    ValidateCreativeProjectUseCase,
    RenderCreativePreviewUseCase,
  ],
})
export class CreativeModule {}
