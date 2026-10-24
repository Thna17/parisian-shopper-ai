import { Module } from '@nestjs/common';
import { ApplicationModule } from '@parisian-shopper/application';

import { CreativeGenerationWorker } from './creative-generation.worker.js';
import { JobsModule } from './jobs.module.js';

@Module({
  imports: [ApplicationModule, JobsModule],
  providers: [CreativeGenerationWorker],
  exports: [CreativeGenerationWorker],
})
export class CreativeGenerationWorkerModule {}
