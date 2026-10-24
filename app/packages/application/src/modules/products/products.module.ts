import { Module } from '@nestjs/common';
import { CLOCK, SystemClock } from '@parisian-shopper/common';
import { AppConfigService, FeatureFlag, FeatureFlagService } from '@parisian-shopper/config';

import { AuthModule } from '../auth/auth.module.js';
import { CreateProductSnapshotUseCase } from './application/create-product-snapshot.use-case.js';
import { GetProductBySkuUseCase } from './application/get-product-by-sku.use-case.js';
import { NoopProductMetrics, PRODUCT_METRICS } from './application/product-metrics.port.js';
import { PRODUCT_SOURCE, type ProductSource } from './application/product-source.port.js';
import { RevalidateProductSnapshotUseCase } from './application/revalidate-product-snapshot.use-case.js';
import { SearchProductsUseCase } from './application/search-products.use-case.js';
import {
  PRODUCT_ASSET_STORAGE,
  type ProductAssetStoragePort,
} from './application/product-asset-storage.port.js';
import {
  PRODUCT_ASSET_ACQUISITION,
  type ProductAssetAcquisitionPort,
} from './application/product-asset-acquisition.port.js';
import {
  PRODUCT_ASSET_ELIGIBILITY_EVALUATOR,
  ProductAssetEligibilityEvaluator,
} from './application/product-asset-eligibility-evaluator.js';
import { RegisterProductAssetUseCase } from './application/register-product-asset.use-case.js';
import { ApproveProductAssetUseCase } from './application/approve-product-asset.use-case.js';
import { ReplaceProductAssetUseCase } from './application/replace-product-asset.use-case.js';
import { VerifyProductAssetRightsUseCase } from './application/verify-product-asset-rights.use-case.js';
import { DiskProductAssetStorageAdapter } from './infrastructure/disk-product-asset-storage.adapter.js';
import { SafeProductAssetAcquisitionService } from './infrastructure/safe-product-asset-acquisition.service.js';
import { ProductSourceUnavailableError } from './domain/product-errors.js';
import { FreshnessEvaluator } from './domain/freshness-evaluator.js';
import { DisabledProductSource } from './infrastructure/disabled-product-source.js';
import { MekhlaProductSource } from './infrastructure/mekhla-product-source.js';
import { MockProductSource } from './infrastructure/mock-product-source.js';

@Module({
  imports: [AuthModule],
  providers: [
    {
      provide: PRODUCT_SOURCE,
      inject: [AppConfigService, FeatureFlagService],
      useFactory: (config: AppConfigService, features: FeatureFlagService): ProductSource =>
        selectProductSource(
          config.nodeEnvironment,
          features.isEnabled(FeatureFlag.PRODUCT_API),
          config,
        ),
    },
    { provide: PRODUCT_METRICS, useClass: NoopProductMetrics },
    { provide: CLOCK, useClass: SystemClock },
    {
      provide: PRODUCT_ASSET_STORAGE,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): ProductAssetStoragePort => {
        return new DiskProductAssetStorageAdapter({
          storageRoot: config.creative?.storageRoot || '.data/assets',
          maxBytes: config.creative?.maxBytes || 15 * 1024 * 1024,
        });
      },
    },
    {
      provide: PRODUCT_ASSET_ACQUISITION,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): ProductAssetAcquisitionPort => {
        return new SafeProductAssetAcquisitionService({
          allowedHosts: config.productApi?.allowedHosts,
          maxFileSizeBytes: 15 * 1024 * 1024,
          requestTimeoutMs: config.productApi?.timeoutMs || 10000,
        });
      },
    },
    {
      provide: PRODUCT_ASSET_ELIGIBILITY_EVALUATOR,
      useClass: ProductAssetEligibilityEvaluator,
    },
    ProductAssetEligibilityEvaluator,
    RegisterProductAssetUseCase,
    ApproveProductAssetUseCase,
    ReplaceProductAssetUseCase,
    VerifyProductAssetRightsUseCase,
    GetProductBySkuUseCase,
    SearchProductsUseCase,
    CreateProductSnapshotUseCase,
    RevalidateProductSnapshotUseCase,
    FreshnessEvaluator,
  ],
  exports: [
    PRODUCT_SOURCE,
    PRODUCT_METRICS,
    PRODUCT_ASSET_STORAGE,
    PRODUCT_ASSET_ACQUISITION,
    PRODUCT_ASSET_ELIGIBILITY_EVALUATOR,
    ProductAssetEligibilityEvaluator,
    RegisterProductAssetUseCase,
    ApproveProductAssetUseCase,
    ReplaceProductAssetUseCase,
    VerifyProductAssetRightsUseCase,
    GetProductBySkuUseCase,
    SearchProductsUseCase,
    CreateProductSnapshotUseCase,
    RevalidateProductSnapshotUseCase,
    FreshnessEvaluator,
  ],
})
export class ProductsModule {}

export function selectProductSource(
  environment: 'development' | 'test' | 'production',
  productApiEnabled: boolean,
  config?: AppConfigService,
  fetchFn?: typeof fetch,
): ProductSource {
  if (productApiEnabled) {
    if (!config || !config.productApi.baseUrl || !config.productApi.businessId) {
      throw new ProductSourceUnavailableError(new Error('Product API configuration is incomplete'));
    }
    return new MekhlaProductSource({
      baseUrl: config.productApi.baseUrl,
      businessId: config.productApi.businessId,
      currency: config.productApi.currency,
      allowedHosts: config.productApi.allowedHosts,
      timeoutMs: config.productApi.timeoutMs,
      maxRetries: config.productApi.maxRetries,
      token: config.productApi.token,
      fetchFn,
    });
  }
  return environment === 'production' ? new DisabledProductSource() : new MockProductSource();
}
