import type { PostActor } from '../../posts/post-policy.js';
import type {
  BrandGuidanceInput,
  PinnedBrandGuidance,
  ReferenceSnapshot,
} from '../domain/brand-guidance.schema.js';
export const BRAND_GUIDANCE_REPOSITORY = Symbol('BRAND_GUIDANCE_REPOSITORY');
export interface BrandReferenceInput {
  sourceSystem: 'FACEBOOK' | 'INSTAGRAM' | 'BRAND_GUIDELINES' | 'CAMPAIGN_COLLATERAL';
  sourceUrl: string;
  captionText: string;
  copyrightDeclared: boolean;
  copyrightOwner: string;
  licenseReference: string;
  tags: string[];
  mediaCasKeys: string[];
  previousSourceId?: string | undefined;
}
export interface ReferenceView {
  id: string;
  sourceUrl: string | null;
  sourceSystem: string;
  captionText: string;
  copyrightDeclared: boolean;
  copyrightOwner: string;
  licenseReference: string;
  tags: string[];
  mediaCasKeys: string[];
  version: number;
  groupId: string | null;
  status: string;
  reviewEventId: string | null;
  sourceDigest: string;
  media: ReferenceSnapshot['media'];
  reviewHistory?: {
    id: string;
    decision: string;
    notes: string;
    actorUserId: string;
    createdAt: string;
  }[];
  history: { id: string; version: number }[];
}
export interface GuidanceView {
  id: string;
  name: string;
  versionNumber: number;
  status: string;
  guidance: BrandGuidanceInput;
  ruleVersionId: string;
  datasetVersionId: string;
  digest: string;
  approvalId: string | null;
  benchmarkReport: unknown;
  createdByUserId: string;
}
export interface BrandGuidanceRepository {
  list(): Promise<GuidanceView[]>;
  create(input: BrandGuidanceInput, actor: PostActor): Promise<GuidanceView>;
  approve(id: string, digest: string, actor: PostActor): Promise<GuidanceView>;
  references(): Promise<ReferenceView[]>;
  createReference(input: BrandReferenceInput, actor: PostActor): Promise<ReferenceView>;
  reviewReference(
    id: string,
    digest: string,
    decision: 'APPROVED' | 'REJECTED' | 'REVOKED',
    notes: string,
    media: ReferenceSnapshot['media'],
    actor: PostActor,
    expectedReviewEventId?: string | null,
  ): Promise<ReferenceView>;
  pin(id: string, referenceIds: string[]): Promise<PinnedBrandGuidance>;
}
