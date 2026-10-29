export type ContentType =
  'PRODUCT_SPOTLIGHT' | 'PROMOTION' | 'SCENT_PYRAMID' | 'EDUCATIONAL' | 'ENGAGEMENT';

export type ContentLanguage = 'KM' | 'EN' | 'BILINGUAL';

export type ContentPlatform = 'FACEBOOK' | 'INSTAGRAM' | 'TELEGRAM' | 'GENERIC';

export type ContentJobStatus =
  | 'REQUESTED'
  | 'GENERATING'
  | 'DRAFT'
  | 'UNDER_REVIEW'
  | 'REVISION_REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'FAILED';

export interface ContentStructuredOutput {
  headline: string;
  english_caption?: string | null;
  khmer_caption?: string | null;
  cta: string;
  hashtags: string[];
  facts_used?: string[];
}

export interface ContentVersion {
  id: string;
  contentJobId: string;
  versionNumber: number;
  provider: string;
  model: string;
  promptVersion: string;
  structuredOutput: ContentStructuredOutput;
  revisionRequestId?: string | null;
  createdAt: string;
}

export interface GenerationAttempt {
  id: string;
  contentJobId: string;
  attemptNumber: number;
  provider: string;
  model: string;
  promptVersion: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT';
  startedAt: string;
  completedAt?: string | null;
  errorCode?: string | null;
}

export interface ValidationFinding {
  id: string;
  field: string;
  severity: 'INFO' | 'WARNING' | 'BLOCKING';
  code: string;
  message: string;
  expectedValue?: unknown;
  actualValue?: unknown;
}

export interface ValidationResult {
  id: string;
  contentVersionId: string;
  validatorVersion: string;
  status: 'PASSED' | 'PASSED_WITH_WARNINGS' | 'BLOCKED' | 'FAILED';
  findingCount: number;
  blockingCount: number;
  warningCount: number;
  infoCount: number;
  findings: ValidationFinding[];
  createdAt: string;
}

export interface ContentJob {
  id: string;
  productSnapshotId: string;
  brandRuleVersionId: string;
  requesterUserId: string;
  campaignId?: string | null;
  contentType: ContentType;
  language: ContentLanguage;
  platform: ContentPlatform;
  campaignContext?: string | null;
  status: ContentJobStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedContentJobs {
  items: ContentJob[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ContentJobDetail {
  job: ContentJob;
  product?: {
    id: string;
    sku: string;
    title: string;
    brand: string;
    priceUsd: number;
    category?: string;
  } | null;
  campaign?: {
    id: string;
    code: string;
    name: string;
    status: string;
  } | null;
  attempts: GenerationAttempt[];
  versions: ContentVersion[];
  currentVersion?: ContentVersion | null;
  latestValidationResult?: ValidationResult | null;
}

export interface CreateContentJobPayload {
  productSnapshotId: string;
  campaignId?: string;
  contentType: ContentType;
  language: ContentLanguage;
  platform: ContentPlatform;
  campaignContext?: string;
}

export interface ManualRevisePayload {
  currentVersionId: string;
  field: 'headline' | 'englishCaption' | 'khmerCaption' | 'cta';
  newValue: string;
}

export interface ListContentJobsParams {
  page?: number;
  limit?: number;
  status?: ContentJobStatus;
  productSnapshotId?: string;
  campaignId?: string;
}
