import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  type ApplicationLogger,
  APPLICATION_LOGGER,
  type OutboxWriter,
} from '@parisian-shopper/common';
import { CREATIVE_JOB_REPOSITORY, type CreativeJobRepository } from './creative-job.repository.js';
import { VISUAL_ASSET_REPOSITORY, type VisualAssetRepository } from './visual-asset.repository.js';
import {
  VISUAL_VALIDATION_REPOSITORY,
  type VisualValidationRepository,
  type VisualValidationResultRecord,
} from './visual-validation.repository.js';
import { ASSET_STORAGE, type AssetStoragePort } from './asset-storage.port.js';
import {
  DETERMINISTIC_VISUAL_VALIDATOR,
  DeterministicVisualValidator,
} from '../domain/services/deterministic-visual-validator.js';
import {
  VISUAL_SAFETY_SCANNER,
  VisualSafetyScanner,
} from '../domain/services/visual-safety-scanner.js';
import {
  SOFT_AESTHETIC_SCORER,
  type ISoftAestheticScorer,
} from '../domain/services/soft-aesthetic-scorer.port.js';
import {
  CreativeJobNotFoundError,
  VisualAssetNotFoundError,
  AssetNotFoundError,
} from '../domain/creative-errors.js';
import {
  VISUAL_VALIDATOR_VERSION,
  type VisualValidationFindingDraft,
} from '../domain/visual-validation.js';

export interface ValidateCreativeInput {
  readonly creativeJobId: string;
  readonly visualAssetId: string;
  readonly outboxWriter?: OutboxWriter;
}

export interface ValidateCreativeResult {
  readonly validationResult: VisualValidationResultRecord;
  readonly isPassed: boolean;
  readonly aestheticScore?: number | undefined;
  readonly aestheticGrade?: string | undefined;
}

@Injectable()
export class ValidateCreativeUseCase {
  public constructor(
    @Inject(CREATIVE_JOB_REPOSITORY)
    private readonly jobRepo: CreativeJobRepository,
    @Inject(VISUAL_ASSET_REPOSITORY)
    private readonly assetRepo: VisualAssetRepository,
    @Inject(VISUAL_VALIDATION_REPOSITORY)
    private readonly validationRepo: VisualValidationRepository,
    @Inject(ASSET_STORAGE)
    private readonly storage: AssetStoragePort,
    @Inject(DETERMINISTIC_VISUAL_VALIDATOR)
    private readonly deterministicValidator: DeterministicVisualValidator,
    @Inject(VISUAL_SAFETY_SCANNER)
    private readonly safetyScanner: VisualSafetyScanner,
    @Inject(APPLICATION_LOGGER)
    private readonly logger: ApplicationLogger,
    @Optional()
    @Inject(SOFT_AESTHETIC_SCORER)
    private readonly aestheticScorer?: ISoftAestheticScorer,
  ) {}

  public async execute(input: ValidateCreativeInput): Promise<ValidateCreativeResult> {
    const { creativeJobId, visualAssetId } = input;

    // 1. Fetch CreativeJob and VisualAsset
    const job = await this.jobRepo.findById(creativeJobId);
    if (!job) {
      throw new CreativeJobNotFoundError(creativeJobId);
    }

    const asset = await this.assetRepo.findById(visualAssetId);
    if (!asset || asset.creativeJobId !== creativeJobId) {
      throw new VisualAssetNotFoundError(visualAssetId);
    }

    // 2. Load VisualAsset bytes from AssetStoragePort
    const assetBuffer = await this.storage.getAssetBuffer(asset.storageKey);
    if (!assetBuffer) {
      throw new AssetNotFoundError(asset.storageKey);
    }

    // 3. Run DeterministicVisualValidator
    const deterministicOutcome = await this.deterministicValidator.validate({
      assetBuffer,
      expectedSha256: asset.sha256,
      targetAspectRatio: job.aspectRatio,
      targetWidth: asset.width,
      targetHeight: asset.height,
    });

    // 4. Run VisualSafetyScanner
    const promptMeta: { stylePrompt?: string; briefText?: string } = {
      stylePrompt: job.creativeProfile,
    };
    if (asset.creativeBriefVersion) {
      promptMeta.briefText = asset.creativeBriefVersion;
    }

    const safetyOutcome = this.safetyScanner.scan({
      promptMetadata: promptMeta,
    });

    // Combine findings
    const combinedFindings: VisualValidationFindingDraft[] = [
      ...deterministicOutcome.findings,
      ...safetyOutcome.findings,
    ];

    const blockingCount = combinedFindings.filter((f) => f.severity === 'BLOCKING').length;
    const warningCount = combinedFindings.filter((f) => f.severity === 'WARNING').length;
    const isPassed = blockingCount === 0;
    const status = isPassed ? (warningCount > 0 ? 'PASSED_WITH_WARNINGS' : 'PASSED') : 'FAILED';

    // 5. Persist VisualValidationResult and VisualValidationFindings
    const persistedResult = await this.validationRepo.persistResult({
      visualAssetId,
      validatorVersion: VISUAL_VALIDATOR_VERSION,
      status,
      findings: combinedFindings.map((f) => ({
        field: f.field,
        severity: f.severity,
        code: f.code,
        message: f.message,
        ...(f.metadata !== undefined ? { metadata: f.metadata } : {}),
      })),
    });

    // 6. Update CreativeJob status based on validation outcome
    let aestheticScore: number | undefined;
    let aestheticGrade: string | undefined;

    if (isPassed) {
      // Transition VALIDATING -> READY_FOR_REVIEW
      await this.jobRepo.transitionStatus(creativeJobId, 'VALIDATING', 'READY_FOR_REVIEW');

      // Track 2: Decoupled Soft Aesthetic Scoring (Advisory)
      if (this.aestheticScorer) {
        try {
          const aestheticOutcome = await this.aestheticScorer.scoreComposition({
            assetBuffer,
            aspectRatio: (job.aspectRatio as '1:1' | '4:5' | '9:16') || '1:1',
            width: asset.width,
            height: asset.height,
          });
          aestheticScore = aestheticOutcome.overallScore;
          aestheticGrade = aestheticOutcome.grade;
        } catch (err: unknown) {
          this.logger.warn(
            `Track 2 advisory aesthetic scoring skipped: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      if (input.outboxWriter) {
        await input.outboxWriter.append({
          topic: 'CREATIVE_VALIDATED',
          schemaVersion: 1,
          idempotencyKey: `creative-job:${creativeJobId}:validated`,
          aggregateType: 'CreativeJob',
          aggregateId: creativeJobId,
          payload: {
            creativeJobId,
            visualAssetId,
            validationResultId: persistedResult.id,
            status: persistedResult.status,
            warningCount,
            ...(aestheticScore !== undefined ? { aestheticScore, aestheticGrade } : {}),
          },
          occurredAt: new Date(),
          availableAt: new Date(),
        });
      }

      this.logger.log(`Creative job ${creativeJobId} passed visual validation (status: ${status})`);
    } else {
      // Transition VALIDATING -> FAILED
      await this.jobRepo.transitionStatus(creativeJobId, 'VALIDATING', 'FAILED');

      // Extract operator remediation actions from blocking findings metadata
      const remediationActions = Array.from(
        new Set(
          combinedFindings
            .filter(
              (f) =>
                f.severity === 'BLOCKING' && typeof f.metadata?.['remediationAction'] === 'string',
            )
            .map((f) => f.metadata!['remediationAction'] as string)
            .filter(Boolean),
        ),
      );

      if (input.outboxWriter) {
        await input.outboxWriter.append({
          topic: 'CREATIVE_VALIDATION_FAILED',
          schemaVersion: 1,
          idempotencyKey: `creative-job:${creativeJobId}:validation-failed`,
          aggregateType: 'CreativeJob',
          aggregateId: creativeJobId,
          payload: {
            creativeJobId,
            visualAssetId,
            validationResultId: persistedResult.id,
            blockingCount,
            findings: combinedFindings.map((f) => ({ code: f.code, message: f.message })),
            remediationActions,
          },
          occurredAt: new Date(),
          availableAt: new Date(),
        });
      }

      this.logger.warn(
        `Creative job ${creativeJobId} failed visual validation (${blockingCount} blocking findings)`,
      );
    }

    return {
      validationResult: persistedResult,
      isPassed,
      ...(aestheticScore !== undefined ? { aestheticScore, aestheticGrade } : {}),
    };
  }
}
