import { Inject, Injectable } from '@nestjs/common';
import { InfrastructureError } from '@parisian-shopper/common';
import { DatabaseHealthIndicator } from '@parisian-shopper/database';
import { ValkeyConnectionService } from '@parisian-shopper/jobs';

@Injectable()
export class ReadinessService {
  public constructor(
    @Inject(DatabaseHealthIndicator) private readonly database: DatabaseHealthIndicator,
    @Inject(ValkeyConnectionService) private readonly valkey: ValkeyConnectionService,
  ) {}

  public async assertReady(): Promise<void> {
    try {
      await Promise.all([this.database.ping(), this.valkey.ping()]);
    } catch (error: unknown) {
      throw new InfrastructureError({
        publicMessage: 'Application dependencies are not ready',
        cause: error,
      });
    }
  }
}
