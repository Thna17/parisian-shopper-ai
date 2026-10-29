import {
  type ChannelCapability,
  type PublicationChannel,
  type PublicationStatus,
} from '@parisian-shopper/application';

export interface PublicationAttemptResponseDto {
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

export interface PublicationResponseDto {
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

export interface PublicationDetailResponseDto extends PublicationResponseDto {
  readonly attempts: readonly PublicationAttemptResponseDto[];
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

export interface PaginatedPublicationsResponseDto {
  readonly items: readonly PublicationResponseDto[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
}

export type ChannelCapabilityResponseDto = ChannelCapability;

export interface EligibleAssetResponseDto {
  readonly contentVersionId: string;
  readonly versionNumber: number;
  readonly contentJobId: string;
  readonly productName: string;
  readonly approvedAt: string;
  readonly hasCreativeExports: boolean;
}
