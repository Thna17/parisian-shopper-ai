import { Inject, Injectable, Optional } from '@nestjs/common';
import { type ApplicationLogger, APPLICATION_LOGGER } from '@parisian-shopper/common';
import {
  type CreativeSceneVersionRecord,
  type OutboxEventDraft,
  type SceneInvalidationEventRecord,
} from '../domain/scene/creative-scene.types.js';
import {
  CREATIVE_SCENE_REPOSITORY,
  type CreativeSceneRepository,
} from './creative-scene.repository.js';

export interface AssessDependencyInvalidationInput {
  readonly version: CreativeSceneVersionRecord;
  readonly currentPriceStockHash?: string | null | undefined;
  readonly currentContentHash?: string | null | undefined;
  readonly reason?: string | undefined;
  readonly recordedByUserId?: string | null | undefined;
}

export interface InvalidationAssessmentResult {
  readonly isValid: boolean;
  readonly dependencyDiverged: boolean;
  readonly invalidationEvent?: SceneInvalidationEventRecord | undefined;
}

@Injectable()
export class SceneInvalidationService {
  public constructor(
    @Inject(CREATIVE_SCENE_REPOSITORY)
    private readonly sceneRepo: CreativeSceneRepository,
    @Optional()
    @Inject(APPLICATION_LOGGER)
    private readonly logger?: ApplicationLogger,
  ) {}

  public async assessAndInvalidateIfDiverged(
    input: AssessDependencyInvalidationInput,
  ): Promise<InvalidationAssessmentResult> {
    // If the snapshot dependency exists in version.dependencies, check if priceStockHash matches
    const snapshotDep = input.version.dependencies.find(
      (d) => d.dependencyType === 'PRODUCT_SNAPSHOT',
    );

    let diverged = false;
    let divergedType = 'PRODUCT_SNAPSHOT';
    let expectedDigest = snapshotDep?.immutableDigest ?? '';
    let actualDigest = input.currentPriceStockHash ?? '';

    if (
      input.currentPriceStockHash !== undefined &&
      snapshotDep &&
      input.currentPriceStockHash !== snapshotDep.immutableDigest
    ) {
      diverged = true;
      divergedType = 'PRODUCT_SNAPSHOT';
      expectedDigest = snapshotDep.immutableDigest;
      actualDigest = input.currentPriceStockHash ?? '';
    }

    const contentDep = input.version.dependencies.find(
      (d) => d.dependencyType === 'CONTENT_VERSION',
    );
    if (
      !diverged &&
      input.currentContentHash !== undefined &&
      contentDep &&
      input.currentContentHash !== contentDep.immutableDigest
    ) {
      diverged = true;
      divergedType = 'CONTENT_VERSION';
      expectedDigest = contentDep.immutableDigest;
      actualDigest = input.currentContentHash ?? '';
    }

    if (!diverged) {
      const isStale =
        input.version.state?.status === 'STALE_FACTS' ||
        input.version.state?.status === 'INVALIDATED';
      return {
        isValid: !isStale,
        dependencyDiverged: false,
      };
    }

    this.logger?.warn('Creative scene dependency divergence detected', {
      sceneId: input.version.sceneId,
      versionNumber: input.version.versionNumber,
      divergedType,
      expectedDigest,
      actualDigest,
    });

    const now = new Date();
    const reason =
      input.reason ??
      `Authoritative ${divergedType} dependency diverged (expected ${expectedDigest}, got ${actualDigest})`;

    let outboxEvent: OutboxEventDraft | undefined;
    if (input.version.state?.status === 'APPROVED') {
      outboxEvent = {
        topic: 'creative.approval.rendered_ineligible',
        schemaVersion: 1,
        idempotencyKey: `scene:${input.version.sceneId}:v${input.version.versionNumber}:stale_${divergedType.toLowerCase()}`,
        aggregateType: 'CreativeScene',
        aggregateId: input.version.sceneId,
        payload: {
          sceneId: input.version.sceneId,
          versionNumber: input.version.versionNumber,
          reason,
          divergedDependencyType: divergedType,
          expectedDigest,
          actualDigest,
          occurredAt: now.toISOString(),
        },
        occurredAt: now,
        availableAt: now,
      };
    }

    const invalidationEvent = await this.sceneRepo.recordDependencyInvalidation({
      sceneVersionId: input.version.id,
      reason,
      divergedDependencyType: divergedType,
      expectedDigest,
      actualDigest,
      recordedByUserId: input.recordedByUserId,
      outboxEvent,
    });

    return {
      isValid: false,
      dependencyDiverged: true,
      invalidationEvent,
    };
  }
}
