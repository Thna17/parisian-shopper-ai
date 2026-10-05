import { Module } from '@nestjs/common';
import { ApplicationModule } from '@parisian-shopper/application';
import { AIProvidersModule } from '@parisian-shopper/ai-providers';
import { AppConfigModule } from '@parisian-shopper/config';
import { DatabaseModule } from '@parisian-shopper/database';
import {
  ContentGenerationWorkerModule,
  ContentValidationWorkerModule,
  JobsModule,
} from '@parisian-shopper/jobs';
import { LoggerModule } from '@parisian-shopper/logger';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    DatabaseModule,
    AIProvidersModule,
    ApplicationModule,
    JobsModule,
    ContentGenerationWorkerModule,
    ContentValidationWorkerModule,
  ],
})
export class WorkerModule {}
