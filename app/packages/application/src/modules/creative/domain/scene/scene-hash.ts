import { createHash } from 'node:crypto';
import type { PosterAspectRatio } from '../poster-spec.js';
import type { SafeMargins } from '../poster-tokens.js';
import type {
  LayerDependencyDraft,
  LayerDependencyRecord,
  SceneLayerDraft,
  SceneLayerRecord,
  SceneLanguage,
  SceneTemplateId,
} from './creative-scene.types.js';

export function canonicalStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }

  const type = typeof value;

  if (type === 'number') {
    return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  }

  if (type === 'boolean' || type === 'string') {
    return JSON.stringify(value);
  }

  if (type === 'bigint') {
    return JSON.stringify((value as bigint).toString(10));
  }

  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  if (Buffer.isBuffer(value)) {
    return JSON.stringify(value.toString('hex'));
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => canonicalStringify(item));
    return `[${items.join(',')}]`;
  }

  if (type === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB));

    const fields = entries.map(
      ([k, v]) => `${JSON.stringify(k)}:${canonicalStringify(v)}`,
    );
    return `{${fields.join(',')}}`;
  }

  if (type === 'symbol') {
    return JSON.stringify((value as symbol).toString());
  }

  return 'null';
}

export function sha256Hex(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex').toLowerCase();
}

export function computeCanonicalSha256(content: unknown): string {
  return sha256Hex(canonicalStringify(content));
}

function assertAuthoritativeRecord(record: unknown, helperName: string): asserts record is Record<string, unknown> {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new TypeError(`${helperName} requires an authoritative record object; got ${typeof record}`);
  }
}

export function computeSnapshotDigest(snapshot: object): string {
  assertAuthoritativeRecord(snapshot, 'computeSnapshotDigest');
  return computeCanonicalSha256(snapshot);
}

export function computeProductAssetDigest(asset: object): string {
  assertAuthoritativeRecord(asset, 'computeProductAssetDigest');
  return computeCanonicalSha256(asset);
}

export function computeRegistrationDigest(registration: object): string {
  assertAuthoritativeRecord(registration, 'computeRegistrationDigest');
  return computeCanonicalSha256(registration);
}

export function computeAssessmentDigest(assessment: object): string {
  assertAuthoritativeRecord(assessment, 'computeAssessmentDigest');
  return computeCanonicalSha256(assessment);
}

export function computeRightsEventDigest(rightsEvent: object): string {
  assertAuthoritativeRecord(rightsEvent, 'computeRightsEventDigest');
  return computeCanonicalSha256(rightsEvent);
}

export function computeApprovalEventDigest(approvalEvent: object): string {
  assertAuthoritativeRecord(approvalEvent, 'computeApprovalEventDigest');
  return computeCanonicalSha256(approvalEvent);
}

export function computeContentVersionDigest(contentVersion: object): string {
  assertAuthoritativeRecord(contentVersion, 'computeContentVersionDigest');
  return computeCanonicalSha256(contentVersion);
}

export function computeBrandRuleDigest(brandProfile: object): string {
  assertAuthoritativeRecord(brandProfile, 'computeBrandRuleDigest');
  return computeCanonicalSha256(brandProfile);
}

export function computeIdentifierDigest(identifier: string): string {
  if (typeof identifier !== 'string' || identifier.trim() === '') {
    throw new TypeError('computeIdentifierDigest requires a non-empty string identifier');
  }
  return computeCanonicalSha256({ id: identifier });
}

export function computeLayerHash(layer: SceneLayerDraft | SceneLayerRecord): string {
  const normalized = {
    blendMode: layer.blendMode,
    bounds: {
      height: layer.bounds.height,
      width: layer.bounds.width,
      x: layer.bounds.x,
      y: layer.bounds.y,
    },
    layerGroup: layer.layerGroup,
    layerKey: layer.layerKey,
    layerType: layer.layerType,
    name: layer.name,
    opacity: layer.opacity,
    payload: layer.payload,
    payloadSchemaVersion: layer.payloadSchemaVersion,
    sortOrder: layer.sortOrder,
    visible: layer.visible,
    zIndex: layer.zIndex,
  };
  return sha256Hex(canonicalStringify(normalized));
}

export function computeDependencyHash(
  dependencies: readonly (LayerDependencyDraft | LayerDependencyRecord)[],
): string {
  const sorted = [...dependencies].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    const typeCmp = a.dependencyType.localeCompare(b.dependencyType);
    if (typeCmp !== 0) return typeCmp;
    return a.dependencyIdentifier.localeCompare(b.dependencyIdentifier);
  });

  const canonicalDeps = sorted.map((d) => ({
    dependencyIdentifier: d.dependencyIdentifier,
    dependencyType: d.dependencyType,
    evidenceIdentifier: d.evidenceIdentifier ?? null,
    immutableDigest: d.immutableDigest.toLowerCase(),
    sortOrder: d.sortOrder,
  }));

  return sha256Hex(canonicalStringify(canonicalDeps));
}

export interface ComputeSceneHashInput {
  readonly templateId: SceneTemplateId;
  readonly templateVersion: string;
  readonly aspectRatio: PosterAspectRatio;
  readonly width: number;
  readonly height: number;
  readonly safeMargins: SafeMargins;
  readonly language: SceneLanguage;
  readonly stylePresetId?: string | null | undefined;
  readonly layers: readonly (SceneLayerDraft | SceneLayerRecord)[];
  readonly dependencyHash: string;
}

export function computeSceneHash(input: ComputeSceneHashInput): string {
  // Sort layers deterministically by sortOrder ascending, then zIndex ascending, then layerKey ascending
  const sortedLayers = [...input.layers].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    if (a.zIndex !== b.zIndex) {
      return a.zIndex - b.zIndex;
    }
    return a.layerKey.localeCompare(b.layerKey);
  });

  const layerDigests = sortedLayers.map((l) => ({
    layerGroup: l.layerGroup,
    layerHash: 'layerHash' in l && l.layerHash ? l.layerHash : computeLayerHash(l),
    layerKey: l.layerKey,
    layerType: l.layerType,
    sortOrder: l.sortOrder,
    zIndex: l.zIndex,
  }));

  const canonicalPayload = {
    aspectRatio: input.aspectRatio,
    dependencyHash: input.dependencyHash.toLowerCase(),
    height: input.height,
    language: input.language,
    layerDigests,
    safeMargins: {
      bottom: input.safeMargins.bottom,
      left: input.safeMargins.left,
      right: input.safeMargins.right,
      top: input.safeMargins.top,
    },
    stylePresetId: input.stylePresetId ?? null,
    templateId: input.templateId,
    templateVersion: input.templateVersion,
    width: input.width,
  };

  return sha256Hex(canonicalStringify(canonicalPayload));
}
