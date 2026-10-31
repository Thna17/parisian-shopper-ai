import { Inject, Injectable } from '@nestjs/common';
import { RegurgitationViolationError } from '../domain/brand-errors.js';
import type { EvaluationPolicy, OriginalityReport } from '../domain/brand-profile.types.js';
import { BRAND_SOURCE_REPOSITORY, type BrandSourceRepository } from './brand-source.repository.js';

export interface EvaluateOriginalityInput {
  readonly candidateText: string;
  readonly policy?: Partial<EvaluationPolicy>;
  readonly throwOnViolation?: boolean;
}

const DEFAULT_POLICY: EvaluationPolicy = {
  id: 'default-anti-regurgitation-policy-v1',
  maxNgramOverlapThreshold: 0.4, // Max 40% 3-gram overlap
  maxLevenshteinSimilarityThreshold: 0.45, // Max 45% overall textual similarity
  minCandidateLengthChars: 20,
};

@Injectable()
export class EvaluateCandidateOriginalityUseCase {
  public constructor(
    @Inject(BRAND_SOURCE_REPOSITORY)
    private readonly brandSourceRepo: BrandSourceRepository,
  ) {}

  public async execute(input: EvaluateOriginalityInput): Promise<OriginalityReport> {
    const policy: EvaluationPolicy = {
      id: input.policy?.id ?? DEFAULT_POLICY.id,
      maxNgramOverlapThreshold:
        input.policy?.maxNgramOverlapThreshold ?? DEFAULT_POLICY.maxNgramOverlapThreshold,
      maxLevenshteinSimilarityThreshold:
        input.policy?.maxLevenshteinSimilarityThreshold ??
        DEFAULT_POLICY.maxLevenshteinSimilarityThreshold,
      minCandidateLengthChars:
        input.policy?.minCandidateLengthChars ?? DEFAULT_POLICY.minCandidateLengthChars,
    };

    const candidate = input.candidateText.trim();

    // Short strings are not checked against regurgitation
    if (candidate.length < policy.minCandidateLengthChars) {
      return {
        candidateText: candidate,
        isOriginal: true,
        highestNgramOverlap: 0,
        highestLevenshteinSimilarity: 0,
        matchedSourceId: null,
        matchedSanitizedTextSnippet: null,
        violations: [],
      };
    }

    const historicalSources = await this.brandSourceRepo.listSources(100, 0);

    let maxNgram = 0;
    let maxLev = 0;
    let worstSourceId: string | null = null;
    let worstSnippet: string | null = null;
    const violations: string[] = [];

    const candidateNormalized = this.normalize(candidate);
    const candidateNgrams = this.getNgrams(candidateNormalized, 3);

    for (const source of historicalSources) {
      const sourceNormalized = this.normalize(source.sanitizedCaptionText);
      if (sourceNormalized.length < policy.minCandidateLengthChars) continue;

      const sourceNgrams = this.getNgrams(sourceNormalized, 3);
      const ngramOverlap = this.calculateJaccardSimilarity(candidateNgrams, sourceNgrams);
      const levSim = this.calculateLevenshteinSimilarity(candidateNormalized, sourceNormalized);

      if (ngramOverlap > maxNgram) {
        maxNgram = ngramOverlap;
        worstSourceId = source.id;
        worstSnippet = source.sanitizedCaptionText.slice(0, 120);
      }
      if (levSim > maxLev) {
        maxLev = levSim;
        worstSourceId = source.id;
        worstSnippet = source.sanitizedCaptionText.slice(0, 120);
      }
    }

    if (maxNgram > policy.maxNgramOverlapThreshold) {
      violations.push(
        `N-gram overlap (${(maxNgram * 100).toFixed(1)}%) exceeds threshold of ${(policy.maxNgramOverlapThreshold * 100).toFixed(1)}%`,
      );
    }

    if (maxLev > policy.maxLevenshteinSimilarityThreshold) {
      violations.push(
        `Levenshtein similarity (${(maxLev * 100).toFixed(1)}%) exceeds threshold of ${(policy.maxLevenshteinSimilarityThreshold * 100).toFixed(1)}%`,
      );
    }

    const isOriginal = violations.length === 0;

    if (!isOriginal && input.throwOnViolation) {
      const peakScore = Math.max(maxNgram, maxLev);
      const peakThreshold = Math.min(
        policy.maxNgramOverlapThreshold,
        policy.maxLevenshteinSimilarityThreshold,
      );
      throw new RegurgitationViolationError(
        peakScore,
        peakThreshold,
        worstSourceId ?? 'unknown-source',
      );
    }

    return {
      candidateText: candidate,
      isOriginal,
      highestNgramOverlap: Math.round(maxNgram * 1000) / 1000,
      highestLevenshteinSimilarity: Math.round(maxLev * 1000) / 1000,
      matchedSourceId: worstSourceId,
      matchedSanitizedTextSnippet: worstSnippet,
      violations,
    };
  }

  private normalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private getNgrams(text: string, n: number): Set<string> {
    const words = text.split(' ').filter((w) => w.length > 0);
    const ngrams = new Set<string>();
    if (words.length < n) {
      if (words.length > 0) {
        ngrams.add(words.join(' '));
      }
      return ngrams;
    }
    for (let i = 0; i <= words.length - n; i++) {
      ngrams.add(words.slice(i, i + n).join(' '));
    }
    return ngrams;
  }

  private calculateJaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
    if (setA.size === 0 || setB.size === 0) return 0;
    let intersection = 0;
    for (const item of setA) {
      if (setB.has(item)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  private calculateLevenshteinSimilarity(s1: string, s2: string): number {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    if (longer.length === 0) return 1.0;

    // Use windowed Levenshtein if strings are very long to keep computational complexity low
    const maxLen = 300;
    const str1 = longer.slice(0, maxLen);
    const str2 = shorter.slice(0, maxLen);

    const distance = this.levenshteinDistance(str1, str2);
    return (str1.length - distance) / str1.length;
  }

  private levenshteinDistance(s1: string, s2: string): number {
    const costs: number[] = [];
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else if (j > 0) {
          let newValue = costs[j - 1]!;
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]!) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length]!;
  }
}
