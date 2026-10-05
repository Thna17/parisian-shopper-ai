import { Injectable, OnModuleInit } from '@nestjs/common';
import { FACTUAL_VALIDATOR_VERSION } from '@parisian-shopper/application';
import { Queue } from 'bullmq';

import { createBullMqConnection } from './bullmq-connection.js';
import { ContentValidationJobName, QueueName } from './queue-names.js';
import { QueueRegistry } from './queue.registry.js';
import { ValkeyConnectionService } from './valkey-connection.service.js';

export interface ContentValidationJobData {
  contentVersionId: string;
}

@Injectable()
export class ContentValidationQueue implements OnModuleInit {
  public constructor(
    private readonly valkey: ValkeyConnectionService,
    private readonly registry: QueueRegistry,
  ) {}

  public async onModuleInit(): Promise<void> {
    const client = await this.valkey.createDedicatedClient('content-validation-queue');
    const queue = new Queue<ContentValidationJobData>(QueueName.CONTENT_VALIDATION, {
      connection: createBullMqConnection(client),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: { count: 1_000 },
        removeOnFail: { count: 5_000 },
      },
    });
    this.registry.register(QueueName.CONTENT_VALIDATION, queue);
    await queue.waitUntilReady();
  }

  public async enqueue(contentVersionId: string): Promise<void> {
    await this.registry
      .get(QueueName.CONTENT_VALIDATION)
      .add(
        ContentValidationJobName.VALIDATE_CONTENT_VERSION,
        { contentVersionId },
        { jobId: `validate-${contentVersionId}-${FACTUAL_VALIDATOR_VERSION}` },
      );
  }
}
