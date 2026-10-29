import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type PrismaService } from '../prisma.service.js';
import { PrismaPublishingRepository } from './prisma-publishing.repository.js';

type AsyncMock<T = unknown> = jest.MockedFunction<(...args: unknown[]) => Promise<T>>;

interface MockPrismaClient {
  publication: {
    create: AsyncMock;
    findUnique: AsyncMock;
    findMany: AsyncMock;
    count: AsyncMock;
    update: AsyncMock;
  };
  publicationAttempt: {
    create: AsyncMock;
    update: AsyncMock;
    count: AsyncMock;
  };
  approvalEvent: {
    findMany: AsyncMock;
  };
}

describe('PrismaPublishingRepository', () => {
  let mockPrisma: MockPrismaClient;
  let repository: PrismaPublishingRepository;

  const sampleRow = {
    id: 'pub-001',
    contentVersionId: 'ver-001',
    creativeExportId: 'exp-001',
    destinationChannel: 'MANUAL_EXPORT',
    destinationAccountId: null,
    requestedByUserId: 'usr-001',
    status: 'READY',
    idempotencyKey: 'idemp-1',
    campaignId: 'camp-001',
    scheduledAt: null,
    publishedAt: null,
    externalPublicationId: null,
    cancellationReason: null,
    createdAt: new Date('2026-10-29T10:00:00Z'),
    updatedAt: new Date('2026-10-29T10:00:00Z'),
  };

  beforeEach(() => {
    mockPrisma = {
      publication: {
        create: jest.fn<AsyncMock>().mockResolvedValue(sampleRow),
        findUnique: jest.fn<AsyncMock>().mockResolvedValue(sampleRow),
        findMany: jest.fn<AsyncMock>().mockResolvedValue([sampleRow]),
        count: jest.fn<AsyncMock>().mockResolvedValue(1),
        update: jest.fn<AsyncMock>().mockResolvedValue(sampleRow),
      },
      publicationAttempt: {
        create: jest.fn<AsyncMock>().mockResolvedValue({
          id: 'att-001',
          publicationId: 'pub-001',
          attemptNumber: 1,
          status: 'PROCESSING',
          startedAt: new Date(),
          completedAt: null,
          providerResult: null,
          externalPublicationId: null,
          errorCode: null,
          errorMessage: null,
          retryEligible: false,
          createdAt: new Date(),
        }),
        update: jest.fn<AsyncMock>().mockResolvedValue({
          id: 'att-001',
          publicationId: 'pub-001',
          attemptNumber: 1,
          status: 'PUBLISHED',
          startedAt: new Date(),
          completedAt: new Date(),
          providerResult: { success: true },
          externalPublicationId: null,
          errorCode: null,
          errorMessage: null,
          retryEligible: false,
          createdAt: new Date(),
        }),
        count: jest.fn<AsyncMock>().mockResolvedValue(0),
      },
      approvalEvent: {
        findMany: jest.fn<AsyncMock>().mockResolvedValue([
          {
            contentVersionId: 'ver-001',
            createdAt: new Date('2026-10-29T09:00:00Z'),
            contentVersion: {
              id: 'ver-001',
              versionNumber: 1,
              contentJobId: 'job-001',
              productSnapshot: {
                productName: 'Chanel No 5',
              },
              creativeJobs: [
                {
                  exports: [{ id: 'exp-001' }],
                },
              ],
            },
          },
        ]),
      },
    };

    repository = new PrismaPublishingRepository(mockPrisma as unknown as PrismaService);
  });

  it('creates a publication record', async () => {
    const result = await repository.create({
      contentVersionId: 'ver-001',
      creativeExportId: 'exp-001',
      destinationChannel: 'MANUAL_EXPORT',
      destinationAccountId: null,
      requestedByUserId: 'usr-001',
      idempotencyKey: 'idemp-1',
      campaignId: 'camp-001',
      status: 'READY',
    });

    expect(result.id).toBe('pub-001');
    expect(result.destinationChannel).toBe('MANUAL_EXPORT');
    expect(mockPrisma.publication.create).toHaveBeenCalled();
  });

  it('finds by idempotency key', async () => {
    const result = await repository.findByIdempotencyKey('idemp-1');
    expect(result?.id).toBe('pub-001');
    expect(mockPrisma.publication.findUnique).toHaveBeenCalledWith({
      where: { idempotencyKey: 'idemp-1' },
    });
  });

  it('lists publications with pagination', async () => {
    const result = await repository.list({ page: 1, limit: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.totalPages).toBe(1);
  });

  it('creates and updates publication attempts', async () => {
    const attempt = await repository.createAttempt({
      publicationId: 'pub-001',
      attemptNumber: 1,
      status: 'PROCESSING',
    });
    expect(attempt.id).toBe('att-001');

    const updated = await repository.updateAttempt(attempt.id, {
      status: 'PUBLISHED',
      completedAt: new Date(),
    });
    expect(updated.status).toBe('PUBLISHED');
  });

  it('finds eligible content versions for publishing', async () => {
    const result = await repository.findEligibleContentVersions({ page: 1, limit: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.productName).toBe('Chanel No 5');
    expect(result.items[0]?.hasCreativeExports).toBe(true);
  });
});
