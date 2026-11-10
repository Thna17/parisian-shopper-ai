import type { PostActor } from '../../posts/post-policy.js';
export const PRODUCT_MARKETING_HISTORY = Symbol('PRODUCT_MARKETING_HISTORY');
export interface RecentProductConcept {
  postId: string;
  purpose: string;
  brief: string;
  campaignId: string | null;
  createdAt: string;
  status: string;
}
export interface ProductMarketingHistory {
  recent(
    sku: string,
    excludePostId: string | undefined,
    actor: PostActor,
  ): Promise<RecentProductConcept[]>;
}
