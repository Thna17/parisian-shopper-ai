import { Injectable, OnModuleInit } from '@nestjs/common';
import { AppConfigService, FeatureFlag, FeatureFlagService } from '@parisian-shopper/config';
import { type ContentGenerationEnqueuer } from '@parisian-shopper/application';
import { Queue } from 'bullmq';

import { createBullMqConnection } from './bullmq-connection.js';
import { ContentGenerationJobName, QueueName } from './queue-names.js';
import { QueueRegistry } from './queue.registry.js';
import { ValkeyConnectionService } from './valkey-connection.service.js';

export interface ContentGenerationJobData {
  contentJobId: string;
}

@Injectable()
export class ContentGenerationQueue implements OnModuleInit, ContentGenerationEnqueuer {
  public constructor(
    private readonly flags: FeatureFlagService,
    private readonly config: AppConfigService,
    private readonly valkey: ValkeyConnectionService,
    private readonly registry: QueueRegistry,
  ) {}

  public async onModuleInit(): Promise<void> {
    if (!this.flags.isEnabled(FeatureFlag.AI_TEXT_GENERATION)) return;
    const client = await this.valkey.createDedicatedClient('content-generation-queue');
    const queue = new Queue<ContentGenerationJobData>(QueueName.CONTENT_GENERATION, {
      connection: createBullMqConnection(client),
      defaultJobOptions: {
        attempts: this.config.ai.maxRetries + 1,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: { count: 1_000 },
        removeOnFail: { count: 5_000 },
      },
    });
    this.registry.register(QueueName.CONTENT_GENERATION, queue);
    await queue.waitUntilReady();
  }

  public async enqueue(contentJobId: string): Promise<void> {
    await this.registry
      .get(QueueName.CONTENT_GENERATION)
      .add(
        ContentGenerationJobName.GENERATE_CONTENT,
        { contentJobId },
        { jobId: `generate-${contentJobId}-${Date.now()}` },
      );
  }
}
