import { type ClaimedOutboxEvent } from '@parisian-shopper/common';

export const OUTBOX_RELAY_REPOSITORY = Symbol('OUTBOX_RELAY_REPOSITORY');

export interface OutboxRelayRepository {
  claimEvents(
    topics: readonly string[],
    limit: number,
    now: Date,
  ): Promise<readonly ClaimedOutboxEvent[]>;
  markProcessed(eventId: string, now: Date): Promise<void>;
  markFailed(
    eventId: string,
    errorCode: string,
    retryAt: Date,
    terminal: boolean,
  ): Promise<void>;
}
