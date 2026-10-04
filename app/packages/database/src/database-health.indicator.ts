import { Injectable } from '@nestjs/common';

import { PrismaService } from './prisma.service.js';

@Injectable()
export class DatabaseHealthIndicator {
  public constructor(private readonly prisma: PrismaService) {}

  public async ping(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }
}
