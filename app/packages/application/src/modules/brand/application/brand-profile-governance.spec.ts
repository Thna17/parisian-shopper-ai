/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Permission } from '../../auth/domain/permissions.js';
import {
  BrandProfileNotFoundError,
  DuplicateBrandProfileError,
  InsufficientBrandPermissionError,
  InvalidBrandProfileStateTransitionError,
} from '../domain/brand-errors.js';
import type {
  BrandProfileVersionDraft,
  BrandProfileVersionRecord,
} from '../domain/brand-profile.types.js';
import { ActivateBrandProfileUseCase } from './activate-brand-profile.use-case.js';
import { AssembleBrandBriefUseCase } from './assemble-brand-brief.use-case.js';
import { type BrandProfileRepository } from './brand-profile.repository.js';
import { CreateBrandProfileDraftUseCase } from './create-brand-profile-draft.use-case.js';
import { GetActiveBrandProfileUseCase } from './get-active-brand-profile.use-case.js';
import { ListBrandProfilesUseCase } from './list-brand-profiles.use-case.js';
import { RollbackBrandProfileUseCase } from './rollback-brand-profile.use-case.js';

describe('SEC-BRAND-01 to SEC-BRAND-10: Brand Profile Governance & Targeted Rollback', () => {
  let mockRepo: jest.Mocked<BrandProfileRepository>;
  let createDraftUseCase: CreateBrandProfileDraftUseCase;
  let activateUseCase: ActivateBrandProfileUseCase;
  let rollbackUseCase: RollbackBrandProfileUseCase;
  let getActiveUseCase: GetActiveBrandProfileUseCase;
  let listProfilesUseCase: ListBrandProfilesUseCase;
  let assembleBriefUseCase: AssembleBrandBriefUseCase;

  const sampleDraft: BrandProfileVersionDraft = {
    name: 'PARISIAN_LUXURY_V1',
    evaluationPolicyId: 'default-anti-regurgitation-policy-v1',
    languagePolicy: {
      formality: 'LUXURY_FORMAL',
      primaryLanguage: 'BILINGUAL',
      khmerConventions: {
        scriptStyle: 'Moul',
        spacingRules: 'Zero-width space between phrases',
        disallowedLoanwords: ['discount', 'super sale'],
      },
      englishConventions: {
        tone: 'Parisian understated luxury',
        capitalization: 'SENTENCE_CASE',
      },
    },
    toneRules: {
      luxuryAttributes: ['sensorial', 'artisan craftsmanship', 'Parisian heritage'],
      prohibitedHyperbole: ['cheapest price', 'crazy discount'],
      allowedEmojis: ['✨', '🌿'],
      maxEmojisPerPost: 2,
    },
    visualAestheticRules: {
      approvedColorPalettes: [
        { name: 'Haussmann Gold', hexCodes: ['#D4AF37', '#F5F5DC', '#1C1C1C'] },
      ],
      lightingStyles: ['Soft morning window illumination'],
      textures: ['French limestone', 'brushed brass'],
      pedestals: ['Minimalist fluted stone cylinder'],
    },
    typographyRules: {
      headlineFont: 'Playfair Display',
      bodyFontKhmer: 'Battambang',
      bodyFontLatin: 'Inter',
      minimumLeadingRatio: 1.4,
    },
    logoRules: {
      clearSpaceRatio: 0.5,
      allowedPlacements: ['TOP_CENTER', 'BOTTOM_CENTER'],
      defaultVariant: 'GOLD',
    },
    approvedExampleIds: ['ex-001', 'ex-002'],
    prohibitedPatterns: ['cheap', 'bargain'],
    approvedByUserId: 'usr-admin-01',
  };

  const sampleActiveRecord: BrandProfileVersionRecord = {
    ...sampleDraft,
    id: 'prof-v1-uuid',
    versionNumber: 1,
    name: 'PARISIAN_LUXURY_V1',
    status: 'ACTIVE',
    benchmarkReport: null,
    activatedAt: new Date('2026-10-01T00:00:00Z'),
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
  };

  const sampleV2Record: BrandProfileVersionRecord = {
    ...sampleActiveRecord,
    id: 'prof-v2-uuid',
    versionNumber: 2,
    status: 'DRAFT',
    activatedAt: null,
  };

  beforeEach(() => {
    mockRepo = {
      createDraft: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
        id: 'prof-v2-uuid',
        versionNumber: 2,
        status: 'DRAFT',
        ...sampleDraft,
        benchmarkReport: null,
        activatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      findById: jest.fn<(...args: any[]) => Promise<any>>().mockImplementation((id: string) => {
        if (id === 'prof-v1-uuid') return Promise.resolve(sampleActiveRecord);
        if (id === 'prof-v2-uuid') return Promise.resolve(sampleV2Record);
        return Promise.resolve(null);
      }),
      findByNameAndVersion: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(null),
      findActive: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(sampleActiveRecord),
      listProfiles: jest
        .fn<(...args: any[]) => Promise<any>>()
        .mockResolvedValue([sampleActiveRecord]),
      updateStatus: jest
        .fn<(...args: any[]) => Promise<any>>()
        .mockResolvedValue(sampleActiveRecord),
      activateVersion: jest
        .fn<(...args: any[]) => Promise<any>>()
        .mockImplementation((_id: string, userId: string) =>
          Promise.resolve({
            ...sampleV2Record,
            status: 'ACTIVE',
            activatedAt: new Date(),
            approvedByUserId: userId,
          }),
        ),
      rollbackToVersion: jest
        .fn<(...args: any[]) => Promise<any>>()
        .mockImplementation((_targetId: string, userId: string) =>
          Promise.resolve({
            revokedProfile: {
              ...sampleV2Record,
              status: 'REVOKED',
            },
            restoredProfile: {
              ...sampleActiveRecord,
              status: 'ACTIVE',
              activatedAt: new Date(),
              approvedByUserId: userId,
            },
          }),
        ),
    };

    createDraftUseCase = new CreateBrandProfileDraftUseCase(mockRepo);
    activateUseCase = new ActivateBrandProfileUseCase(mockRepo);
    rollbackUseCase = new RollbackBrandProfileUseCase(mockRepo);
    getActiveUseCase = new GetActiveBrandProfileUseCase(mockRepo);
    listProfilesUseCase = new ListBrandProfilesUseCase(mockRepo);
    assembleBriefUseCase = new AssembleBrandBriefUseCase(mockRepo);
  });

  it('SEC-BRAND-01: Non-admin user cannot create brand profile draft', async () => {
    await expect(
      createDraftUseCase.execute({
        ...sampleDraft,
        permissions: [Permission.VIEW_ALL_CONTENT],
      }),
    ).rejects.toThrow(InsufficientBrandPermissionError);
  });

  it('SEC-BRAND-02: Admin user successfully creates draft with sequential version index', async () => {
    const result = await createDraftUseCase.execute({
      ...sampleDraft,
      permissions: [Permission.ADMIN],
    });
    expect(result.id).toBe('prof-v2-uuid');
    expect(result.status).toBe('DRAFT');
    expect(mockRepo.createDraft).toHaveBeenCalled();
  });

  it('SEC-BRAND-03: Duplicate name and version draft throws DuplicateBrandProfileError', async () => {
    mockRepo.findByNameAndVersion.mockResolvedValueOnce(sampleActiveRecord);
    await expect(
      createDraftUseCase.execute({
        ...sampleDraft,
        permissions: [Permission.ADMIN],
      }),
    ).rejects.toThrow(DuplicateBrandProfileError);
  });

  it('SEC-BRAND-04: Non-admin user cannot activate a brand profile', async () => {
    await expect(
      activateUseCase.execute({
        profileId: 'prof-v2-uuid',
        authorizedUserId: 'usr-guest-01',
        permissions: [Permission.VIEW_ALL_CONTENT],
      }),
    ).rejects.toThrow(InsufficientBrandPermissionError);
  });

  it('SEC-BRAND-05: Activating non-existent profile throws BrandProfileNotFoundError', async () => {
    await expect(
      activateUseCase.execute({
        profileId: 'unknown-profile-id',
        authorizedUserId: 'usr-admin-01',
        permissions: [Permission.ADMIN],
      }),
    ).rejects.toThrow(BrandProfileNotFoundError);
  });

  it('SEC-BRAND-06: Activating an already ACTIVE profile is idempotent', async () => {
    const result = await activateUseCase.execute({
      profileId: 'prof-v1-uuid',
      authorizedUserId: 'usr-admin-01',
      permissions: [Permission.ADMIN],
    });
    expect(result.status).toBe('ACTIVE');
    expect(mockRepo.activateVersion).not.toHaveBeenCalled();
  });

  it('SEC-BRAND-07: Direct reactivation of RETIRED or REVOKED profile is prohibited without rollback', async () => {
    mockRepo.findById.mockResolvedValueOnce({
      ...sampleActiveRecord,
      status: 'RETIRED',
    });
    await expect(
      activateUseCase.execute({
        profileId: 'prof-v1-uuid',
        authorizedUserId: 'usr-admin-01',
        permissions: [Permission.ADMIN],
      }),
    ).rejects.toThrow(InvalidBrandProfileStateTransitionError);
  });

  it('SEC-BRAND-08: Admin executes atomic activation, retiring prior active version', async () => {
    const result = await activateUseCase.execute({
      profileId: 'prof-v2-uuid',
      authorizedUserId: 'usr-admin-01',
      permissions: [Permission.ADMIN],
    });
    expect(result.status).toBe('ACTIVE');
    expect(mockRepo.activateVersion).toHaveBeenCalledWith('prof-v2-uuid', 'usr-admin-01');
  });

  it('SEC-BRAND-09: Rollback restores target version and marks current active as REVOKED', async () => {
    mockRepo.findById.mockImplementation((id: string) => {
      if (id === 'prof-v1-uuid')
        return Promise.resolve({ ...sampleActiveRecord, status: 'RETIRED' });
      if (id === 'prof-v2-uuid') return Promise.resolve({ ...sampleV2Record, status: 'ACTIVE' });
      return Promise.resolve(null);
    });

    const result = await rollbackUseCase.execute({
      targetVersionId: 'prof-v1-uuid',
      reason: 'Reverting due to tone divergence in Khmer festive guidelines',
      authorizedUserId: 'usr-admin-01',
      permissions: [Permission.ADMIN],
    });

    expect(result.restoredProfile.id).toBe('prof-v1-uuid');
    expect(result.restoredProfile.status).toBe('ACTIVE');
    expect(result.revokedProfile?.status).toBe('REVOKED');
    expect(result.rollbackReason).toContain('Reverting due to tone divergence');
  });

  it('SEC-BRAND-10: AssembleBrandBrief injects active profile tone and product snapshot context', async () => {
    const brief = await assembleBriefUseCase.execute({
      productSnapshot: {
        sku: 'FIC-PERF-001',
        productName: 'Moonlit River EDP',
        brand: 'Maison Imaginaire',
      },
      campaignContext: 'French Spring Collection',
    });

    expect(brief.brandProfileVersionId).toBe('prof-v1-uuid');
    expect(brief.versionNumber).toBe(1);
    expect(brief.luxuryToneDirectives).toContain('sensorial');
    expect(brief.productContext?.sku).toBe('FIC-PERF-001');
  });

  it('SEC-BRAND-10b: AssembleBrandBrief provides deterministic fallback when no profile is active', async () => {
    mockRepo.findActive.mockResolvedValueOnce(null);
    const brief = await assembleBriefUseCase.execute();
    expect(brief.brandProfileVersionId).toBe('fallback-deterministic-v1');
    expect(brief.luxuryToneDirectives.length).toBeGreaterThan(0);
    expect(brief.forbiddenVocabulary).toContain('cheap');
  });

  it('SEC-BRAND-10c: GetActiveBrandProfileUseCase retrieves currently active profile record', async () => {
    const active = await getActiveUseCase.execute();
    expect(active).toBeDefined();
    expect(active?.id).toBe('prof-v1-uuid');
    expect(mockRepo.findActive).toHaveBeenCalledTimes(1);
  });

  it('SEC-BRAND-10d: ListBrandProfilesUseCase lists brand profile versions ordered by pagination', async () => {
    const list = await listProfilesUseCase.execute();
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('PARISIAN_LUXURY_V1');
    expect(mockRepo.listProfiles).toHaveBeenCalledTimes(1);
  });
});
