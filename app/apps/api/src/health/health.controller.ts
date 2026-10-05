import { Controller, Get, Inject, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';

import { ReadinessService } from './readiness.service.js';

interface HealthResponse {
  status: 'ok';
}

@ApiTags('health')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  public constructor(@Inject(ReadinessService) private readonly readiness: ReadinessService) {}

  @Get()
  @ApiOkResponse({ description: 'Application and required dependencies are ready' })
  @ApiServiceUnavailableResponse({ description: 'A required dependency is unavailable' })
  public async health(): Promise<HealthResponse> {
    await this.readiness.assertReady();
    return { status: 'ok' };
  }

  @Get('live')
  @ApiOkResponse({ description: 'Application process is alive' })
  public live(): HealthResponse {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOkResponse({ description: 'Required dependencies are ready' })
  @ApiServiceUnavailableResponse({ description: 'A required dependency is unavailable' })
  public async ready(): Promise<HealthResponse> {
    await this.readiness.assertReady();
    return { status: 'ok' };
  }
}
