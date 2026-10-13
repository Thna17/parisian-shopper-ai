import { Global, Module } from '@nestjs/common';
import { CONTENT_GENERATION_ENQUEUER } from '@parisian-shopper/application';

import { QueueRegistry } from './queue.registry.js';
import { ValkeyConnectionService } from './valkey-connection.service.js';
import { WorkerRegistry } from './worker.registry.js';
import { ContentGenerationQueue } from './content-generation.queue.js';
import {
  CREATIVE_GENERATION_ENQUEUER,
  CreativeGenerationQueue,
} from './creative-generation.queue.js';

@Global()
@Module({
  providers: [
    ValkeyConnectionService,
    QueueRegistry,
    WorkerRegistry,
    ContentGenerationQueue,
    CreativeGenerationQueue,
    { provide: CONTENT_GENERATION_ENQUEUER, useExisting: ContentGenerationQueue },
    { provide: CREATIVE_GENERATION_ENQUEUER, useExisting: CreativeGenerationQueue },
  ],
  exports: [
    ValkeyConnectionService,
    QueueRegistry,
    WorkerRegistry,
    ContentGenerationQueue,
    CreativeGenerationQueue,
    CONTENT_GENERATION_ENQUEUER,
    CREATIVE_GENERATION_ENQUEUER,
  ],
})
export class JobsModule {}

