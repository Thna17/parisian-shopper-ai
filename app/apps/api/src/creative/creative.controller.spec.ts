/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  type SanitizedEmployeeDto,
  ListCreativeProjectsUseCase,
  GetCreativeProjectDetailUseCase,
  CreateCreativeProjectUseCase,
  ValidateCreativeProjectUseCase,
  RenderCreativePreviewUseCase,
  ReviseSceneUseCase,
  GetSceneVersionUseCase,
  ExportPosterUseCase,
  ApproveCreativeUseCase,
  RejectCreativeUseCase,
  type AssetStoragePort,
  type VisualAssetRepository,
  type CreativeSceneRepository,
  type CreativeJobRepository,
} from '@parisian-shopper/application';
import { CreativeController } from './creative.controller.js';

describe('CreativeController (Unit & API Integration)', () => {
  let controller: CreativeController;
  let mockListProjectsUseCase: jest.Mocked<ListCreativeProjectsUseCase>;
  let mockGetProjectDetailUseCase: jest.Mocked<GetCreativeProjectDetailUseCase>;
  let mockCreateProjectUseCase: jest.Mocked<CreateCreativeProjectUseCase>;
  let mockValidateProjectUseCase: jest.Mocked<ValidateCreativeProjectUseCase>;
  let mockRenderPreviewUseCase: jest.Mocked<RenderCreativePreviewUseCase>;
  let mockReviseSceneUseCase: jest.Mocked<ReviseSceneUseCase>;
  let mockGetSceneVersionUseCase: jest.Mocked<GetSceneVersionUseCase>;
  let mockExportPosterUseCase: jest.Mocked<ExportPosterUseCase>;
  let mockApproveCreativeUseCase: jest.Mocked<ApproveCreativeUseCase>;
  let mockRejectCreativeUseCase: jest.Mocked<RejectCreativeUseCase>;
  let mockStorage: jest.Mocked<AssetStoragePort>;
  let mockVisualAssetRepo: jest.Mocked<VisualAssetRepository>;
  let mockSceneRepo: jest.Mocked<CreativeSceneRepository>;
  let mockJobRepo: jest.Mocked<CreativeJobRepository>;

  const mockEditorEmployee: SanitizedEmployeeDto = {
    id: 'user-editor-1',
    displayName: 'Creative Editor',
    roles: ['MARKETING_EDITOR'],
    permissions: [
      'VIEW_PRODUCTS',
      'VIEW_OWN_CONTENT',
      'CREATE_CONTENT',
      'EDIT_CONTENT',
      'EDIT_CREATIVE',
      'REGENERATE_CREATIVE',
    ],
    status: 'ACTIVE',
  };

  const mockApproverEmployee: SanitizedEmployeeDto = {
    id: 'user-approver-1',
    displayName: 'Marketing Approver',
    roles: ['MARKETING_APPROVER'],
    permissions: ['VIEW_PRODUCTS', 'VIEW_OWN_CONTENT', 'APPROVE_CREATIVE', 'EXPORT_CREATIVE'],
    status: 'ACTIVE',
  };

  beforeEach(() => {
    mockListProjectsUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ListCreativeProjectsUseCase>;

    mockGetProjectDetailUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetCreativeProjectDetailUseCase>;

    mockCreateProjectUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CreateCreativeProjectUseCase>;

    mockValidateProjectUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ValidateCreativeProjectUseCase>;

    mockRenderPreviewUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<RenderCreativePreviewUseCase>;

    mockReviseSceneUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ReviseSceneUseCase>;

    mockGetSceneVersionUseCase = {
      listVersions: jest.fn(),
      getScene: jest.fn(),
      getVersionById: jest.fn(),
      getVersionByNumber: jest.fn(),
    } as unknown as jest.Mocked<GetSceneVersionUseCase>;

    mockExportPosterUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ExportPosterUseCase>;

    mockApproveCreativeUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ApproveCreativeUseCase>;

    mockRejectCreativeUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<RejectCreativeUseCase>;

    mockStorage = {
      saveAsset: jest.fn(),
      getAssetBuffer: jest.fn(),
      getMetadata: jest.fn(),
      assetExists: jest.fn(),
    } as unknown as jest.Mocked<AssetStoragePort>;

    mockVisualAssetRepo = {
      createAsset: jest.fn(),
      findById: jest.fn(),
      findByJobAndVersion: jest.fn(),
    } as unknown as jest.Mocked<VisualAssetRepository>;

    mockSceneRepo = {
      findById: jest.fn(),
      findScenes: jest.fn(),
      findLatestVersionBySceneId: jest.fn(),
      updateVersionState: jest.fn(),
    } as unknown as jest.Mocked<CreativeSceneRepository>;

    mockJobRepo = {
      createJob: jest.fn(),
      findById: jest.fn(),
      transitionStatus: jest.fn(),
      updateJob: jest.fn(),
    } as unknown as jest.Mocked<CreativeJobRepository>;

    controller = new CreativeController(
      mockListProjectsUseCase,
      mockGetProjectDetailUseCase,
      mockCreateProjectUseCase,
      mockValidateProjectUseCase,
      mockRenderPreviewUseCase,
      mockReviseSceneUseCase,
      mockGetSceneVersionUseCase,
      mockExportPosterUseCase,
      mockApproveCreativeUseCase,
      mockRejectCreativeUseCase,
      mockStorage,
      mockVisualAssetRepo,
      mockSceneRepo,
      mockJobRepo,
    );
  });

  describe('CREATIVE-API-01 — Authorized template listing', () => {
    it('returns approved canonical poster templates with slots and tokens', () => {
      const templates = controller.listTemplates();
      expect(templates.length).toBeGreaterThanOrEqual(4);
      const ids = templates.map((t) => t.id);
      expect(ids).toContain('EDITORIAL_SPLIT');
      expect(ids).toContain('CENTERED_HERO');
      expect(ids).toContain('KHMER_SEASONAL');
      expect(ids).toContain('SCENT_STORY');
    });
  });

  describe('CREATIVE-API-03 to 06 — Create a project, product & campaign & version association', () => {
    it('creates initial scene and version 1 via CreateCreativeProjectUseCase', async () => {
      const mockResult = {
        scene: {
          id: 'scene-1',
          creativeJobId: 'job-1',
          campaignId: 'camp-1',
          title: 'Rose Impériale Summer Launch',
          currentVersionNumber: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        version: {
          id: 'ver-1',
          sceneId: 'scene-1',
          versionNumber: 1,
          parentVersionId: null,
          aspectRatio: '1:1' as const,
          width: 1080,
          height: 1080,
          templateId: 'EDITORIAL_SPLIT' as const,
          templateVersion: '1.0.0',
          stylePresetId: null,
          language: 'EN' as const,
          safeMargins: { top: 80, bottom: 80, left: 80, right: 80 },
          brandProfileVersionId: 'brand-1',
          sourceContentVersionId: 'cv-1',
          productSnapshotId: 'snap-1',
          sceneHash: 'a'.repeat(64),
          dependencyHash: 'b'.repeat(64),
          changeReason: 'Initial',
          operationCode: 'INITIAL_DRAFT' as const,
          requestedByUserId: mockEditorEmployee.id,
          metadata: null,
          createdAt: new Date(),
          layers: [],
          dependencies: [],
        },
      };

      mockCreateProjectUseCase.execute.mockResolvedValue(mockResult);

      const res = await controller.createProject(mockEditorEmployee, {
        title: 'Rose Impériale Summer Launch',
        productSnapshotId: 'snap-1',
        sourceContentVersionId: 'cv-1',
        templateId: 'EDITORIAL_SPLIT',
        aspectRatio: '1:1',
        language: 'EN',
        campaignId: 'camp-1',
      });

      const typedRes = res as { scene: { id: string }; version: { versionNumber: number } };
      expect(typedRes.scene.id).toBe('scene-1');
      expect(typedRes.version.versionNumber).toBe(1);
      expect(mockCreateProjectUseCase.execute).toHaveBeenCalledWith({
        title: 'Rose Impériale Summer Launch',
        productSnapshotId: 'snap-1',
        sourceContentVersionId: 'cv-1',
        templateId: 'EDITORIAL_SPLIT',
        aspectRatio: '1:1',
        language: 'EN',
        campaignId: 'camp-1',
        requesterUserId: mockEditorEmployee.id,
        requesterRoles: mockEditorEmployee.roles,
      });
    });
  });

  describe('CREATIVE-API-09 & 10 — Draft editing and immutable version preservation', () => {
    it('saves canvas edits by creating version 2 with parentVersionId pointing to version 1', async () => {
      const mockV2 = {
        id: 'ver-2',
        sceneId: 'scene-1',
        versionNumber: 2,
        parentVersionId: 'ver-1',
        aspectRatio: '1:1' as const,
        width: 1080,
        height: 1080,
        templateId: 'EDITORIAL_SPLIT' as const,
        templateVersion: '1.0.0',
        stylePresetId: null,
        language: 'EN' as const,
        safeMargins: { top: 80, bottom: 80, left: 80, right: 80 },
        brandProfileVersionId: 'brand-1',
        sourceContentVersionId: 'cv-1',
        productSnapshotId: 'snap-1',
        sceneHash: 'c'.repeat(64),
        dependencyHash: 'd'.repeat(64),
        changeReason: 'Adjusted padding',
        operationCode: 'EDIT_LAYOUT' as const,
        requestedByUserId: mockEditorEmployee.id,
        metadata: null,
        createdAt: new Date(),
        layers: [],
        dependencies: [],
      };

      mockReviseSceneUseCase.execute.mockResolvedValue(mockV2);

      const res = await controller.reviseProject('scene-1', mockEditorEmployee, {
        expectedVersionNumber: 1,
        changeReason: 'Adjusted padding',
        operationCode: 'EDIT_LAYOUT',
        layers: [],
      });

      expect(res.versionNumber).toBe(2);
      expect(res.parentVersionId).toBe('ver-1');
    });
  });

  describe('CREATIVE-API-11 to 13 — Render request, lifecycle, and preview retrieval', () => {
    it('executes server preview render and returns visualAssetId and preview URL', async () => {
      mockRenderPreviewUseCase.execute.mockResolvedValue({
        visualAssetId: 'asset-preview-1',
        storageKey: 'cas/previews/scene-1/v1_abc.png',
        width: 1080,
        height: 1080,
        sha256: '1'.repeat(64),
        byteSize: 125000,
        mimeType: 'image/png',
        validationStatus: 'PASSED',
        isPassed: true,
        findings: [],
        aestheticScore: 9.4,
        previewUrl: '/v1/creative/renders/asset-preview-1/file',
      });

      const res = await controller.renderPreview('scene-1', mockEditorEmployee);

      expect(res.visualAssetId).toBe('asset-preview-1');
      expect(res.validationStatus).toBe('PASSED');
      expect(res.isPassed).toBe(true);
      expect(res.aestheticScore).toBe(9.4);
    });

    it('retrieves render metadata for an existing asset', async () => {
      mockVisualAssetRepo.findById.mockResolvedValue({
        id: 'asset-preview-1',
        creativeJobId: 'job-1',
        versionNumber: 1,
        assetRole: 'COMPOSITED_CREATIVE',
        mimeType: 'image/png',
        width: 1080,
        height: 1080,
        byteSize: 125000,
        sha256: '1'.repeat(64),
        storageKey: 'cas/previews/scene-1/v1_abc.png',
        sourceProductAssetDigest: '2'.repeat(64),
        createdAt: new Date(),
      });

      const meta = await controller.getRenderMetadata('asset-preview-1');
      expect(meta.id).toBe('asset-preview-1');
      expect(meta.width).toBe(1080);
      expect(meta.mimeType).toBe('image/png');
    });

    it('throws NotFoundException when render does not exist', async () => {
      mockVisualAssetRepo.findById.mockResolvedValue(null);
      await expect(controller.getRenderMetadata('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('CREATIVE-API-15 & 16 — Visual hard-gate rejection and soft aesthetic score separation', () => {
    it('reports blocking findings and soft aesthetic scoring via validateProject', async () => {
      mockValidateProjectUseCase.execute.mockResolvedValue({
        isPassed: false,
        blockingCount: 1,
        warningCount: 1,
        infoCount: 0,
        findings: [
          {
            code: 'GATE_SAFE_MARGIN_VIOLATION',
            severity: 'BLOCKING',
            message: 'Layer typo_01 extends outside safe margin',
            field: 'layers.typo_01.bounds',
          },
          {
            code: 'GATE_TEXT_CONTRAST_LOW',
            severity: 'WARNING',
            message: 'Borderline contrast',
            field: 'layers.typo_01.payload.headline.color',
          },
        ],
        aestheticScore: 6.7,
        aestheticGrade: 'FAIR',
      });

      const res = await controller.validateProject('scene-1', mockEditorEmployee, {
        versionNumber: 1,
      });

      expect(res.isPassed).toBe(false);
      expect(res.blockingCount).toBe(1);
      expect(res.aestheticScore).toBe(6.7);
      expect(res.aestheticGrade).toBe('FAIR');
    });
  });

  describe('CREATIVE-API-17 to 20 — Multi-format export and no unapproved export bypass', () => {
    it('blocks export with BadRequestException when creative is not approved', async () => {
      mockSceneRepo.findById.mockResolvedValue({
        id: 'scene-1',
        creativeJobId: 'job-unapproved-1',
        campaignId: null,
        title: 'Draft Poster',
        currentVersionNumber: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockExportPosterUseCase.execute.mockRejectedValue(
        new Error(
          'Creative job job-unapproved-1 is not approved for export (current status: REQUESTED)',
        ),
      );

      await expect(
        controller.exportProject('scene-1', mockApproverEmployee, {
          format: 'SQUARE_1080',
          encoding: 'PNG',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows export when creative job is approved', async () => {
      mockSceneRepo.findById.mockResolvedValue({
        id: 'scene-1',
        creativeJobId: 'job-approved-1',
        campaignId: null,
        title: 'Approved Poster',
        currentVersionNumber: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockExportPosterUseCase.execute.mockResolvedValue({
        buffer: Buffer.from('png-bytes'),
        mimeType: 'image/png',
        filename: 'parisian-poster-1080x1080.png',
        width: 1080,
        height: 1080,
        sha256: '9'.repeat(64),
        byteSize: 250000,
        exportId: 'export-uuid-1',
        storageKey: 'cas/exports/export-1.png',
      });

      const res = await controller.exportProject('scene-1', mockApproverEmployee, {
        format: 'SQUARE_1080',
        encoding: 'PNG',
      });

      expect(res.exportId).toBe('export-uuid-1');
      expect(res.width).toBe(1080);
      expect(res.height).toBe(1080);
      expect(res.downloadUrl).toContain('/v1/creative/exports/export-uuid-1/download');
    });
  });

  describe('CREATIVE-API-09 to 11 — Approval, Rejection, and Submission workflows', () => {
    it('approves a creative project via ApproveCreativeUseCase', async () => {
      mockSceneRepo.findById.mockResolvedValue({
        id: 'scene-1',
        creativeJobId: 'job-1',
        campaignId: null,
        title: 'Ready Poster',
        currentVersionNumber: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockApproveCreativeUseCase.execute.mockResolvedValue({
        approvalEvent: {
          id: 'event-1',
          creativeJobId: 'job-1',
          visualAssetId: 'asset-1',
          decision: 'CREATIVE_APPROVED',
          approverUserId: mockApproverEmployee.id,
          createdAt: new Date(),
        },
      });

      const res = await controller.approveProject('scene-1', mockApproverEmployee, {
        comment: 'Looks great!',
      });

      expect(res.decision).toBe('CREATIVE_APPROVED');
      expect(mockApproveCreativeUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          creativeJobId: 'job-1',
          approvedBy: mockApproverEmployee.id,
        }),
      );
    });

    it('rejects a creative project via RejectCreativeUseCase', async () => {
      mockSceneRepo.findById.mockResolvedValue({
        id: 'scene-1',
        creativeJobId: 'job-1',
        campaignId: null,
        title: 'Ready Poster',
        currentVersionNumber: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockRejectCreativeUseCase.execute.mockResolvedValue({
        approvalEvent: {
          id: 'event-2',
          creativeJobId: 'job-1',
          visualAssetId: 'asset-1',
          decision: 'CREATIVE_REJECTED',
          approverUserId: mockApproverEmployee.id,
          comment: 'Color palette contrast issue',
          createdAt: new Date(),
        },
      });

      const res = await controller.rejectProject('scene-1', mockApproverEmployee, {
        reason: 'Color palette contrast issue',
      });

      expect(res.decision).toBe('CREATIVE_REJECTED');
      expect(mockRejectCreativeUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          creativeJobId: 'job-1',
          rejectedBy: mockApproverEmployee.id,
          comment: 'Color palette contrast issue',
        }),
      );
    });

    it('submits a project for review', async () => {
      mockSceneRepo.findById.mockResolvedValue({
        id: 'scene-1',
        creativeJobId: 'job-1',
        campaignId: null,
        title: 'Draft Poster',
        currentVersionNumber: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockJobRepo.findById.mockResolvedValue({
        id: 'job-1',
        productSnapshotId: 'snap-1',
        contentVersionId: 'cv-1',
        requestedByUserId: mockEditorEmployee.id,
        brandRuleVersionId: 'brv-1',
        targetPlatform: 'TELEGRAM',
        aspectRatio: '1:1',
        creativeProfile: 'PARISIAN_ELEGANCE',
        status: 'VALIDATING',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockSceneRepo.findLatestVersionBySceneId.mockResolvedValue({
        id: 'ver-1',
        sceneId: 'scene-1',
        versionNumber: 1,
        aspectRatio: '1:1',
        width: 1080,
        height: 1080,
        templateId: 'CENTERED_HERO',
        templateVersion: '1.0.0',
        language: 'EN',
        safeMargins: { top: 40, bottom: 40, left: 40, right: 40 },
        brandProfileVersionId: 'bp-1',
        sourceContentVersionId: 'cv-1',
        productSnapshotId: 'snap-1',
        sceneHash: 'hash-1',
        dependencyHash: 'dep-hash-1',
        requestedByUserId: mockEditorEmployee.id,
        layers: [],
        dependencies: [],
        createdAt: new Date(),
      });

      const res = await controller.submitProject('scene-1', mockEditorEmployee);

      expect(res.status).toBe('READY_FOR_REVIEW');
      expect(mockJobRepo.transitionStatus).toHaveBeenCalledWith(
        'job-1',
        'VALIDATING',
        'READY_FOR_REVIEW',
      );
      expect(mockSceneRepo.updateVersionState).toHaveBeenCalledWith('ver-1', {
        status: 'READY_FOR_REVIEW',
        isExportEligible: false,
      });
    });
  });
});
