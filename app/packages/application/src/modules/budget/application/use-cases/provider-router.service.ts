import { Inject, Injectable } from '@nestjs/common';
import { UnauthorizedProviderFallbackError } from '../../domain/budget-errors.js';
import {
  type AiModality,
  type CostKnowledgeState,
  type EnvironmentTier,
  type ProviderCapabilityRegistrationRecord,
} from '../../domain/budget.types.js';
import { CircuitBreakerService } from '../../domain/circuit-breaker.js';
import {
  BUDGET_POLICY_REPOSITORY,
  type BudgetPolicyRepository,
} from '../ports/budget-policy.repository.js';
import {
  PROVIDER_CAPABILITY_REPOSITORY,
  type ProviderCapabilityRepository,
} from '../ports/provider-capability.repository.js';

export interface RouteProviderRequest {
  readonly modality: AiModality;
  readonly capability: string;
  readonly preferredProviderId?: string | undefined;
  readonly environment?: EnvironmentTier | undefined;
  readonly operationType?: 'EDIT_TEXT' | 'RELAYOUT' | 'SYNTHESIS' | undefined;
}

export interface RouteProviderResult {
  readonly providerId: string;
  readonly modelId: string;
  readonly estimatedCost: number;
  readonly costKnowledge: CostKnowledgeState;
  readonly isZeroCost: boolean;
  readonly isFallback: boolean;
  readonly capability: ProviderCapabilityRegistrationRecord;
}

@Injectable()
export class ProviderRouterService {
  public constructor(
    @Inject(PROVIDER_CAPABILITY_REPOSITORY)
    private readonly capabilityRepo: ProviderCapabilityRepository,
    @Inject(BUDGET_POLICY_REPOSITORY)
    private readonly budgetPolicyRepo: BudgetPolicyRepository,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {}

  /**
   * Deterministic operation pricing (AC-12):
   * Revisions (EDIT_TEXT, RELAYOUT) cost $0.00 (ZERO_CONFIRMED).
   */
  public evaluateOperationCost(operationType?: string): {
    estimatedCost: number;
    costKnowledge: CostKnowledgeState;
    isZeroCost: boolean;
  } {
    if (operationType === 'EDIT_TEXT' || operationType === 'RELAYOUT') {
      return {
        estimatedCost: 0,
        costKnowledge: 'ZERO_CONFIRMED',
        isZeroCost: true,
      };
    }

    return {
      estimatedCost: 0.05,
      costKnowledge: 'ESTIMATED',
      isZeroCost: false,
    };
  }

  /**
   * Selects an authorized, active, circuit-healthy provider capability.
   * Enforces fail-closed fallback governance (AC-13).
   */
  public async selectProvider(request: RouteProviderRequest): Promise<RouteProviderResult> {
    const policy = await this.budgetPolicyRepo.getActivePolicy();
    const allowedProviders = policy?.allowedProviders ?? ['openai', 'codex_cli', 'fake'];
    const allowedFallbacks = policy?.allowedFallbacks ?? ['codex_cli', 'fake'];

    const env = request.environment ?? 'DEVELOPMENT';
    const capabilities = await this.capabilityRepo.listActiveCapabilities(request.modality, env);

    const matching = capabilities.filter((c) =>
      c.supportedCapabilities.includes(request.capability),
    );

    // If deterministic zero-cost edit/relayout
    const costInfo = this.evaluateOperationCost(request.operationType);

    // 1. Try preferred provider if authorized
    if (request.preferredProviderId) {
      if (allowedProviders.includes(request.preferredProviderId)) {
        const preferredCap = matching.find(
          (c) => c.providerId.toLowerCase() === request.preferredProviderId?.toLowerCase(),
        );

        if (preferredCap) {
          try {
            this.circuitBreaker.assertHealthy(preferredCap.providerId, request.modality);
            return {
              providerId: preferredCap.providerId,
              modelId: preferredCap.modelId,
              estimatedCost: costInfo.estimatedCost,
              costKnowledge: costInfo.costKnowledge,
              isZeroCost: costInfo.isZeroCost,
              isFallback: false,
              capability: preferredCap,
            };
          } catch {
            // Circuit is OPEN, proceed to authorized fallback
          }
        }
      }
    }

    // 2. Select first healthy allowed primary provider
    for (const cap of matching) {
      if (allowedProviders.includes(cap.providerId)) {
        try {
          this.circuitBreaker.assertHealthy(cap.providerId, request.modality);
          return {
            providerId: cap.providerId,
            modelId: cap.modelId,
            estimatedCost: costInfo.estimatedCost,
            costKnowledge: costInfo.costKnowledge,
            isZeroCost: costInfo.isZeroCost,
            isFallback: false,
            capability: cap,
          };
        } catch {
          // Circuit open, check next
        }
      }
    }

    // 3. Fallback routing (AC-13): Fail-closed unless explicitly in allowedFallbacks
    for (const cap of matching) {
      if (allowedFallbacks.includes(cap.providerId)) {
        try {
          this.circuitBreaker.assertHealthy(cap.providerId, request.modality);
          return {
            providerId: cap.providerId,
            modelId: cap.modelId,
            estimatedCost: 0,
            costKnowledge: 'ZERO_CONFIRMED',
            isZeroCost: true,
            isFallback: true,
            capability: cap,
          };
        } catch {
          // Circuit open
        }
      }
    }

    // Fail closed: fallback unauthorized or all broken
    throw new UnauthorizedProviderFallbackError(
      `No authorized healthy provider or fallback available for modality ${request.modality} and capability ${request.capability}.`,
    );
  }
}
