import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import {
  type CreateCreativeExportInput,
  CreativeExportConflictError,
  CreativeJobNotFoundError,
  VisualAssetNotFoundError,
} from '@parisian-shopper/application';
import { Prisma, type CreativeExport as PrismaCreativeExport } from '@prisma/client';
import { PrismaCreativeExportRepository } from './prisma-creative-export.repository.js';
import { type PrismaService } from '../prisma.service.js';

type AsyncMock<T = unknown> = jest.MockedFunction<(...args: unknown[]) => Promise<T>>;

interface MockModel {
  create?: AsyncMock;
  findUnique?: AsyncMock;
  findMany?: AsyncMock;
}

interface MockPrismaClient {
  creativeExport: MockModel;
}

const sampleExportInput: CreateCreativeExportInput = {
  creativeJobId: '00000000-0000-4000-8000-000000000001',
  visualAssetId: '00000000-0000-4000-8000-000000000002',
  format: 'SQUARE_1080',
  encoding: 'PNG',
  width: 1080,
  height: 1080,
  aspectRatio: '1:1',
  byteSize: 1024000,
  sha256: 'a'.repeat(64),
  storageKey: 'cas/aa/bb/' + 'a'.repeat(64) + '.png',
  quality: 90,
  validationStatus: 'PASSED',
  exportedByUserId: '00000000-0000-4000-8000-000000000003',
};

const sampleExportRow: PrismaCreativeExport = {
  id: '00000000-0000-4000-8000-000000000010',
  creativeJobId: sampleExportInput.creativeJobId,
  visualAssetId: sampleExportInput.visualAssetId,
  format: 'SQUARE_1080',
  encoding: 'PNG',
  width: 1080,
  height: 1080,
  aspectRatio: '1:1',
  byteSize: 1024000,
  sha256: 'a'.repeat(64),
  storageKey: sampleExportInput.storageKey,
  quality: 90,
  validationStatus: 'PASSED',
  exportedByUserId: sampleExportInput.exportedByUserId,
  createdAt: new Date('2026-10-29T10:00:00.000Z'),
};

describe('PrismaCreativeExportRepository (W32-B)', () => {
  let repository: PrismaCreativeExportRepository;
  let mockPrisma: MockPrismaClient;

  beforeEach(() => {
    mockPrisma = {
      creativeExport: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
    };

    repository = new PrismaCreativeExportRepository(mockPrisma as unknown as PrismaService);
  });

  describe('createExport', () => {
    it('successfully persists a creative export record and maps return fields', async () => {
      mockPrisma.creativeExport.create!.mockResolvedValue(sampleExportRow);

      const result = await repository.createExport(sampleExportInput);

      expect(mockPrisma.creativeExport.create).toHaveBeenCalledWith({
        data: {
          creativeJobId: sampleExportInput.creativeJobId,
          visualAssetId: sampleExportInput.visualAssetId,
          format: 'SQUARE_1080',
          encoding: 'PNG',
          width: 1080,
          height: 1080,
          aspectRatio: '1:1',
          byteSize: 1024000,
          sha256: 'a'.repeat(64),
          storageKey: sampleExportInput.storageKey,
          quality: 90,
          validationStatus: 'PASSED',
          exportedByUserId: sampleExportInput.exportedByUserId,
        },
      });

      expect(result.id).toBe(sampleExportRow.id);
      expect(result.format).toBe('SQUARE_1080');
      expect(result.encoding).toBe('PNG');
      expect(result.width).toBe(1080);
      expect(result.height).toBe(1080);
      expect(result.quality).toBe(90);
      expect(result.validationStatus).toBe('PASSED');
      expect(result.createdAt).toEqual(sampleExportRow.createdAt);
    });

    it('throws CreativeExportConflictError on P2002 unique constraint violation', async () => {
      const p2002Error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
      });
      mockPrisma.creativeExport.create!.mockRejectedValue(p2002Error);

      await expect(repository.createExport(sampleExportInput)).rejects.toThrow(
        CreativeExportConflictError,
      );
    });

    it('throws VisualAssetNotFoundError on P2003 foreign key violation for visual_asset_id', async () => {
      const p2003Error = new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
        code: 'P2003',
        clientVersion: '6.19.3',
        meta: { field_name: 'creative_exports_visual_asset_id_fkey' },
      });
      mockPrisma.creativeExport.create!.mockRejectedValue(p2003Error);

      await expect(repository.createExport(sampleExportInput)).rejects.toThrow(
        VisualAssetNotFoundError,
      );
    });

    it('throws CreativeJobNotFoundError on P2003 foreign key violation for creative_job_id', async () => {
      const p2003Error = new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
        code: 'P2003',
        clientVersion: '6.19.3',
        meta: { field_name: 'creative_exports_creative_job_id_fkey' },
      });
      mockPrisma.creativeExport.create!.mockRejectedValue(p2003Error);

      await expect(repository.createExport(sampleExportInput)).rejects.toThrow(
        CreativeJobNotFoundError,
      );
    });

    it('rethrows unexpected database errors', async () => {
      const unexpectedError = new Error('Database connection reset');
      mockPrisma.creativeExport.create!.mockRejectedValue(unexpectedError);

      await expect(repository.createExport(sampleExportInput)).rejects.toThrow(
        'Database connection reset',
      );
    });
  });

  describe('findById', () => {
    it('returns mapped record when found', async () => {
      mockPrisma.creativeExport.findUnique!.mockResolvedValue(sampleExportRow);

      const result = await repository.findById(sampleExportRow.id);

      expect(mockPrisma.creativeExport.findUnique).toHaveBeenCalledWith({
        where: { id: sampleExportRow.id },
      });
      expect(result).not.toBeNull();
      expect(result?.id).toBe(sampleExportRow.id);
    });

    it('returns null when record not found', async () => {
      mockPrisma.creativeExport.findUnique!.mockResolvedValue(null);

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByAssetAndFormat', () => {
    it('queries by compound unique key and returns mapped record', async () => {
      mockPrisma.creativeExport.findUnique!.mockResolvedValue(sampleExportRow);

      const result = await repository.findByAssetAndFormat(
        sampleExportInput.visualAssetId,
        'SQUARE_1080',
        'PNG',
      );

      expect(mockPrisma.creativeExport.findUnique).toHaveBeenCalledWith({
        where: {
          visualAssetId_format_encoding: {
            visualAssetId: sampleExportInput.visualAssetId,
            format: 'SQUARE_1080',
            encoding: 'PNG',
          },
        },
      });
      expect(result).not.toBeNull();
      expect(result?.format).toBe('SQUARE_1080');
      expect(result?.encoding).toBe('PNG');
    });

    it('returns null when no record matches format and encoding', async () => {
      mockPrisma.creativeExport.findUnique!.mockResolvedValue(null);

      const result = await repository.findByAssetAndFormat(
        sampleExportInput.visualAssetId,
        'STORY_1080_1920',
        'JPEG',
      );

      expect(result).toBeNull();
    });
  });

  describe('listByJobId', () => {
    it('returns ordered records by createdAt descending', async () => {
      mockPrisma.creativeExport.findMany!.mockResolvedValue([sampleExportRow]);

      const results = await repository.listByJobId(sampleExportInput.creativeJobId);

      expect(mockPrisma.creativeExport.findMany).toHaveBeenCalledWith({
        where: { creativeJobId: sampleExportInput.creativeJobId },
        orderBy: { createdAt: 'desc' },
      });
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe(sampleExportRow.id);
    });
  });

  describe('listByVisualAssetId', () => {
    it('returns exports for specific visual asset', async () => {
      mockPrisma.creativeExport.findMany!.mockResolvedValue([sampleExportRow]);

      const results = await repository.listByVisualAssetId(sampleExportInput.visualAssetId);

      expect(mockPrisma.creativeExport.findMany).toHaveBeenCalledWith({
        where: { visualAssetId: sampleExportInput.visualAssetId },
        orderBy: { createdAt: 'desc' },
      });
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe(sampleExportRow.id);
    });
  });
});
