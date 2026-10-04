export interface OutboxEventDraft {
  topic: string;
  schemaVersion: number;
  idempotencyKey: string;
  aggregateType?: string;
  aggregateId?: string;
  payload: Readonly<Record<string, unknown>>;
  occurredAt: Date;
  availableAt: Date;
}

export interface OutboxWriter {
  append(event: OutboxEventDraft): Promise<string>;
}

export interface ApplicationTransactionContext {
  outbox: OutboxWriter;
}

export interface TransactionManager {
  run<T>(work: (context: ApplicationTransactionContext) => Promise<T>): Promise<T>;
}

export interface ClaimedOutboxEvent extends OutboxEventDraft {
  id: string;
  attemptCount: number;
}

export interface OutboxEventHandler {
  readonly topic: string;
  handle(event: ClaimedOutboxEvent): Promise<void>;
}
