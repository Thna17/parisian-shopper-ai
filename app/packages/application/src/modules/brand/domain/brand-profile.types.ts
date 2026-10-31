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
    readonly scriptStyle: 'Moul' | 'Battambang' | 'Siemreap';
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
  readonly defaultVariant: 'GOLD' | 'MONOCHROME_WHITE' | 'MONOCHROME_BLACK';
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
