/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { OutboxWriter } from '@parisian-shopper/common';
import { BrandProfileNotFoundError } from '../domain/brand-errors.js';
import type {
  BrandProfileVersionRecord,
  BrandSourceArchiveRecord,
  TestCaseInput,
} from '../domain/brand-profile.types.js';
import { type BrandProfileRepository } from './brand-profile.repository.js';
import { type BrandSourceRepository } from './brand-source.repository.js';
import { EvaluateCandidateOriginalityUseCase } from './evaluate-candidate-originality.use-case.js';
import { RunBrandBenchmarkUseCase } from './run-brand-benchmark.use-case.js';

describe('SEC-BRAND-EVAL-01 to SEC-BRAND-EVAL-07: Brand Benchmark Laboratory', () => {
  let mockProfileRepo: jest.Mocked<BrandProfileRepository>;
  let mockSourceRepo: jest.Mocked<BrandSourceRepository>;
  let mockOutboxWriter: jest.Mocked<OutboxWriter>;
  let originalityUseCase: EvaluateCandidateOriginalityUseCase;
  let benchmarkUseCase: RunBrandBenchmarkUseCase;

  const sampleProfile: BrandProfileVersionRecord = {
    id: 'prof-v1-uuid',
    versionNumber: 1,
    name: 'PARISIAN_LUXURY_V1',
    status: 'ACTIVE',
    evaluationPolicyId: 'default-anti-regurgitation-policy-v1',
    languagePolicy: {
      formality: 'LUXURY_FORMAL',
      primaryLanguage: 'BILINGUAL',
      khmerConventions: {
        scriptStyle: 'Moul',
        spacingRules: 'Zero-width space between phrases',
        disallowedLoanwords: ['discount', 'super sale', 'cheap'],
      },
      englishConventions: {
        tone: 'Parisian understated luxury',
        capitalization: 'SENTENCE_CASE',
      },
    },
    toneRules: {
      luxuryAttributes: ['sensorial', 'artisan craftsmanship', 'Parisian heritage', 'timeless'],
      prohibitedHyperbole: ['cheapest price', 'crazy discount', 'lowest price in town'],
      allowedEmojis: ['✨', '🌿'],
      maxEmojisPerPost: 2,
    },
    visualAestheticRules: {
      approvedColorPalettes: [{ name: 'Gold', hexCodes: ['#D4AF37'] }],
      lightingStyles: ['Window light'],
      textures: ['Limestone'],
      pedestals: ['Fluted cylinder'],
    },
    typographyRules: {
      headlineFont: 'Playfair Display',
      bodyFontKhmer: 'Battambang',
      bodyFontLatin: 'Inter',
      minimumLeadingRatio: 1.4,
    },
    logoRules: {
      clearSpaceRatio: 0.5,
      allowedPlacements: ['TOP_CENTER'],
      defaultVariant: 'GOLD',
    },
    approvedExampleIds: ['ex-001'],
    prohibitedPatterns: ['bargain', 'buy now fast'],
    benchmarkReport: null,
    approvedByUserId: 'usr-admin-01',
    activatedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleHistoricalSource: BrandSourceArchiveRecord = {
    id: 'src-arch-01',
    sourceSystem: 'INSTAGRAM',
    externalPostId: 'ig-101',
    captionText: 'Raw caption',
    sanitizedCaptionText:
      'L’élégance intemporelle de Paris au cœur de Phnom Penh avec la nouvelle collection de maroquinerie.',
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
      findById: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(sampleProfile),
      findByNameAndVersion: jest.fn<(...args: any[]) => Promise<any>>(),
      findActive: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(sampleProfile),
      listProfiles: jest.fn<(...args: any[]) => Promise<any>>(),
      updateStatus: jest.fn<(...args: any[]) => Promise<any>>(),
      activateVersion: jest.fn<(...args: any[]) => Promise<any>>(),
      rollbackToVersion: jest.fn<(...args: any[]) => Promise<any>>(),
      updateBenchmarkReport: jest
        .fn<(...args: any[]) => Promise<any>>()
        .mockResolvedValue(sampleProfile),
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
      append: jest.fn<(event: any) => Promise<string>>().mockResolvedValue('outbox-1'),
    };

    originalityUseCase = new EvaluateCandidateOriginalityUseCase(mockSourceRepo);
    benchmarkUseCase = new RunBrandBenchmarkUseCase(
      mockProfileRepo,
      originalityUseCase,
      mockOutboxWriter,
    );
  });

  it('SEC-BRAND-EVAL-01: throws BrandProfileNotFoundError when running benchmark against non-existent profile', async () => {
    mockProfileRepo.findById.mockResolvedValueOnce(null);

    await expect(
      benchmarkUseCase.execute({
        profileId: 'non-existent-uuid',
      }),
    ).rejects.toThrow(BrandProfileNotFoundError);
  });

  it('SEC-BRAND-EVAL-02: awards high tone scores for luxury attributes and heavily penalizes prohibited hyperbole', async () => {
    const luxuryCases: TestCaseInput[] = [
      {
        testCaseId: 'tc-lux',
        prompt: 'Luxury perfume description',
        candidateText:
          'Une création artisan craftsmanship et sensorial exceptionnelle inspirée par notre Parisian heritage.',
      },
    ];

    const reportLux = await benchmarkUseCase.execute({
      profileId: sampleProfile.id,
      testCases: luxuryCases,
    });

    expect(reportLux.testCaseEvaluations[0]?.toneScore).toBeGreaterThanOrEqual(0.8);
    expect(reportLux.testCaseEvaluations[0]?.detectedLuxuryAttributes).toContain('sensorial');
    expect(reportLux.testCaseEvaluations[0]?.detectedLuxuryAttributes).toContain(
      'artisan craftsmanship',
    );

    const hyperboleCases: TestCaseInput[] = [
      {
        testCaseId: 'tc-bad',
        prompt: 'Promotional discount announcement',
        candidateText: 'Cheapest price in the market with crazy discount and buy now fast.',
      },
    ];

    const reportBad = await benchmarkUseCase.execute({
      profileId: sampleProfile.id,
      testCases: hyperboleCases,
    });

    expect(reportBad.testCaseEvaluations[0]?.toneScore).toBeLessThan(0.3);
    expect(reportBad.testCaseEvaluations[0]?.detectedForbiddenPatterns.length).toBeGreaterThan(0);
    expect(reportBad.testCaseEvaluations[0]?.passed).toBe(false);
  });

  it('SEC-BRAND-EVAL-03: penalizes disallowed loanwords in Khmer/bilingual conventions', async () => {
    const loanwordCases: TestCaseInput[] = [
      {
        testCaseId: 'tc-loanword',
        prompt: 'Khmer bilingual promotion',
        candidateText: 'Special super sale with extra discount for new boutique customers.',
      },
    ];

    const report = await benchmarkUseCase.execute({
      profileId: sampleProfile.id,
      testCases: loanwordCases,
    });

    expect(report.testCaseEvaluations[0]?.detectedLoanwords).toContain('discount');
    expect(report.testCaseEvaluations[0]?.detectedLoanwords).toContain('super sale');
    expect(report.testCaseEvaluations[0]?.typographyScore).toBeLessThan(0.3);
    expect(report.testCaseEvaluations[0]?.passed).toBe(false);
  });

  it('SEC-BRAND-EVAL-04: detects anti-regurgitation plagiarism and penalizes originality score in benchmark', async () => {
    const plagiarizedCases: TestCaseInput[] = [
      {
        testCaseId: 'tc-plagiarized',
        prompt: 'Copy from historical campaign',
        candidateText:
          'L’élégance intemporelle de Paris au cœur de Phnom Penh avec la nouvelle collection de maroquinerie de luxe.',
      },
    ];

    const report = await benchmarkUseCase.execute({
      profileId: sampleProfile.id,
      testCases: plagiarizedCases,
    });

    expect(report.testCaseEvaluations[0]?.originalityViolations.length).toBeGreaterThan(0);
    expect(report.testCaseEvaluations[0]?.originalityScore).toBeLessThan(0.6);
    expect(report.testCaseEvaluations[0]?.passed).toBe(false);
  });

  it('SEC-BRAND-EVAL-05: produces accurate aggregate averages across multiple benchmark test cases', async () => {
    const report = await benchmarkUseCase.execute({
      profileId: sampleProfile.id,
    });

    expect(report.totalTestCases).toBe(3);
    expect(typeof report.overallScore).toBe('number');
    expect(typeof report.toneScoreAverage).toBe('number');
    expect(typeof report.typographyScoreAverage).toBe('number');
    expect(typeof report.originalityScoreAverage).toBe('number');
    expect(report.overallScore).toBeGreaterThan(0);
  });

  it('SEC-BRAND-EVAL-06: marks benchmark passed when overall score is >= 0.75 and zero critical violations exist', async () => {
    const passingCases: TestCaseInput[] = [
      {
        testCaseId: 'tc-pass-1',
        prompt: 'Parisian fragrance spotlight',
        candidateText:
          'Une eau de parfum intemporelle célébrant le Parisian heritage et un artisan craftsmanship unique.',
      },
      {
        testCaseId: 'tc-pass-2',
        prompt: 'Fine jewelry introduction',
        candidateText:
          'Découvrez une collection sensorial et timeless façonnée selon les règles d’or des joailliers parisiens.',
      },
    ];

    const report = await benchmarkUseCase.execute({
      profileId: sampleProfile.id,
      testCases: passingCases,
    });

    expect(report.passed).toBe(true);
    expect(report.overallScore).toBeGreaterThanOrEqual(0.75);
    expect(report.passedTestCases).toBe(2);
    expect(report.summaryViolations).toHaveLength(0);
  });

  it('SEC-BRAND-EVAL-07: persists benchmark report on BrandProfileVersion and emits outbox event', async () => {
    const report = await benchmarkUseCase.execute({
      profileId: sampleProfile.id,
    });

    expect(mockProfileRepo.updateBenchmarkReport).toHaveBeenCalledWith(
      sampleProfile.id,
      expect.objectContaining({
        benchmarkRunId: report.benchmarkRunId,
        overallScore: report.overallScore,
      }),
    );

    expect(mockOutboxWriter.append).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'brand.benchmark.completed',
        aggregateType: 'BrandProfileVersion',
        aggregateId: sampleProfile.id,
        payload: expect.objectContaining({
          benchmarkRunId: report.benchmarkRunId,
          profileId: sampleProfile.id,
        }),
      }),
    );
  });
});
