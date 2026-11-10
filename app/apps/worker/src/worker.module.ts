import { Module } from '@nestjs/common';
import { ApplicationModule, CreativeModule, ProductsModule } from '@parisian-shopper/application';
import { AIProvidersModule } from '@parisian-shopper/ai-providers';
import { AppConfigModule } from '@parisian-shopper/config';
import {
  CreativeProvidersModule,
  PostImageProvidersModule,
} from '@parisian-shopper/creative-providers';
import { DatabaseModule } from '@parisian-shopper/database';
import {
  ContentGenerationWorkerModule,
  ContentValidationWorkerModule,
  CreativeGenerationWorkerModule,
  JobsModule,
  OutboxRelayWorkerModule,
  ProductCatalogSyncWorkerModule,
} from '@parisian-shopper/jobs';
import { LoggerModule } from '@parisian-shopper/logger';

import { PostGenerationWorker } from './post-generation.worker.js';
import { WorkerHealthService } from './worker-health.service.js';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    DatabaseModule,
    AIProvidersModule,
    CreativeProvidersModule,
    PostImageProvidersModule,
    CreativeModule,
    ProductsModule,
    ApplicationModule,
    JobsModule,
    ContentGenerationWorkerModule,
    ContentValidationWorkerModule,
    CreativeGenerationWorkerModule,
    ProductCatalogSyncWorkerModule,
    OutboxRelayWorkerModule,
  ],
  providers: [WorkerHealthService, PostGenerationWorker],
})
export class WorkerModule {}
