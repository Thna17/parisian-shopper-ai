import { Injectable, OnModuleInit } from '@nestjs/common';
import { ContentGenerationError, GenerateContentUseCase } from '@parisian-shopper/application';
import { AppConfigService, FeatureFlag, FeatureFlagService } from '@parisian-shopper/config';
import { type Job, UnrecoverableError, Worker } from 'bullmq';

import { createBullMqConnection } from './bullmq-connection.js';
import { type ContentGenerationJobData } from './content-generation.queue.js';
import { ContentValidationQueue } from './content-validation.queue.js';
import { ContentGenerationJobName, QueueName } from './queue-names.js';
import { ValkeyConnectionService } from './valkey-connection.service.js';
import { WorkerRegistry } from './worker.registry.js';

@Injectable()
export class ContentGenerationWorker implements OnModuleInit {
  public constructor(
    private readonly flags: FeatureFlagService,
    private readonly config: AppConfigService,
    private readonly valkey: ValkeyConnectionService,
    private readonly registry: WorkerRegistry,
    private readonly generateContent: GenerateContentUseCase,
    private readonly validationQueue: ContentValidationQueue,
  ) {}

  public async onModuleInit(): Promise<void> {
    if (!this.flags.isEnabled(FeatureFlag.AI_TEXT_GENERATION)) return;
    const client = await this.valkey.createDedicatedClient('content-generation-worker');
    const worker = new Worker<ContentGenerationJobData, void>(
      QueueName.CONTENT_GENERATION,
      (job) => this.process(job),
      {
        connection: createBullMqConnection(client),
        concurrency: 2,
        lockDuration: this.config.ai.attemptStaleAfterMs,
      },
    );
    this.registry.register(QueueName.CONTENT_GENERATION, worker);
    await worker.waitUntilReady();
  }

  private async process(job: Job<ContentGenerationJobData>): Promise<void> {
    if (job.name !== ContentGenerationJobName.GENERATE_CONTENT) {
      throw new UnrecoverableError('Unsupported content-generation job name');
    }
    try {
      const version = await this.generateContent.execute(job.data.contentJobId);
      if (version !== null) await this.validationQueue.enqueue(version.id);
    } catch (error) {
      if (error instanceof ContentGenerationError && !error.retryable) {
        throw new UnrecoverableError(error.publicMessage);
      }
      throw error;
    }
  }
}
