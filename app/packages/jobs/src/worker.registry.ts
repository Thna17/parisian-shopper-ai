import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { type Worker } from 'bullmq';

import { type QueueName } from './queue-names.js';

@Injectable()
export class WorkerRegistry implements OnModuleDestroy {
  private readonly workers = new Map<QueueName, Worker>();

  public register(name: QueueName, worker: Worker): void {
    if (this.workers.has(name)) {
      throw new Error(`Worker is already registered: ${name}`);
    }
    this.workers.set(name, worker);
  }

  public async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.workers.values()].map(async (worker) => worker.close()));
    this.workers.clear();
  }
}
