/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import {
  type ApplicationLogger,
  type ClaimedOutboxEvent,
} from '@parisian-shopper/common';
import {
  type AssetStoragePort,
  type CreativeJobRecord,
  type CreativeJobRepository,
  type NormalizedProductEnvelope,
  type ProductSnapshot,
  type ProductSnapshotRepository,
  type TelegramDraftView,
  type TelegramWorkflowRepository,
  type VisualAssetRecord,
  type VisualAssetRepository,
} from '@parisian-shopper/application';
import { FeatureFlag } from '@parisian-shopper/config';

import {
  buildChannelBroadcastKeyboard,
  ChannelBroadcastRenderer,
  escapeMarkdownV2,
} from '../renderers/channel-broadcast.renderer.js';
import { TelegramChannelBroadcastAdapter } from '../channel-broadcast/telegram-channel-broadcast.adapter.js';
import { FakeTelegramGateway } from '../telegram-delivery.gateway.js';

describe('Telegram Channel Broadcast Publishing', () => {
  describe('escapeMarkdownV2', () => {
    it('escapes all Telegram MarkdownV2 reserved characters', () => {
      const specialText = 'Hermès Birkin 25 (Gold/Togo) - €18,500.00! [Limited ~Edition~] `VIP` > #luxury + special | {2026}';
      const escaped = escapeMarkdownV2(specialText);

      expect(escaped).toContain('\\(');
      expect(escaped).toContain('\\)');
      expect(escaped).toContain('\\-');
      expect(escaped).toContain('\\.');
      expect(escaped).toContain('\\!');
      expect(escaped).toContain('\\[');
      expect(escaped).toContain('\\]');
      expect(escaped).toContain('\\~');
      expect(escaped).toContain('\\`');
      expect(escaped).toContain('\\>');
      expect(escaped).toContain('\\#');
      expect(escaped).toContain('\\+');
      expect(escaped).toContain('\\|');
      expect(escaped).toContain('\\{');
      expect(escaped).toContain('\\}');
    });
  });

  describe('ChannelBroadcastRenderer', () => {
    it('renders a high-fidelity luxury Parisian broadcast caption', () => {
      const caption = ChannelBroadcastRenderer.renderCaption({
        productName: 'Hermès Birkin 25 Togo Gold',
        brand: 'Hermès',
        sku: 'HERMES-BIRKIN-25-GOLD',
        price: '18500.00',
        currency: 'EUR',
        headline: 'L’élégance intemporelle au cœur de Paris.',
        frenchCaption: 'Une pièce d’exception façonnée à la main dans les ateliers parisiens.',
        englishCaption: 'An exceptional piece handcrafted in Parisian ateliers.',
        cta: 'Contactez notre concierge privé pour toute demande de réservation.',
        hashtags: ['#Hermes', '#Birkin25', '#ParisianLuxury'],
      });

      expect(caption).toContain('✨ *PARISIAN LUXURY SELECTION* ✨');
      expect(caption).toContain('💎 *Hermès Birkin 25 Togo Gold*');
      expect(caption).toContain('_Hermès_');
      expect(caption).toContain('*18500\\.00 EUR*');
      expect(caption).toContain('`HERMES\\-BIRKIN\\-25\\-GOLD`');
      expect(caption).toContain('🇫🇷 Une pièce d’exception façonnée à la main');
      expect(caption).toContain('🇬🇧 An exceptional piece handcrafted in Parisian ateliers\\.');
      expect(caption).toContain('🛎️ _Contactez notre concierge privé');
      expect(caption).toContain('\\#Hermes \\#Birkin25 \\#ParisianLuxury');
    });

    it('enforces Telegram 1024-character maximum caption limit with clean truncation', () => {
      const longText = 'A'.repeat(1500);
      const caption = ChannelBroadcastRenderer.renderCaption({
        productName: 'Ultra Long Title',
        frenchCaption: longText,
      });

      expect(caption.length).toBeLessThanOrEqual(1024);
      expect(caption.endsWith('...')).toBe(true);
    });
  });

  describe('buildChannelBroadcastKeyboard', () => {
    it('builds inline keyboard with concierge link by default', () => {
      const keyboard = buildChannelBroadcastKeyboard({});
      expect(keyboard).toHaveLength(1);
      expect(keyboard[0]?.[0]?.text).toBe('💬 Inquire with Concierge');
      expect(keyboard[0]?.[0]?.url).toBe('https://t.me/parisian_concierge');
    });

    it('includes checkout button when checkoutUrl is provided', () => {
      const keyboard = buildChannelBroadcastKeyboard({
        conciergeUrl: 'https://t.me/custom_vip',
        checkoutUrl: 'https://checkout.parisianshopper.com/order-123',
      });
      expect(keyboard).toHaveLength(1);
      expect(keyboard[0]).toHaveLength(2);
      expect(keyboard[0]?.[0]?.url).toBe('https://t.me/custom_vip');
      expect(keyboard[0]?.[1]?.text).toBe('🛍️ Reserve Now');
      expect(keyboard[0]?.[1]?.url).toBe('https://checkout.parisianshopper.com/order-123');
    });
  });

  describe('TelegramChannelBroadcastAdapter', () => {
    let mockLogger: ApplicationLogger;
    let gateway: FakeTelegramGateway;
    let mockConfig: {
      telegram: {
        mode: 'polling';
        actionTokenTtlSeconds: number;
        channelId?: string;
      };
      demoMode: boolean;
    };
    let mockFlags: { isEnabled: jest.Mock<(flag: string) => boolean> };
    let mockWorkflowRepo: Partial<TelegramWorkflowRepository>;
    let mockCreativeJobs: Partial<CreativeJobRepository>;
    let mockVisualAssets: Partial<VisualAssetRepository>;
    let mockProductSnapshots: Partial<ProductSnapshotRepository>;
    let mockAssetStorage: Partial<AssetStoragePort>;

    const sampleJob: CreativeJobRecord = {
      id: 'creative-job-42',
      contentVersionId: 'version-cv-99',
      productSnapshotId: 'snap-1',
      brandRuleVersionId: 'brand-1',
      requestedByUserId: 'user-admin',
      status: 'CREATIVE_APPROVED',
      targetPlatform: 'INSTAGRAM',
      aspectRatio: '1:1',
      creativeProfile: 'STUDIO_MINIMAL',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const sampleAsset: VisualAssetRecord = {
      id: 'visual-asset-77',
      creativeJobId: 'creative-job-42',
      versionNumber: 1,
      assetRole: 'COMPOSITED_CREATIVE',
      storageKey: 'cas/sample-asset.png',
      sha256: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      width: 1080,
      height: 1080,
      mimeType: 'image/png',
      byteSize: 45678,
      sourceProductAssetDigest: 'digest-1',
      createdAt: new Date(),
    };

    const sampleDraftView: TelegramDraftView = {
      jobId: 'content-job-1',
      sku: 'HERMES-BIRKIN-25-GOLD',
      productName: 'Hermès Birkin 25 Togo Gold',
      contentType: 'PRODUCT_SPOTLIGHT',
      language: 'BILINGUAL',
      platform: 'INSTAGRAM',
      jobStatus: 'APPROVED',
      createdAt: new Date(),
      requesterTelegramUserId: '123456789',
      telegramIdentityId: 'identity-uuid-1',
      output: {
        headline: 'L’élégance intemporelle',
        khmerCaption: 'Une création rare venue directement des salons parisiens.',
        englishCaption: 'A rare creation directly from Parisian salons.',
        cta: 'Contactez votre concierge.',
        hashtags: ['#Hermes', '#Birkin'],
      },
      validation: {
        id: 'val-1',
        contentVersionId: 'version-cv-99',
        status: 'PASSED',
        validatorVersion: 'v1',
        findingCount: 0,
        blockingCount: 0,
        warningCount: 0,
        infoCount: 0,
        findings: [],
        createdAt: new Date(),
      },
    };

    const sampleProductSnapshot: ProductSnapshot = {
      id: 'snap-1',
      product: {
        product: {
          product_name: 'Hermès Birkin 25 Togo Gold',
          brand: 'Hermès',
          sku: 'HERMES-BIRKIN-25-GOLD',
          price: '18500.00',
          currency: 'EUR',
          stock_status: 'IN_STOCK',
        },
      } as unknown as NormalizedProductEnvelope,
      snapshotHash: 'hash-1',
      normalizerVersion: 'v1',
      createdAt: new Date(),
    };

    const createOutboxEvent = (): ClaimedOutboxEvent => ({
      id: 'event-approved-1',
      topic: 'CREATIVE_APPROVED',
      schemaVersion: 1,
      idempotencyKey: 'creative-job:creative-job-42:approved',
      aggregateType: 'CreativeJob',
      aggregateId: 'creative-job-42',
      payload: {
        creativeJobId: 'creative-job-42',
        visualAssetId: 'visual-asset-77',
        approvalEventId: 'approval-event-1',
        approverUserId: 'user-admin',
      },
      attemptCount: 1,
      occurredAt: new Date(),
      availableAt: new Date(),
    });

    beforeEach(() => {
      mockLogger = {
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
      };
      gateway = new FakeTelegramGateway();
      mockConfig = {
        telegram: {
          mode: 'polling',
          actionTokenTtlSeconds: 900,
          channelId: '@parisian_vip_channel',
        },
        demoMode: false,
      };
      mockFlags = {
        isEnabled: jest.fn((flag: string) => flag === FeatureFlag.TELEGRAM_CHANNEL_PUBLISHING),
      };
      mockWorkflowRepo = {
        getDraftViewByVersionId: jest.fn(() => Promise.resolve(sampleDraftView)),
        beginNotificationDelivery: jest.fn<TelegramWorkflowRepository['beginNotificationDelivery']>(
          () => Promise.resolve('SEND'),
        ),
        markNotificationSent: jest.fn(() => Promise.resolve()),
      };
      mockCreativeJobs = {
        findById: jest.fn(() => Promise.resolve(sampleJob)),
      };
      mockVisualAssets = {
        findById: jest.fn(() => Promise.resolve(sampleAsset)),
      };
      mockProductSnapshots = {
        findById: jest.fn(() => Promise.resolve(sampleProductSnapshot)),
      };
      mockAssetStorage = {
        getAssetBuffer: jest.fn(() => Promise.resolve(Buffer.from('fake-hero-image-bytes'))),
      };
    });

    it('skips publication if TELEGRAM_CHANNEL_PUBLISHING feature flag is false', async () => {
      mockFlags.isEnabled.mockReturnValue(false);

      const adapter = new TelegramChannelBroadcastAdapter(
        mockConfig,
        mockFlags,
        gateway,
        mockLogger,
        mockWorkflowRepo as TelegramWorkflowRepository,
        mockCreativeJobs as CreativeJobRepository,
        mockVisualAssets as VisualAssetRepository,
        mockProductSnapshots as ProductSnapshotRepository,
        mockAssetStorage as AssetStoragePort,
      );

      await adapter.dispatchBroadcast(createOutboxEvent());

      expect(gateway.sent).toHaveLength(0);
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Telegram channel publishing skipped: feature flag is disabled',
        expect.any(Object),
      );
    });

    it('skips publication if TELEGRAM_CHANNEL_ID is missing or empty', async () => {
      delete mockConfig.telegram.channelId;

      const adapter = new TelegramChannelBroadcastAdapter(
        mockConfig,
        mockFlags,
        gateway,
        mockLogger,
        mockWorkflowRepo as TelegramWorkflowRepository,
        mockCreativeJobs as CreativeJobRepository,
        mockVisualAssets as VisualAssetRepository,
        mockProductSnapshots as ProductSnapshotRepository,
        mockAssetStorage as AssetStoragePort,
      );

      await adapter.dispatchBroadcast(createOutboxEvent());

      expect(gateway.sent).toHaveLength(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Telegram channel publishing skipped: TELEGRAM_CHANNEL_ID is not configured',
        expect.any(Object),
      );
    });

    it('skips publication if the event was already dispatched (in-memory deduplication)', async () => {
      const adapter = new TelegramChannelBroadcastAdapter(
        mockConfig,
        mockFlags,
        gateway,
        mockLogger,
        mockWorkflowRepo as TelegramWorkflowRepository,
        mockCreativeJobs as CreativeJobRepository,
        mockVisualAssets as VisualAssetRepository,
        mockProductSnapshots as ProductSnapshotRepository,
        mockAssetStorage as AssetStoragePort,
      );

      const event = createOutboxEvent();
      await adapter.dispatchBroadcast(event);
      expect(gateway.sent).toHaveLength(1);

      // Second invocation for same outbox event
      await adapter.dispatchBroadcast(event);
      expect(gateway.sent).toHaveLength(1);
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('already processed'),
        expect.any(Object),
      );
    });

    it('skips publication if database record indicates ALREADY_SENT (db deduplication)', async () => {
      mockWorkflowRepo.beginNotificationDelivery = jest.fn<TelegramWorkflowRepository['beginNotificationDelivery']>(
        () => Promise.resolve('ALREADY_SENT'),
      );

      const adapter = new TelegramChannelBroadcastAdapter(
        mockConfig,
        mockFlags,
        gateway,
        mockLogger,
        mockWorkflowRepo as TelegramWorkflowRepository,
        mockCreativeJobs as CreativeJobRepository,
        mockVisualAssets as VisualAssetRepository,
        mockProductSnapshots as ProductSnapshotRepository,
        mockAssetStorage as AssetStoragePort,
      );

      await adapter.dispatchBroadcast(createOutboxEvent());

      expect(gateway.sent).toHaveLength(0);
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('delivery already recorded'),
        expect.any(Object),
      );
    });

    it('successfully publishes high-resolution visual broadcast to channel with photo, caption, and buttons', async () => {
      const adapter = new TelegramChannelBroadcastAdapter(
        mockConfig,
        mockFlags,
        gateway,
        mockLogger,
        mockWorkflowRepo as TelegramWorkflowRepository,
        mockCreativeJobs as CreativeJobRepository,
        mockVisualAssets as VisualAssetRepository,
        mockProductSnapshots as ProductSnapshotRepository,
        mockAssetStorage as AssetStoragePort,
      );

      const event = createOutboxEvent();
      await adapter.dispatchBroadcast(event);

      expect(gateway.sent).toHaveLength(1);
      const sentMessage = gateway.sent[0];
      expect(sentMessage?.telegramUserId).toBe('@parisian_vip_channel');
      expect(sentMessage?.message.photoBuffer).toBeDefined();
      expect(sentMessage?.message.parseMode).toBe('MarkdownV2');
      expect(sentMessage?.message.text).toContain('✨ *PARISIAN LUXURY SELECTION* ✨');
      expect(sentMessage?.message.text).toContain('💎 *Hermès Birkin 25 Togo Gold*');
      expect(sentMessage?.message.buttons).toBeDefined();
      expect(sentMessage?.message.buttons?.[0]?.[0]?.text).toBe('💬 Inquire with Concierge');
      expect(sentMessage?.message.buttons?.[0]?.[0]?.url).toBe('https://t.me/parisian_concierge');

      expect(mockWorkflowRepo.markNotificationSent).toHaveBeenCalledWith(event.id, expect.any(Date));
    });

    it('rethrows errors if Telegram gateway delivery fails to allow outbox relay retries', async () => {
      const failingGateway: FakeTelegramGateway = {
        sent: [],
        callbackAnswers: [],
        sendMessages: jest.fn(() => Promise.reject(new Error('Telegram API Network Timeout'))),
        answerCallback: jest.fn(),
      };

      const adapter = new TelegramChannelBroadcastAdapter(
        mockConfig,
        mockFlags,
        failingGateway,
        mockLogger,
        mockWorkflowRepo as TelegramWorkflowRepository,
        mockCreativeJobs as CreativeJobRepository,
        mockVisualAssets as VisualAssetRepository,
        mockProductSnapshots as ProductSnapshotRepository,
        mockAssetStorage as AssetStoragePort,
      );

      await expect(adapter.dispatchBroadcast(createOutboxEvent())).rejects.toThrow(
        'Telegram API Network Timeout',
      );
    });
  });
});
