import { type VisualAssetRole } from '../domain/creative.js';

export const VISUAL_ASSET_REPOSITORY = Symbol('VISUAL_ASSET_REPOSITORY');

export interface VisualAssetRecord {
  readonly id: string;
  readonly creativeJobId: string;
  readonly versionNumber: number;
  readonly assetRole: VisualAssetRole;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
  readonly sha256: string;
  readonly storageKey: string;
  readonly provider?: string;
  readonly model?: string;
  readonly seed?: bigint;
  readonly promptVersion?: string;
  readonly creativeBriefVersion?: string;
  readonly sourceProductAssetDigest: string;
  readonly backgroundAssetDigest?: string;
  readonly createdAt: Date;
}

export interface CreateVisualAssetInput {
  readonly creativeJobId: string;
  readonly assetRole: VisualAssetRole;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
  readonly sha256: string;
  readonly storageKey: string;
  readonly provider?: string;
  readonly model?: string;
  readonly seed?: bigint;
  readonly promptVersion?: string;
  readonly creativeBriefVersion?: string;
  readonly sourceProductAssetDigest: string;
  readonly backgroundAssetDigest?: string;
}

export interface VisualAssetRepository {
  createAsset(input: CreateVisualAssetInput): Promise<VisualAssetRecord>;
  findById(id: string): Promise<VisualAssetRecord | null>;
  findByJobAndVersion(
    creativeJobId: string,
    versionNumber: number,
  ): Promise<VisualAssetRecord | null>;
  listByJobId(creativeJobId: string): Promise<readonly VisualAssetRecord[]>;
  findLatestByJobId(creativeJobId: string): Promise<VisualAssetRecord | null>;
}
