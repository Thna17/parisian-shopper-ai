import { Inject, Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { type Queue } from 'bullmq';
import { APPLICATION_LOGGER, type ApplicationLogger, withTimeout } from '@parisian-shopper/common';

import { type QueueName } from './queue-names.js';

const SHUTDOWN_TIMEOUT_MS = 30_000;

@Injectable()
export class QueueRegistry implements OnModuleDestroy {
  private readonly queues = new Map<QueueName, Queue>();

  public constructor(
    @Optional()
    @Inject(APPLICATION_LOGGER)
    private readonly logger?: ApplicationLogger,
  ) {}

  public register(name: QueueName, queue: Queue): void {
    if (this.queues.has(name)) {
      throw new Error(`Queue is already registered: ${name}`);
    }
    this.queues.set(name, queue);
  }

  public get(name: QueueName): Queue {
    const queue = this.queues.get(name);
    if (queue === undefined) {
      throw new Error(`Queue is not registered: ${name}`);
    }
    return queue;
  }

  public getAll(): readonly [QueueName, Queue][] {
    return [...this.queues.entries()];
  }

  public async onModuleDestroy(): Promise<void> {
    const closePromises = [...this.queues.entries()].map(async ([name, queue]) => {
      try {
        await withTimeout(queue.close(), SHUTDOWN_TIMEOUT_MS, `BullMQ Queue close (${name})`);
      } catch (error) {
        this.logger?.warn(`Queue ${name} close exceeded timeout budget during shutdown`, {
          action: 'queue_shutdown_timeout',
          queue: name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
    await Promise.all(closePromises);
    this.queues.clear();
  }
}
