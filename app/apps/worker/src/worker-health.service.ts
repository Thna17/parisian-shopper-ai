import http, { type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { withTimeout } from '@parisian-shopper/common';
import { DatabaseHealthIndicator } from '@parisian-shopper/database';
import { PrometheusMetricsService, ValkeyConnectionService } from '@parisian-shopper/jobs';
import { PinoLoggerService } from '@parisian-shopper/logger';

@Injectable()
export class WorkerHealthService implements OnModuleInit, OnModuleDestroy {
  private server: Server | undefined;

  public constructor(
    @Inject(DatabaseHealthIndicator)
    private readonly database: DatabaseHealthIndicator,
    @Inject(ValkeyConnectionService)
    private readonly valkey: ValkeyConnectionService,
    @Inject(PrometheusMetricsService)
    private readonly metrics: PrometheusMetricsService,
    @Inject(PinoLoggerService)
    private readonly logger: PinoLoggerService,
  ) {}

  public onModuleInit(): Promise<void> {
    return new Promise((resolve) => {
      const port = Number(process.env.WORKER_HEALTH_PORT || 8081);
      const host = process.env.WORKER_HEALTH_HOST || '0.0.0.0';

      this.server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
        void this.handleRequest(req, res);
      });

      this.server.listen(port, host, () => {
        this.logger.log(
          `Worker health and metrics probe server listening on http://${host}:${port}`,
          {
            action: 'worker_health_server_started',
            port,
            host,
          },
        );
        resolve();
      });

      this.server.on('error', (err) => {
        this.logger.warn('Worker health server error or port in use', {
          action: 'worker_health_server_error',
          error: err.message,
        });
        resolve();
      });
    });
  }

  public getPort(): number | undefined {
    const address = this.server?.address();
    if (address && typeof address === 'object') {
      return address.port;
    }
    return undefined;
  }

  public async onModuleDestroy(): Promise<void> {
    if (this.server !== undefined) {
      const server = this.server;
      this.server = undefined;
      const closeServer = new Promise<void>((resolve) => {
        if (typeof server.closeAllConnections === 'function') {
          server.closeAllConnections();
        }
        server.close(() => resolve());
      });
      try {
        await withTimeout(closeServer, 30_000, 'Worker health server close');
      } catch {
        // do not block exit
      }
    }
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? '/';

    if (url === '/health/live') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (url === '/health/ready' || url === '/health') {
      try {
        await Promise.all([this.database.ping(), this.valkey.ping()]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } catch (error) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'unavailable',
            error: error instanceof Error ? error.message : 'Dependency unavailable',
          }),
        );
      }
      return;
    }

    if (url === '/metrics') {
      try {
        const output = await this.metrics.getPrometheusMetrics();
        res.writeHead(200, {
          'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        });
        res.end(output);
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(
          `Error generating metrics: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }
}
