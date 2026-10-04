import { Global, Module } from '@nestjs/common';

import { QueueRegistry } from './queue.registry.js';
import { ValkeyConnectionService } from './valkey-connection.service.js';
import { WorkerRegistry } from './worker.registry.js';

@Global()
@Module({
  providers: [ValkeyConnectionService, QueueRegistry, WorkerRegistry],
  exports: [ValkeyConnectionService, QueueRegistry, WorkerRegistry],
})
export class JobsModule {}
