import { type ExportEncoding, type ExportFormat } from './export-poster.use-case.js';

export const CREATIVE_EXPORT_REPOSITORY = Symbol('CREATIVE_EXPORT_REPOSITORY');

export interface CreativeExportRecord {
  readonly id: string;
  readonly creativeJobId: string;
  readonly visualAssetId: string;
  readonly format: ExportFormat;
  readonly encoding: ExportEncoding;
  readonly width: number;
  readonly height: number;
  readonly aspectRatio: string;
  readonly byteSize: number;
  readonly sha256: string;
  readonly storageKey: string;
  readonly quality?: number | undefined;
  readonly validationStatus: string;
  readonly exportedByUserId: string;
  readonly createdAt: Date;
}

export interface CreateCreativeExportInput {
  readonly creativeJobId: string;
  readonly visualAssetId: string;
  readonly format: ExportFormat;
  readonly encoding: ExportEncoding;
  readonly width: number;
  readonly height: number;
  readonly aspectRatio: string;
  readonly byteSize: number;
  readonly sha256: string;
  readonly storageKey: string;
  readonly quality?: number | undefined;
  readonly validationStatus?: string | undefined;
  readonly exportedByUserId: string;
}

export interface CreativeExportRepository {
  createExport(input: CreateCreativeExportInput): Promise<CreativeExportRecord>;
  findById(id: string): Promise<CreativeExportRecord | null>;
  findByAssetAndFormat(
    visualAssetId: string,
    format: ExportFormat,
    encoding: ExportEncoding,
  ): Promise<CreativeExportRecord | null>;
  listByJobId(creativeJobId: string): Promise<readonly CreativeExportRecord[]>;
  listByVisualAssetId(visualAssetId: string): Promise<readonly CreativeExportRecord[]>;
}
