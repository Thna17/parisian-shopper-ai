import { Module } from '@nestjs/common';
import { ApplicationModule } from '@parisian-shopper/application';
import { AppConfigModule } from '@parisian-shopper/config';
import { DatabaseModule } from '@parisian-shopper/database';
import { JobsModule } from '@parisian-shopper/jobs';
import { LoggerModule } from '@parisian-shopper/logger';

@Module({
  imports: [AppConfigModule, LoggerModule, DatabaseModule, JobsModule, ApplicationModule],
})
export class WorkerModule {}
