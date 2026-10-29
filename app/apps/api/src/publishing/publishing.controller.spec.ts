/* eslint-disable @typescript-eslint/unbound-method */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  type CancelPublicationUseCase,
  type ConfirmPublicationUseCase,
  type CreatePublicationUseCase,
  type GetPublicationDetailUseCase,
  type ListDestinationsUseCase,
  type ListEligibleAssetsUseCase,
  type ListPublicationsUseCase,
  Permission,
  PublicationChannel,
  type PublicationDetail,
  type PublicationRecord,
  PublicationStatus,
  type RetryPublicationUseCase,
  type SanitizedEmployeeDto,
} from '@parisian-shopper/application';
import { PublishingController } from './publishing.controller.js';

describe('PublishingController', () => {
  let controller: PublishingController;
  let mockListPublicationsUseCase: jest.Mocked<ListPublicationsUseCase>;
  let mockCreatePublicationUseCase: jest.Mocked<CreatePublicationUseCase>;
  let mockGetPublicationDetailUseCase: jest.Mocked<GetPublicationDetailUseCase>;
  let mockConfirmPublicationUseCase: jest.Mocked<ConfirmPublicationUseCase>;
  let mockRetryPublicationUseCase: jest.Mocked<RetryPublicationUseCase>;
  let mockCancelPublicationUseCase: jest.Mocked<CancelPublicationUseCase>;
  let mockListEligibleAssetsUseCase: jest.Mocked<ListEligibleAssetsUseCase>;
  let mockListDestinationsUseCase: jest.Mocked<ListDestinationsUseCase>;

  const mockAdminEmployee: SanitizedEmployeeDto = {
    id: 'emp-admin-001',
    displayName: 'Admin User',
    status: 'ACTIVE',
    roles: ['ADMIN'],
    permissions: [
      Permission.VIEW_OWN_CONTENT,
      Permission.VIEW_ALL_CONTENT,
      Permission.PUBLISH_CREATIVE,
    ],
  };

  const sampleRecord: PublicationRecord = {
    id: 'pub-001',
    contentVersionId: 'ver-001',
    creativeExportId: 'exp-001',
    destinationChannel: PublicationChannel.MANUAL_EXPORT,
    destinationAccountId: null,
    requestedByUserId: 'emp-admin-001',
    status: PublicationStatus.READY,
    idempotencyKey: 'idemp-1',
    campaignId: 'camp-001',
    scheduledAt: null,
    publishedAt: null,
    externalPublicationId: null,
    cancellationReason: null,
    createdAt: new Date('2026-10-29T10:00:00Z'),
    updatedAt: new Date('2026-10-29T10:00:00Z'),
  };

  const sampleDetail: PublicationDetail = {
    ...sampleRecord,
    attempts: [],
    contentVersion: {
      id: 'ver-001',
      versionNumber: 1,
      contentJobId: 'job-001',
      structuredOutput: {},
    },
    creativeExport: null,
    requestedByUser: {
      id: 'emp-admin-001',
      displayName: 'Admin User',
    },
    campaign: null,
  };

  beforeEach(() => {
    mockListPublicationsUseCase = {
      execute: jest.fn<ListPublicationsUseCase['execute']>().mockResolvedValue({
        items: [sampleRecord],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      }),
    } as unknown as jest.Mocked<ListPublicationsUseCase>;

    mockCreatePublicationUseCase = {
      execute: jest.fn<CreatePublicationUseCase['execute']>().mockResolvedValue(sampleRecord),
    } as unknown as jest.Mocked<CreatePublicationUseCase>;

    mockGetPublicationDetailUseCase = {
      execute: jest.fn<GetPublicationDetailUseCase['execute']>().mockResolvedValue(sampleDetail),
    } as unknown as jest.Mocked<GetPublicationDetailUseCase>;

    mockConfirmPublicationUseCase = {
      execute: jest.fn<ConfirmPublicationUseCase['execute']>().mockResolvedValue({
        ...sampleRecord,
        status: PublicationStatus.PUBLISHED,
        publishedAt: new Date(),
      }),
    } as unknown as jest.Mocked<ConfirmPublicationUseCase>;

    mockRetryPublicationUseCase = {
      execute: jest.fn<RetryPublicationUseCase['execute']>().mockResolvedValue({
        ...sampleRecord,
        status: PublicationStatus.QUEUED,
      }),
    } as unknown as jest.Mocked<RetryPublicationUseCase>;

    mockCancelPublicationUseCase = {
      execute: jest.fn<CancelPublicationUseCase['execute']>().mockResolvedValue({
        ...sampleRecord,
        status: PublicationStatus.CANCELLED,
        cancellationReason: 'Cancelled by user',
      }),
    } as unknown as jest.Mocked<CancelPublicationUseCase>;

    mockListEligibleAssetsUseCase = {
      execute: jest.fn<ListEligibleAssetsUseCase['execute']>().mockResolvedValue({
        items: [
          {
            contentVersionId: 'ver-001',
            versionNumber: 1,
            contentJobId: 'job-001',
            productName: 'Chanel No 5',
            approvedAt: '2026-10-29T09:00:00Z',
            hasCreativeExports: true,
          },
        ],
        total: 1,
      }),
    } as unknown as jest.Mocked<ListEligibleAssetsUseCase>;

    mockListDestinationsUseCase = {
      execute: jest.fn<ListDestinationsUseCase['execute']>().mockReturnValue([
        {
          channel: PublicationChannel.TELEGRAM_CHANNEL,
          displayName: 'Telegram Channel',
          connected: true,
          enabled: false,
          reason: 'Disabled pending W61 verification',
        },
        {
          channel: PublicationChannel.MANUAL_EXPORT,
          displayName: 'Manual Export',
          connected: true,
          enabled: true,
        },
      ]),
    };

    controller = new PublishingController(
      mockListPublicationsUseCase,
      mockCreatePublicationUseCase,
      mockGetPublicationDetailUseCase,
      mockConfirmPublicationUseCase,
      mockRetryPublicationUseCase,
      mockCancelPublicationUseCase,
      mockListEligibleAssetsUseCase,
      mockListDestinationsUseCase,
    );
  });

  it('lists publications with formatted ISO timestamps', async () => {
    const result = await controller.listPublications({}, mockAdminEmployee);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.createdAt).toBe('2026-10-29T10:00:00.000Z');
  });

  it('creates publication successfully', async () => {
    const result = await controller.createPublication(
      {
        contentVersionId: 'ver-001',
        destinationChannel: PublicationChannel.MANUAL_EXPORT,
        idempotencyKey: 'idemp-1',
      },
      mockAdminEmployee,
    );

    expect(result.id).toBe('pub-001');
    expect(mockCreatePublicationUseCase.execute).toHaveBeenCalled();
  });

  it('gets destinations list', () => {
    const result = controller.getDestinations(mockAdminEmployee);
    expect(result).toHaveLength(2);
    expect(mockListDestinationsUseCase.execute).toHaveBeenCalled();
  });

  it('lists eligible assets', async () => {
    const result = await controller.listEligibleAssets(undefined, undefined, mockAdminEmployee);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.productName).toBe('Chanel No 5');
  });

  it('gets publication detail', async () => {
    const result = await controller.getPublicationDetail('pub-001', mockAdminEmployee);
    expect(result.id).toBe('pub-001');
  });

  it('confirms publication', async () => {
    const result = await controller.confirmPublication('pub-001', mockAdminEmployee);
    expect(result.status).toBe(PublicationStatus.PUBLISHED);
  });

  it('retries publication', async () => {
    const result = await controller.retryPublication('pub-001', mockAdminEmployee);
    expect(result.status).toBe(PublicationStatus.QUEUED);
  });

  it('cancels publication', async () => {
    const result = await controller.cancelPublication(
      'pub-001',
      { reason: 'User requested cancellation' },
      mockAdminEmployee,
    );
    expect(result.status).toBe(PublicationStatus.CANCELLED);
  });
});
