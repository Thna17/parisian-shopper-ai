import { Injectable } from '@nestjs/common';
import { type ClaimedOutboxEvent } from '@parisian-shopper/common';
import { type OutboxRelayRepository } from '@parisian-shopper/application';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma.service.js';

const OUTBOX_LEASE_MS = 5 * 60 * 1_000; // 5 minutes

@Injectable()
export class PrismaOutboxRelayRepository implements OutboxRelayRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async claimEvents(
    topics: readonly string[],
    limit: number,
    now: Date,
  ): Promise<readonly ClaimedOutboxEvent[]> {
    if (topics.length === 0) return [];
    return this.prisma.$transaction(async (tx) => {
      const staleBefore = new Date(now.getTime() - OUTBOX_LEASE_MS);
      const rows = await tx.$queryRaw<readonly { id: string }[]>`
        SELECT id FROM outbox_events
        WHERE topic IN (${Prisma.join(topics)})
          AND processed_at IS NULL
          AND available_at <= ${now}
          AND (claimed_at IS NULL OR claimed_at < ${staleBefore})
        ORDER BY occurred_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED`;
      const ids = rows.map((row) => row.id);
      if (ids.length === 0) return [];
      await tx.outboxEvent.updateMany({
        where: { id: { in: ids } },
        data: { claimedAt: now, attemptCount: { increment: 1 } },
      });
      const events = await tx.outboxEvent.findMany({ where: { id: { in: ids } } });
      return events.map((event) => ({
        id: event.id,
        topic: event.topic,
        schemaVersion: event.schemaVersion,
        idempotencyKey: event.idempotencyKey,
        ...(event.aggregateType ? { aggregateType: event.aggregateType } : {}),
        ...(event.aggregateId ? { aggregateId: event.aggregateId } : {}),
        payload: event.payload as Readonly<Record<string, unknown>>,
        occurredAt: event.occurredAt,
        availableAt: event.availableAt,
        attemptCount: event.attemptCount,
      }));
    });
  }

  public async markProcessed(eventId: string, now: Date): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id: eventId },
      data: { processedAt: now },
    });
  }

  public async markFailed(
    eventId: string,
    errorCode: string,
    retryAt: Date,
    terminal: boolean,
  ): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id: eventId },
      data: {
        lastErrorCode: errorCode,
        availableAt: terminal ? new Date('9999-12-31T23:59:59Z') : retryAt,
        processedAt: terminal ? retryAt : null,
      },
    });
  }
}
