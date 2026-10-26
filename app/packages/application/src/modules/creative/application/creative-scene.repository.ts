import type {
  CreativeSceneRecord,
  CreativeSceneVersionRecord,
  LayerDependencyDraft,
  OutboxEventDraft,
  PosterAspectRatio,
  SafeMargins,
  SceneInvalidationEventRecord,
  SceneLayerDraft,
  SceneLanguage,
  SceneOperationCode,
  SceneTemplateId,
} from '../domain/scene/creative-scene.types.js';

export const CREATIVE_SCENE_REPOSITORY = Symbol('CREATIVE_SCENE_REPOSITORY');

export interface CreateInitialSceneAtomicInput {
  readonly creativeJobId: string;
  readonly campaignId?: string | null | undefined;
  readonly title: string;
  readonly aspectRatio: PosterAspectRatio;
  readonly width: number;
  readonly height: number;
  readonly templateId: SceneTemplateId;
  readonly templateVersion: string;
  readonly stylePresetId?: string | null | undefined;
  readonly language: SceneLanguage;
  readonly safeMargins: SafeMargins;
  readonly brandProfileVersionId: string;
  readonly sourceContentVersionId: string;
  readonly productSnapshotId: string;
  readonly sceneHash: string;
  readonly dependencyHash: string;
  readonly layers: readonly SceneLayerDraft[];
  readonly dependencies: readonly LayerDependencyDraft[];
  readonly requestedByUserId?: string | null | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | null | undefined;
  readonly outboxEvent: OutboxEventDraft;
}

export interface CreateRevisionAtomicInput {
  readonly sceneId: string;
  readonly expectedVersionNumber: number;
  readonly templateId: SceneTemplateId;
  readonly templateVersion: string;
  readonly stylePresetId?: string | null | undefined;
  readonly language: SceneLanguage;
  readonly safeMargins: SafeMargins;
  readonly brandProfileVersionId: string;
  readonly sourceContentVersionId: string;
  readonly productSnapshotId: string;
  readonly sceneHash: string;
  readonly dependencyHash: string;
  readonly changeReason: string;
  readonly operationCode: SceneOperationCode;
  readonly requestedByUserId?: string | null | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | null | undefined;
  readonly layers: readonly SceneLayerDraft[];
  readonly dependencies: readonly LayerDependencyDraft[];
  readonly outboxEvents: readonly [OutboxEventDraft, ...OutboxEventDraft[]];
}

export interface RecordDependencyInvalidationInput {
  readonly sceneVersionId: string;
  readonly reason: string;
  readonly divergedDependencyType: string;
  readonly expectedDigest: string;
  readonly actualDigest: string;
  readonly recordedByUserId?: string | null | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | null | undefined;
  readonly outboxEvent?: OutboxEventDraft | undefined;
}

export interface CreativeSceneRepository {
  createInitialScene(
    input: CreateInitialSceneAtomicInput,
  ): Promise<{ readonly scene: CreativeSceneRecord; readonly version: CreativeSceneVersionRecord }>;

  createRevision(input: CreateRevisionAtomicInput): Promise<CreativeSceneVersionRecord>;

  recordDependencyInvalidation(
    input: RecordDependencyInvalidationInput,
  ): Promise<SceneInvalidationEventRecord>;

  findById(sceneId: string): Promise<CreativeSceneRecord | null>;
  findByJobId(creativeJobId: string): Promise<CreativeSceneRecord | null>;
  findVersionById(versionId: string): Promise<CreativeSceneVersionRecord | null>;
  findVersionByNumber(
    sceneId: string,
    versionNumber: number,
  ): Promise<CreativeSceneVersionRecord | null>;
  findLatestVersionByJobId(creativeJobId: string): Promise<CreativeSceneVersionRecord | null>;
  findLatestVersionBySceneId(sceneId: string): Promise<CreativeSceneVersionRecord | null>;
  listVersions(sceneId: string): Promise<readonly CreativeSceneVersionRecord[]>;
}
