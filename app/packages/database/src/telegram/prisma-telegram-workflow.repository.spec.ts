import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { type NormalizedProductEnvelope } from '@parisian-shopper/application';
import { Prisma } from '@prisma/client';
import { PrismaTelegramWorkflowRepository } from './prisma-telegram-workflow.repository.js';
import { type PrismaService } from '../prisma.service.js';

type AsyncMock<T = unknown> = jest.MockedFunction<(...args: unknown[]) => Promise<T>>;

interface MockModel {
  create?: AsyncMock;
  findUnique?: AsyncMock;
  findFirst?: AsyncMock;
  findMany?: AsyncMock;
  update?: AsyncMock;
  upsert?: AsyncMock;
  deleteMany?: AsyncMock;
}

interface MockPrismaClient {
  telegramActiveWorkflowMessage: MockModel;
  telegramChannelPublicationRecord: MockModel;
  telegramCreateFlow: MockModel;
  $queryRaw: AsyncMock;
  $transaction: jest.MockedFunction<
    (callback: (tx: MockPrismaClient) => Promise<unknown>) => Promise<unknown>
  >;
}

const mockProductEnvelope: NormalizedProductEnvelope = {
  schema_version: '1.0',
  source_system: 'mock_catalog',
  retrieved_at: '2026-10-28T00:00:00.000Z',
  source_updated_at: '2026-10-28T00:00:00.000Z',
  lifecycle_status: 'active',
  product: {
    sku: 'FIC-PERF-001',
    product_name: 'Chanel No. 5 Eau de Parfum',
    brand: 'Chanel',
    category: 'Fragrance',
    description: 'Iconic floral aldehyde fragrance.',
    price: '195.00',
    currency: 'USD',
    stock_status: 'in_stock',
  },
};

describe('PrismaTelegramWorkflowRepository (Durable Persistence W30-B)', () => {
  let repository: PrismaTelegramWorkflowRepository;
  let mockPrisma: MockPrismaClient;

  beforeEach(() => {
    mockPrisma = {
      telegramActiveWorkflowMessage: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        deleteMany: jest.fn(),
      },
      telegramChannelPublicationRecord: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
      },
      telegramCreateFlow: {
        update: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      $queryRaw: jest.fn(),
      $transaction: jest.fn(async (cb) => cb(mockPrisma)),
    };

    repository = new PrismaTelegramWorkflowRepository(mockPrisma as unknown as PrismaService);
  });

  describe('Active Workflow Message Persistence', () => {
    it('sets and upserts active workflow message with metadata and custom messageType', async () => {
      const resourceKey = 'flow-12345';
      const messageId = 1042;
      const chatId = 'chat-7788';
      const payloadMetadata = { step: 3, lastCommand: '/create' };

      mockPrisma.telegramActiveWorkflowMessage.upsert!.mockResolvedValueOnce({
        id: 'uuid-1',
        resourceKey,
        chatId,
        messageId,
        messageType: 'WIZARD_PROMPT',
        payloadMetadata,
        updatedAt: new Date(),
        createdAt: new Date(),
      });

      await repository.setActiveWorkflowMessage(resourceKey, messageId, chatId, {
        messageType: 'WIZARD_PROMPT',
        payloadMetadata,
      });

      expect(mockPrisma.telegramActiveWorkflowMessage.upsert).toHaveBeenCalledWith({
        where: { resourceKey },
        create: {
          resourceKey,
          messageId,
          chatId,
          messageType: 'WIZARD_PROMPT',
          payloadMetadata,
        },
        update: {
          messageId,
          chatId,
          messageType: 'WIZARD_PROMPT',
          payloadMetadata,
        },
      });
    });

    it('defaults messageType to WIZARD_PROMPT and handles omitted chatId', async () => {
      const resourceKey = 'job-999';
      const messageId = 555;

      mockPrisma.telegramActiveWorkflowMessage.upsert!.mockResolvedValueOnce({
        id: 'uuid-2',
        resourceKey,
        chatId: null,
        messageId,
        messageType: 'WIZARD_PROMPT',
        payloadMetadata: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      });

      await repository.setActiveWorkflowMessage(resourceKey, messageId);

      expect(mockPrisma.telegramActiveWorkflowMessage.upsert).toHaveBeenCalledWith({
        where: { resourceKey },
        create: {
          resourceKey,
          messageId,
          messageType: 'WIZARD_PROMPT',
          payloadMetadata: Prisma.JsonNull,
        },
        update: {
          messageId,
          messageType: 'WIZARD_PROMPT',
          payloadMetadata: Prisma.JsonNull,
        },
      });
    });

    it('supports object-form input for SetActiveWorkflowMessageInput with VISUAL_REVIEW_CARD', async () => {
      const resourceKey = 'job-card-888';
      const input = {
        messageId: 9876,
        chatId: 'chat-xyz',
        messageType: 'VISUAL_REVIEW_CARD' as const,
        payloadMetadata: { reason: 'fallback' },
      };

      mockPrisma.telegramActiveWorkflowMessage.upsert!.mockResolvedValueOnce({
        id: 'uuid-3',
        resourceKey,
        chatId: 'chat-xyz',
        messageId: 9876,
        messageType: 'VISUAL_REVIEW_CARD',
        payloadMetadata: { reason: 'fallback' },
        updatedAt: new Date(),
        createdAt: new Date(),
      });

      await repository.setActiveWorkflowMessage(resourceKey, input);

      expect(mockPrisma.telegramActiveWorkflowMessage.upsert).toHaveBeenCalledWith({
        where: { resourceKey },
        create: {
          resourceKey,
          messageId: 9876,
          chatId: 'chat-xyz',
          messageType: 'VISUAL_REVIEW_CARD',
          payloadMetadata: { reason: 'fallback' },
        },
        update: {
          messageId: 9876,
          chatId: 'chat-xyz',
          messageType: 'VISUAL_REVIEW_CARD',
          payloadMetadata: { reason: 'fallback' },
        },
      });
    });

    it('retrieves active workflow message properly formatted', async () => {
      mockPrisma.telegramActiveWorkflowMessage.findUnique!.mockResolvedValueOnce({
        id: 'uuid-1',
        resourceKey: 'flow-12345',
        chatId: 'chat-7788',
        messageId: 1042,
        messageType: 'REVIEW_CARD',
        payloadMetadata: { version: 2 },
        updatedAt: new Date(),
        createdAt: new Date(),
      });

      const result = await repository.getActiveWorkflowMessage('flow-12345');

      expect(result).toEqual({
        messageId: 1042,
        chatId: 'chat-7788',
        messageType: 'REVIEW_CARD',
        payloadMetadata: { version: 2 },
      });
    });

    it('returns null when active workflow message is not found', async () => {
      mockPrisma.telegramActiveWorkflowMessage.findUnique!.mockResolvedValueOnce(null);

      const result = await repository.getActiveWorkflowMessage('nonexistent-key');
      expect(result).toBeNull();
    });

    it('clears active workflow message by deleting records with matching resourceKey', async () => {
      mockPrisma.telegramActiveWorkflowMessage.deleteMany!.mockResolvedValueOnce({ count: 1 });

      await repository.clearActiveWorkflowMessage('flow-12345');

      expect(mockPrisma.telegramActiveWorkflowMessage.deleteMany).toHaveBeenCalledWith({
        where: { resourceKey: 'flow-12345' },
      });
    });
  });

  describe('Channel Publication Records', () => {
    it('records channel publication by upserting creativeJobId record', async () => {
      const creativeJobId = 'cj-111';
      const visualAssetId = 'va-222';
      const channelId = '-100123456789';
      const messageId = 888;
      const publishedAt = new Date('2026-10-28T12:00:00Z');

      mockPrisma.telegramChannelPublicationRecord.upsert!.mockResolvedValueOnce({
        id: 'pub-uuid',
        creativeJobId,
        visualAssetId,
        channelId,
        messageId,
        publishedAt,
      });

      await repository.recordChannelPublication(
        creativeJobId,
        visualAssetId,
        channelId,
        messageId,
        publishedAt,
      );

      expect(mockPrisma.telegramChannelPublicationRecord.upsert).toHaveBeenCalledWith({
        where: { creativeJobId },
        create: {
          creativeJobId,
          visualAssetId,
          channelId,
          messageId,
          publishedAt,
        },
        update: {
          visualAssetId,
          channelId,
          messageId,
          publishedAt,
        },
      });
    });

    it('retrieves channel publication by creativeJobId', async () => {
      const creativeJobId = 'cj-111';
      const publishedAt = new Date('2026-10-28T12:00:00Z');

      mockPrisma.telegramChannelPublicationRecord.findUnique!.mockResolvedValueOnce({
        id: 'pub-uuid',
        creativeJobId,
        visualAssetId: 'va-222',
        channelId: '-100123456789',
        messageId: 888,
        publishedAt,
      });

      const publication = await repository.getChannelPublication(creativeJobId);

      expect(publication).toEqual({
        channelId: '-100123456789',
        messageId: 888,
        publishedAt,
      });
    });

    it('returns null when channel publication is not found', async () => {
      mockPrisma.telegramChannelPublicationRecord.findUnique!.mockResolvedValueOnce(null);

      const publication = await repository.getChannelPublication('cj-nonexistent');
      expect(publication).toBeNull();
    });
  });

  describe('Flow Lifecycle: cancelFlow and findActiveFlowByIdentity', () => {
    it('cancels flow and marks status as CANCELLED with completedAt timestamp', async () => {
      const flowId = 'flow-cancel-test';
      mockPrisma.telegramCreateFlow.update!.mockResolvedValueOnce({
        id: flowId,
        status: 'CANCELLED',
      });

      await repository.cancelFlow(flowId);

      expect(mockPrisma.telegramCreateFlow.update).toHaveBeenCalledWith({
        where: { id: flowId },
        data: expect.objectContaining({
          status: 'CANCELLED',
          completedAt: expect.any(Date),
        }),
      });
    });

    it('finds active flow by identity filtering out COMPLETED, CANCELLED, and EXPIRED', async () => {
      const identityId = 'identity-uuid-1';
      const expiresAt = new Date(Date.now() + 600_000);

      mockPrisma.telegramCreateFlow.findFirst!.mockResolvedValueOnce({
        id: 'flow-active-1',
        telegramIdentityId: identityId,
        productData: mockProductEnvelope,
        status: 'SELECTING_LANGUAGE',
        contentType: 'PRODUCT_SPOTLIGHT',
        language: null,
        platform: null,
        expiresAt,
        completedAt: null,
        createdAt: new Date(),
      });

      const flow = await repository.findActiveFlowByIdentity(identityId);

      expect(mockPrisma.telegramCreateFlow.findFirst).toHaveBeenCalledWith({
        where: {
          telegramIdentityId: identityId,
          status: {
            notIn: ['COMPLETED', 'CANCELLED', 'EXPIRED'],
          },
          expiresAt: {
            gt: expect.any(Date),
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(flow).not.toBeNull();
      expect(flow?.id).toBe('flow-active-1');
      expect(flow?.status).toBe('SELECTING_LANGUAGE');
      expect(flow?.contentType).toBe('PRODUCT_SPOTLIGHT');
    });

    it('returns null when no active unexpired flow exists for identity', async () => {
      mockPrisma.telegramCreateFlow.findFirst!.mockResolvedValueOnce(null);

      const flow = await repository.findActiveFlowByIdentity('identity-idle');
      expect(flow).toBeNull();
    });
  });
});
