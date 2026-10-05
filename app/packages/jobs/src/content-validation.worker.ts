import { Injectable, OnModuleInit } from '@nestjs/common';
import { ValidateContentVersionUseCase } from '@parisian-shopper/application';
import { type Job, UnrecoverableError, Worker } from 'bullmq';

import { createBullMqConnection } from './bullmq-connection.js';
import { type ContentValidationJobData } from './content-validation.queue.js';
import { ContentValidationJobName, QueueName } from './queue-names.js';
import { ValkeyConnectionService } from './valkey-connection.service.js';
import { WorkerRegistry } from './worker.registry.js';

@Injectable()
export class ContentValidationWorker implements OnModuleInit {
  public constructor(
    private readonly valkey: ValkeyConnectionService,
    private readonly registry: WorkerRegistry,
    private readonly validateContentVersion: ValidateContentVersionUseCase,
  ) {}

  public async onModuleInit(): Promise<void> {
    const client = await this.valkey.createDedicatedClient('content-validation-worker');
    const worker = new Worker<ContentValidationJobData, void>(
      QueueName.CONTENT_VALIDATION,
      (job) => this.process(job),
      { connection: createBullMqConnection(client), concurrency: 4 },
    );
    this.registry.register(QueueName.CONTENT_VALIDATION, worker);
    await worker.waitUntilReady();
  }

  private async process(job: Job<ContentValidationJobData>): Promise<void> {
    if (job.name !== ContentValidationJobName.VALIDATE_CONTENT_VERSION) {
      throw new UnrecoverableError('Unsupported content-validation job name');
    }
    await this.validateContentVersion.execute(job.data.contentVersionId);
  }
}
