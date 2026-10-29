/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any */
import { jest } from '@jest/globals';
import { CreateCampaignUseCase } from './create-campaign.use-case.js';
import { GetCampaignDetailUseCase } from './get-campaign-detail.use-case.js';
import { ChangeCampaignStatusUseCase } from './change-campaign-status.use-case.js';
import { AssociateCampaignProductUseCase } from './associate-campaign-product.use-case.js';
import { RemoveCampaignProductUseCase } from './remove-campaign-product.use-case.js';
import type { CampaignRepository, CampaignDetail } from './campaign.repository.js';
import type { ProductSnapshotRepository } from '../../products/application/product-snapshot.repository.js';
import {
  CampaignForbiddenError,
  CampaignNotFoundError,
  DuplicateCampaignCodeError,
  DuplicateCampaignProductError,
  InvalidCampaignDateRangeError,
  InvalidCampaignStatusTransitionError,
} from '../domain/campaign-errors.js';
import { ProductSnapshotNotFoundError } from '../../products/domain/product-errors.js';
import { CampaignStatus } from '../domain/campaign.types.js';
import { Permission } from '../../auth/domain/permissions.js';

describe('Campaign Application Use Cases', () => {
  let mockCampaignRepo: jest.Mocked<CampaignRepository>;
  let mockSnapshotRepo: jest.Mocked<ProductSnapshotRepository>;

  const sampleCampaign: CampaignDetail = {
    id: '11111111-1111-4000-8000-111111111111',
    code: 'CAMP-ROSE-2026',
    name: 'Rose De Grasse Spring Spotlight',
    objective: "Promote luxury niche floral fragrance for Mother's Day",
    description: 'High-end social media and Telegram campaign.',
    status: CampaignStatus.DRAFT,
    startDate: new Date('2026-05-01T00:00:00.000Z'),
    endDate: new Date('2026-05-15T00:00:00.000Z'),
    createdById: 'user-emp-001',
    createdByDisplayName: 'Chanel Lead',
    productCount: 1,
    products: [
      {
        id: 'assoc-001',
        campaignId: '11111111-1111-4000-8000-111111111111',
        productSnapshotId: 'snap-001',
        sortOrder: 0,
        isHero: true,
        notes: 'Hero featured fragrance',
        targetPromoPrice: 195.0,
        targetDiscountPercent: 15.0,
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        productSku: 'PERF-ROSE-001',
        productTitle: 'Rose Impériale EDP 100ml',
        brandName: 'Maison Royale',
        catalogPriceUsd: 230.0,
      },
    ],
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
  };

  beforeEach(() => {
    mockCampaignRepo = {
      findById: jest.fn<CampaignRepository['findById']>().mockResolvedValue(sampleCampaign),
      findByCode: jest.fn<CampaignRepository['findByCode']>().mockResolvedValue(null),
      findPaginated: jest.fn<CampaignRepository['findPaginated']>().mockResolvedValue({
        items: [sampleCampaign],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      }),
      create: jest.fn<CampaignRepository['create']>().mockResolvedValue(sampleCampaign),
      update: jest.fn<CampaignRepository['update']>().mockResolvedValue(sampleCampaign),
      updateStatus: jest.fn<CampaignRepository['updateStatus']>().mockResolvedValue(sampleCampaign),
      addProduct: jest
        .fn<CampaignRepository['addProduct']>()
        .mockResolvedValue(sampleCampaign.products[0]!),
      removeProduct: jest.fn<CampaignRepository['removeProduct']>().mockResolvedValue(undefined),
      delete: jest.fn<CampaignRepository['delete']>().mockResolvedValue(undefined),
    };

    mockSnapshotRepo = {
      findById: jest.fn<ProductSnapshotRepository['findById']>().mockResolvedValue({
        id: 'snap-001',
        product: {
          sku: 'PERF-ROSE-001',
          name: 'Rose Impériale EDP 100ml',
          brand: 'Maison Royale',
          priceUsd: 230.0,
        } as any,
        snapshotHash: 'snap-hash-01',
        normalizerVersion: 'v1',
        createdAt: new Date(),
      }),
      create: jest.fn<ProductSnapshotRepository['create']>(),
    };
  });

  describe('CreateCampaignUseCase', () => {
    it('creates a campaign with valid inputs', async () => {
      const useCase = new CreateCampaignUseCase(mockCampaignRepo);
      const result = await useCase.execute({
        code: 'CAMP-ROSE-2026',
        name: 'Rose De Grasse Spring',
        objective: 'Spring Spotlight',
        startDate: new Date('2026-05-01'),
        endDate: new Date('2026-05-15'),
        createdById: 'user-emp-001',
      });

      expect(result).toBeDefined();
      expect(mockCampaignRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'CAMP-ROSE-2026',
          status: CampaignStatus.DRAFT,
          createdById: 'user-emp-001',
        }),
      );
    });

    it('rejects campaign creation if end date is earlier than start date', async () => {
      const useCase = new CreateCampaignUseCase(mockCampaignRepo);
      await expect(
        useCase.execute({
          code: 'CAMP-INVALID',
          name: 'Invalid Dates',
          objective: 'Test',
          startDate: new Date('2026-05-15'),
          endDate: new Date('2026-05-01'),
          createdById: 'user-emp-001',
        }),
      ).rejects.toThrow(InvalidCampaignDateRangeError);
    });

    it('rejects duplicate campaign code', async () => {
      mockCampaignRepo.findByCode.mockResolvedValueOnce(sampleCampaign);
      const useCase = new CreateCampaignUseCase(mockCampaignRepo);
      await expect(
        useCase.execute({
          code: 'CAMP-ROSE-2026',
          name: 'Rose De Grasse Spring',
          objective: 'Spring Spotlight',
          createdById: 'user-emp-001',
        }),
      ).rejects.toThrow(DuplicateCampaignCodeError);
    });
  });

  describe('GetCampaignDetailUseCase', () => {
    it('retrieves campaign by UUID for user with VIEW_ALL_CONTENT', async () => {
      const useCase = new GetCampaignDetailUseCase(mockCampaignRepo);
      const result = await useCase.execute({
        idOrCode: sampleCampaign.id,
        actingUserId: 'other-user',
        permissions: [Permission.VIEW_ALL_CONTENT],
      });
      expect(result.id).toBe(sampleCampaign.id);
      expect(mockCampaignRepo.findById).toHaveBeenCalledWith(sampleCampaign.id);
    });

    it('allows creator to view campaign with VIEW_OWN_CONTENT', async () => {
      mockCampaignRepo.findById.mockResolvedValueOnce(null);
      mockCampaignRepo.findByCode.mockResolvedValueOnce(sampleCampaign);
      const useCase = new GetCampaignDetailUseCase(mockCampaignRepo);
      const result = await useCase.execute({
        idOrCode: sampleCampaign.code,
        actingUserId: 'user-emp-001',
        permissions: [Permission.VIEW_OWN_CONTENT],
      });
      expect(result.code).toBe(sampleCampaign.code);
      expect(mockCampaignRepo.findByCode).toHaveBeenCalledWith(sampleCampaign.code);
    });

    it('forbids non-owner from viewing campaign if they only have VIEW_OWN_CONTENT', async () => {
      const useCase = new GetCampaignDetailUseCase(mockCampaignRepo);
      await expect(
        useCase.execute({
          idOrCode: sampleCampaign.id,
          actingUserId: 'unauthorized-user',
          permissions: [Permission.VIEW_OWN_CONTENT],
        }),
      ).rejects.toThrow(CampaignForbiddenError);
    });

    it('throws CampaignNotFoundError when campaign does not exist', async () => {
      mockCampaignRepo.findById.mockResolvedValueOnce(null);
      const useCase = new GetCampaignDetailUseCase(mockCampaignRepo);
      await expect(
        useCase.execute({
          idOrCode: '22222222-2222-4000-8000-222222222222',
          actingUserId: 'user-emp-001',
          permissions: [Permission.VIEW_ALL_CONTENT],
        }),
      ).rejects.toThrow(CampaignNotFoundError);
    });
  });

  describe('ChangeCampaignStatusUseCase', () => {
    it('transitions DRAFT to PLANNED when at least 1 product is present', async () => {
      const useCase = new ChangeCampaignStatusUseCase(mockCampaignRepo);
      await useCase.execute({
        id: sampleCampaign.id,
        nextStatus: CampaignStatus.PLANNED,
        actingUserId: 'user-emp-001',
        permissions: [Permission.EDIT_CONTENT],
      });
      expect(mockCampaignRepo.updateStatus).toHaveBeenCalledWith(
        sampleCampaign.id,
        CampaignStatus.PLANNED,
      );
    });

    it('rejects transitioning to PLANNED if no products are associated', async () => {
      mockCampaignRepo.findById.mockResolvedValueOnce({
        ...sampleCampaign,
        productCount: 0,
        products: [],
      });
      const useCase = new ChangeCampaignStatusUseCase(mockCampaignRepo);
      await expect(
        useCase.execute({
          id: sampleCampaign.id,
          nextStatus: CampaignStatus.PLANNED,
          actingUserId: 'user-emp-001',
          permissions: [Permission.EDIT_CONTENT],
        }),
      ).rejects.toThrow(InvalidCampaignStatusTransitionError);
    });

    it('rejects transitioning to ACTIVE if user lacks APPROVE_CONTENT', async () => {
      mockCampaignRepo.findById.mockResolvedValueOnce({
        ...sampleCampaign,
        status: CampaignStatus.PLANNED,
      });
      const useCase = new ChangeCampaignStatusUseCase(mockCampaignRepo);
      await expect(
        useCase.execute({
          id: sampleCampaign.id,
          nextStatus: CampaignStatus.ACTIVE,
          actingUserId: 'user-emp-001',
          permissions: [Permission.EDIT_CONTENT], // missing APPROVE_CONTENT
        }),
      ).rejects.toThrow(CampaignForbiddenError);
    });

    it('rejects invalid status transitions like DRAFT -> COMPLETED', async () => {
      const useCase = new ChangeCampaignStatusUseCase(mockCampaignRepo);
      await expect(
        useCase.execute({
          id: sampleCampaign.id,
          nextStatus: CampaignStatus.COMPLETED,
          actingUserId: 'user-emp-001',
          permissions: [Permission.APPROVE_CONTENT, Permission.EDIT_CONTENT],
        }),
      ).rejects.toThrow(InvalidCampaignStatusTransitionError);
    });
  });

  describe('AssociateCampaignProductUseCase (Commercial Integrity Invariant)', () => {
    it('associates verified product snapshot without mutating catalog snapshot price', async () => {
      mockCampaignRepo.findById.mockResolvedValueOnce({
        ...sampleCampaign,
        products: [], // currently empty
      });
      const useCase = new AssociateCampaignProductUseCase(mockCampaignRepo, mockSnapshotRepo);

      const result = await useCase.execute({
        campaignId: sampleCampaign.id,
        productSnapshotId: 'snap-001',
        targetPromoPrice: 180.0,
        targetDiscountPercent: 20.0,
        isHero: true,
        notes: "Featured Mother's day offer",
        actingUserId: 'user-emp-001',
        permissions: [Permission.EDIT_CONTENT],
      });

      expect(result).toBeDefined();
      // Verifies repository received targetPromoPrice
      expect(mockCampaignRepo.addProduct).toHaveBeenCalledWith(
        sampleCampaign.id,
        expect.objectContaining({
          productSnapshotId: 'snap-001',
          targetPromoPrice: 180.0,
          targetDiscountPercent: 20.0,
          isHero: true,
        }),
      );
      // COMMERCIAL INTEGRITY INVARIANT:
      // Product snapshot repository create() MUST NEVER be called
      expect(mockSnapshotRepo.create).not.toHaveBeenCalled();
    });

    it('rejects association if product snapshot does not exist', async () => {
      mockSnapshotRepo.findById.mockResolvedValueOnce(null);
      const useCase = new AssociateCampaignProductUseCase(mockCampaignRepo, mockSnapshotRepo);

      await expect(
        useCase.execute({
          campaignId: sampleCampaign.id,
          productSnapshotId: 'non-existent-snap',
          actingUserId: 'user-emp-001',
          permissions: [Permission.EDIT_CONTENT],
        }),
      ).rejects.toThrow(ProductSnapshotNotFoundError);
    });

    it('rejects duplicate product snapshot association', async () => {
      const useCase = new AssociateCampaignProductUseCase(mockCampaignRepo, mockSnapshotRepo);

      await expect(
        useCase.execute({
          campaignId: sampleCampaign.id,
          productSnapshotId: 'snap-001', // already in sampleCampaign.products
          actingUserId: 'user-emp-001',
          permissions: [Permission.EDIT_CONTENT],
        }),
      ).rejects.toThrow(DuplicateCampaignProductError);
    });
  });

  describe('RemoveCampaignProductUseCase', () => {
    it('removes product association for authorized user', async () => {
      const useCase = new RemoveCampaignProductUseCase(mockCampaignRepo);
      await useCase.execute({
        campaignId: sampleCampaign.id,
        productSnapshotIdOrAssocId: 'assoc-001',
        actingUserId: 'user-emp-001',
        permissions: [Permission.EDIT_CONTENT],
      });
      expect(mockCampaignRepo.removeProduct).toHaveBeenCalledWith(sampleCampaign.id, 'assoc-001');
    });

    it('rejects removing products from an ARCHIVED campaign', async () => {
      mockCampaignRepo.findById.mockResolvedValueOnce({
        ...sampleCampaign,
        status: CampaignStatus.ARCHIVED,
      });
      const useCase = new RemoveCampaignProductUseCase(mockCampaignRepo);
      await expect(
        useCase.execute({
          campaignId: sampleCampaign.id,
          productSnapshotIdOrAssocId: 'assoc-001',
          actingUserId: 'user-emp-001',
          permissions: [Permission.EDIT_CONTENT],
        }),
      ).rejects.toThrow(InvalidCampaignStatusTransitionError);
    });
  });
});
