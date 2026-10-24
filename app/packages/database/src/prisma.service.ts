import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { withTimeout } from '@parisian-shopper/common';

const SHUTDOWN_TIMEOUT_MS = 30_000;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  public async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  public async onModuleDestroy(): Promise<void> {
    try {
      await withTimeout(
        this.$disconnect(),
        SHUTDOWN_TIMEOUT_MS,
        'Prisma connection pool disconnect',
      );
    } catch {
      // Do not block container termination
    }
  }
}
