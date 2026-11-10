import { describe, expect, it, jest } from '@jest/globals';
import { CreativeGenerationQueue } from '../creative-generation.queue.js';
import type { QueueRegistry } from '../queue.registry.js';
import type { ValkeyConnectionService } from '../valkey-connection.service.js';

describe('creative generation dispatch safety', () => {
  it('enqueues a single attempt so a timeout is not resubmitted automatically', async () => {
    const add = jest.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
    const registry = { get: jest.fn(() => ({ add })) } as unknown as QueueRegistry;
    const queue = new CreativeGenerationQueue({} as ValkeyConnectionService, registry);
    await queue.enqueue({ contentVersionId: 'version-1', requestedBy: 'user-1' });
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({ attempts: 1 }),
    );
  });
});
