export class BudgetExhaustedError extends Error {
  public readonly code = 'BUDGET_EXHAUSTED';
  constructor(
    message = 'Operational AI budget ceiling has been reached. Paid generation requests are temporarily suspended.',
  ) {
    super(message);
    this.name = 'BudgetExhaustedError';
  }
}

export class InsufficientBudgetError extends Error {
  public readonly code = 'INSUFFICIENT_BUDGET';
  constructor(required: number, available: number) {
    super(
      `Insufficient budget headroom: required $${required.toFixed(4)}, available $${available.toFixed(4)}.`,
    );
    this.name = 'InsufficientBudgetError';
  }
}

export class BudgetPolicyNotFoundError extends Error {
  public readonly code = 'BUDGET_POLICY_NOT_FOUND';
  constructor(id?: string) {
    super(id ? `Budget policy ${id} was not found.` : 'No active budget policy is configured.');
    this.name = 'BudgetPolicyNotFoundError';
  }
}

export class ReservationNotFoundError extends Error {
  public readonly code = 'RESERVATION_NOT_FOUND';
  constructor(id: string) {
    super(`Cost reservation ${id} was not found.`);
    this.name = 'ReservationNotFoundError';
  }
}

export class DuplicateReservationError extends Error {
  public readonly code = 'DUPLICATE_RESERVATION';
  constructor(key: string) {
    super(`Reservation with idempotency key ${key} already exists.`);
    this.name = 'DuplicateReservationError';
  }
}

export class InsufficientAnalyticsPermissionError extends Error {
  public readonly code = 'INSUFFICIENT_PERMISSION';
  constructor(permission: string) {
    super(`Requires ${permission} permission.`);
    this.name = 'InsufficientAnalyticsPermissionError';
  }
}
