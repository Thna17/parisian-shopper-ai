import http from 'node:http';
import { jest } from '@jest/globals';
import { type DatabaseHealthIndicator } from '@parisian-shopper/database';
import {
  type PrometheusMetricsService,
  type ValkeyConnectionService,
} from '@parisian-shopper/jobs';
import { type PinoLoggerService } from '@parisian-shopper/logger';
import { WorkerHealthService } from '../worker-health.service.js';

interface HealthResponse {
  status?: string;
  error?: string;
}

describe('WorkerHealthService', () => {
  let service: WorkerHealthService;
  const mockDatabase = { ping: jest.fn<() => Promise<void>>() };
  const mockValkey = { ping: jest.fn<() => Promise<void>>() };
  const mockMetrics = { getPrometheusMetrics: jest.fn<() => Promise<string>>() };
  const mockLogger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  beforeEach(() => {
    process.env.WORKER_HEALTH_PORT = '0';
    process.env.WORKER_HEALTH_HOST = '127.0.0.1';
    mockDatabase.ping.mockReset().mockResolvedValue(undefined);
    mockValkey.ping.mockReset().mockResolvedValue(undefined);
    mockMetrics.getPrometheusMetrics.mockReset().mockResolvedValue('# HELP test metric\n');

    service = new WorkerHealthService(
      mockDatabase as unknown as DatabaseHealthIndicator,
      mockValkey as unknown as ValkeyConnectionService,
      mockMetrics as unknown as PrometheusMetricsService,
      mockLogger as unknown as PinoLoggerService,
    );
  });

  afterEach(async () => {
    delete process.env.WORKER_HEALTH_PORT;
    delete process.env.WORKER_HEALTH_HOST;
    await service.onModuleDestroy();
  });

  function makeRequest(
    path: string,
  ): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
    const port = service.getPort();
    return new Promise((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${port ?? 0}${path}`, (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            headers: res.headers,
            body,
          });
        });
      });
      req.on('error', reject);
    });
  }

  it('serves liveness probe on /health/live', async () => {
    await service.onModuleInit();
    const res = await makeRequest('/health/live');

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body) as HealthResponse;
    expect(parsed).toEqual({ status: 'ok' });
    expect(mockDatabase.ping).not.toHaveBeenCalled();
    expect(mockValkey.ping).not.toHaveBeenCalled();
  });

  it('serves readiness probe on /health/ready when dependencies are healthy', async () => {
    await service.onModuleInit();
    const res = await makeRequest('/health/ready');

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body) as HealthResponse;
    expect(parsed).toEqual({ status: 'ok' });
    expect(mockDatabase.ping).toHaveBeenCalledTimes(1);
    expect(mockValkey.ping).toHaveBeenCalledTimes(1);
  });

  it('returns 503 when a dependency fails in readiness probe', async () => {
    mockValkey.ping.mockRejectedValueOnce(new Error('Valkey connection refused'));
    await service.onModuleInit();
    const res = await makeRequest('/health/ready');

    expect(res.statusCode).toBe(503);
    const parsed = JSON.parse(res.body) as HealthResponse;
    expect(parsed.status).toBe('unavailable');
    expect(parsed.error).toContain('Valkey connection refused');
  });

  it('serves prometheus metrics on /metrics', async () => {
    mockMetrics.getPrometheusMetrics.mockResolvedValueOnce(
      '# HELP custom_metric counter\ncustom_metric 42\n',
    );
    await service.onModuleInit();
    const res = await makeRequest('/metrics');

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.body).toContain('custom_metric 42');
  });

  it('returns 404 for unknown endpoints', async () => {
    await service.onModuleInit();
    const res = await makeRequest('/unknown-path');

    expect(res.statusCode).toBe(404);
  });
});
