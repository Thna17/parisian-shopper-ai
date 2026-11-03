export class BudgetExceededError extends Error {
  public readonly code = 'BUDGET_EXCEEDED';
  public constructor(
    message = 'Budget ceiling exceeded: generation request blocked fail-closed under active BudgetPolicy.',
  ) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

export class ActiveReservationNotFoundError extends Error {
  public readonly code = 'ACTIVE_RESERVATION_NOT_FOUND';
  public constructor(id?: string) {
    super(
      id
        ? `No active reservation in state RESERVED was found for reservation ID: ${id}.`
        : 'Outbound provider dispatch requires an active budget reservation in state RESERVED.',
    );
    this.name = 'ActiveReservationNotFoundError';
  }
}

export class ReservationExpiredError extends Error {
  public readonly code = 'RESERVATION_EXPIRED';
  public constructor(id: string, expiresAt: Date) {
    super(
      `Reservation ${id} expired at ${expiresAt.toISOString()} and can no longer be dispatched or settled.`,
    );
    this.name = 'ReservationExpiredError';
  }
}

export class ReservationStateTransitionError extends Error {
  public readonly code = 'INVALID_RESERVATION_STATE_TRANSITION';
  public constructor(fromState: string, toState: string) {
    super(`Illegal reservation state transition from ${fromState} to ${toState}.`);
    this.name = 'ReservationStateTransitionError';
  }
}

export class DuplicateSettlementError extends Error {
  public readonly code = 'DUPLICATE_SETTLEMENT';
  public constructor(settlementKey: string) {
    super(
      `Settlement with key ${settlementKey} has already been posted to the usage ledger. Duplicate billing prevented.`,
    );
    this.name = 'DuplicateSettlementError';
  }
}

export class ProviderCircuitBrokenError extends Error {
  public readonly code = 'PROVIDER_CIRCUIT_BROKEN';
  public constructor(providerId: string, modality: string) {
    super(
      `Circuit breaker is OPEN for provider ${providerId} on modality ${modality} due to consecutive failures. Requests fail closed immediately.`,
    );
    this.name = 'ProviderCircuitBrokenError';
  }
}

export class UnverifiedPricingError extends Error {
  public readonly code = 'UNVERIFIED_PRICING';
  public constructor(providerId: string, modelId: string) {
    super(
      `Pricing schedule for provider ${providerId} and model ${modelId} is missing or unverified. Paid dispatch blocked fail-closed.`,
    );
    this.name = 'UnverifiedPricingError';
  }
}

export class ExchangeRateUnavailableError extends Error {
  public readonly code = 'EXCHANGE_RATE_UNAVAILABLE';
  public constructor(fromCurrency: string, toCurrency: string) {
    super(
      `Authoritative foreign exchange rate conversion from ${fromCurrency} to ${toCurrency} is missing or unverified. Operation blocked fail-closed.`,
    );
    this.name = 'ExchangeRateUnavailableError';
  }
}

export class UnauthorizedProviderFallbackError extends Error {
  public readonly code = 'UNAUTHORIZED_PROVIDER_FALLBACK';
  public constructor(fallbackProvider: string) {
    super(
      `Fallback to provider ${fallbackProvider} is not permitted under the active BudgetPolicy allowedFallbacks list.`,
    );
    this.name = 'UnauthorizedProviderFallbackError';
  }
}

export class DestructivePurgeBlockedError extends Error {
  public readonly code = 'DESTRUCTIVE_PURGE_BLOCKED';
  public constructor() {
    super(
      'Destructive purge of financial usage ledger entries is disabled by default and blocked until W03-DEC-016 is formally approved.',
    );
    this.name = 'DestructivePurgeBlockedError';
  }
}

export class InsufficientBudgetPermissionError extends Error {
  public readonly code = 'INSUFFICIENT_BUDGET_PERMISSION';
  public constructor(permission: string) {
    super(`Operation requires permission: ${permission}.`);
    this.name = 'InsufficientBudgetPermissionError';
  }
}
