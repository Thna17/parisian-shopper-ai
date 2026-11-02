/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { OutboxWriter } from '@parisian-shopper/common';
import { Permission } from '../../auth/domain/permissions.js';
import type {
  BrandProfileVersionRecord,
  BrandSourceArchiveRecord,
} from '../domain/brand-profile.types.js';
import { ActivateBrandProfileUseCase } from './activate-brand-profile.use-case.js';
import { type BrandProfileRepository } from './brand-profile.repository.js';
import { type BrandSourceRepository } from './brand-source.repository.js';
import { EvaluateCandidateOriginalityUseCase } from './evaluate-candidate-originality.use-case.js';
import { RollbackBrandProfileUseCase } from './rollback-brand-profile.use-case.js';

describe('SEC-BRAND-EVAL-17 to SEC-BRAND-EVAL-20: Brand Domain Outbox Events', () => {
  let mockProfileRepo: jest.Mocked<BrandProfileRepository>;
  let mockSourceRepo: jest.Mocked<BrandSourceRepository>;
  let mockOutboxWriter: jest.Mocked<OutboxWriter>;
  let activateUseCase: ActivateBrandProfileUseCase;
  let rollbackUseCase: RollbackBrandProfileUseCase;
  let originalityUseCase: EvaluateCandidateOriginalityUseCase;

  const sampleDraftProfile: BrandProfileVersionRecord = {
    id: 'prof-v2-uuid',
    versionNumber: 2,
    name: 'PARISIAN_LUXURY_V2',
    status: 'DRAFT',
    evaluationPolicyId: 'default-anti-regurgitation-policy-v1',
    languagePolicy: {
      formality: 'LUXURY_FORMAL',
      primaryLanguage: 'BILINGUAL',
      khmerConventions: {
        scriptStyle: 'Moul',
        spacingRules: 'Zero-width space',
        disallowedLoanwords: ['discount'],
      },
      englishConventions: {
        tone: 'Parisian luxury',
        capitalization: 'SENTENCE_CASE',
      },
    },
    toneRules: {
      luxuryAttributes: ['sensorial'],
      prohibitedHyperbole: ['cheap'],
      allowedEmojis: ['✨'],
      maxEmojisPerPost: 1,
    },
    visualAestheticRules: {
      approvedColorPalettes: [],
      lightingStyles: [],
      textures: [],
      pedestals: [],
    },
    typographyRules: {
      headlineFont: 'Playfair',
      bodyFontKhmer: 'Battambang',
      bodyFontLatin: 'Inter',
      minimumLeadingRatio: 1.4,
    },
    logoRules: {
      clearSpaceRatio: 0.5,
      allowedPlacements: ['TOP_CENTER'],
      defaultVariant: 'GOLD',
    },
    approvedExampleIds: [],
    prohibitedPatterns: [],
    benchmarkReport: null,
    approvedByUserId: 'usr-admin-01',
    activatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleActiveProfile: BrandProfileVersionRecord = {
    ...sampleDraftProfile,
    id: 'prof-v1-uuid',
    versionNumber: 1,
    status: 'ACTIVE',
    activatedAt: new Date(),
  };

  const sampleHistoricalSource: BrandSourceArchiveRecord = {
    id: 'src-arch-01',
    sourceSystem: 'INSTAGRAM',
    externalPostId: 'ig-101',
    captionText: 'Raw caption',
    sanitizedCaptionText:
      'L’élégance intemporelle de Paris au cœur de Phnom Penh avec la nouvelle collection de maroquinerie de luxe.',
    copyrightDeclared: true,
    copyrightOwner: 'L’Atelier Parisien SARL',
    licenseReference: 'COMMERCIAL-INTERNAL-2026',
    mediaCasKeys: [],
    tags: ['luxury'],
    sha256Hex: 'abc123sha',
    ingestedByUserId: 'usr-admin-01',
    createdAt: new Date(),
  };

  beforeEach(() => {
    mockProfileRepo = {
      createDraft: jest.fn<(...args: any[]) => Promise<any>>(),
      findById: jest.fn<(...args: any[]) => Promise<any>>().mockImplementation((id: string) => {
        if (id === 'prof-v2-uuid') return Promise.resolve(sampleDraftProfile);
        if (id === 'prof-v1-uuid') return Promise.resolve(sampleActiveProfile);
        return Promise.resolve(null);
      }),
      findByNameAndVersion: jest.fn<(...args: any[]) => Promise<any>>(),
      findActive: jest
        .fn<(...args: any[]) => Promise<any>>()
        .mockResolvedValue(sampleActiveProfile),
      listProfiles: jest.fn<(...args: any[]) => Promise<any>>(),
      updateStatus: jest.fn<(...args: any[]) => Promise<any>>(),
      activateVersion: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
        ...sampleDraftProfile,
        status: 'ACTIVE',
        activatedAt: new Date(),
      }),
      rollbackToVersion: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
        revokedProfile: { ...sampleDraftProfile, status: 'REVOKED' },
        restoredProfile: sampleActiveProfile,
      }),
      updateBenchmarkReport: jest.fn<(...args: any[]) => Promise<any>>(),
    };

    mockSourceRepo = {
      storeRawPost: jest.fn<(...args: any[]) => Promise<any>>(),
      findById: jest.fn<(...args: any[]) => Promise<any>>(),
      findBySha256: jest.fn<(...args: any[]) => Promise<any>>(),
      listSources: jest
        .fn<(...args: any[]) => Promise<any>>()
        .mockResolvedValue([sampleHistoricalSource]),
    };

    mockOutboxWriter = {
      append: jest.fn<(event: any) => Promise<string>>().mockResolvedValue('outbox-evt-1'),
    };

    activateUseCase = new ActivateBrandProfileUseCase(mockProfileRepo, mockOutboxWriter);
    rollbackUseCase = new RollbackBrandProfileUseCase(mockProfileRepo, mockOutboxWriter);
    originalityUseCase = new EvaluateCandidateOriginalityUseCase(mockSourceRepo, mockOutboxWriter);
  });

  it('SEC-BRAND-EVAL-17: emits brand.profile.activated transactional outbox event on profile activation', async () => {
    await activateUseCase.execute({
      profileId: 'prof-v2-uuid',
      authorizedUserId: 'usr-admin-01',
      permissions: [Permission.ADMIN],
    });

    expect(mockOutboxWriter.append).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'brand.profile.activated',
        aggregateType: 'BrandProfileVersion',
        aggregateId: 'prof-v2-uuid',
        payload: expect.objectContaining({
          profileId: 'prof-v2-uuid',
          versionNumber: 2,
          activatedByUserId: 'usr-admin-01',
        }),
      }),
    );
  });

  it('SEC-BRAND-EVAL-18: emits brand.profile.rollback_executed transactional outbox event on targeted rollback', async () => {
    mockProfileRepo.findById.mockResolvedValueOnce({
      ...sampleActiveProfile,
      status: 'RETIRED',
    });

    await rollbackUseCase.execute({
      targetVersionId: 'prof-v1-uuid',
      reason: 'Khmer loanword regression',
      authorizedUserId: 'usr-admin-01',
      permissions: [Permission.ADMIN],
    });

    expect(mockOutboxWriter.append).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'brand.profile.rollback_executed',
        aggregateType: 'BrandProfileVersion',
        aggregateId: 'prof-v1-uuid',
        payload: expect.objectContaining({
          previousProfileId: 'prof-v2-uuid',
          restoredProfileId: 'prof-v1-uuid',
          reason: 'Khmer loanword regression',
          actorUserId: 'usr-admin-01',
        }),
      }),
    );
  });

  it('SEC-BRAND-EVAL-19: emits brand.originality.violation_detected transactional outbox event when regurgitation is detected', async () => {
    const verbatimCopy =
      'L’élégance intemporelle de Paris au cœur de Phnom Penh avec la nouvelle collection de maroquinerie de luxe.';

    const report = await originalityUseCase.execute({
      candidateId: 'candidate-copy-999',
      candidateText: verbatimCopy,
    });

    expect(report.isOriginal).toBe(false);
    expect(mockOutboxWriter.append).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'brand.originality.violation_detected',
        aggregateType: 'BrandSourceArchive',
        aggregateId: 'src-arch-01',
        payload: expect.objectContaining({
          candidateId: 'candidate-copy-999',
          matchedHistoricalAssetId: 'src-arch-01',
        }),
      }),
    );
  });

  it('SEC-BRAND-EVAL-20: does NOT emit violation event when candidate copy is original', async () => {
    const originalCopy =
      'Une fragrance inédite révélant des notes solaires et un sillage poudré d’une grande délicatesse.';

    const report = await originalityUseCase.execute({
      candidateId: 'candidate-clean-111',
      candidateText: originalCopy,
    });

    expect(report.isOriginal).toBe(true);
    expect(mockOutboxWriter.append).not.toHaveBeenCalled();
  });
});
