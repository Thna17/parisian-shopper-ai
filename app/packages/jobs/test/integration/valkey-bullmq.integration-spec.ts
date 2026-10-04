import { GlideClient } from '@valkey/valkey-glide';
import { Job, Queue, Worker } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';

import { createBullMqConnection } from '../../src/bullmq-connection.js';

describe('Valkey and BullMQ foundation', () => {
  let container: StartedTestContainer | undefined;

  beforeAll(async () => {
    container = await new GenericContainer('valkey/valkey:8.1.3-alpine')
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
      .start();
  });

  afterAll(async () => {
    await container?.stop();
  });

  it('connects to Valkey and executes one isolated infrastructure probe job', async () => {
    if (container === undefined) throw new Error('Valkey test container is not initialized');
    const address = { host: container.getHost(), port: container.getMappedPort(6379) };
    const healthClient = await GlideClient.createClient({ addresses: [address] });
    expect(await healthClient.ping()).toBe('PONG');

    const queueClient = await GlideClient.createClient({ addresses: [address] });
    const workerClient = await GlideClient.createClient({ addresses: [address] });
    const queueName = `phase-1a-probe-${randomUUID()}`;
    const queue = new Queue<{ probe: boolean }>(queueName, {
      connection: createBullMqConnection(queueClient),
    });
    const worker = new Worker<{ probe: boolean }, boolean>(
      queueName,
      (job: Job<{ probe: boolean }>) => Promise.resolve(job.data.probe),
      { connection: createBullMqConnection(workerClient) },
    );

    try {
      await Promise.all([queue.waitUntilReady(), worker.waitUntilReady()]);
      const completion = new Promise<boolean>((resolve, reject) => {
        worker.once('completed', (_job, result) => resolve(result));
        worker.once('failed', (_job, error) => reject(error));
      });
      await queue.add(
        'connectivity-probe',
        { probe: true },
        {
          jobId: 'phase-1a-connectivity-probe',
          removeOnComplete: true,
          removeOnFail: true,
        },
      );

      await expect(completion).resolves.toBe(true);
    } finally {
      await worker.close();
      await queue.close();
      queueClient.close();
      workerClient.close();
      healthClient.close();
    }
  });
});
