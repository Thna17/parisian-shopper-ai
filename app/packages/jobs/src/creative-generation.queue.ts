import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { FeatureFlag, FeatureFlagService } from '@parisian-shopper/config';
import { Queue } from 'bullmq';

import { createBullMqConnection } from './bullmq-connection.js';
import { CreativeGenerationJobName, QueueName } from './queue-names.js';
import { QueueRegistry } from './queue.registry.js';
import { ValkeyConnectionService } from './valkey-connection.service.js';

import {
  CREATIVE_GENERATION_ENQUEUER,
  type CreativeGenerationEnqueuer,
  type CreativeGenerationJobInput as CreativeGenerationJobData,
} from '@parisian-shopper/application';

export {
  CREATIVE_GENERATION_ENQUEUER,
  type CreativeGenerationEnqueuer,
  type CreativeGenerationJobData,
};

@Injectable()
export class CreativeGenerationQueue implements OnModuleInit, CreativeGenerationEnqueuer {
  public constructor(
    private readonly valkey: ValkeyConnectionService,
    private readonly registry: QueueRegistry,
    @Optional() private readonly flags?: Pick<FeatureFlagService, 'isEnabled'>,
  ) {}

  public async onModuleInit(): Promise<void> {
    if (this.flags !== undefined && !this.flags.isEnabled(FeatureFlag.CREATIVE_GENERATION)) {
      return;
    }
    const client = await this.valkey.createDedicatedClient('creative-generation-queue');
    const queue = new Queue<CreativeGenerationJobData>(QueueName.CREATIVE_GENERATION, {
      connection: createBullMqConnection(client),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: { count: 1_000 },
        removeOnFail: { count: 5_000 },
      },
    });
    this.registry.register(QueueName.CREATIVE_GENERATION, queue);
    await queue.waitUntilReady();
  }

  public async enqueue(data: CreativeGenerationJobData): Promise<void> {
    const queue = this.registry.get(QueueName.CREATIVE_GENERATION);
    const deduplicationId = data.creativeJobId ?? data.contentVersionId;
    await queue.add(CreativeGenerationJobName.GENERATE_CREATIVE, data, {
      jobId: `creative-${deduplicationId}-${Date.now()}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1_000 },
    });
  }
}
