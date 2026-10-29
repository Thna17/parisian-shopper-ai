export const PublicationStatus = {
  DRAFT: 'DRAFT',
  READY: 'READY',
  QUEUED: 'QUEUED',
  PROCESSING: 'PROCESSING',
  PUBLISHED: 'PUBLISHED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  UNKNOWN_OUTCOME: 'UNKNOWN_OUTCOME',
} as const;
export type PublicationStatus = (typeof PublicationStatus)[keyof typeof PublicationStatus];

export const PublicationChannel = {
  TELEGRAM_CHANNEL: 'TELEGRAM_CHANNEL',
  FACEBOOK_PAGE: 'FACEBOOK_PAGE',
  INSTAGRAM: 'INSTAGRAM',
  MANUAL_EXPORT: 'MANUAL_EXPORT',
} as const;
export type PublicationChannel = (typeof PublicationChannel)[keyof typeof PublicationChannel];

export interface PublicationRecord {
  readonly id: string;
  readonly contentVersionId: string;
  readonly creativeExportId: string | null;
  readonly destinationChannel: PublicationChannel;
  readonly destinationAccountId: string | null;
  readonly requestedByUserId: string;
  readonly status: PublicationStatus;
  readonly idempotencyKey: string;
  readonly campaignId: string | null;
  readonly scheduledAt: string | null;
  readonly publishedAt: string | null;
  readonly externalPublicationId: string | null;
  readonly cancellationReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PublicationAttempt {
  readonly id: string;
  readonly publicationId: string;
  readonly attemptNumber: number;
  readonly status: PublicationStatus;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly providerResult: unknown;
  readonly externalPublicationId: string | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly retryEligible: boolean;
  readonly createdAt: string;
}

export interface PublicationDetail extends PublicationRecord {
  readonly attempts: readonly PublicationAttempt[];
  readonly contentVersion: {
    readonly id: string;
    readonly versionNumber: number;
    readonly contentJobId: string;
    readonly structuredOutput: unknown;
  };
  readonly creativeExport: {
    readonly id: string;
    readonly format: string;
    readonly encoding: string;
    readonly width: number;
    readonly height: number;
    readonly storageKey: string;
  } | null;
  readonly requestedByUser: {
    readonly id: string;
    readonly displayName: string;
  };
  readonly campaign: {
    readonly id: string;
    readonly code: string;
    readonly name: string;
  } | null;
}

export interface PaginatedPublications {
  readonly items: readonly PublicationRecord[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
}

export interface EligibleAsset {
  readonly contentVersionId: string;
  readonly versionNumber: number;
  readonly contentJobId: string;
  readonly productName: string;
  readonly approvedAt: string;
  readonly hasCreativeExports: boolean;
}

export interface ChannelCapability {
  readonly channel: PublicationChannel;
  readonly displayName: string;
  readonly connected: boolean;
  readonly enabled: boolean;
  readonly reason?: string;
}

export interface CreatePublicationInput {
  readonly contentVersionId: string;
  readonly creativeExportId?: string | null;
  readonly destinationChannel: PublicationChannel;
  readonly destinationAccountId?: string | null;
  readonly idempotencyKey: string;
  readonly campaignId?: string | null;
}

export interface PublishingFilterParams {
  readonly page?: number;
  readonly limit?: number;
  readonly status?: PublicationStatus;
  readonly channel?: PublicationChannel;
}
