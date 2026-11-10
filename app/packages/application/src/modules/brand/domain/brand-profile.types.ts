export const BrandProfileStatus = {
  DRAFT: 'DRAFT',
  BENCHMARKING: 'BENCHMARKING',
  PENDING_SIGN_OFF: 'PENDING_SIGN_OFF',
  ACTIVE: 'ACTIVE',
  RETIRED: 'RETIRED',
  REVOKED: 'REVOKED',
} as const;
export type BrandProfileStatus = (typeof BrandProfileStatus)[keyof typeof BrandProfileStatus];

export const BrandSourceSystem = {
  FACEBOOK: 'FACEBOOK',
  INSTAGRAM: 'INSTAGRAM',
  BRAND_GUIDELINES: 'BRAND_GUIDELINES',
  CAMPAIGN_COLLATERAL: 'CAMPAIGN_COLLATERAL',
} as const;
export type BrandSourceSystem = (typeof BrandSourceSystem)[keyof typeof BrandSourceSystem];

export const BrandDatasetStatus = {
  CURATING: 'CURATING',
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
} as const;
export type BrandDatasetStatus = (typeof BrandDatasetStatus)[keyof typeof BrandDatasetStatus];

export interface LanguagePolicy {
  readonly formality: 'LUXURY_FORMAL' | 'ELEVATED_CASUAL' | 'EDITORIAL';
  readonly primaryLanguage: 'KM' | 'EN' | 'BILINGUAL';
  readonly khmerConventions: {
    readonly scriptStyle: 'Moul' | 'Battambang' | 'Siemreap' | 'Noto Sans Khmer';
    readonly spacingRules: string;
    readonly disallowedLoanwords: readonly string[];
  };
  readonly englishConventions: {
    readonly tone: string;
    readonly capitalization: 'SENTENCE_CASE' | 'TITLE_CASE' | 'MINIMAL';
  };
}

export interface ToneRules {
  readonly luxuryAttributes: readonly string[];
  readonly prohibitedHyperbole: readonly string[];
  readonly allowedEmojis: readonly string[];
  readonly maxEmojisPerPost: number;
}

export interface VisualAestheticRules {
  readonly approvedColorPalettes: readonly {
    readonly name: string;
    readonly hexCodes: readonly string[];
  }[];
  readonly lightingStyles: readonly string[];
  readonly textures: readonly string[];
  readonly pedestals: readonly string[];
}

export interface TypographyRules {
  readonly headlineFont: string;
  readonly bodyFontKhmer: string;
  readonly bodyFontLatin: string;
  readonly minimumLeadingRatio: number;
}

export interface LogoRules {
  readonly clearSpaceRatio: number;
  readonly allowedPlacements: readonly (
    'TOP_CENTER' | 'BOTTOM_CENTER' | 'TOP_LEFT' | 'TOP_RIGHT'
  )[];
  readonly defaultVariant: 'GOLD' | 'MONOCHROME_WHITE' | 'MONOCHROME_BLACK' | 'AS_UPLOADED';
}

export interface BrandProfileVersionRecord {
  readonly id: string;
  readonly versionNumber: number;
  readonly name: string;
  readonly status: BrandProfileStatus;
  readonly evaluationPolicyId: string;
  readonly languagePolicy: LanguagePolicy;
  readonly toneRules: ToneRules;
  readonly visualAestheticRules: VisualAestheticRules;
  readonly typographyRules: TypographyRules;
  readonly logoRules: LogoRules;
  readonly approvedExampleIds: readonly string[];
  readonly prohibitedPatterns: readonly string[];
  readonly benchmarkReport: Record<string, unknown> | null;
  readonly approvedByUserId: string;
  readonly activatedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface BrandProfileVersionDraft {
  readonly name: string;
  readonly evaluationPolicyId: string;
  readonly languagePolicy: LanguagePolicy;
  readonly toneRules: ToneRules;
  readonly visualAestheticRules: VisualAestheticRules;
  readonly typographyRules: TypographyRules;
  readonly logoRules: LogoRules;
  readonly approvedExampleIds: readonly string[];
  readonly prohibitedPatterns: readonly string[];
  readonly approvedByUserId: string;
}

export interface BrandSourceArchiveRecord {
  readonly id: string;
  readonly sourceSystem: BrandSourceSystem;
  readonly externalPostId: string | null;
  readonly captionText: string;
  readonly sanitizedCaptionText: string;
  readonly copyrightDeclared: boolean;
  readonly copyrightOwner: string;
  readonly licenseReference: string;
  readonly mediaCasKeys: readonly string[];
  readonly tags: readonly string[];
  readonly sha256Hex: string;
  readonly ingestedByUserId: string;
  readonly createdAt: Date;
}

export interface IngestBrandSourceInput {
  readonly sourceSystem: BrandSourceSystem;
  readonly externalPostId?: string;
  readonly captionText: string;
  readonly copyrightDeclared: boolean;
  readonly copyrightOwner: string;
  readonly licenseReference: string;
  readonly mediaCasKeys?: readonly string[];
  readonly tags?: readonly string[];
  readonly actorUserId: string;
  readonly permissions: readonly string[];
}

export interface BrandDatasetVersionRecord {
  readonly id: string;
  readonly name: string;
  readonly versionString: string;
  readonly status: BrandDatasetStatus;
  readonly assetCount: number;
  readonly gitCommitHash: string | null;
  readonly approvedByUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface BrandBrief {
  readonly brandProfileVersionId: string;
  readonly versionNumber: number;
  readonly luxuryToneDirectives: readonly string[];
  readonly forbiddenVocabulary: readonly string[];
  readonly languageGuidance: {
    readonly formality: string;
    readonly primaryScript: string;
    readonly emojiAllowance: number;
  };
  readonly visualDirectives: {
    readonly recommendedPalettes: readonly string[];
    readonly approvedLighting: readonly string[];
  };
  readonly productContext?: {
    readonly sku: string;
    readonly productName: string;
    readonly brand: string;
  };
  readonly assembledAt: string;
}

export interface OriginalityReport {
  readonly candidateText: string;
  readonly isOriginal: boolean;
  readonly highestNgramOverlap: number;
  readonly highestLevenshteinSimilarity: number;
  readonly matchedSourceId: string | null;
  readonly matchedSanitizedTextSnippet: string | null;
  readonly violations: readonly string[];
}

export interface EvaluationPolicy {
  readonly id: string;
  readonly maxNgramOverlapThreshold: number; // e.g. 0.40 (40%)
  readonly maxLevenshteinSimilarityThreshold: number; // e.g. 0.45 (45%)
  readonly minCandidateLengthChars: number; // e.g. 20
}

export interface TestCaseInput {
  readonly testCaseId: string;
  readonly prompt: string;
  readonly candidateText: string;
  readonly category?: string;
}

export interface TestCaseEvaluation {
  readonly testCaseId: string;
  readonly prompt: string;
  readonly candidateText: string;
  readonly toneScore: number;
  readonly typographyScore: number;
  readonly originalityScore: number;
  readonly totalScore: number;
  readonly passed: boolean;
  readonly detectedLuxuryAttributes: readonly string[];
  readonly detectedForbiddenPatterns: readonly string[];
  readonly detectedLoanwords: readonly string[];
  readonly originalityViolations: readonly string[];
}

export interface BenchmarkEvaluationReport {
  readonly benchmarkRunId: string;
  readonly profileId: string;
  readonly profileVersionNumber: number;
  readonly testDatasetId: string;
  readonly policyId: string;
  readonly totalTestCases: number;
  readonly passedTestCases: number;
  readonly overallScore: number; // 0.0 - 1.0
  readonly toneScoreAverage: number;
  readonly typographyScoreAverage: number;
  readonly originalityScoreAverage: number;
  readonly passed: boolean;
  readonly summaryViolations: readonly string[];
  readonly testCaseEvaluations: readonly TestCaseEvaluation[];
  readonly evaluatedAt: string;
}

export interface ReviewFeedbackRecord {
  readonly id?: string;
  readonly sourceType: 'REVIEW_DESK' | 'BENCHMARK_LAB' | 'MANUAL_REVISION';
  readonly contentJobId?: string | null;
  readonly contentVersionId?: string | null;
  readonly originalText: string;
  readonly revisedText?: string | null;
  readonly decision: 'APPROVED' | 'REJECTED' | 'REVISED';
  readonly critiqueNotes?: string | null;
  readonly toneFlags?: readonly string[];
  readonly reviewerUserId?: string | null;
  readonly datasetVersionId?: string | null;
  readonly createdAt?: Date;
}

export interface FeedbackIngestionSummary {
  readonly batchId: string;
  readonly ingestedCount: number;
  readonly approvedCount: number;
  readonly rejectedCount: number;
  readonly revisedCount: number;
  readonly commonToneFlags: readonly { readonly flag: string; readonly count: number }[];
  readonly ingestedAt: string;
}

export interface CreateBrandDatasetInput {
  readonly name: string;
  readonly versionString: string;
  readonly status?: BrandDatasetStatus | undefined;
  readonly gitCommitHash?: string | null | undefined;
  readonly approvedByUserId?: string | null | undefined;
  readonly initialFeedbackIds?: readonly string[] | undefined;
}
