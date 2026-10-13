import { Module } from '@nestjs/common';
import { ApplicationModule } from '@parisian-shopper/application';

import { CreativeGenerationQueue } from './creative-generation.queue.js';
import { CreativeGenerationWorker } from './creative-generation.worker.js';
import { JobsModule } from './jobs.module.js';

@Module({
  imports: [ApplicationModule, JobsModule],
  providers: [CreativeGenerationWorker, CreativeGenerationQueue],
  exports: [CreativeGenerationWorker, CreativeGenerationQueue],
})
export class CreativeGenerationWorkerModule {}
