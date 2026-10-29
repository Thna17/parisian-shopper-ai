import type {
  PaginatedPublications,
  PublicationAttemptRecord,
  PublicationDetail,
  PublicationRecord,
} from '../domain/publication.types.js';

export const PUBLISHING_REPOSITORY = Symbol('PUBLISHING_REPOSITORY');

export interface PublishingRepository {
  create(input: {
    contentVersionId: string;
    creativeExportId: string | null;
    destinationChannel: string;
    destinationAccountId: string | null;
    requestedByUserId: string;
    idempotencyKey: string;
    campaignId: string | null;
    status: string;
  }): Promise<PublicationRecord>;

  findById(id: string): Promise<PublicationDetail | null>;
  findByIdempotencyKey(key: string): Promise<PublicationRecord | null>;

  list(query: {
    page: number;
    limit: number;
    status?: string;
    channel?: string;
  }): Promise<PaginatedPublications>;

  updateStatus(
    id: string,
    status: string,
    extra?: {
      publishedAt?: Date;
      externalPublicationId?: string;
      cancellationReason?: string;
    },
  ): Promise<PublicationRecord>;

  createAttempt(input: {
    publicationId: string;
    attemptNumber: number;
    status: string;
  }): Promise<PublicationAttemptRecord>;

  updateAttempt(
    id: string,
    update: {
      status: string;
      completedAt?: Date;
      providerResult?: unknown;
      externalPublicationId?: string;
      errorCode?: string;
      errorMessage?: string;
      retryEligible?: boolean;
    },
  ): Promise<PublicationAttemptRecord>;

  getAttemptCount(publicationId: string): Promise<number>;

  findEligibleContentVersions(query: { page: number; limit: number }): Promise<{
    items: Array<{
      contentVersionId: string;
      versionNumber: number;
      contentJobId: string;
      productName: string;
      approvedAt: string;
      hasCreativeExports: boolean;
    }>;
    total: number;
  }>;
}
