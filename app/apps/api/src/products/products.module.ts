import { ProductsModule } from '@parisian-shopper/application';
import { ProductMarketingController } from './product-marketing.controller.js';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProductSyncAuthGuard } from './guards/product-sync-auth.guard.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

@Module({
  imports: [AuthModule, ProductsModule],
  controllers: [ProductsController, ProductMarketingController],
  providers: [ProductsService, ProductSyncAuthGuard],
  exports: [ProductsService],
})
export class ProductsApiModule {}
