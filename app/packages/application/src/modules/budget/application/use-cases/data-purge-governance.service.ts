import { Injectable } from '@nestjs/common';
import { DestructivePurgeBlockedError } from '../../domain/budget-errors.js';

export interface PurgeEvaluationResult {
  readonly isPurgeAllowed: boolean;
  readonly reason: string;
  readonly decisionStatus: 'PROPOSED' | 'APPROVED';
}

@Injectable()
export class DataPurgeGovernanceService {
  private isW03Dec016Approved = false;

  /**
   * Asserts whether a destructive purge of financial ledger records is legally authorized.
   * By default, W03-DEC-016 is PROPOSED, blocking all automated destructive purges.
   */
  public assertPurgeAllowed(): void {
    if (!this.isW03Dec016Approved) {
      throw new DestructivePurgeBlockedError();
    }
  }

  public evaluatePurgeStatus(): PurgeEvaluationResult {
    if (!this.isW03Dec016Approved) {
      return {
        isPurgeAllowed: false,
        reason:
          'Destructive purge of financial usage ledger entries is disabled by default and blocked until W03-DEC-016 is formally approved by legal, finance, and operations.',
        decisionStatus: 'PROPOSED',
      };
    }

    return {
      isPurgeAllowed: true,
      reason: 'W03-DEC-016 has been formally approved. Data retention schedules may be applied.',
      decisionStatus: 'APPROVED',
    };
  }

  public setW03Dec016Approval(approved: boolean): void {
    this.isW03Dec016Approved = approved;
  }
}
