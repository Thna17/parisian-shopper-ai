/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment */
import { jest } from '@jest/globals';
import {
  type CampaignDetail,
  type CampaignProductRecord,
  type CampaignSummary,
  CampaignStatus,
  Permission,
  type SanitizedEmployeeDto,
  type AssociateCampaignProductUseCase,
  type ChangeCampaignStatusUseCase,
  type CreateCampaignUseCase,
  type GetCampaignDetailUseCase,
  type ListCampaignsUseCase,
  type RemoveCampaignProductUseCase,
  type UpdateCampaignUseCase,
} from '@parisian-shopper/application';
import { CampaignsController } from './campaigns.controller.js';
import { type CreateCampaignDto } from './dto/create-campaign.dto.js';
import { type UpdateCampaignDto } from './dto/update-campaign.dto.js';
import { type AssociateProductDto } from './dto/associate-product.dto.js';

describe('CampaignsController', () => {
  let controller: CampaignsController;
  let mockListCampaignsUseCase: jest.Mocked<ListCampaignsUseCase>;
  let mockCreateCampaignUseCase: jest.Mocked<CreateCampaignUseCase>;
  let mockGetCampaignDetailUseCase: jest.Mocked<GetCampaignDetailUseCase>;
  let mockUpdateCampaignUseCase: jest.Mocked<UpdateCampaignUseCase>;
  let mockChangeCampaignStatusUseCase: jest.Mocked<ChangeCampaignStatusUseCase>;
  let mockAssociateCampaignProductUseCase: jest.Mocked<AssociateCampaignProductUseCase>;
  let mockRemoveCampaignProductUseCase: jest.Mocked<RemoveCampaignProductUseCase>;

  const mockEmployee: SanitizedEmployeeDto = {
    id: 'emp-uuid-001',
    displayName: 'Golden Editor',
    status: 'ACTIVE',
    roles: ['MARKETING_EDITOR'],
    permissions: [
      Permission.VIEW_OWN_CONTENT,
      Permission.VIEW_ALL_CONTENT,
      Permission.CREATE_CONTENT,
      Permission.EDIT_CONTENT,
      Permission.VIEW_PRODUCTS,
    ],
  };

  const sampleCampaignSummary: CampaignSummary = {
    id: 'camp-uuid-001',
    code: 'CAMP-ROSE-2026',
    name: 'Rose Impériale Spring Campaign',
    objective: "Mother's Day promotion",
    description: 'High end social media spotlight',
    status: CampaignStatus.DRAFT,
    startDate: new Date('2026-05-01T00:00:00.000Z'),
    endDate: new Date('2026-05-15T00:00:00.000Z'),
    createdById: 'emp-uuid-001',
    createdByDisplayName: 'Golden Editor',
    productCount: 1,
    heroProductSku: 'PERF-ROSE-001',
    heroProductTitle: 'Rose Impériale EDP 100ml',
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
  };

  const sampleProductRecord: CampaignProductRecord = {
    id: 'assoc-001',
    campaignId: 'camp-uuid-001',
    productSnapshotId: 'snap-001',
    sortOrder: 0,
    isHero: true,
    notes: 'Hero spotlight item',
    targetPromoPrice: 195.0,
    targetDiscountPercent: 15.0,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    productSku: 'PERF-ROSE-001',
    productTitle: 'Rose Impériale EDP 100ml',
    brandName: 'Maison Royale',
    catalogPriceUsd: 230.0,
    heroAssetUrl: 'https://cdn.example.com/rose-hero.png',
  };

  const sampleCampaignDetail: CampaignDetail = {
    ...sampleCampaignSummary,
    products: [sampleProductRecord],
  };

  beforeEach(() => {
    mockListCampaignsUseCase = {
      execute: jest.fn<ListCampaignsUseCase['execute']>().mockResolvedValue({
        items: [sampleCampaignSummary],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      }),
    } as unknown as jest.Mocked<ListCampaignsUseCase>;

    mockCreateCampaignUseCase = {
      execute: jest.fn<CreateCampaignUseCase['execute']>().mockResolvedValue(sampleCampaignDetail),
    } as unknown as jest.Mocked<CreateCampaignUseCase>;

    mockGetCampaignDetailUseCase = {
      execute: jest
        .fn<GetCampaignDetailUseCase['execute']>()
        .mockResolvedValue(sampleCampaignDetail),
    } as unknown as jest.Mocked<GetCampaignDetailUseCase>;

    mockUpdateCampaignUseCase = {
      execute: jest.fn<UpdateCampaignUseCase['execute']>().mockResolvedValue(sampleCampaignDetail),
    } as unknown as jest.Mocked<UpdateCampaignUseCase>;

    mockChangeCampaignStatusUseCase = {
      execute: jest.fn<ChangeCampaignStatusUseCase['execute']>().mockResolvedValue({
        ...sampleCampaignDetail,
        status: CampaignStatus.PLANNED,
      }),
    } as unknown as jest.Mocked<ChangeCampaignStatusUseCase>;

    mockAssociateCampaignProductUseCase = {
      execute: jest
        .fn<AssociateCampaignProductUseCase['execute']>()
        .mockResolvedValue(sampleProductRecord),
    } as unknown as jest.Mocked<AssociateCampaignProductUseCase>;

    mockRemoveCampaignProductUseCase = {
      execute: jest.fn<RemoveCampaignProductUseCase['execute']>().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RemoveCampaignProductUseCase>;

    controller = new CampaignsController(
      mockListCampaignsUseCase,
      mockCreateCampaignUseCase,
      mockGetCampaignDetailUseCase,
      mockUpdateCampaignUseCase,
      mockChangeCampaignStatusUseCase,
      mockAssociateCampaignProductUseCase,
      mockRemoveCampaignProductUseCase,
    );
  });

  it('CAMP-API-01: lists campaigns with pagination and filters', async () => {
    const result = await controller.listCampaigns(
      { page: 1, limit: 10, search: 'Rose', status: CampaignStatus.DRAFT },
      mockEmployee,
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.code).toBe('CAMP-ROSE-2026');
    expect(mockListCampaignsUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        limit: 10,
        search: 'Rose',
        status: CampaignStatus.DRAFT,
        actingUserId: mockEmployee.id,
        permissions: mockEmployee.permissions,
      }),
    );
  });

  it('CAMP-API-02: creates a campaign deriving createdById from authenticated session', async () => {
    const dto: CreateCampaignDto = {
      code: 'CAMP-ROSE-2026',
      name: 'Rose Impériale Spring Campaign',
      objective: "Mother's Day promotion",
      description: 'High end social media spotlight',
      startDate: '2026-05-01T00:00:00.000Z',
      endDate: '2026-05-15T00:00:00.000Z',
    };

    const result = await controller.createCampaign(dto, mockEmployee);

    expect(result.id).toBe('camp-uuid-001');
    expect(result.code).toBe('CAMP-ROSE-2026');
    expect(mockCreateCampaignUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        code: dto.code,
        name: dto.name,
        objective: dto.objective,
        createdById: mockEmployee.id, // derived from authenticated session
      }),
    );
  });

  it('CAMP-API-03: retrieves campaign details by identifier', async () => {
    const result = await controller.getCampaign('camp-uuid-001', mockEmployee);

    expect(result.id).toBe('camp-uuid-001');
    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.catalogPriceUsd).toBe(230.0);
    expect(result.products[0]?.targetPromoPrice).toBe(195.0);
    expect(mockGetCampaignDetailUseCase.execute).toHaveBeenCalledWith({
      idOrCode: 'camp-uuid-001',
      actingUserId: mockEmployee.id,
      permissions: mockEmployee.permissions,
    });
  });

  it('CAMP-API-04: updates allowed campaign attributes', async () => {
    const dto: UpdateCampaignDto = {
      name: 'Updated Campaign Name',
      objective: 'Updated Strategic Objective',
    };

    const result = await controller.updateCampaign('camp-uuid-001', dto, mockEmployee);

    expect(result).toBeDefined();
    expect(mockUpdateCampaignUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'camp-uuid-001',
        actingUserId: mockEmployee.id,
        permissions: mockEmployee.permissions,
        updates: expect.objectContaining({
          name: 'Updated Campaign Name',
          objective: 'Updated Strategic Objective',
        }),
      }),
    );
  });

  it('CAMP-API-05: changes campaign lifecycle status', async () => {
    const result = await controller.changeStatus(
      'camp-uuid-001',
      { status: CampaignStatus.PLANNED },
      mockEmployee,
    );

    expect(result.status).toBe(CampaignStatus.PLANNED);
    expect(mockChangeCampaignStatusUseCase.execute).toHaveBeenCalledWith({
      id: 'camp-uuid-001',
      nextStatus: CampaignStatus.PLANNED,
      actingUserId: mockEmployee.id,
      permissions: mockEmployee.permissions,
    });
  });

  it('CAMP-API-06: associates product snapshot with proposed target pricing without mutating snapshot MSRP', async () => {
    const dto: AssociateProductDto = {
      productSnapshotId: 'snap-001',
      isHero: true,
      notes: 'Hero spotlight item',
      targetPromoPrice: 195.0,
      targetDiscountPercent: 15.0,
    };

    const result = await controller.addProduct('camp-uuid-001', dto, mockEmployee);

    expect(result.productSnapshotId).toBe('snap-001');
    expect(result.targetPromoPrice).toBe(195.0);
    expect(result.catalogPriceUsd).toBe(230.0);
    expect(mockAssociateCampaignProductUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: 'camp-uuid-001',
        productSnapshotId: 'snap-001',
        targetPromoPrice: 195.0,
        targetDiscountPercent: 15.0,
        isHero: true,
      }),
    );
  });

  it('CAMP-API-07: removes product association from campaign', async () => {
    await controller.removeProduct('camp-uuid-001', 'snap-001', mockEmployee);

    expect(mockRemoveCampaignProductUseCase.execute).toHaveBeenCalledWith({
      campaignId: 'camp-uuid-001',
      productSnapshotIdOrAssocId: 'snap-001',
      actingUserId: mockEmployee.id,
      permissions: mockEmployee.permissions,
    });
  });
});
