import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  type ApplicationLogger,
  APPLICATION_LOGGER,
  type Clock,
  CLOCK,
  ForbiddenError,
  SystemClock,
} from '@parisian-shopper/common';

import { Permission, PermissionService } from '../../auth/domain/permissions.js';
import { FreshnessEvaluator } from '../domain/freshness-evaluator.js';
import {
  FRESHNESS_POLICY_REPOSITORY,
  type FreshnessPolicyRepository,
} from '../domain/freshness-policy.js';
import {
  formatFreshnessPresentation,
  type FreshnessState,
  type ProductFreshnessPresentation,
  type RevalidationOutcome,
  SourceAvailability,
} from '../domain/freshness-state.js';
import { createHash } from 'node:crypto';
import {
  FreshnessPolicyMissingError,
  ProductSnapshotNotFoundError,
  ProductSourceAuthFailedError,
  ProductSourceRateLimitedError,
  ProductSourceResponseInvalidError,
  ProductSourceTimeoutError,
} from '../domain/product-errors.js';
import { canonicalJson, type ProductDependencyScope } from './product-snapshot-hash.js';
import {
  PRODUCT_FRESHNESS_ASSESSMENT_REPOSITORY,
  type ProductFreshnessAssessment,
  type ProductFreshnessAssessmentRepository,
} from './product-freshness-assessment.repository.js';
import {
  PRODUCT_REVALIDATION_UNIT_OF_WORK,
  type ProductRevalidationUnitOfWork,
  type RevalidationOutboxDraft,
} from './product-revalidation-unit-of-work.port.js';
import {
  PRODUCT_NORMALIZER_VERSION,
  PRODUCT_SNAPSHOT_REPOSITORY,
  type ProductSnapshot,
  type ProductSnapshotRepository,
} from './product-snapshot.repository.js';
import { PRODUCT_SOURCE, type ProductSource } from './product-source.port.js';

export function buildRevalidationIdempotencyKey(params: {
  environment: string;
  targetId: string;
  policyId: string;
  policyVersion: string;
  actorUserId: string;
  callerKey: string;
}): string {
  const payload = {
    actorUserId: params.actorUserId,
    callerKey: params.callerKey,
    environment: params.environment,
    operation: 'revalidate',
    policyId: params.policyId,
    policyVersion: params.policyVersion,
    targetId: params.targetId,
  };
  const hash = createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex');
  return `reval:v1:${hash}`;
}

export interface RevalidateProductSnapshotInput {
  readonly sku?: string | undefined;
  readonly snapshotId?: string | undefined;
  readonly environment?: 'development' | 'test' | 'staging' | 'production' | undefined;
  readonly correlationId?: string | undefined;
  readonly idempotencyKey?: string | undefined;
  readonly actor: {
    readonly userId: string;
    readonly roles: readonly string[];
  };
}

export interface RevalidateProductSnapshotResult {
  readonly currentSnapshot: ProductSnapshot;
  readonly previousSnapshotId: string;
  readonly isNewSnapshotCreated: boolean;
  readonly freshnessState: FreshnessState;
  readonly revalidationOutcome: RevalidationOutcome;
  readonly sourceAvailability: SourceAvailability;
  readonly reasonCodes: readonly string[];
  readonly changedScopes: readonly ProductDependencyScope[];
  readonly assessment: ProductFreshnessAssessment;
  readonly presentation: ProductFreshnessPresentation;
}

@Injectable()
export class RevalidateProductSnapshotUseCase {
  private readonly permissions: PermissionService;
  private readonly clock: Clock;
  private readonly evaluator: FreshnessEvaluator;

  public constructor(
    @Inject(PRODUCT_SNAPSHOT_REPOSITORY)
    private readonly snapshots: ProductSnapshotRepository,
    @Inject(PRODUCT_FRESHNESS_ASSESSMENT_REPOSITORY)
    private readonly assessments: ProductFreshnessAssessmentRepository,
    @Inject(FRESHNESS_POLICY_REPOSITORY)
    private readonly policyRepo: FreshnessPolicyRepository,
    @Inject(PRODUCT_SOURCE)
    private readonly productSource: ProductSource,
    @Inject(PRODUCT_REVALIDATION_UNIT_OF_WORK)
    private readonly unitOfWork: ProductRevalidationUnitOfWork,
    @Inject(APPLICATION_LOGGER)
    private readonly logger: ApplicationLogger,
    @Optional()
    @Inject(CLOCK)
    clock?: Clock,
    @Optional()
    permissions?: PermissionService,
    @Optional()
    evaluator?: FreshnessEvaluator,
  ) {
    this.clock = clock ?? new SystemClock();
    this.permissions = permissions ?? new PermissionService();
    this.evaluator = evaluator ?? new FreshnessEvaluator();
  }

  public async execute(
    input: RevalidateProductSnapshotInput,
  ): Promise<RevalidateProductSnapshotResult> {
    const startedAt = this.clock.nowEpochMs();

    // 1. Authorization check: requires CREATE_CONTENT or EDIT_CREATIVE
    if (
      !this.permissions.hasAnyRolePermission(input.actor.roles, Permission.CREATE_CONTENT) &&
      !this.permissions.hasAnyRolePermission(input.actor.roles, Permission.EDIT_CREATIVE)
    ) {
      throw new ForbiddenError({
        publicMessage: 'Permission denied: Cannot revalidate product snapshots.',
      });
    }

    // 2. Load existing snapshot
    let snapshot: ProductSnapshot | null = null;
    if (input.snapshotId) {
      snapshot = await this.snapshots.findById(input.snapshotId);
      if (!snapshot) {
        throw new ProductSnapshotNotFoundError(input.snapshotId);
      }
    } else if (input.sku) {
      if (this.snapshots.findLatestBySku) {
        snapshot = await this.snapshots.findLatestBySku(input.sku);
      }
      if (!snapshot) {
        throw new ProductSnapshotNotFoundError(input.sku);
      }
    } else {
      throw new ProductSnapshotNotFoundError('Unknown');
    }

    const currentSnapshot = snapshot;

    // 3. Load active policy for environment
    const targetEnv =
      input.environment ??
      (process.env.NODE_ENV as 'development' | 'test' | 'staging' | 'production') ??
      'development';

    const policy = await this.policyRepo.findActivePolicy(targetEnv);
    if (!policy) {
      throw new FreshnessPolicyMissingError(
        `No active approved FreshnessPolicy found for environment "${targetEnv}". Production activation is blocked by W03-DEC-002.`,
      );
    }

    // 4. Build compound idempotency key and perform replay check
    let compoundKey: string | undefined;
    if (input.idempotencyKey) {
      compoundKey = buildRevalidationIdempotencyKey({
        environment: targetEnv,
        targetId: input.snapshotId ?? currentSnapshot.id,
        policyId: policy.policyId,
        policyVersion: policy.version,
        actorUserId: input.actor.userId,
        callerKey: input.idempotencyKey,
      });

      const existing = await this.assessments.findByIdempotencyKey(compoundKey);
      if (existing) {
        const storedSnapshot =
          (await this.snapshots.findById(existing.snapshotId)) ?? currentSnapshot;
        const presentation = formatFreshnessPresentation(
          existing.freshnessState,
          existing.revalidationOutcome,
          existing.sourceAvailability,
        );

        const evidence = existing.evidence as Record<string, unknown> | undefined;
        const changedScopes = (evidence?.changedScopes as ProductDependencyScope[]) ?? [];
        const isNewSnapshotCreated = Boolean(evidence?.newSnapshotCreated);

        return {
          currentSnapshot: storedSnapshot,
          previousSnapshotId: existing.comparedSnapshotId ?? currentSnapshot.id,
          isNewSnapshotCreated,
          freshnessState: existing.freshnessState,
          revalidationOutcome: existing.revalidationOutcome,
          sourceAvailability: existing.sourceAvailability,
          reasonCodes: existing.reasonCodes,
          changedScopes,
          assessment: existing,
          presentation,
        };
      }
    }

    const evaluationTime = this.clock.now();
    const sku = currentSnapshot.product.product.sku;

    // 5. Query upstream product source
    let sourceAvailability: SourceAvailability = SourceAvailability.AVAILABLE;
    let upstreamResult: Awaited<ReturnType<typeof this.productSource.getBySku>> | null = null;
    let safeErrorCategory: string | undefined;

    try {
      upstreamResult = await this.productSource.getBySku(sku);
    } catch (error) {
      sourceAvailability = SourceAvailability.UNREACHABLE;
      safeErrorCategory =
        error instanceof ProductSourceTimeoutError
          ? 'TIMEOUT'
          : error instanceof ProductSourceAuthFailedError
            ? 'AUTH_FAILED'
            : error instanceof ProductSourceRateLimitedError
              ? 'RATE_LIMITED'
              : error instanceof ProductSourceResponseInvalidError
                ? 'INVALID_RESPONSE'
                : 'UNAVAILABLE';
    }

    // 6. Evaluate revalidation using FreshnessEvaluator domain service
    const evalResult = this.evaluator.evaluateRevalidation({
      snapshot: currentSnapshot,
      policy,
      clock: this.clock,
      sourceAvailability,
      upstreamProduct: upstreamResult,
      safeErrorCategory,
    });

    // 7. Atomic transaction via ProductRevalidationUnitOfWork
    let persistenceResult: Awaited<ReturnType<typeof this.unitOfWork.execute>>;
    try {
      persistenceResult = await this.unitOfWork.execute({
        currentSnapshot,
        newSnapshotInput:
          evalResult.newSnapshotNeeded && upstreamResult && evalResult.newHashes
            ? {
                product: upstreamResult,
                snapshotHash: evalResult.newHashes.full,
                dependencyHashes: evalResult.newHashes,
                normalizerVersion: PRODUCT_NORMALIZER_VERSION,
              }
            : undefined,
        assessment: (snapshotId) => ({
          snapshotId,
          evaluatedAt: evaluationTime,
          policyId: policy.policyId,
          policyVersion: policy.version,
          freshnessState: evalResult.freshnessState,
          revalidationOutcome: evalResult.revalidationOutcome,
          sourceAvailability: evalResult.sourceAvailability,
          reasonCodes: [...evalResult.reasonCodes],
          evidence: {
            changedScopes: evalResult.changedScopes,
            preservedScopes: evalResult.preservedScopes,
            correlationId: input.correlationId,
            durationMs: Math.max(0, this.clock.nowEpochMs() - startedAt),
            newSnapshotCreated: evalResult.newSnapshotNeeded,
            policyId: policy.policyId,
            policyVersion: policy.version,
            previousSnapshotId: currentSnapshot.id,
            sku,
            ...(safeErrorCategory ? { errorCategory: safeErrorCategory } : {}),
            ...(upstreamResult === null && sourceAvailability === SourceAvailability.AVAILABLE
              ? { upstreamStatus: 'NOT_FOUND' }
              : {}),
          },
          comparedSnapshotId: evalResult.isMaterial ? currentSnapshot.id : undefined,
          actorUserId: input.actor.userId,
          idempotencyKey: compoundKey,
        }),
        outboxEvents: ({ snapshot: finalSnapshot, assessment: finalAssessment }) => {
          const events: RevalidationOutboxDraft[] = [];

          if (evalResult.newSnapshotNeeded) {
            events.push({
              topic: 'product.snapshot.created',
              schemaVersion: 1,
              idempotencyKey: `snapshot-created-${finalSnapshot.id}`,
              aggregateType: 'ProductSnapshot',
              aggregateId: finalSnapshot.id,
              payload: {
                snapshotId: finalSnapshot.id,
                sku,
                snapshotHash: finalSnapshot.snapshotHash,
                dependencyHashes: finalSnapshot.dependencyHashes,
                retrievedAt: finalSnapshot.product.retrieved_at,
                createdAt: finalSnapshot.createdAt.toISOString(),
              },
              occurredAt: evaluationTime,
              availableAt: evaluationTime,
            });

            events.push({
              topic: 'product.facts.material_change_detected',
              schemaVersion: 1,
              idempotencyKey: `facts-changed-${finalSnapshot.id}`,
              aggregateType: 'ProductSnapshot',
              aggregateId: finalSnapshot.id,
              payload: {
                previousSnapshotId: currentSnapshot.id,
                newSnapshotId: finalSnapshot.id,
                sku,
                changedScopes: evalResult.changedScopes,
                preservedScopes: evalResult.preservedScopes,
                evaluatedAt: evaluationTime.toISOString(),
              },
              occurredAt: evaluationTime,
              availableAt: evaluationTime,
            });

            events.push({
              topic: 'approval.invalidation_requested_by_fact_change',
              schemaVersion: 1,
              idempotencyKey: `approval-invalidation-requested-${currentSnapshot.id}-${finalSnapshot.id}`,
              aggregateType: 'ProductSnapshot',
              aggregateId: currentSnapshot.id,
              payload: {
                previousSnapshotId: currentSnapshot.id,
                newSnapshotId: finalSnapshot.id,
                sku,
                changedScopes: evalResult.changedScopes,
                preservedScopes: evalResult.preservedScopes,
                assessmentId: finalAssessment.id,
                policyId: policy.policyId,
                policyVersion: policy.version,
                correlationId: input.correlationId,
                evaluatedAt: evaluationTime.toISOString(),
              },
              occurredAt: evaluationTime,
              availableAt: evaluationTime,
            });
          }

          if (sourceAvailability !== SourceAvailability.AVAILABLE) {
            events.push({
              topic: 'product.source.outage_detected',
              schemaVersion: 1,
              idempotencyKey: `source-outage-${currentSnapshot.id}-${evaluationTime.getTime()}`,
              aggregateType: 'ProductSnapshot',
              aggregateId: currentSnapshot.id,
              payload: {
                sku,
                errorCategory: safeErrorCategory,
                evaluatedAt: evaluationTime.toISOString(),
              },
              occurredAt: evaluationTime,
              availableAt: evaluationTime,
            });
          }

          events.push({
            topic: 'product.freshness.assessed',
            schemaVersion: 1,
            idempotencyKey: `freshness-assessed-${finalAssessment.id}`,
            aggregateType: 'ProductFreshnessAssessment',
            aggregateId: finalAssessment.id,
            payload: {
              assessmentId: finalAssessment.id,
              snapshotId: finalSnapshot.id,
              sku,
              freshnessState: evalResult.freshnessState,
              revalidationOutcome: evalResult.revalidationOutcome,
              sourceAvailability: evalResult.sourceAvailability,
              reasonCodes: evalResult.reasonCodes,
              evaluatedAt: evaluationTime.toISOString(),
            },
            occurredAt: evaluationTime,
            availableAt: evaluationTime,
          });

          return events;
        },
      });
    } catch (error: unknown) {
      if (compoundKey && isUniqueConstraintError(error, 'idempotency')) {
        const winningAssessment = await this.assessments.findByIdempotencyKey(compoundKey);
        if (winningAssessment) {
          const storedSnapshot =
            (await this.snapshots.findById(winningAssessment.snapshotId)) ?? currentSnapshot;
          const presentation = formatFreshnessPresentation(
            winningAssessment.freshnessState,
            winningAssessment.revalidationOutcome,
            winningAssessment.sourceAvailability,
          );
          const evidence = winningAssessment.evidence as Record<string, unknown> | undefined;
          const changedScopes = (evidence?.changedScopes as ProductDependencyScope[]) ?? [];
          const isNewSnapshotCreated = Boolean(evidence?.newSnapshotCreated);

          return {
            currentSnapshot: storedSnapshot,
            previousSnapshotId: winningAssessment.comparedSnapshotId ?? currentSnapshot.id,
            isNewSnapshotCreated,
            freshnessState: winningAssessment.freshnessState,
            revalidationOutcome: winningAssessment.revalidationOutcome,
            sourceAvailability: winningAssessment.sourceAvailability,
            reasonCodes: winningAssessment.reasonCodes,
            changedScopes,
            assessment: winningAssessment,
            presentation,
          };
        }
      }
      throw error;
    }

    const presentation = formatFreshnessPresentation(
      evalResult.freshnessState,
      evalResult.revalidationOutcome,
      evalResult.sourceAvailability,
      evalResult.isMaterial ? `Changed scopes: ${evalResult.changedScopes.join(', ')}` : undefined,
    );

    this.logger.log('Product snapshot revalidated', {
      sku,
      snapshotId: persistenceResult.snapshot.id,
      previousSnapshotId: currentSnapshot.id,
      isNewSnapshotCreated: persistenceResult.isNewSnapshotCreated,
      freshnessState: evalResult.freshnessState,
      revalidationOutcome: evalResult.revalidationOutcome,
      changedScopes: evalResult.changedScopes,
      durationMs: Math.max(0, this.clock.nowEpochMs() - startedAt),
    });

    return {
      currentSnapshot: persistenceResult.snapshot,
      previousSnapshotId: currentSnapshot.id,
      isNewSnapshotCreated: persistenceResult.isNewSnapshotCreated,
      freshnessState: evalResult.freshnessState,
      revalidationOutcome: evalResult.revalidationOutcome,
      sourceAvailability: evalResult.sourceAvailability,
      reasonCodes: evalResult.reasonCodes,
      changedScopes: evalResult.changedScopes,
      assessment: persistenceResult.assessment,
      presentation,
    };
  }
}

function isUniqueConstraintError(error: unknown, fieldSubstr?: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string; meta?: { target?: string[] | string } };
  const isUniqueCode = err.code === 'P2002' || err.code === '23505';
  const hasUniqueMsg =
    typeof err.message === 'string' &&
    (err.message.includes('Unique constraint failed') ||
      err.message.includes('duplicate key value violates unique constraint') ||
      err.message.includes('unique constraint'));
  if (!isUniqueCode && !hasUniqueMsg) return false;
  if (!fieldSubstr) return true;
  const targetStr = JSON.stringify(err.meta ?? '') + ' ' + (err.message ?? '');
  return targetStr.toLowerCase().includes(fieldSubstr.toLowerCase());
}
