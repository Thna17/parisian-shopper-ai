import { Inject, Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { type Worker } from 'bullmq';
import { APPLICATION_LOGGER, type ApplicationLogger, withTimeout } from '@parisian-shopper/common';

import { type QueueName } from './queue-names.js';

const SHUTDOWN_TIMEOUT_MS = 30_000;

@Injectable()
export class WorkerRegistry implements OnModuleDestroy {
  private readonly workers = new Map<QueueName, Worker>();

  public constructor(
    @Optional()
    @Inject(APPLICATION_LOGGER)
    private readonly logger?: ApplicationLogger,
  ) {}

  public register(name: QueueName, worker: Worker): void {
    if (this.workers.has(name)) {
      throw new Error(`Worker is already registered: ${name}`);
    }
    this.workers.set(name, worker);
  }

  public get(name: QueueName): Worker | undefined {
    return this.workers.get(name);
  }

  public getAll(): readonly [QueueName, Worker][] {
    return [...this.workers.entries()];
  }

  public async onModuleDestroy(): Promise<void> {
    const closePromises = [...this.workers.entries()].map(async ([name, worker]) => {
      try {
        await withTimeout(worker.close(), SHUTDOWN_TIMEOUT_MS, `BullMQ Worker close (${name})`);
      } catch (error) {
        this.logger?.warn(`Worker ${name} close exceeded timeout budget during shutdown`, {
          action: 'worker_shutdown_timeout',
          worker: name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
    await Promise.all(closePromises);
    this.workers.clear();
  }
}
