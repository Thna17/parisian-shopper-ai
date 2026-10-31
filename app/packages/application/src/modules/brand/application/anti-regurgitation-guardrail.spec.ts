/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RegurgitationViolationError } from '../domain/brand-errors.js';
import type { BrandSourceArchiveRecord } from '../domain/brand-profile.types.js';
import { type BrandSourceRepository } from './brand-source.repository.js';
import { EvaluateCandidateOriginalityUseCase } from './evaluate-candidate-originality.use-case.js';

describe('SEC-BRAND-11 to SEC-BRAND-14: Anti-Regurgitation Guardrails', () => {
  let mockSourceRepo: jest.Mocked<BrandSourceRepository>;
  let evaluateOriginalityUseCase: EvaluateCandidateOriginalityUseCase;

  const sampleArchivedSources: BrandSourceArchiveRecord[] = [
    {
      id: 'src-arch-01',
      sourceSystem: 'INSTAGRAM',
      externalPostId: 'ig-1001',
      captionText: 'Raw caption with phone',
      sanitizedCaptionText:
        'L’élégance intemporelle de Paris au cœur de Phnom Penh avec la nouvelle collection de maroquinerie de luxe.',
      copyrightDeclared: true,
      copyrightOwner: 'L’Atelier Parisien SARL',
      licenseReference: 'LIC-2026-FR-09',
      mediaCasKeys: ['cas-img-01'],
      tags: ['handbag', 'luxury', 'leather'],
      sha256Hex: 'abcdef1234567890',
      ingestedByUserId: 'usr-admin-01',
      createdAt: new Date('2026-10-01T00:00:00Z'),
    },
    {
      id: 'src-arch-02',
      sourceSystem: 'FACEBOOK',
      externalPostId: 'fb-2002',
      captionText: 'Raw facebook text',
      sanitizedCaptionText:
        ' découvrez l’artisanat d’art français incarné dans chaque point de couture fait main sur cuir pleine fleur.',
      copyrightDeclared: true,
      copyrightOwner: 'L’Atelier Parisien SARL',
      licenseReference: 'LIC-2026-FR-09',
      mediaCasKeys: [],
      tags: ['craftsmanship'],
      sha256Hex: '123456abcdef7890',
      ingestedByUserId: 'usr-admin-01',
      createdAt: new Date('2026-10-02T00:00:00Z'),
    },
  ];

  beforeEach(() => {
    mockSourceRepo = {
      storeRawPost: jest.fn<(...args: any[]) => Promise<any>>(),
      findById: jest.fn<(...args: any[]) => Promise<any>>(),
      findBySha256: jest.fn<(...args: any[]) => Promise<any>>(),
      listSources: jest
        .fn<(...args: any[]) => Promise<any>>()
        .mockResolvedValue(sampleArchivedSources),
    };

    evaluateOriginalityUseCase = new EvaluateCandidateOriginalityUseCase(mockSourceRepo);
  });

  it('SEC-BRAND-11: flags high n-gram overlap when candidate copies verbatim phrases from source archives', async () => {
    // Verbatim copy of phrase from src-arch-01
    const candidateText =
      'L’élégance intemporelle de Paris au cœur de Phnom Penh avec la nouvelle collection de maroquinerie de luxe exclusif.';

    const report = await evaluateOriginalityUseCase.execute({
      candidateText,
      policy: {
        maxNgramOverlapThreshold: 0.35,
        maxLevenshteinSimilarityThreshold: 0.8, // high threshold so only n-gram triggers
      },
    });

    expect(report.isOriginal).toBe(false);
    expect(report.highestNgramOverlap).toBeGreaterThan(0.35);
    expect(report.matchedSourceId).toBe('src-arch-01');
    expect(report.violations.some((v) => v.includes('N-gram overlap'))).toBe(true);
  });

  it('SEC-BRAND-12: flags high Levenshtein similarity when text closely paraphrases or approximates archive', async () => {
    // Paraphrase with slight character differences but near-identical structure
    const candidateText =
      'Lélégance intemporelle de Paris au coeur de Phnom Penh avec la nouvelle collection de maroquinerie luxe.';

    const report = await evaluateOriginalityUseCase.execute({
      candidateText,
      policy: {
        maxNgramOverlapThreshold: 0.95, // high so only Levenshtein triggers
        maxLevenshteinSimilarityThreshold: 0.45,
      },
    });

    expect(report.isOriginal).toBe(false);
    expect(report.highestLevenshteinSimilarity).toBeGreaterThan(0.45);
    expect(report.matchedSourceId).toBe('src-arch-01');
    expect(report.violations.some((v) => v.includes('Levenshtein similarity'))).toBe(true);
  });

  it('SEC-BRAND-13: throws RegurgitationViolationError when throwOnViolation is true', async () => {
    const candidateText =
      'L’élégance intemporelle de Paris au cœur de Phnom Penh avec la nouvelle collection de maroquinerie de luxe.';

    await expect(
      evaluateOriginalityUseCase.execute({
        candidateText,
        throwOnViolation: true,
      }),
    ).rejects.toThrow(RegurgitationViolationError);
  });

  it('SEC-BRAND-14: passes original candidate copy with zero or minimal overlap against historical archive', async () => {
    const freshOriginalCopy =
      'Éveillez vos sens avec une création joaillière inédite, alliant la clarté du saphir khmer aux lignes pures de la place Vendôme.';

    const report = await evaluateOriginalityUseCase.execute({
      candidateText: freshOriginalCopy,
      throwOnViolation: true,
    });

    expect(report.isOriginal).toBe(true);
    expect(report.violations).toHaveLength(0);
    expect(report.highestNgramOverlap).toBeLessThan(0.4);
    expect(report.highestLevenshteinSimilarity).toBeLessThan(0.45);
  });

  it('SEC-BRAND-14b: gracefully marks very short strings (<20 chars) as original without false positives', async () => {
    const shortText = 'Paris Luxe';

    const report = await evaluateOriginalityUseCase.execute({
      candidateText: shortText,
      throwOnViolation: true,
    });

    expect(report.isOriginal).toBe(true);
    expect(report.highestNgramOverlap).toBe(0);
    expect(mockSourceRepo.listSources).not.toHaveBeenCalled();
  });
});
