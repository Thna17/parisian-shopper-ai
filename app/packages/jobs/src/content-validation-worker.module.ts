import { Module } from '@nestjs/common';
import { ApplicationModule } from '@parisian-shopper/application';

import { ContentValidationWorker } from './content-validation.worker.js';
import { JobsModule } from './jobs.module.js';

@Module({ imports: [ApplicationModule, JobsModule], providers: [ContentValidationWorker] })
export class ContentValidationWorkerModule {}
