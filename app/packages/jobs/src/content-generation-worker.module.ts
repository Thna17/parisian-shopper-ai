import { Module } from '@nestjs/common';
import { ApplicationModule } from '@parisian-shopper/application';

import { ContentGenerationWorker } from './content-generation.worker.js';
import { JobsModule } from './jobs.module.js';

@Module({ imports: [ApplicationModule, JobsModule], providers: [ContentGenerationWorker] })
export class ContentGenerationWorkerModule {}
