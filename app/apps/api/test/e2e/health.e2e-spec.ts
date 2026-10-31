import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DatabaseHealthIndicator, PrismaService } from '@parisian-shopper/database';
import {
  ContentGenerationQueue,
  CreativeGenerationQueue,
  ValkeyConnectionService,
} from '@parisian-shopper/jobs';
import { jest } from '@jest/globals';
import { type Server } from 'node:http';
import request from 'supertest';

import { AppModule } from '../../src/app.module.js';
import { configureApi } from '../../src/bootstrap.js';

describe('API foundation (e2e)', () => {
  let application: INestApplication;
  let server: Server;
  const databaseHealth = { ping: jest.fn<Promise<void>, []>() };
  const valkeyHealth = { ping: jest.fn<Promise<void>, []>() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
        $transaction: jest.fn().mockImplementation(() => Promise.resolve([])),
      })
      .overrideProvider(DatabaseHealthIndicator)
      .useValue(databaseHealth)
      .overrideProvider(ValkeyConnectionService)
      .useValue(valkeyHealth)
      .overrideProvider(CreativeGenerationQueue)
      .useValue({ enqueue: jest.fn(), onModuleInit: jest.fn() })
      .overrideProvider(ContentGenerationQueue)
      .useValue({ enqueue: jest.fn(), onModuleInit: jest.fn() })
      .compile();

    application = module.createNestApplication();
    configureApi(application);
    await application.init();
    server = application.getHttpServer() as Server;
  });

  afterAll(async () => {
    if (server) {
      server.closeAllConnections?.();
      if (server.listening) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }
    if (application) {
      await application.close();
    }
  });

  beforeEach(() => {
    databaseHealth.ping.mockReset().mockResolvedValue(undefined);
    valkeyHealth.ping.mockReset().mockResolvedValue(undefined);
  });

  it('boots and reports liveness without probing dependencies', async () => {
    await request(server).get('/health/live').expect(200).expect({ status: 'ok' });

    expect(databaseHealth.ping).not.toHaveBeenCalled();
    expect(valkeyHealth.ping).not.toHaveBeenCalled();
  });

  it('reports readiness after PostgreSQL and Valkey checks', async () => {
    await request(server)
      .get('/health/ready')
      .set('x-request-id', 'acceptance-request-1')
      .expect('x-request-id', 'acceptance-request-1')
      .expect(200)
      .expect({ status: 'ok' });

    expect(databaseHealth.ping).toHaveBeenCalledTimes(1);
    expect(valkeyHealth.ping).toHaveBeenCalledTimes(1);
  });

  it('returns a safe error envelope when readiness fails', async () => {
    databaseHealth.ping.mockRejectedValueOnce(new Error('postgresql://secret@internal'));

    const response = await request(server)
      .get('/health')
      .set('x-request-id', 'acceptance-request-2')
      .expect(503);

    expect(response.body as unknown).toEqual({
      error: {
        code: 'INFRASTRUCTURE_ERROR',
        message: 'Application dependencies are not ready',
        requestId: 'acceptance-request-2',
      },
    });
    expect(JSON.stringify(response.body as unknown)).not.toContain('postgresql://secret@internal');
  });

  it('returns a stable error structure for unknown routes', async () => {
    const response = await request(server).get('/not-present').expect(404);
    const body = response.body as {
      error: { code: string; message: string; requestId: string };
    };

    expect(body.error.code).toBe('HTTP_404');
    expect(body.error.message).toBe('Cannot GET /not-present');
    expect(body.error.requestId).toEqual(expect.any(String));
  });

  it('exposes prometheus metrics on /metrics', async () => {
    const response = await request(server).get('/metrics').expect(200);

    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('process_resident_memory_bytes');
    expect(response.text).toContain('nodejs_heap_used_bytes');
    expect(response.text).toContain('bullmq_queue_depth');
    expect(response.text).toContain('ai_token_expenditure_total');
  });
});
