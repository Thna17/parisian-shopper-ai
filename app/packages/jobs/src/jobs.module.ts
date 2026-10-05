import { Global, Module } from '@nestjs/common';

import { QueueRegistry } from './queue.registry.js';
import { ValkeyConnectionService } from './valkey-connection.service.js';
import { WorkerRegistry } from './worker.registry.js';
import { ContentGenerationQueue } from './content-generation.queue.js';

@Global()
@Module({
  providers: [ValkeyConnectionService, QueueRegistry, WorkerRegistry, ContentGenerationQueue],
  exports: [ValkeyConnectionService, QueueRegistry, WorkerRegistry, ContentGenerationQueue],
})
export class JobsModule {}
