import { Global, Module } from '@nestjs/common';
import { CONTENT_GENERATION_ENQUEUER } from '@parisian-shopper/application';

import { QueueRegistry } from './queue.registry.js';
import { ValkeyConnectionService } from './valkey-connection.service.js';
import { WorkerRegistry } from './worker.registry.js';
import { ContentGenerationQueue } from './content-generation.queue.js';

@Global()
@Module({
  providers: [
    ValkeyConnectionService,
    QueueRegistry,
    WorkerRegistry,
    ContentGenerationQueue,
    { provide: CONTENT_GENERATION_ENQUEUER, useExisting: ContentGenerationQueue },
  ],
  exports: [
    ValkeyConnectionService,
    QueueRegistry,
    WorkerRegistry,
    ContentGenerationQueue,
    CONTENT_GENERATION_ENQUEUER,
  ],
})
export class JobsModule {}
