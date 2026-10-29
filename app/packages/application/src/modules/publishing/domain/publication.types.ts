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
  readonly scheduledAt: Date | null;
  readonly publishedAt: Date | null;
  readonly externalPublicationId: string | null;
  readonly cancellationReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PublicationAttemptRecord {
  readonly id: string;
  readonly publicationId: string;
  readonly attemptNumber: number;
  readonly status: PublicationStatus;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
  readonly providerResult: unknown;
  readonly externalPublicationId: string | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly retryEligible: boolean;
  readonly createdAt: Date;
}

export interface PublicationDetail extends PublicationRecord {
  readonly attempts: readonly PublicationAttemptRecord[];
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

export interface CreatePublicationInput {
  readonly contentVersionId: string;
  readonly creativeExportId?: string | null;
  readonly destinationChannel: PublicationChannel;
  readonly destinationAccountId?: string | null;
  readonly idempotencyKey: string;
  readonly campaignId?: string | null;
  readonly actingUserId: string;
  readonly permissions: readonly string[];
}

export interface ConfirmPublicationInput {
  readonly publicationId: string;
  readonly actingUserId: string;
  readonly permissions: readonly string[];
}

export interface RetryPublicationInput {
  readonly publicationId: string;
  readonly actingUserId: string;
  readonly permissions: readonly string[];
}

export interface CancelPublicationInput {
  readonly publicationId: string;
  readonly reason: string;
  readonly actingUserId: string;
  readonly permissions: readonly string[];
}

export interface ListPublicationsQuery {
  readonly page?: number;
  readonly limit?: number;
  readonly status?: PublicationStatus;
  readonly channel?: PublicationChannel;
  readonly actingUserId: string;
  readonly permissions: readonly string[];
}

export interface ChannelCapability {
  readonly channel: PublicationChannel;
  readonly displayName: string;
  readonly connected: boolean;
  readonly enabled: boolean;
  readonly reason?: string;
}

// Valid status transitions
export const PUBLICATION_STATUS_TRANSITIONS: ReadonlyMap<
  PublicationStatus,
  readonly PublicationStatus[]
> = new Map([
  [PublicationStatus.DRAFT, [PublicationStatus.READY, PublicationStatus.CANCELLED]],
  [
    PublicationStatus.READY,
    [PublicationStatus.QUEUED, PublicationStatus.PUBLISHED, PublicationStatus.CANCELLED],
  ],
  [PublicationStatus.QUEUED, [PublicationStatus.PROCESSING, PublicationStatus.CANCELLED]],
  [
    PublicationStatus.PROCESSING,
    [PublicationStatus.PUBLISHED, PublicationStatus.FAILED, PublicationStatus.UNKNOWN_OUTCOME],
  ],
  [PublicationStatus.FAILED, [PublicationStatus.QUEUED]],
  [PublicationStatus.UNKNOWN_OUTCOME, []],
  [PublicationStatus.PUBLISHED, []],
  [PublicationStatus.CANCELLED, []],
]);

// Channel capability registry
export const CHANNEL_CAPABILITIES: readonly ChannelCapability[] = [
  {
    channel: PublicationChannel.TELEGRAM_CHANNEL,
    displayName: 'Telegram Channel',
    connected: true,
    enabled: false,
    reason: 'Live publishing disabled pending W61 controlled publishing verification',
  },
  {
    channel: PublicationChannel.FACEBOOK_PAGE,
    displayName: 'Facebook Page',
    connected: false,
    enabled: false,
    reason: 'No Facebook integration configured',
  },
  {
    channel: PublicationChannel.INSTAGRAM,
    displayName: 'Instagram',
    connected: false,
    enabled: false,
    reason: 'No Instagram integration configured',
  },
  {
    channel: PublicationChannel.MANUAL_EXPORT,
    displayName: 'Manual Export / Download',
    connected: true,
    enabled: true,
  },
];
