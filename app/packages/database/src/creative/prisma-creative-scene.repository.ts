import { Injectable } from '@nestjs/common';
import {
  type CreateInitialSceneAtomicInput,
  type CreateRevisionAtomicInput,
  type CreativeSceneRecord,
  type CreativeSceneRepository,
  type CreativeSceneVersionRecord,
  type LayerDependencyRecord,
  type ListCreativeScenesQuery,
  type CreativeSceneSummary,
  type PaginatedCreativeScenes,
  type PosterAspectRatio,
  type RecordDependencyInvalidationInput,
  type SafeMargins,
  type SceneInvalidationEventRecord,
  type SceneLayerRecord,
  type SceneLayerType,
  type SceneOperationCode,
  type SceneStatus,
  type SceneTemplateId,
  type SceneVersionStateRecord,
  CreativeSceneNotFoundError,
  InvalidSceneLayerError,
  SceneConcurrencyConflictError,
  computeLayerHash,
} from '@parisian-shopper/application';
import {
  type CreativeScene as PrismaCreativeScene,
  type CreativeSceneVersion as PrismaCreativeSceneVersion,
  type SceneLayer as PrismaSceneLayer,
  type LayerDependency as PrismaLayerDependency,
  type SceneVersionState as PrismaSceneVersionState,
  type SceneInvalidationEvent as PrismaSceneInvalidationEvent,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma.service.js';

function toSceneRecord(row: PrismaCreativeScene): CreativeSceneRecord {
  return {
    id: row.id,
    creativeJobId: row.creativeJobId,
    campaignId: row.campaignId,
    title: row.title,
    currentVersionNumber: row.currentVersionNumber,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toLayerRecord(row: PrismaSceneLayer): SceneLayerRecord {
  return {
    id: row.id,
    sceneVersionId: row.sceneVersionId,
    layerKey: row.layerKey,
    layerGroup: row.layerGroup as import('@parisian-shopper/application').LayerGroup,
    layerType: row.layerType as SceneLayerType,
    name: row.name,
    zIndex: row.zIndex,
    visible: row.visible,
    opacity: row.opacity,
    blendMode: row.blendMode as import('@parisian-shopper/application').BlendMode,
    bounds: row.bounds as unknown as import('@parisian-shopper/application').BoundingBox,
    payload: row.payload as unknown as import('@parisian-shopper/application').SceneLayerPayload,
    payloadSchemaVersion: row.payloadSchemaVersion,
    layerHash: row.layerHash,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
  };
}

function toDependencyRecord(row: PrismaLayerDependency): LayerDependencyRecord {
  return {
    id: row.id,
    sceneVersionId: row.sceneVersionId,
    sceneLayerId: row.sceneLayerId,
    dependencyType: row.dependencyType,
    dependencyIdentifier: row.dependencyIdentifier,
    evidenceIdentifier: row.evidenceIdentifier,
    immutableDigest: row.immutableDigest,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
  };
}

function toStateRecord(row: PrismaSceneVersionState): SceneVersionStateRecord {
  return {
    id: row.id,
    sceneVersionId: row.sceneVersionId,
    status: row.status as SceneStatus,
    isExportEligible: row.isExportEligible,
    invalidationReason: row.invalidationReason,
    invalidatedAt: row.invalidatedAt,
    updatedAt: row.updatedAt,
  };
}

function toInvalidationEventRecord(
  row: PrismaSceneInvalidationEvent,
): SceneInvalidationEventRecord {
  return {
    id: row.id,
    sceneVersionId: row.sceneVersionId,
    reason: row.reason,
    divergedDependencyType: row.divergedDependencyType,
    expectedDigest: row.expectedDigest,
    actualDigest: row.actualDigest,
    recordedByUserId: row.recordedByUserId,
    metadata: (row.metadata as Readonly<Record<string, unknown>> | null) ?? null,
    recordedAt: row.recordedAt,
  };
}

type VersionWithRelations = PrismaCreativeSceneVersion & {
  layers?: PrismaSceneLayer[];
  dependencies?: PrismaLayerDependency[];
  state?: PrismaSceneVersionState | null;
};

function toVersionRecord(row: VersionWithRelations): CreativeSceneVersionRecord {
  const sortedLayers = (row.layers ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(toLayerRecord);

  const sortedDeps = (row.dependencies ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(toDependencyRecord);

  return {
    id: row.id,
    sceneId: row.sceneId,
    versionNumber: row.versionNumber,
    parentVersionId: row.parentVersionId,
    aspectRatio: row.aspectRatio as PosterAspectRatio,
    width: row.width,
    height: row.height,
    templateId: row.templateId as SceneTemplateId,
    templateVersion: row.templateVersion,
    stylePresetId: row.stylePresetId,
    language: row.language as 'EN' | 'KM' | 'BILINGUAL',
    safeMargins: row.safeMargins as unknown as SafeMargins,
    brandProfileVersionId: row.brandProfileVersionId,
    sourceContentVersionId: row.sourceContentVersionId,
    productSnapshotId: row.productSnapshotId,
    sceneHash: row.sceneHash,
    dependencyHash: row.dependencyHash,
    changeReason: row.changeReason,
    operationCode: row.operationCode as SceneOperationCode | null,
    requestedByUserId: row.requestedByUserId,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt,
    layers: sortedLayers,
    dependencies: sortedDeps,
    state: row.state ? toStateRecord(row.state) : undefined,
  };
}

const VERSION_INCLUDE_RELATIONS = {
  layers: { orderBy: { sortOrder: 'asc' as const } },
  dependencies: { orderBy: { sortOrder: 'asc' as const } },
  state: true,
};

@Injectable()
export class PrismaCreativeSceneRepository implements CreativeSceneRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async createInitialScene(input: CreateInitialSceneAtomicInput): Promise<{
    readonly scene: CreativeSceneRecord;
    readonly version: CreativeSceneVersionRecord;
  }> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Create CreativeScene container
      const createdScene = await tx.creativeScene.create({
        data: {
          creativeJobId: input.creativeJobId,
          campaignId: input.campaignId ?? null,
          title: input.title,
          currentVersionNumber: 1,
        },
      });

      // 2. Create CreativeSceneVersion 1
      const createdVersion = await tx.creativeSceneVersion.create({
        data: {
          sceneId: createdScene.id,
          versionNumber: 1,
          parentVersionId: null,
          aspectRatio: input.aspectRatio,
          width: input.width,
          height: input.height,
          templateId: input.templateId,
          templateVersion: input.templateVersion,
          stylePresetId: input.stylePresetId ?? null,
          language: input.language,
          safeMargins: input.safeMargins as unknown as Prisma.InputJsonValue,
          brandProfileVersionId: input.brandProfileVersionId,
          sourceContentVersionId: input.sourceContentVersionId,
          productSnapshotId: input.productSnapshotId,
          sceneHash: input.sceneHash,
          dependencyHash: input.dependencyHash,
          changeReason: 'Initial scene composition',
          operationCode: 'INITIAL_DRAFT',
          requestedByUserId: input.requestedByUserId ?? null,
          metadata: (input.metadata as unknown as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        },
      });

      // 3. Create SceneLayer rows
      const layerIdMap = new Map<string, string>();
      for (const layer of input.layers) {
        const computedHash = computeLayerHash(layer);
        const createdLayer = await tx.sceneLayer.create({
          data: {
            ...(layer.id ? { id: layer.id } : {}),
            sceneVersionId: createdVersion.id,
            layerKey: layer.layerKey,
            layerGroup: layer.layerGroup,
            layerType: layer.layerType,
            name: layer.name,
            zIndex: layer.zIndex,
            visible: layer.visible,
            opacity: layer.opacity,
            blendMode: layer.blendMode,
            bounds: layer.bounds as unknown as Prisma.InputJsonValue,
            payload: layer.payload as unknown as Prisma.InputJsonValue,
            payloadSchemaVersion: layer.payloadSchemaVersion,
            layerHash: computedHash,
            sortOrder: layer.sortOrder,
          },
        });
        layerIdMap.set(layer.layerKey, createdLayer.id);
      }

      // 4. Create LayerDependency rows
      for (const dep of input.dependencies) {
        let resolvedLayerId = dep.sceneLayerId ?? null;
        if (dep.sceneLayerKey) {
          const mappedId = layerIdMap.get(dep.sceneLayerKey);
          if (!mappedId) {
            throw new InvalidSceneLayerError(
              dep.sceneLayerKey,
              `Layer dependency references unknown sceneLayerKey "${dep.sceneLayerKey}"`,
            );
          }
          resolvedLayerId = mappedId;
        }

        await tx.layerDependency.create({
          data: {
            ...(dep.id ? { id: dep.id } : {}),
            sceneVersionId: createdVersion.id,
            sceneLayerId: resolvedLayerId,
            dependencyType: dep.dependencyType,
            dependencyIdentifier: dep.dependencyIdentifier,
            evidenceIdentifier: dep.evidenceIdentifier ?? null,
            immutableDigest: dep.immutableDigest,
            sortOrder: dep.sortOrder,
          },
        });
      }

      // 5. Create SceneVersionState row
      await tx.sceneVersionState.create({
        data: {
          sceneVersionId: createdVersion.id,
          status: 'DRAFT',
          isExportEligible: false,
        },
      });

      // 6. Create OutboxEvent row (Mandatory for atomic production persistence)
      await tx.outboxEvent.create({
        data: {
          topic: input.outboxEvent.topic,
          schemaVersion: input.outboxEvent.schemaVersion,
          idempotencyKey: input.outboxEvent.idempotencyKey,
          aggregateType: input.outboxEvent.aggregateType,
          aggregateId: input.outboxEvent.aggregateId,
          payload: {
            ...input.outboxEvent.payload,
            sceneId: createdScene.id,
            sceneVersionId: createdVersion.id,
          },
          occurredAt: input.outboxEvent.occurredAt,
          availableAt: input.outboxEvent.availableAt,
        },
      });

      // Read back with all relations populated
      const fullVersion = await tx.creativeSceneVersion.findUniqueOrThrow({
        where: { id: createdVersion.id },
        include: VERSION_INCLUDE_RELATIONS,
      });

      return {
        scene: toSceneRecord(createdScene),
        version: toVersionRecord(fullVersion),
      };
    });
  }

  public async createRevision(
    input: CreateRevisionAtomicInput,
  ): Promise<CreativeSceneVersionRecord> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Establish row lock on creative_scenes to serialize revisions
        const sceneRows = await tx.$queryRaw<Array<{ id: string; current_version_number: number }>>`
          SELECT id, current_version_number FROM creative_scenes WHERE id = ${input.sceneId}::uuid FOR UPDATE
        `;

        if (!sceneRows || sceneRows.length === 0) {
          throw new CreativeSceneNotFoundError(input.sceneId);
        }

        const sceneRow = sceneRows[0]!;
        if (sceneRow.current_version_number !== input.expectedVersionNumber) {
          throw new SceneConcurrencyConflictError(
            input.sceneId,
            sceneRow.current_version_number + 1,
            `Stale version conflict: current version is ${sceneRow.current_version_number}, but revision expected ${input.expectedVersionNumber}`,
          );
        }

        if (!input.outboxEvents || input.outboxEvents.length === 0) {
          throw new InvalidSceneLayerError(
            input.sceneId,
            'Revision requires at least one outbox event draft',
          );
        }

        // 2. Read parent version
        const parentVersion = await tx.creativeSceneVersion.findUnique({
          where: {
            sceneId_versionNumber: {
              sceneId: input.sceneId,
              versionNumber: input.expectedVersionNumber,
            },
          },
        });

        if (!parentVersion) {
          throw new CreativeSceneNotFoundError(input.sceneId);
        }

        const nextVersionNumber = sceneRow.current_version_number + 1;

        // 3. Create new immutable version N+1
        const createdVersion = await tx.creativeSceneVersion.create({
          data: {
            sceneId: input.sceneId,
            versionNumber: nextVersionNumber,
            parentVersionId: parentVersion.id,
            aspectRatio: parentVersion.aspectRatio,
            width: parentVersion.width,
            height: parentVersion.height,
            templateId: input.templateId,
            templateVersion: input.templateVersion,
            stylePresetId: input.stylePresetId ?? null,
            language: input.language,
            safeMargins: input.safeMargins as unknown as Prisma.InputJsonValue,
            brandProfileVersionId: input.brandProfileVersionId,
            sourceContentVersionId: input.sourceContentVersionId,
            productSnapshotId: input.productSnapshotId,
            sceneHash: input.sceneHash,
            dependencyHash: input.dependencyHash,
            changeReason: input.changeReason,
            operationCode: input.operationCode,
            requestedByUserId: input.requestedByUserId ?? null,
            metadata: (input.metadata as unknown as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          },
        });

        // 4. Create SceneLayer rows
        const layerIdMap = new Map<string, string>();
        for (const layer of input.layers) {
          const computedHash = computeLayerHash(layer);
          const createdLayer = await tx.sceneLayer.create({
            data: {
              ...(layer.id ? { id: layer.id } : {}),
              sceneVersionId: createdVersion.id,
              layerKey: layer.layerKey,
              layerGroup: layer.layerGroup,
              layerType: layer.layerType,
              name: layer.name,
              zIndex: layer.zIndex,
              visible: layer.visible,
              opacity: layer.opacity,
              blendMode: layer.blendMode,
              bounds: layer.bounds as unknown as Prisma.InputJsonValue,
              payload: layer.payload as unknown as Prisma.InputJsonValue,
              payloadSchemaVersion: layer.payloadSchemaVersion,
              layerHash: computedHash,
              sortOrder: layer.sortOrder,
            },
          });
          layerIdMap.set(layer.layerKey, createdLayer.id);
        }

        // 5. Create LayerDependency rows
        for (const dep of input.dependencies) {
          let resolvedLayerId = dep.sceneLayerId ?? null;
          if (dep.sceneLayerKey) {
            const mappedId = layerIdMap.get(dep.sceneLayerKey);
            if (!mappedId) {
              throw new InvalidSceneLayerError(
                dep.sceneLayerKey,
                `Layer dependency references unknown sceneLayerKey "${dep.sceneLayerKey}"`,
              );
            }
            resolvedLayerId = mappedId;
          }

          await tx.layerDependency.create({
            data: {
              ...(dep.id ? { id: dep.id } : {}),
              sceneVersionId: createdVersion.id,
              sceneLayerId: resolvedLayerId,
              dependencyType: dep.dependencyType,
              dependencyIdentifier: dep.dependencyIdentifier,
              evidenceIdentifier: dep.evidenceIdentifier ?? null,
              immutableDigest: dep.immutableDigest,
              sortOrder: dep.sortOrder,
            },
          });
        }

        // 6. Create SceneVersionState row
        await tx.sceneVersionState.create({
          data: {
            sceneVersionId: createdVersion.id,
            status: 'DRAFT',
            isExportEligible: false,
          },
        });

        // 7. Update creative_scenes current_version_number pointer
        await tx.creativeScene.update({
          where: { id: input.sceneId },
          data: { currentVersionNumber: nextVersionNumber },
        });

        // 8. Create OutboxEvent rows atomically
        for (const outbox of input.outboxEvents) {
          await tx.outboxEvent.create({
            data: {
              topic: outbox.topic,
              schemaVersion: outbox.schemaVersion,
              idempotencyKey: outbox.idempotencyKey,
              aggregateType: outbox.aggregateType,
              aggregateId: outbox.aggregateId,
              payload: {
                ...outbox.payload,
                sceneId: input.sceneId,
                sceneVersionId: createdVersion.id,
              },
              occurredAt: outbox.occurredAt,
              availableAt: outbox.availableAt,
            },
          });
        }

        // Read back with relations
        const fullVersion = await tx.creativeSceneVersion.findUniqueOrThrow({
          where: { id: createdVersion.id },
          include: VERSION_INCLUDE_RELATIONS,
        });

        return toVersionRecord(fullVersion);
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new SceneConcurrencyConflictError(
          input.sceneId,
          input.expectedVersionNumber + 1,
          `Concurrent revision conflict: version ${input.expectedVersionNumber + 1} already created`,
        );
      }
      throw error;
    }
  }

  public async recordDependencyInvalidation(
    input: RecordDependencyInvalidationInput,
  ): Promise<SceneInvalidationEventRecord> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Create append-only SceneInvalidationEvent
      const createdEvent = await tx.sceneInvalidationEvent.create({
        data: {
          sceneVersionId: input.sceneVersionId,
          reason: input.reason,
          divergedDependencyType: input.divergedDependencyType,
          expectedDigest: input.expectedDigest,
          actualDigest: input.actualDigest,
          recordedByUserId: input.recordedByUserId ?? null,
          metadata: (input.metadata as unknown as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        },
      });

      // 2. Update mutable state projection
      await tx.sceneVersionState.update({
        where: { sceneVersionId: input.sceneVersionId },
        data: {
          status: 'STALE_FACTS',
          isExportEligible: false,
          invalidationReason: input.reason,
          invalidatedAt: new Date(),
        },
      });

      // 3. Insert OutboxEvent if provided
      if (input.outboxEvent) {
        await tx.outboxEvent.create({
          data: {
            topic: input.outboxEvent.topic,
            schemaVersion: input.outboxEvent.schemaVersion,
            idempotencyKey: input.outboxEvent.idempotencyKey,
            aggregateType: input.outboxEvent.aggregateType,
            aggregateId: input.outboxEvent.aggregateId,
            payload: input.outboxEvent.payload as unknown as Prisma.InputJsonValue,
            occurredAt: input.outboxEvent.occurredAt,
            availableAt: input.outboxEvent.availableAt,
          },
        });
      }

      return toInvalidationEventRecord(createdEvent);
    });
  }

  public async findById(sceneId: string): Promise<CreativeSceneRecord | null> {
    const row = await this.prisma.creativeScene.findUnique({
      where: { id: sceneId },
    });
    return row ? toSceneRecord(row) : null;
  }

  public async findByJobId(creativeJobId: string): Promise<CreativeSceneRecord | null> {
    const row = await this.prisma.creativeScene.findFirst({
      where: { creativeJobId },
      orderBy: { createdAt: 'desc' },
    });
    return row ? toSceneRecord(row) : null;
  }

  public async findVersionById(versionId: string): Promise<CreativeSceneVersionRecord | null> {
    const row = await this.prisma.creativeSceneVersion.findUnique({
      where: { id: versionId },
      include: VERSION_INCLUDE_RELATIONS,
    });
    return row ? toVersionRecord(row) : null;
  }

  public async findVersionByNumber(
    sceneId: string,
    versionNumber: number,
  ): Promise<CreativeSceneVersionRecord | null> {
    const row = await this.prisma.creativeSceneVersion.findUnique({
      where: {
        sceneId_versionNumber: {
          sceneId,
          versionNumber,
        },
      },
      include: VERSION_INCLUDE_RELATIONS,
    });
    return row ? toVersionRecord(row) : null;
  }

  public async findLatestVersionByJobId(
    creativeJobId: string,
  ): Promise<CreativeSceneVersionRecord | null> {
    const scene = await this.findByJobId(creativeJobId);
    if (!scene) {
      return null;
    }
    return this.findLatestVersionBySceneId(scene.id);
  }

  public async findLatestVersionBySceneId(
    sceneId: string,
  ): Promise<CreativeSceneVersionRecord | null> {
    const row = await this.prisma.creativeSceneVersion.findFirst({
      where: { sceneId },
      orderBy: { versionNumber: 'desc' },
      include: VERSION_INCLUDE_RELATIONS,
    });
    return row ? toVersionRecord(row) : null;
  }

  public async listVersions(sceneId: string): Promise<readonly CreativeSceneVersionRecord[]> {
    const rows = await this.prisma.creativeSceneVersion.findMany({
      where: { sceneId },
      orderBy: { versionNumber: 'asc' },
      include: VERSION_INCLUDE_RELATIONS,
    });
    return rows.map(toVersionRecord);
  }

  public async findScenes(query: ListCreativeScenesQuery): Promise<PaginatedCreativeScenes> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(50, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.CreativeSceneWhereInput = {};
    if (query.campaignId) {
      where.campaignId = query.campaignId;
    }
    if (query.search && query.search.trim().length > 0) {
      where.title = { contains: query.search.trim(), mode: 'insensitive' };
    }

    const [total, sceneRows] = await Promise.all([
      this.prisma.creativeScene.count({ where }),
      this.prisma.creativeScene.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
        include: {
          versions: {
            orderBy: { versionNumber: 'desc' },
            take: 1,
            include: VERSION_INCLUDE_RELATIONS,
          },
        },
      }),
    ]);

    const items: CreativeSceneSummary[] = [];
    for (const row of sceneRows) {
      const sceneRecord = toSceneRecord(row);
      const latestVerRow = row.versions[0];
      const latestVersion = latestVerRow ? toVersionRecord(latestVerRow) : undefined;

      let productSnapshot: CreativeSceneSummary['productSnapshot'] = undefined;
      let campaign: CreativeSceneSummary['campaign'] = undefined;

      if (latestVerRow?.productSnapshotId) {
        const snap = await this.prisma.productSnapshot.findUnique({
          where: { id: latestVerRow.productSnapshotId },
        });
        if (snap) {
          productSnapshot = {
            id: snap.id,
            sku: snap.sku,
            productName: snap.productName,
            brand: snap.brand,
            price: Number(snap.price),
          };
        }
      }

      if (row.campaignId) {
        const camp = await this.prisma.campaign.findUnique({
          where: { id: row.campaignId },
        });
        if (camp) {
          campaign = {
            id: camp.id,
            code: camp.code,
            name: camp.name,
          };
        }
      }

      items.push({
        scene: sceneRecord,
        ...(latestVersion ? { latestVersion } : {}),
        ...(productSnapshot ? { productSnapshot } : {}),
        ...(campaign ? { campaign } : {}),
      });
    }

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  public async updateVersionState(
    sceneVersionId: string,
    state: { status: string; isExportEligible?: boolean; invalidationReason?: string },
  ): Promise<void> {
    await this.prisma.sceneVersionState.update({
      where: { sceneVersionId },
      data: {
        status: state.status,
        ...(state.isExportEligible !== undefined
          ? { isExportEligible: state.isExportEligible }
          : {}),
        ...(state.invalidationReason !== undefined
          ? { invalidationReason: state.invalidationReason }
          : {}),
      },
    });
  }
}
