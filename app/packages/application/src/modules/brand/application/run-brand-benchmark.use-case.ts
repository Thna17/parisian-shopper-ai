import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type { OutboxWriter } from '@parisian-shopper/common';
import { BrandProfileNotFoundError } from '../domain/brand-errors.js';
import type {
  BenchmarkEvaluationReport,
  TestCaseEvaluation,
  TestCaseInput,
} from '../domain/brand-profile.types.js';
import {
  BRAND_PROFILE_REPOSITORY,
  type BrandProfileRepository,
} from './brand-profile.repository.js';
import { EvaluateCandidateOriginalityUseCase } from './evaluate-candidate-originality.use-case.js';

export interface RunBrandBenchmarkInput {
  readonly profileId: string;
  readonly testDatasetId?: string | undefined;
  readonly policyId?: string | undefined;
  readonly testCases?: readonly TestCaseInput[] | undefined;
  readonly outboxWriter?: OutboxWriter | undefined;
}

const DEFAULT_BENCHMARK_TEST_CASES: readonly TestCaseInput[] = [
  {
    testCaseId: 'bench-tc-01',
    prompt: 'Craft a luxury bilingual introduction for a Parisian niche fragrance',
    candidateText:
      'L’artisanat d’art français rencontre la grâce khmère dans un sillage sensorial raffiné et exclusif.',
    category: 'PERFUME_SPOTLIGHT',
  },
  {
    testCaseId: 'bench-tc-02',
    prompt: 'Announce a high jewelry showcase celebrating Place Vendôme heritage',
    candidateText:
      'Une célébration de l’héritage parisien avec une joaillerie d’exception façonnée par les plus grands maîtres.',
    category: 'JEWELRY_HERITAGE',
  },
  {
    testCaseId: 'bench-tc-03',
    prompt: 'Describe a festive silk scarf with delicate artisanal craftsmanship',
    candidateText:
      'Chaque fil de soie raconte une histoire intemporelle alliant raffinement et modernité discrète.',
    category: 'SILK_ACCESSORIES',
  },
];

@Injectable()
export class RunBrandBenchmarkUseCase {
  public constructor(
    @Inject(BRAND_PROFILE_REPOSITORY)
    private readonly brandProfileRepo: BrandProfileRepository,
    private readonly evaluateOriginalityUseCase: EvaluateCandidateOriginalityUseCase,
    @Optional()
    @Inject('OUTBOX_WRITER')
    private readonly defaultOutboxWriter?: OutboxWriter,
  ) {}

  public async execute(input: RunBrandBenchmarkInput): Promise<BenchmarkEvaluationReport> {
    const profile = await this.brandProfileRepo.findById(input.profileId);
    if (!profile) {
      throw new BrandProfileNotFoundError(input.profileId);
    }

    const testCases = input.testCases ?? DEFAULT_BENCHMARK_TEST_CASES;
    const testCaseEvaluations: TestCaseEvaluation[] = [];
    const summaryViolations: string[] = [];

    for (const tc of testCases) {
      const evaluation = await this.evaluateTestCase(tc, profile);
      testCaseEvaluations.push(evaluation);

      if (!evaluation.passed) {
        for (const v of evaluation.originalityViolations) {
          summaryViolations.push(`[${tc.testCaseId}] Originality: ${v}`);
        }
        for (const fp of evaluation.detectedForbiddenPatterns) {
          summaryViolations.push(`[${tc.testCaseId}] Forbidden Pattern: "${fp}"`);
        }
        for (const lw of evaluation.detectedLoanwords) {
          summaryViolations.push(`[${tc.testCaseId}] Disallowed Loanword: "${lw}"`);
        }
      }
    }

    const totalTestCases = testCaseEvaluations.length;
    const passedTestCases = testCaseEvaluations.filter((t) => t.passed).length;

    const toneSum = testCaseEvaluations.reduce((acc, t) => acc + t.toneScore, 0);
    const typoSum = testCaseEvaluations.reduce((acc, t) => acc + t.typographyScore, 0);
    const origSum = testCaseEvaluations.reduce((acc, t) => acc + t.originalityScore, 0);
    const totalSum = testCaseEvaluations.reduce((acc, t) => acc + t.totalScore, 0);

    const toneScoreAverage = Math.round((toneSum / totalTestCases) * 1000) / 1000;
    const typographyScoreAverage = Math.round((typoSum / totalTestCases) * 1000) / 1000;
    const originalityScoreAverage = Math.round((origSum / totalTestCases) * 1000) / 1000;
    const overallScore = Math.round((totalSum / totalTestCases) * 1000) / 1000;

    const passed = overallScore >= 0.75 && summaryViolations.length === 0;

    const report: BenchmarkEvaluationReport = {
      benchmarkRunId: randomUUID(),
      profileId: profile.id,
      profileVersionNumber: profile.versionNumber,
      testDatasetId: input.testDatasetId ?? 'default-benchmark-dataset-v1',
      policyId: input.policyId ?? profile.evaluationPolicyId,
      totalTestCases,
      passedTestCases,
      overallScore,
      toneScoreAverage,
      typographyScoreAverage,
      originalityScoreAverage,
      passed,
      summaryViolations,
      testCaseEvaluations,
      evaluatedAt: new Date().toISOString(),
    };

    // Store benchmark report on profile record
    await this.brandProfileRepo.updateBenchmarkReport(
      profile.id,
      report as unknown as Record<string, unknown>,
    );

    // Emit transactional outbox event
    const outbox = input.outboxWriter ?? this.defaultOutboxWriter;
    if (outbox) {
      await outbox.append({
        topic: 'brand.benchmark.completed',
        schemaVersion: 1,
        idempotencyKey: `brand-benchmark-${report.benchmarkRunId}`,
        aggregateType: 'BrandProfileVersion',
        aggregateId: profile.id,
        payload: {
          benchmarkRunId: report.benchmarkRunId,
          profileId: profile.id,
          profileVersionNumber: profile.versionNumber,
          testDatasetId: report.testDatasetId,
          overallScore: report.overallScore,
          passed: report.passed,
          evaluatedAt: report.evaluatedAt,
        },
        occurredAt: new Date(),
        availableAt: new Date(),
      });
    }

    return report;
  }

  private async evaluateTestCase(
    tc: TestCaseInput,
    profile: {
      toneRules: { luxuryAttributes: readonly string[]; prohibitedHyperbole: readonly string[] };
      languagePolicy: { khmerConventions: { disallowedLoanwords: readonly string[] } };
      prohibitedPatterns: readonly string[];
    },
  ): Promise<TestCaseEvaluation> {
    const candidateLower = tc.candidateText.toLowerCase();

    // 1. Evaluate Tone Score
    let toneScore = 0.5;
    const detectedLuxuryAttributes: string[] = [];
    const detectedForbiddenPatterns: string[] = [];

    for (const attr of profile.toneRules.luxuryAttributes) {
      if (candidateLower.includes(attr.toLowerCase())) {
        detectedLuxuryAttributes.push(attr);
        toneScore += 0.15;
      }
    }

    for (const hyperbole of profile.toneRules.prohibitedHyperbole) {
      if (candidateLower.includes(hyperbole.toLowerCase())) {
        detectedForbiddenPatterns.push(hyperbole);
        toneScore -= 0.35;
      }
    }

    for (const prohibited of profile.prohibitedPatterns) {
      if (candidateLower.includes(prohibited.toLowerCase())) {
        if (!detectedForbiddenPatterns.includes(prohibited)) {
          detectedForbiddenPatterns.push(prohibited);
        }
        toneScore -= 0.35;
      }
    }

    toneScore = Math.max(0, Math.min(1.0, toneScore));

    // 2. Evaluate Typography & Khmer Loanwords
    let typographyScore = 0.6;
    const detectedLoanwords: string[] = [];

    for (const loanword of profile.languagePolicy.khmerConventions.disallowedLoanwords) {
      if (candidateLower.includes(loanword.toLowerCase())) {
        detectedLoanwords.push(loanword);
        typographyScore -= 0.35;
      }
    }

    typographyScore = Math.max(0, Math.min(1.0, typographyScore));

    // 3. Evaluate Originality Guardrails
    const originalityReport = await this.evaluateOriginalityUseCase.execute({
      candidateText: tc.candidateText,
    });

    let originalityScore = 1.0;
    const originalityViolations = [...originalityReport.violations];
    if (!originalityReport.isOriginal) {
      originalityScore = Math.max(
        0,
        1.0 -
          Math.max(
            originalityReport.highestNgramOverlap,
            originalityReport.highestLevenshteinSimilarity,
          ),
      );
    }

    originalityScore = Math.round(originalityScore * 1000) / 1000;

    // 4. Combined Total Score
    const totalScore =
      Math.round((toneScore * 0.4 + typographyScore * 0.3 + originalityScore * 0.3) * 1000) / 1000;

    const passed =
      totalScore >= 0.7 &&
      detectedForbiddenPatterns.length === 0 &&
      detectedLoanwords.length === 0 &&
      originalityViolations.length === 0;

    return {
      testCaseId: tc.testCaseId,
      prompt: tc.prompt,
      candidateText: tc.candidateText,
      toneScore: Math.round(toneScore * 1000) / 1000,
      typographyScore: Math.round(typographyScore * 1000) / 1000,
      originalityScore,
      totalScore,
      passed,
      detectedLuxuryAttributes,
      detectedForbiddenPatterns,
      detectedLoanwords,
      originalityViolations,
    };
  }
}
