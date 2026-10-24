import { Module } from '@nestjs/common';
import { JobsModule } from '@parisian-shopper/jobs';

import { MetricsController } from './metrics.controller.js';

@Module({
  imports: [JobsModule],
  controllers: [MetricsController],
})
export class MetricsModule {}
