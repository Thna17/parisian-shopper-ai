import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { type Queue } from 'bullmq';

import { type QueueName } from './queue-names.js';

@Injectable()
export class QueueRegistry implements OnModuleDestroy {
  private readonly queues = new Map<QueueName, Queue>();

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

  public async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map(async (queue) => queue.close()));
    this.queues.clear();
  }
}
