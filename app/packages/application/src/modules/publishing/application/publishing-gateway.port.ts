export const PUBLISHING_GATEWAY = Symbol('PUBLISHING_GATEWAY');

export interface FourEyesVerificationProof {
  readonly contentJobId: string;
  readonly contentVersionId: string;
  readonly requesterUserId: string;
  readonly approverUserId: string;
  readonly decision: 'APPROVED';
  readonly approvedAt: string; // ISO string
  readonly signature: string; // HMAC-SHA256 signature
}

export interface PublishPostPayload {
  readonly publicationId: string;
  readonly channel: 'FACEBOOK_PAGE' | 'INSTAGRAM';
  readonly targetAccountId?: string | null | undefined;
  readonly imageUrl: string;
  readonly caption: string;
  readonly contentJobStatus: 'APPROVED';
  readonly fourEyesProof: FourEyesVerificationProof;
}

export interface PublishPostResult {
  readonly success: boolean;
  readonly externalPublicationId: string;
  readonly permalinkUrl?: string;
  readonly channel: 'FACEBOOK_PAGE' | 'INSTAGRAM';
  readonly publishedAt: Date;
  readonly rawProviderResult?: Record<string, unknown>;
}

export interface PublishingGateway {
  publishPost(payload: PublishPostPayload): Promise<PublishPostResult>;
}
