import { Module } from '@nestjs/common';
import { AppConfigService, FeatureFlag, FeatureFlagService } from '@parisian-shopper/config';

import { CreateProductSnapshotUseCase } from './application/create-product-snapshot.use-case.js';
import { GetProductBySkuUseCase } from './application/get-product-by-sku.use-case.js';
import { NoopProductMetrics, PRODUCT_METRICS } from './application/product-metrics.port.js';
import { PRODUCT_SOURCE, type ProductSource } from './application/product-source.port.js';
import { SearchProductsUseCase } from './application/search-products.use-case.js';
import { ProductSourceUnavailableError } from './domain/product-errors.js';
import { DisabledProductSource } from './infrastructure/disabled-product-source.js';
import { MockProductSource } from './infrastructure/mock-product-source.js';

@Module({
  providers: [
    {
      provide: PRODUCT_SOURCE,
      inject: [AppConfigService, FeatureFlagService],
      useFactory: (config: AppConfigService, features: FeatureFlagService): ProductSource =>
        selectProductSource(config.nodeEnvironment, features.isEnabled(FeatureFlag.PRODUCT_API)),
    },
    { provide: PRODUCT_METRICS, useClass: NoopProductMetrics },
    GetProductBySkuUseCase,
    SearchProductsUseCase,
    CreateProductSnapshotUseCase,
  ],
  exports: [
    PRODUCT_SOURCE,
    PRODUCT_METRICS,
    GetProductBySkuUseCase,
    SearchProductsUseCase,
    CreateProductSnapshotUseCase,
  ],
})
export class ProductsModule {}

export function selectProductSource(
  environment: 'development' | 'test' | 'production',
  productApiEnabled: boolean,
): ProductSource {
  if (productApiEnabled) {
    throw new ProductSourceUnavailableError(
      new Error('HTTP Product Source is not implemented in Phase 1B'),
    );
  }
  return environment === 'production' ? new DisabledProductSource() : new MockProductSource();
}
