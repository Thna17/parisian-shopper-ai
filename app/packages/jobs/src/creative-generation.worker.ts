import { Inject, Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { GenerateCreativeUseCase, ValidateCreativeUseCase } from '@parisian-shopper/application';
import {
  APPLICATION_LOGGER,
  type ApplicationLogger,
  type OutboxWriter,
} from '@parisian-shopper/common';
import { type Job, UnrecoverableError, Worker } from 'bullmq';

import { createBullMqConnection } from './bullmq-connection.js';
import { type CreativeGenerationJobData } from './creative-generation.queue.js';
import { CreativeGenerationJobName, QueueName } from './queue-names.js';
import { ValkeyConnectionService } from './valkey-connection.service.js';
import { WorkerRegistry } from './worker.registry.js';

@Injectable()
export class CreativeGenerationWorker implements OnModuleInit {
  public constructor(
    private readonly valkey: ValkeyConnectionService,
    private readonly registry: WorkerRegistry,
    private readonly generateCreative: GenerateCreativeUseCase,
    private readonly validateCreative: ValidateCreativeUseCase,
    @Inject(APPLICATION_LOGGER)
    private readonly logger: ApplicationLogger,
    @Optional()
    @Inject('OUTBOX_WRITER')
    private readonly outboxWriter?: OutboxWriter,
  ) {}

  public async onModuleInit(): Promise<void> {
    const client = await this.valkey.createDedicatedClient('creative-generation-worker');
    const worker = new Worker<CreativeGenerationJobData, void>(
      QueueName.CREATIVE_GENERATION,
      (job) => this.process(job),
      {
        connection: createBullMqConnection(client),
        concurrency: 2, // Default: 2 parallel jobs to manage libvips memory overhead
        lockDuration: 60_000, // 60 seconds lock duration
        // A worker crash does not prove that the provider did not charge.
        maxStalledCount: 0,
      },
    );
    this.registry.register(QueueName.CREATIVE_GENERATION, worker);
    await worker.waitUntilReady();
  }

  public async process(job: Job<CreativeGenerationJobData>): Promise<void> {
    if (job.name !== CreativeGenerationJobName.GENERATE_CREATIVE) {
      throw new UnrecoverableError('Unsupported creative-generation job name');
    }

    const startedAt = new Date();
    const startTime = startedAt.getTime();
    const { contentVersionId, requestedBy, format, stylePreset } = job.data;

    this.logger.log(`Processing creative generation job for content version ${contentVersionId}`, {
      jobId: job.id,
      attempt: job.attemptsMade,
      startedAt: startedAt.toISOString(),
    });

    try {
      // 1. Dispatch GenerateCreativeUseCase
      const generateResult = await this.generateCreative.execute({
        contentVersionId,
        requestedBy,
        ...(format !== undefined ? { format } : {}),
        ...(stylePreset !== undefined ? { stylePreset } : {}),
      });

      const { creativeJob, visualAsset } = generateResult;

      // 2. Automatically chain ValidateCreativeUseCase upon completion
      const validationResult = await this.validateCreative.execute({
        creativeJobId: creativeJob.id,
        visualAssetId: visualAsset.id,
        ...(this.outboxWriter !== undefined ? { outboxWriter: this.outboxWriter } : {}),
      });

      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startTime;
      this.logger.log(`Creative generation and validation completed in ${durationMs}ms`, {
        jobId: job.id,
        creativeJobId: creativeJob.id,
        visualAssetId: visualAsset.id,
        validationPassed: validationResult.isPassed,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs,
      });
    } catch (error) {
      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startTime;
      this.logger.error(
        `Creative generation worker job failed after ${durationMs}ms: ${error instanceof Error ? error.message : String(error)}`,
        {
          jobId: job.id,
          contentVersionId,
          error: error instanceof Error ? error.message : String(error),
          startedAt: startedAt.toISOString(),
          failedAt: completedAt.toISOString(),
          durationMs,
          attemptsMade: job.attemptsMade,
          isDeadLetter: true,
        },
      );

      // Even previously queued jobs may have retries configured. A timeout or
      // validation failure after dispatch must not trigger another paid call.
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new UnrecoverableError(errorMessage);
    }
  }
}
