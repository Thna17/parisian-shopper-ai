import { Injectable } from '@nestjs/common';
import {
  type CompleteAttemptInput,
  type ProviderAttemptDraft,
  type ProviderAttemptRecord,
  type ReservationLifecycleState,
  type UsageLedgerEntryDraft,
  type UsageLedgerEntryRecord,
  type UsageLedgerRepository,
  type UsageReservationDraft,
  type UsageReservationRecord,
} from '@parisian-shopper/application';
import {
  AiModality,
  Prisma,
  RetryRelationship as PrismaRetryRel,
  type ProviderAttempt,
  type UsageLedgerEntry,
  type UsageReservation,
} from '@prisma/client';
import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaUsageLedgerRepository implements UsageLedgerRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async createReservation(draft: UsageReservationDraft): Promise<UsageReservationRecord> {
    const created = await this.prisma.usageReservation.create({
      data: {
        idempotencyKey: draft.idempotencyKey,
        budgetPolicyVersionId: draft.budgetPolicyVersionId,
        userId: draft.userId,
        tenantId: draft.tenantId,
        creativeJobId: draft.creativeJobId ?? null,
        contentJobId: draft.contentJobId ?? null,
        campaignId: draft.campaignId ?? null,
        providerId: draft.providerId,
        modelId: draft.modelId,
        estimatedCost: new Prisma.Decimal(draft.estimatedCost),
        currency: draft.currency,
        capacityUnits: draft.capacityUnits ?? null,
        state: 'RESERVED',
        expiresAt: draft.expiresAt,
      },
    });

    return this.mapReservation(created);
  }

  public async findReservationById(id: string): Promise<UsageReservationRecord | null> {
    const found = await this.prisma.usageReservation.findUnique({
      where: { id },
    });
    if (!found) return null;
    return this.mapReservation(found);
  }

  public async findReservationByIdempotencyKey(
    key: string,
  ): Promise<UsageReservationRecord | null> {
    const found = await this.prisma.usageReservation.findUnique({
      where: { idempotencyKey: key },
    });
    if (!found) return null;
    return this.mapReservation(found);
  }

  public async updateReservationState(
    id: string,
    state: ReservationLifecycleState,
    expectedVersion: number,
    closedAt?: Date | null,
    dispatchedAt?: Date | null,
  ): Promise<UsageReservationRecord> {
    const updateData: Prisma.UsageReservationUpdateInput = {
      state: state,
      version: { increment: 1 },
    };

    if (closedAt !== undefined) {
      updateData.closedAt = closedAt;
    }
    if (dispatchedAt !== undefined) {
      updateData.dispatchedAt = dispatchedAt;
    }

    const updated = await this.prisma.usageReservation.update({
      where: { id, version: expectedVersion },
      data: updateData,
    });

    return this.mapReservation(updated);
  }

  public async listExpiredReservations(cutoff: Date): Promise<readonly UsageReservationRecord[]> {
    const records = await this.prisma.usageReservation.findMany({
      where: {
        state: 'RESERVED',
        expiresAt: { lte: cutoff },
      },
      take: 100,
    });
    return records.map((r) => this.mapReservation(r));
  }

  public async createAttempt(draft: ProviderAttemptDraft): Promise<ProviderAttemptRecord> {
    const created = await this.prisma.providerAttempt.create({
      data: {
        reservationId: draft.reservationId,
        attemptNumber: draft.attemptNumber,
        providerId: draft.providerId,
        modelId: draft.modelId,
        modality: draft.modality as AiModality,
        safePromptDigest: draft.safePromptDigest,
        digestAlgorithm: draft.digestAlgorithm,
        digestKeyVersion: draft.digestKeyVersion,
        retryRelationship: (draft.retryRelationship ?? 'INITIAL_ATTEMPT') as PrismaRetryRel,
        providerRequestId: draft.providerRequestId ?? null,
        operationalOutcome: 'IN_PROGRESS',
      },
    });

    return this.mapAttempt(created);
  }

  public async findAttemptById(id: string): Promise<ProviderAttemptRecord | null> {
    const found = await this.prisma.providerAttempt.findUnique({
      where: { id },
    });
    if (!found) return null;
    return this.mapAttempt(found);
  }

  public async findAttemptByReservationAndNumber(
    reservationId: string,
    attemptNumber: number,
  ): Promise<ProviderAttemptRecord | null> {
    const found = await this.prisma.providerAttempt.findUnique({
      where: {
        reservationId_attemptNumber: { reservationId, attemptNumber },
      },
    });
    if (!found) return null;
    return this.mapAttempt(found);
  }

  public async updateAttempt(input: CompleteAttemptInput): Promise<ProviderAttemptRecord> {
    const data: Prisma.ProviderAttemptUpdateInput = {
      operationalOutcome: input.operationalOutcome,
      completedAt: new Date(),
    };

    if (input.inputTokens !== undefined) data.inputTokens = input.inputTokens;
    if (input.outputTokens !== undefined) data.outputTokens = input.outputTokens;
    if (input.imageCount !== undefined) data.imageCount = input.imageCount;
    if (input.resolutionTier !== undefined) data.resolutionTier = input.resolutionTier;
    if (input.videoDurationSeconds !== undefined)
      data.videoDurationSeconds = input.videoDurationSeconds;
    if (input.durationMs !== undefined) data.durationMs = input.durationMs;
    if (input.outputDigest !== undefined) data.outputDigest = input.outputDigest;
    if (input.errorCode !== undefined) data.errorCode = input.errorCode;
    if (input.errorMessage !== undefined) data.errorMessage = input.errorMessage;
    if (input.cancellationReason !== undefined) data.cancellationReason = input.cancellationReason;
    if (input.providerRequestId !== undefined) data.providerRequestId = input.providerRequestId;

    const updated = await this.prisma.providerAttempt.update({
      where: { id: input.attemptId },
      data,
    });

    return this.mapAttempt(updated);
  }

  public async listAttemptsByReservationId(
    reservationId: string,
  ): Promise<readonly ProviderAttemptRecord[]> {
    const records = await this.prisma.providerAttempt.findMany({
      where: { reservationId },
      orderBy: { attemptNumber: 'asc' },
    });
    return records.map((a) => this.mapAttempt(a));
  }

  public async appendLedgerEntry(draft: UsageLedgerEntryDraft): Promise<UsageLedgerEntryRecord> {
    const created = await this.prisma.usageLedgerEntry.create({
      data: {
        entryType: draft.entryType,
        reservationId: draft.reservationId,
        attemptId: draft.attemptId ?? null,
        settlementKey: draft.settlementKey,
        amount: new Prisma.Decimal(draft.amount),
        currency: draft.currency,
        costKnowledge: draft.costKnowledge,
        pricingVersionId: draft.pricingVersionId ?? null,
        exchangeRate:
          draft.exchangeRate !== undefined && draft.exchangeRate !== null
            ? new Prisma.Decimal(draft.exchangeRate)
            : null,
        exchangeRateSource: draft.exchangeRateSource ?? null,
        exchangeRateSourceRecordId: draft.exchangeRateSourceRecordId ?? null,
        exchangeRateEffectiveAt: draft.exchangeRateEffectiveAt ?? null,
        baseCurrency: draft.baseCurrency ?? null,
        quoteCurrency: draft.quoteCurrency ?? null,
        reconciliationRef: draft.reconciliationRef ?? null,
        correctionOfEntryId: draft.correctionOfEntryId ?? null,
        actorUserId: draft.actorUserId ?? null,
        systemComponent: draft.systemComponent ?? 'usage-ledger-worker',
      },
    });

    return this.mapLedgerEntry(created);
  }

  public async findLedgerEntryBySettlementKey(key: string): Promise<UsageLedgerEntryRecord | null> {
    const found = await this.prisma.usageLedgerEntry.findUnique({
      where: { settlementKey: key },
    });
    if (!found) return null;
    return this.mapLedgerEntry(found);
  }

  public async listLedgerEntriesByReservationId(
    reservationId: string,
  ): Promise<readonly UsageLedgerEntryRecord[]> {
    const records = await this.prisma.usageLedgerEntry.findMany({
      where: { reservationId },
      orderBy: { recordedAt: 'asc' },
    });
    return records.map((e) => this.mapLedgerEntry(e));
  }

  public async listLedgerEntries(
    limit = 50,
    offset = 0,
  ): Promise<{
    readonly items: readonly UsageLedgerEntryRecord[];
    readonly total: number;
  }> {
    const [records, total] = await Promise.all([
      this.prisma.usageLedgerEntry.findMany({
        take: limit,
        skip: offset,
        orderBy: { recordedAt: 'desc' },
      }),
      this.prisma.usageLedgerEntry.count(),
    ]);

    return {
      items: records.map((r) => this.mapLedgerEntry(r)),
      total,
    };
  }

  public async getAggregateSpend(
    _scopeType: string,
    _scopeId: string,
    fromDate: Date,
    toDate: Date,
    _currency = 'USD',
  ): Promise<number> {
    const agg = await this.prisma.usageLedgerEntry.aggregate({
      where: {
        entryType: { in: ['USAGE_COMMITTED', 'RECONCILIATION_CONFIRMED'] },
        recordedAt: { gte: fromDate, lte: toDate },
      },
      _sum: { amount: true },
    });

    return Number(agg._sum.amount ?? 0);
  }

  public async getActiveReservedExposure(
    _scopeType: string,
    _scopeId: string,
    now: Date,
    _currency = 'USD',
  ): Promise<number> {
    const agg = await this.prisma.usageReservation.aggregate({
      where: {
        state: { in: ['RESERVED', 'DISPATCHED', 'HELD_FOR_RECONCILIATION'] },
        expiresAt: { gt: now },
      },
      _sum: { estimatedCost: true },
    });

    return Number(agg._sum.estimatedCost ?? 0);
  }

  public async listHeldReservations(
    limit = 50,
    offset = 0,
  ): Promise<readonly UsageReservationRecord[]> {
    const records = await this.prisma.usageReservation.findMany({
      where: { state: 'HELD_FOR_RECONCILIATION' },
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.mapReservation(r));
  }

  private mapReservation(r: UsageReservation): UsageReservationRecord {
    return {
      id: r.id,
      idempotencyKey: r.idempotencyKey,
      budgetPolicyVersionId: r.budgetPolicyVersionId,
      userId: r.userId,
      tenantId: r.tenantId,
      creativeJobId: r.creativeJobId,
      contentJobId: r.contentJobId,
      campaignId: r.campaignId,
      providerId: r.providerId,
      modelId: r.modelId,
      estimatedCost: Number(r.estimatedCost),
      currency: r.currency,
      capacityUnits: r.capacityUnits,
      state: r.state,
      createdAt: r.createdAt,
      dispatchedAt: r.dispatchedAt,
      expiresAt: r.expiresAt,
      closedAt: r.closedAt,
      version: r.version,
    };
  }

  private mapAttempt(a: ProviderAttempt): ProviderAttemptRecord {
    return {
      id: a.id,
      reservationId: a.reservationId,
      attemptNumber: a.attemptNumber,
      providerId: a.providerId,
      modelId: a.modelId,
      modality: a.modality,
      providerRequestId: a.providerRequestId,
      dispatchedAt: a.dispatchedAt,
      completedAt: a.completedAt,
      operationalOutcome: a.operationalOutcome,
      retryRelationship: a.retryRelationship,
      inputTokens: a.inputTokens,
      outputTokens: a.outputTokens,
      imageCount: a.imageCount,
      resolutionTier: a.resolutionTier,
      videoDurationSeconds: a.videoDurationSeconds,
      cancellationReason: a.cancellationReason,
      durationMs: a.durationMs,
      safePromptDigest: a.safePromptDigest,
      digestAlgorithm: a.digestAlgorithm,
      digestKeyVersion: a.digestKeyVersion,
      outputDigest: a.outputDigest,
      errorCode: a.errorCode,
      errorMessage: a.errorMessage,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }

  private mapLedgerEntry(e: UsageLedgerEntry): UsageLedgerEntryRecord {
    return {
      id: e.id,
      entryType: e.entryType,
      reservationId: e.reservationId,
      attemptId: e.attemptId,
      settlementKey: e.settlementKey,
      amount: Number(e.amount),
      currency: e.currency,
      costKnowledge: e.costKnowledge,
      pricingVersionId: e.pricingVersionId,
      exchangeRate: e.exchangeRate ? Number(e.exchangeRate) : null,
      exchangeRateSource: e.exchangeRateSource,
      exchangeRateSourceRecordId: e.exchangeRateSourceRecordId,
      exchangeRateEffectiveAt: e.exchangeRateEffectiveAt,
      baseCurrency: e.baseCurrency,
      quoteCurrency: e.quoteCurrency,
      recordedAt: e.recordedAt,
      reconciliationRef: e.reconciliationRef,
      correctionOfEntryId: e.correctionOfEntryId,
      actorUserId: e.actorUserId,
      systemComponent: e.systemComponent,
      createdAt: e.createdAt,
    };
  }
}
