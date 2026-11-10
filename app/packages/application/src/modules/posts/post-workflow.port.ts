import type { AIContentOutput } from '../ai/domain/ai-output.schema.js';
import type { FactualValidationOutcome } from '../validation/domain/validation.js';
import type { PostActor } from './post-policy.js';
import type { PostCreationPlan } from './post-creation-plan.js';

export const POST_REPOSITORY = Symbol('POST_REPOSITORY');
export interface SavePostInput {
  requestKey?: string;
  creationPlan?: PostCreationPlan | null;
  generationId?: string | null;
  captionDraft?: AIContentOutput | null;
  productSnapshotId: string;
  brief: string;
  channel: 'FACEBOOK' | 'INSTAGRAM' | 'TELEGRAM' | 'GENERIC';
  language: 'KM' | 'EN' | 'BILINGUAL';
  campaignId?: string | null;
  captionVersionId?: string | null;
  posterVersionId?: string | null;
  visualAssetId?: string | null;
}
export interface PostWorkflowView {
  id: string;
  creatorUserId: string;
  status: string;
  revisionNumber: number;
  reviewRound: number;
  canReview: boolean;
  canEdit: boolean;
  reviewReason: string;
  events?: readonly { action: string; comment: string | null; revisionId: string }[];
  caption: AIContentOutput | null;
  factualValidation: FactualValidationOutcome | null;
  currentRevision: {
    id: string;
    creationPlan: unknown;
    captionGenerationId?: string | null;
    captionProvenance?: unknown;
    brandSnapshot?:unknown;
    brief: string;
    channel: string;
    language: string;
    campaignId: string | null;
    campaignSnapshot?: unknown;
    productSnapshotId: string;
    generationId: string | null;
    posterVersionId: string | null;
    visualAssetId: string | null;
    generation?: { provenance: unknown } | null;
    visualAsset?: { sourceProductAssetDigest: string | null } | null;
    productSnapshot: {
      sku: string;
      productName: string;
      brand: string;
      price: unknown;
      currency: string;
    };
  };
}
export interface PostListView {
  items: { id: string; status: string; revisionNumber: number; productName: string | undefined }[];
  total: number;
  page: number;
  totalPages: number;
}
export type PostDecision = 'SUBMIT' | 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT';
export interface PostRepository<
  T extends PostWorkflowView = PostWorkflowView,
  L = PostListView,
  C = unknown,
> {
  create(input: SavePostInput, actor: PostActor): Promise<T>;
  get(id: string, actor: PostActor): Promise<T>;
  list(
    actor: PostActor,
    page?: number,
    scope?: 'all' | 'mine' | 'reviews' | 'approved',
  ): Promise<L>;
  revise(id: string, expectedRevision: number, input: SavePostInput, actor: PostActor): Promise<T>;
  prepareVariation(
    id: string,
    expectedRevision: number,
    actor: PostActor,
    intent: 'REGENERATE' | 'NEW_DESIGN',
    style: PostCreationPlan['style'] | undefined,
    feedback: string | undefined,
  ): Promise<T>;
  transition(
    id: string,
    expectedRevision: number,
    action: PostDecision,
    comment: string | undefined,
    actor: PostActor,
    expectedReviewRound?: number,
  ): Promise<T>;
  image(
    id: string,
    actor: PostActor,
    revisionId?: string,
  ): Promise<{ storageKey: string; mimeType: string; sha256: string }>;
  candidates(id: string, actor: PostActor): Promise<C>;
}
