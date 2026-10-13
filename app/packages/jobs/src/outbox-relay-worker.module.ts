import { Module } from '@nestjs/common';
import { JobsModule } from './jobs.module.js';
import { OutboxRelayWorker } from './outbox-relay.worker.js';

@Module({
  imports: [JobsModule],
  providers: [OutboxRelayWorker],
  exports: [OutboxRelayWorker],
})
export class OutboxRelayWorkerModule {}
