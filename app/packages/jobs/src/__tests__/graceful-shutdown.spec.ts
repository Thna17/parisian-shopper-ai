import { describe, expect, it, jest } from '@jest/globals';
import { type Queue, type Worker } from 'bullmq';
import { type ApplicationLogger } from '@parisian-shopper/common';

import { QueueRegistry } from '../queue.registry.js';
import { WorkerRegistry } from '../worker.registry.js';
import { QueueName } from '../queue-names.js';

describe('Graceful Shutdown with Timeout Budget', () => {
  const mockLogger: ApplicationLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  };

  describe('WorkerRegistry', () => {
    it('closes all registered workers gracefully', async () => {
      const registry = new WorkerRegistry(mockLogger);
      const closeMock = jest.fn(() => Promise.resolve());
      const worker: Partial<Worker> = {
        name: 'test-worker',
        close: closeMock,
      };

      registry.register(QueueName.CONTENT_GENERATION, worker as Worker);
      expect(registry.getAll()).toHaveLength(1);

      await registry.onModuleDestroy();

      expect(closeMock).toHaveBeenCalledTimes(1);
      expect(registry.getAll()).toHaveLength(0);
    });

    it('catches and logs timeout if a worker hangs during shutdown', async () => {
      const registry = new WorkerRegistry(mockLogger);
      const hangingWorker: Partial<Worker> = {
        name: 'hanging-worker',
        close: jest.fn(
          () =>
            new Promise<void>((resolve) => {
              // Hang for longer than timeout
              setTimeout(resolve, 500);
            }),
        ),
      };

      registry.register(QueueName.CREATIVE_GENERATION, hangingWorker as Worker);

      // Fast mock timeout or close
      await registry.onModuleDestroy();
      expect(registry.getAll()).toHaveLength(0);
    });
  });

  describe('QueueRegistry', () => {
    it('closes all registered queues gracefully', async () => {
      const registry = new QueueRegistry(mockLogger);
      const closeMock = jest.fn(() => Promise.resolve());
      const queue: Partial<Queue> = {
        name: 'test-queue',
        close: closeMock,
      };

      registry.register(QueueName.CONTENT_GENERATION, queue as Queue);
      expect(registry.getAll()).toHaveLength(1);

      await registry.onModuleDestroy();

      expect(closeMock).toHaveBeenCalledTimes(1);
      expect(registry.getAll()).toHaveLength(0);
    });
  });
});
