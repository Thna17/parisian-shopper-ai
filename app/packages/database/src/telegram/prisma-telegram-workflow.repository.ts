import { Injectable } from '@nestjs/common';
import {
  aiContentOutputSchema,
  hasAnyRolePermission,
  FindingCode,
  FindingSeverity,
  normalizedProductEnvelopeSchema,
  type NormalizedProductEnvelope,
  type PersistedValidationFinding,
  type PersistedValidationResult,
  type StoreActionTokenInput,
  type TelegramActionTokenRecord,
  type TelegramActor,
  type TelegramCreateFlow,
  type TelegramDraftView,
  type TelegramFailureView,
  type TelegramJobSummary,
  type TelegramOutboxEvent,
  type TelegramUserProfile,
  type TelegramWorkflowMetadata,
  type TelegramWorkflowRepository,
  type SetActiveWorkflowMessageInput,
  Permission,
  ValidationStatus,
} from '@parisian-shopper/application';
import {
  Prisma,
  type TelegramWorkflowMessageType,
  type ValidationFinding,
  type ValidationResult,
} from '@prisma/client';

import { PrismaService } from '../prisma.service.js';

const OUTBOX_LEASE_MS = 5 * 60 * 1_000;

@Injectable()
export class PrismaTelegramWorkflowRepository implements TelegramWorkflowRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async setActiveWorkflowMessage(
    resourceKey: string,
    messageIdOrInput: number | SetActiveWorkflowMessageInput,
    chatIdParam?: string,
    optionsParam?: { messageType?: string; payloadMetadata?: Readonly<Record<string, unknown>> },
  ): Promise<void> {
    const isObject = typeof messageIdOrInput === 'object';
    const messageId = isObject ? messageIdOrInput.messageId : messageIdOrInput;
    const chatId = isObject ? messageIdOrInput.chatId : chatIdParam;
    const rawType = isObject ? messageIdOrInput.messageType : optionsParam?.messageType;
    const rawMeta = isObject ? messageIdOrInput.payloadMetadata : optionsParam?.payloadMetadata;

    const messageType = normalizeWorkflowMessageType(rawType);
    const payloadMetadata =
      rawMeta !== undefined ? (rawMeta as Prisma.InputJsonValue) : Prisma.JsonNull;

    await this.prisma.telegramActiveWorkflowMessage.upsert({
      where: { resourceKey },
      create: {
        resourceKey,
        messageId,
        ...(chatId !== undefined ? { chatId } : {}),
        messageType,
        payloadMetadata,
      },
      update: {
        messageId,
        ...(chatId !== undefined ? { chatId } : {}),
        messageType,
        payloadMetadata,
      },
    });
  }

  public async getActiveWorkflowMessage(flowIdOrJobId: string): Promise<{
    messageId: number;
    chatId?: string;
    messageType?: string;
    payloadMetadata?: Readonly<Record<string, unknown>>;
  } | null> {
    const record = await this.prisma.telegramActiveWorkflowMessage.findUnique({
      where: { resourceKey: flowIdOrJobId },
    });
    if (record === null) return null;
    return {
      messageId: record.messageId,
      ...(record.chatId !== null ? { chatId: record.chatId } : {}),
      messageType: record.messageType,
      ...(record.payloadMetadata !== null
        ? { payloadMetadata: record.payloadMetadata as Readonly<Record<string, unknown>> }
        : {}),
    };
  }

  public async clearActiveWorkflowMessage(flowIdOrJobId: string): Promise<void> {
    await this.prisma.telegramActiveWorkflowMessage.deleteMany({
      where: { resourceKey: flowIdOrJobId },
    });
  }

  public async recordChannelPublication(
    creativeJobId: string,
    visualAssetId: string,
    channelId: string,
    messageId: number,
    publishedAt = new Date(),
  ): Promise<void> {
    await this.prisma.telegramChannelPublicationRecord.upsert({
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
  }

  public async getChannelPublication(
    creativeJobId: string,
  ): Promise<{ channelId: string; messageId: number; publishedAt: Date } | null> {
    const record = await this.prisma.telegramChannelPublicationRecord.findUnique({
      where: { creativeJobId },
    });
    if (record === null) return null;
    return {
      channelId: record.channelId,
      messageId: record.messageId,
      publishedAt: record.publishedAt,
    };
  }

  public async claimInboundUpdate(
    updateId: string,
    telegramUserId: string | null,
    updateType: string,
  ): Promise<boolean> {
    try {
      await this.prisma.inboundTelegramUpdate.create({
        data: {
          telegramUpdateId: BigInt(updateId),
          telegramUserId: telegramUserId === null ? null : BigInt(telegramUserId),
          updateType,
        },
      });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  public async resolveActor(profile: TelegramUserProfile): Promise<TelegramActor | null> {
    const record = await this.prisma.telegramIdentity.findUnique({
      where: { telegramUserId: BigInt(profile.telegramUserId) },
      include: {
        user: {
          include: {
            roles: {
              where: { revokedAt: null },
              include: { role: true },
            },
          },
        },
      },
    });
    if (record === null || record.disabledAt !== null || record.user.status !== 'ACTIVE')
      return null;
    await this.prisma.telegramIdentity.update({
      where: { id: record.id },
      data: {
        lastSeenAt: new Date(),
        telegramUsername: profile.username ?? null,
        displayName: profile.displayName ?? null,
      },
    });
    return {
      identityId: record.id,
      internalUserId: record.userId,
      telegramUserId: record.telegramUserId.toString(),
      displayName: record.user.displayName,
      roles: record.user.roles.map((item) => item.role.code),
    };
  }

  public async recordDeniedAccess(profile: TelegramUserProfile): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        action: 'TELEGRAM_ACCESS_DENIED',
        metadata: toJson({ telegramUserId: profile.telegramUserId }),
      },
    });
  }

  public async consumeRateLimit(
    identityId: string,
    action: string,
    limit: number,
    windowSeconds: number,
  ): Promise<boolean> {
    const windowMs = windowSeconds * 1_000;
    const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
    const bucket = await this.prisma.telegramRateLimitBucket.upsert({
      where: {
        telegramIdentityId_action_windowStart: {
          telegramIdentityId: identityId,
          action,
          windowStart,
        },
      },
      create: { telegramIdentityId: identityId, action, windowStart, count: 1 },
      update: { count: { increment: 1 } },
    });
    return bucket.count <= limit;
  }

  public async createFlow(
    identityId: string,
    product: Parameters<TelegramWorkflowRepository['createFlow']>[1],
    expiresAt: Date,
  ): Promise<TelegramCreateFlow> {
    return toFlow(
      await this.prisma.telegramCreateFlow.create({
        data: { telegramIdentityId: identityId, productData: toJson(product), expiresAt },
      }),
    );
  }

  public async findFlowById(id: string): Promise<TelegramCreateFlow | null> {
    const record = await this.prisma.telegramCreateFlow.findUnique({ where: { id } });
    return record === null ? null : toFlow(record);
  }

  public async updateFlowSelection(
    id: string,
    field:
      | 'contentType'
      | 'language'
      | 'platform'
      | 'stylePreset'
      | 'format'
      | 'wizardMessageId'
      | 'step',
    value: string | number,
  ): Promise<TelegramCreateFlow> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM telegram_create_flows WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.telegramCreateFlow.findUnique({ where: { id } });
      if (current === null || current.expiresAt <= new Date())
        throw new Error('Telegram flow expired');

      if (field === 'contentType' || field === 'language' || field === 'platform') {
        if (current.status !== expectedFlowStatus(field))
          throw new Error('Telegram action is stale');
        const data = selectionUpdate(field, String(value));
        return toFlow(await tx.telegramCreateFlow.update({ where: { id }, data }));
      }

      const rawData = (current.productData as Record<string, unknown>) ?? {};
      const envelope = rawData && '_envelope' in rawData ? rawData._envelope : current.productData;
      const meta =
        (rawData && '_metadata' in rawData ? (rawData._metadata as Record<string, unknown>) : {}) ??
        {};
      meta[field] = value;

      const updated = await tx.telegramCreateFlow.update({
        where: { id },
        data: {
          productData: {
            _envelope: envelope,
            _metadata: meta,
          } as Prisma.InputJsonValue,
        },
      });
      return toFlow(updated);
    });
  }

  public async setFlowMetadata(
    id: string,
    metadata: Partial<TelegramWorkflowMetadata>,
  ): Promise<TelegramCreateFlow> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM telegram_create_flows WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.telegramCreateFlow.findUnique({ where: { id } });
      if (current === null || current.expiresAt <= new Date())
        throw new Error('Telegram flow expired');

      const rawData = (current.productData as Record<string, unknown>) ?? {};
      const envelope = rawData && '_envelope' in rawData ? rawData._envelope : current.productData;
      const meta =
        (rawData && '_metadata' in rawData ? (rawData._metadata as Record<string, unknown>) : {}) ??
        {};
      Object.assign(meta, metadata);

      const updated = await tx.telegramCreateFlow.update({
        where: { id },
        data: {
          productData: {
            _envelope: envelope,
            _metadata: meta,
          } as Prisma.InputJsonValue,
        },
      });
      return toFlow(updated);
    });
  }

  public async completeFlow(id: string): Promise<void> {
    await this.prisma.telegramCreateFlow.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  }

  public async cancelFlow(id: string): Promise<void> {
    await this.prisma.telegramCreateFlow.update({
      where: { id },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });
  }

  public async findActiveFlowByIdentity(identityId: string): Promise<TelegramCreateFlow | null> {
    const record = await this.prisma.telegramCreateFlow.findFirst({
      where: {
        telegramIdentityId: identityId,
        status: {
          notIn: ['COMPLETED', 'CANCELLED', 'EXPIRED'],
        },
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return record === null ? null : toFlow(record);
  }

  public async storeActionTokens(inputs: readonly StoreActionTokenInput[]): Promise<void> {
    await this.prisma.telegramActionToken.createMany({
      data: inputs.map((input) => ({
        tokenHash: input.tokenHash,
        telegramIdentityId: input.telegramIdentityId,
        action: input.action,
        resourceId: input.resourceId,
        singleUse: input.singleUse,
        expiresAt: input.expiresAt,
        metadata: input.metadata === undefined ? Prisma.DbNull : toJson(input.metadata),
      })),
    });
  }

  public async consumeActionToken(
    tokenHash: string,
    telegramUserId: string,
    now: Date,
  ): ReturnType<TelegramWorkflowRepository['consumeActionToken']> {
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.telegramActionToken.findUnique({
        where: { tokenHash },
        include: { telegramIdentity: true },
      });
      if (record === null) return { disposition: 'NOT_FOUND' };
      if (record.telegramIdentity.telegramUserId !== BigInt(telegramUserId)) {
        return { disposition: 'WRONG_USER' };
      }
      if (record.expiresAt <= now) return { disposition: 'EXPIRED' };
      if (record.singleUse && record.consumedAt !== null) return { disposition: 'CONSUMED' };
      if (record.singleUse) {
        const updated = await tx.telegramActionToken.updateMany({
          where: { id: record.id, consumedAt: null },
          data: { consumedAt: now },
        });
        if (updated.count !== 1) return { disposition: 'CONSUMED' };
      }
      return { disposition: 'VALID', token: toActionToken(record) };
    });
  }

  public async listRecentJobs(
    actor: TelegramActor,
    limit: number,
  ): Promise<readonly TelegramJobSummary[]> {
    return this.listJobs(actor, undefined, limit);
  }

  public async listHistory(
    actor: TelegramActor,
    sku: string,
    limit: number,
  ): Promise<readonly TelegramJobSummary[]> {
    return this.listJobs(actor, sku, limit);
  }

  public async findJobByFlowId(flowId: string): Promise<TelegramJobSummary | null> {
    const record = await this.prisma.contentJob.findUnique({
      where: { telegramCreateFlowId: flowId },
      include: jobSummaryInclude,
    });
    return record === null ? null : toJobSummary(record);
  }

  public async getSourceByJobId(
    actor: TelegramActor,
    jobId: string,
  ): Promise<NormalizedProductEnvelope | null> {
    const job = await this.prisma.contentJob.findFirst({
      where: { id: jobId, ...accessFilter(actor) },
      include: { productSnapshot: true },
    });
    return job === null ? null : snapshotToEnvelope(job.productSnapshot);
  }

  public async getValidationByVersionId(
    actor: TelegramActor,
    versionId: string,
  ): Promise<PersistedValidationResult | null> {
    const version = await this.prisma.contentVersion.findFirst({
      where: { id: versionId, contentJob: accessFilter(actor) },
      include: {
        validationResults: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { findings: { orderBy: { createdAt: 'asc' } } },
        },
      },
    });
    const validation = version?.validationResults[0];
    return validation === undefined ? null : toValidation(validation);
  }

  public async getDraftViewByVersionId(versionId: string): Promise<TelegramDraftView | null> {
    const version = await this.prisma.contentVersion.findUnique({
      where: { id: versionId },
      include: {
        contentJob: {
          include: {
            productSnapshot: true,
            requester: {
              include: {
                telegramIdentities: { where: { disabledAt: null }, take: 1 },
                roles: { where: { revokedAt: null }, include: { role: true } },
              },
            },
          },
        },
        validationResults: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { findings: { orderBy: { createdAt: 'asc' } } },
        },
      },
    });
    const identity = version?.contentJob.requester.telegramIdentities[0];
    const validation = version?.validationResults[0];
    if (version === null || identity === undefined || validation === undefined) return null;
    const output = aiContentOutputSchema.parse(version.structuredOutput);

    const allVersionsRecords = await this.prisma.contentVersion.findMany({
      where: { contentJobId: version.contentJobId },
      orderBy: { versionNumber: 'desc' },
      include: {
        validationResults: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const allVersions = allVersionsRecords.map((v) => {
      const parsed = aiContentOutputSchema.safeParse(v.structuredOutput);
      return {
        id: v.id,
        versionNumber: v.versionNumber,
        ...(v.validationResults[0] !== undefined
          ? { validationStatus: v.validationResults[0].status }
          : {}),
        createdAt: v.createdAt,
        headline: parsed.success ? parsed.data.headline : '',
      };
    });

    return {
      jobId: version.contentJobId,
      sku: version.contentJob.productSnapshot.sku,
      productName: version.contentJob.productSnapshot.productName,
      contentType: version.contentJob.contentType,
      language: version.contentJob.language,
      platform: version.contentJob.platform,
      jobStatus: version.contentJob.status,
      versionId: version.id,
      versionNumber: version.versionNumber,
      validationStatus: validation.status,
      createdAt: version.createdAt,
      requesterTelegramUserId: identity.telegramUserId.toString(),
      telegramIdentityId: identity.id,
      requesterRoles: version.contentJob.requester.roles.map((r) => r.role.code),
      output: {
        headline: output.headline,
        khmerCaption: output.khmer_caption,
        englishCaption: output.english_caption,
        cta: output.cta,
        hashtags: output.hashtags,
      },
      validation: toValidation(validation),
      allVersions,
    };
  }

  public async getFailureViewByJobId(jobId: string): Promise<TelegramFailureView | null> {
    const job = await this.prisma.contentJob.findUnique({
      where: { id: jobId },
      include: {
        productSnapshot: true,
        requester: { include: { telegramIdentities: { where: { disabledAt: null }, take: 1 } } },
      },
    });
    const identity = job?.requester.telegramIdentities[0];
    if (job === null || identity === undefined) return null;
    return {
      jobId,
      productName: job.productSnapshot.productName,
      requesterTelegramUserId: identity.telegramUserId.toString(),
      telegramIdentityId: identity.id,
    };
  }

  public async claimOutboxEvents(
    topics: readonly string[],
    limit: number,
    now: Date,
  ): Promise<readonly TelegramOutboxEvent[]> {
    if (topics.length === 0) return [];
    return this.prisma.$transaction(async (tx) => {
      const staleBefore = new Date(now.getTime() - OUTBOX_LEASE_MS);
      const rows = await tx.$queryRaw<readonly { id: string }[]>`
        SELECT id FROM outbox_events
        WHERE topic IN (${Prisma.join(topics)})
          AND processed_at IS NULL
          AND available_at <= ${now}
          AND (claimed_at IS NULL OR claimed_at < ${staleBefore})
        ORDER BY occurred_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED`;
      const ids = rows.map((row) => row.id);
      if (ids.length === 0) return [];
      await tx.outboxEvent.updateMany({
        where: { id: { in: ids } },
        data: { claimedAt: now, attemptCount: { increment: 1 } },
      });
      const events = await tx.outboxEvent.findMany({ where: { id: { in: ids } } });
      return events.map((event) => ({
        id: event.id,
        topic: event.topic,
        payload: event.payload as Readonly<Record<string, unknown>>,
        attemptCount: event.attemptCount,
      }));
    });
  }

  public async beginNotificationDelivery(
    outboxEventId: string,
    telegramIdentityId: string,
  ): Promise<'SEND' | 'ALREADY_SENT'> {
    const delivery = await this.prisma.telegramNotificationDelivery.upsert({
      where: { outboxEventId },
      create: { outboxEventId, telegramIdentityId, attemptCount: 1 },
      update: { attemptCount: { increment: 1 } },
    });
    return delivery.sentAt === null ? 'SEND' : 'ALREADY_SENT';
  }

  public async markNotificationSent(outboxEventId: string, now: Date): Promise<void> {
    await this.prisma.telegramNotificationDelivery.update({
      where: { outboxEventId },
      data: { status: 'SENT', sentAt: now, lastErrorCode: null },
    });
  }

  public async markNotificationFailed(
    outboxEventId: string,
    errorCode: string,
    retryAt: Date,
    terminal: boolean,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.telegramNotificationDelivery.updateMany({
        where: { outboxEventId },
        data: { status: 'FAILED', lastErrorCode: errorCode },
      }),
      this.prisma.outboxEvent.update({
        where: { id: outboxEventId },
        data: {
          claimedAt: null,
          lastErrorCode: errorCode,
          availableAt: retryAt,
          ...(terminal ? { processedAt: new Date() } : {}),
        },
      }),
    ]);
  }

  public async markOutboxProcessed(outboxEventId: string, now: Date): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id: outboxEventId },
      data: { processedAt: now, claimedAt: null, lastErrorCode: null },
    });
  }

  public async createPendingInteraction(input: {
    telegramIdentityId: string;
    contentJobId: string;
    contentVersionId: string;
    action: 'EDIT' | 'REJECT';
    expiresAt: Date;
  }): Promise<void> {
    await this.prisma.telegramPendingReviewInteraction.updateMany({
      where: {
        telegramIdentityId: input.telegramIdentityId,
        completedAt: null,
        cancelledAt: null,
      },
      data: {
        cancelledAt: new Date(),
      },
    });

    await this.prisma.telegramPendingReviewInteraction.create({
      data: {
        telegramIdentityId: input.telegramIdentityId,
        contentJobId: input.contentJobId,
        contentVersionId: input.contentVersionId,
        action: input.action,
        expiresAt: input.expiresAt,
      },
    });
  }

  public async findActivePendingInteraction(
    telegramIdentityId: string,
    now: Date,
  ): Promise<{
    id: string;
    contentJobId: string;
    contentVersionId: string;
    action: 'EDIT' | 'REJECT';
  } | null> {
    const record = await this.prisma.telegramPendingReviewInteraction.findFirst({
      where: {
        telegramIdentityId,
        completedAt: null,
        cancelledAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (record === null) return null;
    return {
      id: record.id,
      contentJobId: record.contentJobId,
      contentVersionId: record.contentVersionId,
      action: record.action,
    };
  }

  public async completePendingInteraction(id: string, now: Date): Promise<void> {
    await this.prisma.telegramPendingReviewInteraction.update({
      where: { id },
      data: { completedAt: now },
    });
  }

  public async cancelPendingInteraction(id: string, now: Date): Promise<void> {
    await this.prisma.telegramPendingReviewInteraction.update({
      where: { id },
      data: { cancelledAt: now },
    });
  }

  public async getPreviousVersions(
    actor: TelegramActor,
    jobId: string,
  ): Promise<
    readonly {
      id: string;
      versionNumber: number;
      validationStatus?: string;
      createdAt: Date;
      headline: string;
    }[]
  > {
    const job = await this.prisma.contentJob.findFirst({
      where: {
        id: jobId,
        ...accessFilter(actor),
      },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: {
            validationResults: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });
    if (job === null) return [];
    return job.versions.map((v) => {
      const parsed = aiContentOutputSchema.safeParse(v.structuredOutput);
      return {
        id: v.id,
        versionNumber: v.versionNumber,
        ...(v.validationResults[0] !== undefined
          ? { validationStatus: v.validationResults[0].status }
          : {}),
        createdAt: v.createdAt,
        headline: parsed.success ? parsed.data.headline : '',
      };
    });
  }

  public async appendAudit(
    input: Parameters<TelegramWorkflowRepository['appendAudit']>[0],
  ): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        action: input.action,
        ...(input.actor === undefined
          ? {}
          : {
              actorUserId: input.actor.internalUserId,
              telegramIdentityId: input.actor.identityId,
            }),
        ...(input.resourceType === undefined ? {} : { resourceType: input.resourceType }),
        ...(input.resourceId === undefined ? {} : { resourceId: input.resourceId }),
        metadata: input.metadata === undefined ? Prisma.DbNull : toJson(input.metadata),
      },
    });
  }

  private async listJobs(
    actor: TelegramActor,
    sku: string | undefined,
    limit: number,
  ): Promise<readonly TelegramJobSummary[]> {
    const records = await this.prisma.contentJob.findMany({
      where: {
        ...accessFilter(actor),
        ...(sku === undefined
          ? {}
          : { productSnapshot: { sku: { equals: sku.trim(), mode: 'insensitive' } } }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: jobSummaryInclude,
    });
    return records.map(toJobSummary);
  }
}

const jobSummaryInclude = {
  productSnapshot: true,
  versions: {
    orderBy: { versionNumber: 'desc' as const },
    take: 1,
    include: {
      validationResults: { orderBy: { createdAt: 'desc' as const }, take: 1 },
    },
  },
};

type JobSummaryRecord = Prisma.ContentJobGetPayload<{ include: typeof jobSummaryInclude }>;
type ValidationWithFindings = ValidationResult & { findings: ValidationFinding[] };
function toJobSummary(record: JobSummaryRecord): TelegramJobSummary {
  const version = record.versions[0];
  const validation = version?.validationResults[0];
  return {
    jobId: record.id,
    sku: record.productSnapshot.sku,
    productName: record.productSnapshot.productName,
    contentType: record.contentType,
    language: record.language,
    platform: record.platform,
    jobStatus: record.status,
    ...(version === undefined
      ? {}
      : { versionId: version.id, versionNumber: version.versionNumber }),
    ...(validation === undefined ? {} : { validationStatus: validation.status }),
    createdAt: record.createdAt,
  };
}

function toFlow(
  record: Prisma.TelegramCreateFlowGetPayload<Record<string, never>>,
): TelegramCreateFlow {
  const rawData = record.productData as Record<string, unknown>;
  const productData = rawData && '_envelope' in rawData ? rawData._envelope : record.productData;
  const metadata =
    rawData && '_metadata' in rawData ? (rawData._metadata as Record<string, unknown>) : undefined;

  return {
    id: record.id,
    telegramIdentityId: record.telegramIdentityId,
    product: normalizedProductEnvelopeSchema.parse(productData),
    status: record.status,
    ...(record.contentType === null ? {} : { contentType: record.contentType }),
    ...(record.language === null ? {} : { language: record.language }),
    ...(record.platform === null ? {} : { platform: record.platform }),
    ...(metadata?.stylePreset ? { stylePreset: metadata.stylePreset as string } : {}),
    ...(metadata?.format ? { format: metadata.format as string } : {}),
    ...(metadata?.wizardMessageId ? { wizardMessageId: metadata.wizardMessageId as number } : {}),
    ...(metadata?.step ? { step: metadata.step as number } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
    expiresAt: record.expiresAt,
    ...(record.completedAt === null ? {} : { completedAt: record.completedAt }),
  };
}

function toActionToken(record: {
  id: string;
  telegramIdentityId: string;
  action: string;
  resourceId: string;
  metadata: Prisma.JsonValue | null;
  singleUse: boolean;
  expiresAt: Date;
}): TelegramActionTokenRecord {
  return {
    id: record.id,
    telegramIdentityId: record.telegramIdentityId,
    action: record.action as TelegramActionTokenRecord['action'],
    resourceId: record.resourceId,
    singleUse: record.singleUse,
    expiresAt: record.expiresAt,
    ...(record.metadata === null
      ? {}
      : { metadata: record.metadata as Readonly<Record<string, unknown>> }),
  };
}

function selectionUpdate(
  field: 'contentType' | 'language' | 'platform',
  value: string,
): Prisma.TelegramCreateFlowUpdateInput {
  if (field === 'contentType') return { contentType: value as never, status: 'SELECTING_LANGUAGE' };
  if (field === 'language') return { language: value as never, status: 'SELECTING_PLATFORM' };
  return { platform: value as never };
}

function expectedFlowStatus(
  field: 'contentType' | 'language' | 'platform',
): 'SELECTING_CONTENT_TYPE' | 'SELECTING_LANGUAGE' | 'SELECTING_PLATFORM' {
  if (field === 'contentType') return 'SELECTING_CONTENT_TYPE';
  if (field === 'language') return 'SELECTING_LANGUAGE';
  return 'SELECTING_PLATFORM';
}

function normalizeWorkflowMessageType(raw?: string): TelegramWorkflowMessageType {
  if (raw === 'VISUAL_REVIEW_CARD') return 'VISUAL_REVIEW_CARD';
  if (raw === 'INTERACTION_PROMPT') return 'INTERACTION_PROMPT';
  if (raw === 'REVIEW_CARD') return 'REVIEW_CARD';
  if (raw === 'INPUT_PROMPT') return 'INPUT_PROMPT';
  return 'WIZARD_PROMPT';
}

function accessFilter(actor: TelegramActor): Prisma.ContentJobWhereInput {
  return hasAnyRolePermission(actor.roles, Permission.VIEW_ALL_CONTENT)
    ? {}
    : { requesterUserId: actor.internalUserId };
}

function snapshotToEnvelope(
  record: Prisma.ProductSnapshotGetPayload<Record<string, never>>,
): NormalizedProductEnvelope {
  return normalizedProductEnvelopeSchema.parse({
    schema_version: record.sourceSchemaVersion,
    source_system: record.sourceSystem,
    ...(record.sourceRecordId === null ? {} : { source_record_id: record.sourceRecordId }),
    ...(record.sourceVersion === null ? {} : { source_version: record.sourceVersion }),
    retrieved_at: record.retrievedAt.toISOString(),
    source_updated_at: record.sourceUpdatedAt.toISOString(),
    ...(record.sourceEtag === null ? {} : { etag: record.sourceEtag }),
    lifecycle_status: record.lifecycleStatus,
    product: {
      sku: record.sku,
      product_name: record.productName,
      brand: record.brand,
      category: record.category,
      price: record.price.toString(),
      currency: record.currency,
      ...(record.promoPrice === null ? {} : { promo_price: record.promoPrice.toString() }),
      ...(record.discount === null ? {} : { discount: record.discount }),
      ...(record.description === null ? {} : { description: record.description }),
      ...(record.images === null ? {} : { images: record.images }),
      stock_status: record.stockStatus,
      ...(record.productUrl === null ? {} : { product_url: record.productUrl }),
      ...(record.fragranceNotes === null ? {} : { fragrance_notes: record.fragranceNotes }),
      ...(record.concentration === null ? {} : { concentration: record.concentration }),
      ...(record.size === null ? {} : { size: record.size }),
      ...(record.countryOfOrigin === null ? {} : { country_of_origin: record.countryOfOrigin }),
      ...(record.similarityClaims === null ? {} : { similarity_claims: record.similarityClaims }),
    },
  });
}

function toValidation(record: ValidationWithFindings): PersistedValidationResult {
  return {
    id: record.id,
    contentVersionId: record.contentVersionId,
    validatorVersion: record.validatorVersion,
    status: ValidationStatus[record.status],
    findingCount: record.findingCount,
    blockingCount: record.blockingCount,
    warningCount: record.warningCount,
    infoCount: record.infoCount,
    createdAt: record.createdAt,
    findings: record.findings.map(toFinding),
  };
}

function toFinding(record: ValidationFinding): PersistedValidationFinding {
  return {
    id: record.id,
    validationResultId: record.validationResultId,
    field: record.field,
    severity: FindingSeverity[record.severity],
    code: FindingCode[record.code as keyof typeof FindingCode],
    message: record.message,
    ...(record.expectedValue === null ? {} : { expectedValue: record.expectedValue }),
    ...(record.actualValue === null ? {} : { actualValue: record.actualValue }),
    ...(record.sourcePath === null ? {} : { sourcePath: record.sourcePath }),
    ...(record.contentPath === null ? {} : { contentPath: record.contentPath }),
    ...(record.metadata === null
      ? {}
      : { metadata: record.metadata as Readonly<Record<string, unknown>> }),
    createdAt: record.createdAt,
  };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
