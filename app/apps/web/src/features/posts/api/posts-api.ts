import { apiClient } from '../../../services/api/api-client.js';
import type {
  ContentLanguage,
  ContentPlatform,
  ContentStructuredOutput,
} from '../../content/types/content.types.js';
export interface PostCaption extends ContentStructuredOutput {
  creative_brief?: string;
  facts_used?: string[];
  warnings?: string[];
  missing_information?: string[];
}
export interface PostCreationPlan {
  educationMode?: 'PRODUCT_FACTS' | 'FRAGRANCE_NOTES';
  format: 'POSTER' | 'VIDEO';
  purpose:
    | 'PRODUCT_SPOTLIGHT'
    | 'PROMOTION'
    | 'NEW_ARRIVAL'
    | 'EDUCATIONAL'
    | 'GIFT_GUIDE'
    | 'LIFESTYLE'
    | 'CUSTOM';
  style: 'LUXURY' | 'MINIMAL' | 'FESTIVE' | 'EDITORIAL';
  feedback: string;
  intent: 'INITIAL' | 'EDIT' | 'REGENERATE' | 'NEW_DESIGN';
}
export interface PostInput {
  requestKey?: string;
  creationPlan?: PostCreationPlan | null;
  generationId?: string | null;
  captionDraft?: PostCaption | null;
  productSnapshotId: string;
  brief: string;
  channel: ContentPlatform;
  language: ContentLanguage;
  campaignId?: string | null;
  captionVersionId?: string | null;
  posterVersionId?: string | null;
  visualAssetId?: string | null;
}
export interface McpCreditQuote {
  credits: number;
  balance: number;
  workspaceId: string;
  connectionEpoch: number;
  fingerprint: string;
  expiresAt: string;
  params: Record<string, unknown>;
}
export interface PostGeneration {
  spendingConfirmed?: boolean;
  authorization?: unknown;
  estimatedCredits?: string | null;
  actualCredits?: string | null;
  creditQuote?: McpCreditQuote | null;
  canRecover?: boolean;
  sourceRevisionNumber: number;
  id: string;
  status: string;
  provider: string;
  model: string;
  caption: ContentStructuredOutput | null;
  error: string | null;
  settings: Record<string, unknown>;
  references: unknown[];
  prompt: string;
  estimatedCostUsd: string | null;
  actualCostUsd: string | null;
  provenance: Record<string, unknown> | null;
}
export interface PostGenerationInfo {
  mcpConnection?: {
    status: string;
    configured: boolean;
    dispatchEnabled: boolean;
    sharedUseConfirmed: boolean;
  };
  generation: PostGeneration | null;
  provider: 'disabled' | 'fake' | 'higgsfield' | 'higgsfield_mcp';
  setupMessage: string;
  currentBalanceUsd: number | null;
  expectedCostUsd: string | null;
}
export interface PostRevision extends PostInput {
  brandSnapshot?: {
    name: string;
    versionNumber: number;
    digest: string;
    references: { sourceId: string; version: number }[];
  } | null;
  captionGenerationId?: string | null;
  captionProvenance?: {
    method?: string;
    authorUserId?: string;
    basedOnCaptionGenerationId?: string;
  } | null;
  campaignSnapshot?: {
    id: string;
    name: string;
    code: string;
    objective: string;
    description: string | null;
  } | null;
  visualAsset?: { provider: string; model: string } | null;
  generation?: PostGeneration | null;
  generationId?: string | null;
  id: string;
  revisionNumber: number;
  authorUserId: string;
  createdAt: string;
  author: { id: string; displayName: string };
  productSnapshot: {
    id: string;
    productName: string;
    sku: string;
    brand: string;
    price: string;
    currency: string;
    images: unknown;
  };
  campaign: { id: string; name: string; code: string } | null;
  captionVersion: {
    id: string;
    contentJobId: string;
    versionNumber: number;
    structuredOutput: ContentStructuredOutput;
  } | null;
  posterVersion: { id: string; sceneId: string; versionNumber: number } | null;
}
export interface StaffPost {
  id: string;
  creatorUserId: string;
  status: 'DRAFT' | 'UNDER_REVIEW' | 'CHANGES_REQUESTED' | 'APPROVED' | 'REJECTED';
  revisionNumber: number;
  reviewRound: number;
  caption?: PostCaption | null;
  factualValidation?: {
    status: string;
    blockingCount: number;
    findings: { code: string; message: string; severity: string }[];
  } | null;
  currentRevision: PostRevision;
  revisions: PostRevision[];
  events: {
    id: string;
    action: string;
    comment: string | null;
    revisionId: string;
    reviewRound?: number | null;
    createdAt: string;
    actor: { displayName: string };
  }[];
  canDownload?: boolean;
  downloadReason?: string;
  existingPublications?: { id: string; destinationChannel: string; status: string }[];
  canEdit: boolean;
  canReview: boolean;
  reviewReason: string;
  previewUrl: string | null;
}
export interface PostCandidates {
  captions: {
    id: string;
    contentJobId: string;
    versionNumber: number;
    structuredOutput: ContentStructuredOutput;
  }[];
  posters: {
    id: string;
    sceneId: string;
    versionNumber: number;
    scene: { title: string };
    renderedAssets: { id: string; width: number; height: number }[];
  }[];
}
export interface PostsPage {
  items: {
    id: string;
    status: string;
    productName: string;
    revisionNumber: number;
    creatorName: string;
    updatedAt: string;
  }[];
  page: number;
  totalPages: number;
  total: number;
}
export const postsApi = {
  variation: (
    id: string,
    expectedRevision: number,
    intent: 'REGENERATE' | 'NEW_DESIGN',
    style: PostCreationPlan['style'],
    feedback: string,
  ): Promise<StaffPost> =>
    apiClient.post<StaffPost>(`/v1/posts/${encodeURIComponent(id)}/variations`, {
      expectedRevision,
      intent,
      style,
      feedback,
    }),
  quoteCredits: (id: string): Promise<PostGenerationInfo> =>
    apiClient.post<PostGenerationInfo>(`/v1/posts/${id}/generation/quote`, {}),
  confirmCredits: (
    id: string,
    generationId: string,
    fingerprint: string,
  ): Promise<PostGenerationInfo> =>
    apiClient.post<PostGenerationInfo>(`/v1/posts/${id}/generation/confirm-credits`, {
      generationId,
      fingerprint,
      confirmed: true,
    }),
  generation: (id: string): Promise<PostGenerationInfo> =>
    apiClient.get<PostGenerationInfo>(`/v1/posts/${encodeURIComponent(id)}/generation`),
  generate: (id: string, expectedRevision: number): Promise<PostGenerationInfo> =>
    apiClient.post<PostGenerationInfo>(`/v1/posts/${encodeURIComponent(id)}/generation`, {
      expectedRevision,
    }),
  cancelGeneration: (id: string): Promise<PostGenerationInfo> =>
    apiClient.post<PostGenerationInfo>(`/v1/posts/${encodeURIComponent(id)}/generation/cancel`, {}),
  reconcile: (id: string): Promise<PostGenerationInfo> =>
    apiClient.post<PostGenerationInfo>(
      `/v1/posts/${encodeURIComponent(id)}/generation/reconcile`,
      {},
    ),
  create: (input: PostInput): Promise<StaffPost> => apiClient.post<StaffPost>('/v1/posts', input),
  get: (id: string): Promise<StaffPost> =>
    apiClient.get<StaffPost>(`/v1/posts/${encodeURIComponent(id)}`),
  list: (page = 1, scope: PostListScope = 'all'): Promise<PostsPage> =>
    apiClient.get<PostsPage>(`/v1/posts?page=${page}&scope=${scope}`),
  candidates: (id: string): Promise<PostCandidates> =>
    apiClient.get<PostCandidates>(`/v1/posts/${encodeURIComponent(id)}/candidates`),
  revise: (id: string, expectedRevision: number, input: PostInput): Promise<StaffPost> =>
    apiClient.patch<StaffPost>(`/v1/posts/${encodeURIComponent(id)}`, {
      ...input,
      expectedRevision,
    }),
  action: (
    id: string,
    expectedRevision: number,
    action: 'SUBMIT' | 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT',
    comment?: string,
    expectedReviewRound?: number,
  ): Promise<StaffPost> =>
    apiClient.post<StaffPost>(`/v1/posts/${encodeURIComponent(id)}/actions`, {
      expectedRevision,
      expectedReviewRound,
      action,
      ...(comment ? { comment } : {}),
    }),
};
export const postStatusLabel: Record<string, string> = {
  REJECTED: 'Rejected · prepare a new version',
  DRAFT: 'Draft',
  UNDER_REVIEW: 'Waiting for review',
  APPROVED: 'Approved',
  CHANGES_REQUESTED: 'Changes requested',
};

export type PostListScope = 'all' | 'mine' | 'reviews' | 'approved';
export type PostDownloadKind = 'poster' | 'caption-text' | 'caption-json' | 'manifest';
export interface DownloadedPostFile {
  blob: Blob;
  filename: string;
}
export async function downloadApprovedPost(
  id: string,
  revisionId: string,
  reviewRound: number,
  kind: PostDownloadKind,
): Promise<DownloadedPostFile> {
  const query = new URLSearchParams({ revisionId, reviewRound: String(reviewRound) });
  const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(
      `${base}/v1/posts/${encodeURIComponent(id)}/download/${kind}?${query}`,
      { credentials: 'include', signal: controller.signal },
    );
    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      throw new Error(
        error?.error?.message ??
          'Could not download this approved version. Refresh the post and try again.',
      );
    }
    const bytes = await response.arrayBuffer();
    const expected = response.headers.get('X-Content-SHA256');
    const actual = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      (byte) => byte.toString(16).padStart(2, '0'),
    ).join('');
    if (!expected || actual !== expected || response.headers.get('X-Post-Revision') !== revisionId)
      throw new Error(
        'The downloaded file did not match the approved version. No file was saved. Try again or contact an administrator.',
      );
    const filename =
      response.headers.get('Content-Disposition')?.match(/filename="([a-zA-Z0-9._-]+)"/)?.[1] ??
      `post-${kind}`;
    return {
      blob: new Blob([bytes], {
        type: response.headers.get('Content-Type') ?? 'application/octet-stream',
      }),
      filename,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      throw new Error('The download timed out. Your approved post is saved. Try again.', {
        cause: error,
      });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
export function savePostDownload(file: DownloadedPostFile): void {
  const url = URL.createObjectURL(file.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
