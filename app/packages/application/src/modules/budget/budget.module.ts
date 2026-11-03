import { Module } from '@nestjs/common';
import { CircuitBreakerService } from './domain/circuit-breaker.js';
import { SafePromptDigestService } from './domain/safe-prompt-digest.service.js';
import { CancelReservationUseCase } from './application/use-cases/cancel-reservation.use-case.js';
import { DataPurgeGovernanceService } from './application/use-cases/data-purge-governance.service.js';
import { DispatchProviderAttemptUseCase } from './application/use-cases/dispatch-provider-attempt.use-case.js';
import { ProviderRouterService } from './application/use-cases/provider-router.service.js';
import { ReconcileHeldReservationUseCase } from './application/use-cases/reconcile-held-reservation.use-case.js';
import { ReserveBudgetUseCase } from './application/use-cases/reserve-budget.use-case.js';
import { SettleReservationUseCase } from './application/use-cases/settle-reservation.use-case.js';

@Module({
  providers: [
    CircuitBreakerService,
    SafePromptDigestService,
    ReserveBudgetUseCase,
    DispatchProviderAttemptUseCase,
    SettleReservationUseCase,
    CancelReservationUseCase,
    ReconcileHeldReservationUseCase,
    ProviderRouterService,
    DataPurgeGovernanceService,
  ],
  exports: [
    CircuitBreakerService,
    SafePromptDigestService,
    ReserveBudgetUseCase,
    DispatchProviderAttemptUseCase,
    SettleReservationUseCase,
    CancelReservationUseCase,
    ReconcileHeldReservationUseCase,
    ProviderRouterService,
    DataPurgeGovernanceService,
  ],
})
export class BudgetModule {}
