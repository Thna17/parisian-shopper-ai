import { Inject, Injectable, Optional } from '@nestjs/common';
import { ForbiddenError, NotFoundError } from '@parisian-shopper/common';

import { Permission, PermissionService } from '../../auth/domain/permissions.js';
import {
  CAMPAIGN_REPOSITORY,
  type CampaignRepository,
} from '../../campaigns/application/campaign.repository.js';
import {
  CONTENT_GENERATION_REPOSITORY,
  type ContentGenerationRepository,
} from '../../content/application/content-generation.repository.js';
import {
  PRODUCT_SNAPSHOT_REPOSITORY,
  type ProductSnapshotRepository,
} from '../../products/application/product-snapshot.repository.js';
import {
  VALIDATION_REPOSITORY,
  type ValidationRepository,
} from '../../validation/application/validation.repository.js';
import { type ReviewDeskDetail } from '../domain/approval.js';
import { APPROVALS_REPOSITORY, type ApprovalsRepository } from './approvals.repository.js';

export interface GetReviewDeskDetailInput {
  readonly contentJobId: string;
  readonly versionId?: string;
  readonly actorUserId: string;
  readonly actorRoles: readonly string[];
}

@Injectable()
export class GetReviewDeskDetailUseCase {
  public constructor(
    @Inject(APPROVALS_REPOSITORY)
    private readonly approvalsRepo: ApprovalsRepository,
    @Inject(CONTENT_GENERATION_REPOSITORY)
    private readonly contentRepo: ContentGenerationRepository,
    @Inject(PRODUCT_SNAPSHOT_REPOSITORY)
    private readonly snapshotsRepo: ProductSnapshotRepository,
    @Inject(VALIDATION_REPOSITORY)
    private readonly validationRepo: ValidationRepository,
    private readonly permissions: PermissionService,
    @Optional()
    @Inject(CAMPAIGN_REPOSITORY)
    private readonly campaignsRepo?: CampaignRepository,
  ) {}

  public async execute(input: GetReviewDeskDetailInput): Promise<ReviewDeskDetail> {
    const hasApprovePerm = this.permissions.hasAnyRolePermission(
      input.actorRoles,
      Permission.APPROVE_CONTENT,
    );
    const hasRejectPerm = this.permissions.hasAnyRolePermission(
      input.actorRoles,
      Permission.REJECT_CONTENT,
    );
    const hasViewAll = this.permissions.hasAnyRolePermission(
      input.actorRoles,
      Permission.VIEW_ALL_CONTENT,
    );
    const hasViewOwn = this.permissions.hasAnyRolePermission(
      input.actorRoles,
      Permission.VIEW_OWN_CONTENT,
    );

    if (!hasApprovePerm && !hasRejectPerm && !hasViewAll && !hasViewOwn) {
      throw new ForbiddenError({
        publicMessage: 'Permission denied: Cannot view review desk.',
      });
    }

    const job = await this.contentRepo.findJobById(input.contentJobId);
    if (!job) {
      throw new NotFoundError({
        publicMessage: 'Content job was not found.',
      });
    }

    if (!hasApprovePerm && !hasViewAll && job.requesterUserId !== input.actorUserId) {
      throw new ForbiddenError({
        publicMessage: 'Permission denied: Cannot view another user’s review desk.',
      });
    }

    const [versions, snapshot, approvalEvents, reviewState, revisionRequests] = await Promise.all([
      this.contentRepo.findVersionsByJobId(job.id),
      this.snapshotsRepo.findById(job.productSnapshotId),
      this.approvalsRepo.findApprovalEventsByJobId(job.id),
      this.approvalsRepo.getReviewState(job.id),
      this.approvalsRepo.findRevisionRequestsByJobId(job.id),
    ]);

    let campaign = undefined;
    if (job.campaignId && this.campaignsRepo) {
      const camp = await this.campaignsRepo.findById(job.campaignId);
      if (camp) {
        campaign = {
          id: camp.id,
          code: camp.code,
          name: camp.name,
          status: camp.status,
          ...(camp.objective ? { objective: camp.objective } : {}),
        };
      }
    }

    const maxVersionNumber =
      versions.length > 0 ? Math.max(...versions.map((v) => v.versionNumber)) : 1;

    let targetVersion =
      input.versionId !== undefined
        ? versions.find((v) => v.id === input.versionId)
        : versions.find((v) => v.versionNumber === maxVersionNumber);

    if (!targetVersion && versions.length > 0) {
      targetVersion = versions[versions.length - 1];
    }

    if (!targetVersion) {
      throw new NotFoundError({
        publicMessage: 'No content versions found for this content job.',
      });
    }

    const validationResult = await this.validationRepo.findLatestByContentVersion(targetVersion.id);

    // Resolve author of target version
    let targetAuthorUserId = job.requesterUserId;
    if (targetVersion.revisionRequestId) {
      const matchRev = revisionRequests.find((r) => r.id === targetVersion.revisionRequestId);
      if (matchRev) {
        targetAuthorUserId = matchRev.requestedByUserId;
      }
    }

    // Four-Eyes Eligibility checks
    const selfRequested = job.requesterUserId === input.actorUserId;
    const selfAuthored = targetAuthorUserId === input.actorUserId;
    const missingPermission = !hasApprovePerm;
    const notUnderReview = job.status !== 'UNDER_REVIEW';
    const isStaleVersion = targetVersion.versionNumber !== maxVersionNumber;

    const hasValidationPassed =
      validationResult !== null &&
      validationResult.blockingCount === 0 &&
      (validationResult.status === 'PASSED' || validationResult.status === 'PASSED_WITH_WARNINGS');
    const hasBlockingFindings = !hasValidationPassed;

    const ineligibilityReasons: string[] = [];
    if (missingPermission) {
      ineligibilityReasons.push('NO_PERMISSION');
    }
    if (notUnderReview) {
      ineligibilityReasons.push('NOT_UNDER_REVIEW');
    }
    if (selfRequested) {
      ineligibilityReasons.push('SELF_REQUESTED');
    }
    if (selfAuthored) {
      ineligibilityReasons.push('SELF_AUTHORED');
    }
    if (isStaleVersion) {
      ineligibilityReasons.push('STALE_VERSION');
    }
    if (hasBlockingFindings) {
      ineligibilityReasons.push('BLOCKING_FINDINGS');
    }

    const canApprove = ineligibilityReasons.length === 0;
    const canReject = hasRejectPerm && !notUnderReview;

    // Normalizing product snapshot
    const rawEnvelope = snapshot?.product;
    const rawProduct = rawEnvelope?.product;
    const brand = rawProduct?.brand ?? '';
    const priceUsd = Number(rawProduct?.price) || 0;
    const sku = rawProduct?.sku ?? 'UNKNOWN-SKU';
    const productName = rawProduct?.product_name ?? 'Unknown Product';

    const images = Array.isArray(rawProduct?.images) ? rawProduct.images : [];
    const primaryImage = images.find((img) => img.role === 'primary') ?? images[0];
    const imageUrl = primaryImage?.url;

    const fragranceNotes = rawProduct?.fragrance_notes;

    // Map versions summary
    const versionsSummary = versions.map((v) => {
      const reviewVersion = reviewState?.versions.find((rv) => rv.id === v.id);
      const out = v.structuredOutput as {
        headline?: string;
        english_caption?: string;
        khmer_caption?: string;
        cta?: string;
        hashtags?: string[];
        creative_brief?: string;
        facts_used?: string[];
      };

      return {
        id: v.id,
        versionNumber: v.versionNumber,
        authorUserId: reviewVersion?.authorUserId ?? job.requesterUserId,
        headline: out?.headline ?? '',
        ...(out?.english_caption ? { englishCaption: out.english_caption } : {}),
        ...(out?.khmer_caption ? { khmerCaption: out.khmer_caption } : {}),
        ...(out?.cta ? { cta: out.cta } : {}),
        ...(out?.hashtags ? { hashtags: out.hashtags } : {}),
        ...(out?.creative_brief ? { creativeBrief: out.creative_brief } : {}),
        ...(out?.facts_used ? { factsUsed: out.facts_used } : {}),
        createdAt: v.createdAt,
        ...(reviewVersion?.validationStatus
          ? { validationStatus: reviewVersion.validationStatus }
          : {}),
        ...(reviewVersion?.blockingCount !== undefined
          ? { blockingCount: reviewVersion.blockingCount }
          : {}),
      };
    });

    const targetOutput = targetVersion.structuredOutput as {
      headline?: string;
      english_caption?: string;
      khmer_caption?: string;
      cta?: string;
      hashtags?: string[];
      creative_brief?: string;
      facts_used?: string[];
    };

    return {
      job: {
        id: job.id,
        contentType: job.contentType,
        language: job.language,
        platform: job.platform,
        ...(job.campaignContext ? { campaignContext: job.campaignContext } : {}),
        status: job.status,
        requesterUserId: job.requesterUserId,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },
      productSnapshot: {
        id: snapshot?.id ?? job.productSnapshotId,
        sku,
        productName,
        brand,
        priceUsd,
        ...(typeof rawProduct?.category === 'string' ? { category: rawProduct.category } : {}),
        ...(typeof rawProduct?.description === 'string'
          ? { description: rawProduct.description }
          : {}),
        ...(imageUrl ? { imageUrl } : {}),
        ...(fragranceNotes ? { fragranceNotes } : {}),
        ...(typeof rawProduct?.stock_status === 'string'
          ? { stockStatus: rawProduct.stock_status }
          : {}),
        ...(typeof rawProduct?.product_url === 'string'
          ? { productUrl: rawProduct.product_url }
          : {}),
      },
      ...(campaign ? { campaign } : {}),
      versions: versionsSummary,
      targetVersion: {
        id: targetVersion.id,
        versionNumber: targetVersion.versionNumber,
        authorUserId: targetAuthorUserId,
        headline: targetOutput?.headline ?? '',
        ...(targetOutput?.english_caption ? { englishCaption: targetOutput.english_caption } : {}),
        ...(targetOutput?.khmer_caption ? { khmerCaption: targetOutput.khmer_caption } : {}),
        ...(targetOutput?.cta ? { cta: targetOutput.cta } : {}),
        ...(targetOutput?.hashtags ? { hashtags: targetOutput.hashtags } : {}),
        ...(targetOutput?.creative_brief ? { creativeBrief: targetOutput.creative_brief } : {}),
        ...(targetOutput?.facts_used ? { factsUsed: targetOutput.facts_used } : {}),
        createdAt: targetVersion.createdAt,
        structuredOutput: targetVersion.structuredOutput,
      },
      ...(validationResult
        ? {
            validationResult: {
              id: validationResult.id,
              status: validationResult.status,
              blockingCount: validationResult.blockingCount,
              warningCount: validationResult.warningCount,
              findings: validationResult.findings.map((f) => ({
                severity: f.severity,
                ...(f.field ? { field: f.field } : {}),
                code: f.code,
                message: f.message,
              })),
            },
          }
        : {}),
      ...(reviewState?.activeRevision ? { activeRevision: reviewState.activeRevision } : {}),
      approvalEvents,
      eligibility: {
        canApprove,
        canReject,
        ineligibilityReasons,
        selfRequested,
        selfAuthored,
        missingPermission,
        hasBlockingFindings,
        notUnderReview,
        isStaleVersion,
      },
    };
  }
}
