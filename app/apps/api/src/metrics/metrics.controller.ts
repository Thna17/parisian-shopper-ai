import { Controller, Get, Header, Inject, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PrometheusMetricsService } from '@parisian-shopper/jobs';

@ApiTags('metrics')
@Controller({ path: 'metrics', version: VERSION_NEUTRAL })
export class MetricsController {
  public constructor(
    @Inject(PrometheusMetricsService)
    private readonly metrics: PrometheusMetricsService,
  ) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOkResponse({ description: 'Prometheus metrics exposition format' })
  public async getMetrics(): Promise<string> {
    return this.metrics.getPrometheusMetrics();
  }
}
