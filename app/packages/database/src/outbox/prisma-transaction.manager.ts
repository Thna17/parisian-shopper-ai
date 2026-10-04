import {
  type ApplicationTransactionContext,
  type OutboxEventDraft,
  type OutboxWriter,
  type TransactionManager,
} from '@parisian-shopper/common';
import { type Prisma } from '@prisma/client';

import { PrismaService } from '../prisma.service.js';

export const TRANSACTION_MANAGER = Symbol('TRANSACTION_MANAGER');

class PrismaOutboxWriter implements OutboxWriter {
  public constructor(private readonly transaction: Prisma.TransactionClient) {}

  public async append(event: OutboxEventDraft): Promise<string> {
    const result = await this.transaction.outboxEvent.create({
      data: {
        topic: event.topic,
        schemaVersion: event.schemaVersion,
        idempotencyKey: event.idempotencyKey,
        payload: toJsonObject(event.payload),
        occurredAt: event.occurredAt,
        availableAt: event.availableAt,
        ...(event.aggregateType === undefined ? {} : { aggregateType: event.aggregateType }),
        ...(event.aggregateId === undefined ? {} : { aggregateId: event.aggregateId }),
      },
      select: { id: true },
    });

    return result.id;
  }
}

export class PrismaTransactionManager implements TransactionManager {
  public constructor(private readonly prisma: PrismaService) {}

  public async run<T>(work: (context: ApplicationTransactionContext) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (transaction) =>
      work({ outbox: new PrismaOutboxWriter(transaction) }),
    );
  }
}

function toJsonObject(value: Readonly<Record<string, unknown>>): Prisma.InputJsonObject {
  const result: Record<string, Prisma.InputJsonValue | null> = {};
  for (const [key, item] of Object.entries(value)) {
    const converted = toJsonValue(item);
    if (converted !== undefined) {
      result[key] = converted;
    }
  }
  return result;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | null | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => {
      const converted = toJsonValue(item);
      if (converted === undefined) {
        throw new TypeError('Outbox payload arrays cannot contain undefined or non-JSON values');
      }
      return converted;
    });
  }
  if (typeof value === 'object') {
    return toJsonObject(value as Readonly<Record<string, unknown>>);
  }
  if (value === undefined) {
    return undefined;
  }
  throw new TypeError('Outbox payload must contain only JSON-compatible values');
}
