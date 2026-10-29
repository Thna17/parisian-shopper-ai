import { Inject, Injectable, Optional } from '@nestjs/common';
import { ForbiddenError, NotFoundError } from '@parisian-shopper/common';
import { Permission, PermissionService } from '../../auth/domain/permissions.js';
import {
  PRODUCT_SNAPSHOT_REPOSITORY,
  type ProductSnapshotRepository,
} from '../../products/application/product-snapshot.repository.js';
import {
  CONTENT_GENERATION_REPOSITORY,
  type ContentGenerationRepository,
} from '../../content/application/content-generation.repository.js';
import {
  CAMPAIGN_REPOSITORY,
  type CampaignRepository,
} from '../../campaigns/application/campaign.repository.js';
import {
  PRODUCT_ASSET_REPOSITORY,
  type ProductAssetRepository,
} from '../../products/application/product-asset.repository.js';
import { CREATIVE_JOB_REPOSITORY, type CreativeJobRepository } from './creative-job.repository.js';
import { VISUAL_ASSET_REPOSITORY, type VisualAssetRepository } from './visual-asset.repository.js';
import {
  VISUAL_VALIDATION_REPOSITORY,
  type VisualValidationRepository,
} from './visual-validation.repository.js';
import {
  CREATIVE_SCENE_REPOSITORY,
  type CreativeSceneRepository,
} from './creative-scene.repository.js';
import type {
  CreativeSceneRecord,
  CreativeSceneVersionRecord,
} from '../domain/scene/creative-scene.types.js';

export interface GetCreativeProjectDetailInput {
  readonly projectId: string;
  readonly versionNumber?: number | undefined;
  readonly requesterUserId: string;
  readonly requesterRoles: readonly string[];
}

export interface CreativeProjectDetailResult {
  readonly project: CreativeSceneRecord;
  readonly currentVersion: CreativeSceneVersionRecord;
  readonly versions: readonly CreativeSceneVersionRecord[];
  readonly productSnapshot?:
    | {
        readonly id: string;
        readonly sku: string;
        readonly productName: string;
        readonly brand: string;
        readonly price: number;
        readonly currency: string;
        readonly description?: string | undefined;
        readonly images?: readonly unknown[] | undefined;
      }
    | undefined;
  readonly contentVersion?:
    | {
        readonly id: string;
        readonly headline?: string | undefined;
        readonly bodyCopy?: string | undefined;
        readonly platform?: string | undefined;
        readonly strategy?: string | undefined;
      }
    | undefined;
  readonly campaign?:
    | {
        readonly id: string;
        readonly code: string;
        readonly name: string;
      }
    | undefined;
  readonly creativeJob?:
    | {
        readonly id: string;
        readonly status: string;
        readonly targetPlatform: string;
        readonly creativeProfile: string;
      }
    | undefined;
  readonly latestRender?:
    | {
        readonly id: string;
        readonly width: number;
        readonly height: number;
        readonly sha256: string;
        readonly mimeType: string;
        readonly createdAt: Date;
      }
    | undefined;
  readonly latestValidation?:
    | {
        readonly status: string;
        readonly isPassed: boolean;
        readonly findingCount: number;
        readonly blockingCount: number;
        readonly warningCount: number;
        readonly findings: readonly {
          readonly code: string;
          readonly severity: string;
          readonly message: string;
          readonly field: string;
        }[];
      }
    | undefined;
  readonly availableAssets: readonly {
    readonly id: string;
    readonly registrationId: string;
    readonly role: string;
    readonly rightsState: string;
    readonly approvalDecision: string;
    readonly sha256: string;
    readonly width: number;
    readonly height: number;
  }[];
  readonly canEdit: boolean;
  readonly canApprove: boolean;
  readonly canExport: boolean;
}

@Injectable()
export class GetCreativeProjectDetailUseCase {
  private readonly permissions: PermissionService;

  public constructor(
    @Inject(CREATIVE_SCENE_REPOSITORY)
    private readonly sceneRepo: CreativeSceneRepository,
    @Inject(PRODUCT_SNAPSHOT_REPOSITORY)
    private readonly snapshotRepo: ProductSnapshotRepository,
    @Inject(CONTENT_GENERATION_REPOSITORY)
    private readonly contentRepo: ContentGenerationRepository,
    @Inject(CREATIVE_JOB_REPOSITORY)
    private readonly jobRepo: CreativeJobRepository,
    @Inject(VISUAL_ASSET_REPOSITORY)
    private readonly visualAssetRepo: VisualAssetRepository,
    @Inject(VISUAL_VALIDATION_REPOSITORY)
    private readonly validationRepo: VisualValidationRepository,
    @Optional()
    @Inject(PermissionService)
    permissions?: PermissionService,
    @Optional()
    @Inject(CAMPAIGN_REPOSITORY)
    private readonly campaignRepo?: CampaignRepository,
    @Optional()
    @Inject(PRODUCT_ASSET_REPOSITORY)
    private readonly assetRepo?: ProductAssetRepository,
  ) {
    this.permissions = permissions ?? new PermissionService();
  }

  public async execute(input: GetCreativeProjectDetailInput): Promise<CreativeProjectDetailResult> {
    const hasAccess =
      this.permissions.hasAnyRolePermission(input.requesterRoles, Permission.VIEW_OWN_CONTENT) ||
      this.permissions.hasAnyRolePermission(input.requesterRoles, Permission.VIEW_ALL_CONTENT) ||
      this.permissions.hasAnyRolePermission(input.requesterRoles, Permission.EDIT_CREATIVE);

    if (!hasAccess) {
      throw new ForbiddenError({
        publicMessage: 'Permission denied: Cannot view creative project details.',
      });
    }

    const project = await this.sceneRepo.findById(input.projectId);
    if (!project) {
      throw new NotFoundError({
        publicMessage: `Creative project "${input.projectId}" not found.`,
      });
    }

    const versions = await this.sceneRepo.listVersions(project.id);
    const currentVersion =
      input.versionNumber !== undefined
        ? await this.sceneRepo.findVersionByNumber(project.id, input.versionNumber)
        : await this.sceneRepo.findLatestVersionBySceneId(project.id);

    if (!currentVersion) {
      throw new NotFoundError({
        publicMessage: `Creative version for project "${input.projectId}" not found.`,
      });
    }

    // Load Snapshot
    let productSnapshot: CreativeProjectDetailResult['productSnapshot'] = undefined;
    let sku: string | undefined = undefined;
    if (currentVersion.productSnapshotId) {
      const snap = await this.snapshotRepo.findById(currentVersion.productSnapshotId);
      if (snap) {
        sku = snap.product?.product?.sku;
        productSnapshot = {
          id: snap.id,
          sku: snap.product?.product?.sku ?? '',
          productName: snap.product?.product?.product_name ?? '',
          brand: snap.product?.product?.brand ?? '',
          price: Number(snap.product?.product?.price ?? 0),
          currency: snap.product?.product?.currency ?? 'USD',
          ...(snap.product?.product?.description
            ? { description: snap.product.product.description }
            : {}),
          ...(snap.product?.product?.images ? { images: snap.product.product.images } : {}),
        };
      }
    }

    // Load Content Version
    let contentVersion: CreativeProjectDetailResult['contentVersion'] = undefined;
    if (currentVersion.sourceContentVersionId) {
      const cv = await this.contentRepo.findVersionById(currentVersion.sourceContentVersionId);
      if (cv) {
        contentVersion = {
          id: cv.id,
          ...(cv.structuredOutput?.headline ? { headline: cv.structuredOutput.headline } : {}),
          ...(cv.structuredOutput?.english_caption
            ? { bodyCopy: cv.structuredOutput.english_caption }
            : cv.structuredOutput?.khmer_caption
              ? { bodyCopy: cv.structuredOutput.khmer_caption }
              : {}),
        };
      }
    }

    // Load Campaign
    let campaign: CreativeProjectDetailResult['campaign'] = undefined;
    if (project.campaignId && this.campaignRepo) {
      const camp = await this.campaignRepo.findById(project.campaignId);
      if (camp) {
        campaign = {
          id: camp.id,
          code: camp.code,
          name: camp.name,
        };
      }
    }

    // Load CreativeJob
    const job = await this.jobRepo.findById(project.creativeJobId);
    const creativeJob: CreativeProjectDetailResult['creativeJob'] = job
      ? {
          id: job.id,
          status: job.status,
          targetPlatform: job.targetPlatform,
          creativeProfile: job.creativeProfile,
        }
      : undefined;

    // Load Latest Visual Asset & Validation
    let latestRender: CreativeProjectDetailResult['latestRender'] = undefined;
    let latestValidation: CreativeProjectDetailResult['latestValidation'] = undefined;
    if (job) {
      const latestAsset = await this.visualAssetRepo.findLatestByJobId(job.id);
      if (latestAsset) {
        latestRender = {
          id: latestAsset.id,
          width: latestAsset.width,
          height: latestAsset.height,
          sha256: latestAsset.sha256,
          mimeType: latestAsset.mimeType,
          createdAt: latestAsset.createdAt,
        };

        const valResult = await this.validationRepo.findLatestByAssetId(latestAsset.id);
        if (valResult) {
          latestValidation = {
            status: valResult.status,
            isPassed: valResult.status === 'PASSED' || valResult.status === 'PASSED_WITH_WARNINGS',
            findingCount: valResult.findingCount,
            blockingCount: valResult.blockingCount,
            warningCount: valResult.warningCount,
            findings: valResult.findings.map((f) => ({
              code: f.code,
              severity: f.severity,
              message: f.message,
              field: f.field,
            })),
          };
        }
      }
    }

    // Load Available Product Assets
    const availableAssets: Array<{
      readonly id: string;
      readonly registrationId: string;
      readonly role: string;
      readonly rightsState: string;
      readonly approvalDecision: string;
      readonly sha256: string;
      readonly width: number;
      readonly height: number;
    }> = [];

    if (sku && this.assetRepo) {
      const registrations = await this.assetRepo.findAllHeroCutoutRegistrations(sku);
      for (const reg of registrations) {
        const asset = await this.assetRepo.findAssetById(reg.productAssetId);
        const rights = await this.assetRepo.findLatestRightsEvent(reg.id);
        const approval = await this.assetRepo.findLatestApprovalEvent(reg.id);
        if (asset) {
          availableAssets.push({
            id: asset.id,
            registrationId: reg.id,
            role: reg.role,
            rightsState: rights?.rightsState ?? 'UNVERIFIED',
            approvalDecision: approval?.decision ?? 'PENDING',
            sha256: asset.sha256,
            width: asset.width,
            height: asset.height,
          });
        }
      }
    }

    const canEdit = this.permissions.hasAnyRolePermission(
      input.requesterRoles,
      Permission.EDIT_CREATIVE,
    );
    const canApprove =
      this.permissions.hasAnyRolePermission(input.requesterRoles, Permission.APPROVE_CREATIVE) &&
      job?.status === 'READY_FOR_REVIEW' &&
      job.requestedByUserId !== input.requesterUserId;
    const canExport =
      this.permissions.hasAnyRolePermission(input.requesterRoles, Permission.EXPORT_CREATIVE) &&
      job?.status === 'CREATIVE_APPROVED';

    return {
      project,
      currentVersion,
      versions,
      ...(productSnapshot ? { productSnapshot } : {}),
      ...(contentVersion ? { contentVersion } : {}),
      ...(campaign ? { campaign } : {}),
      ...(creativeJob ? { creativeJob } : {}),
      ...(latestRender ? { latestRender } : {}),
      ...(latestValidation ? { latestValidation } : {}),
      availableAssets,
      canEdit,
      canApprove,
      canExport,
    };
  }
}
