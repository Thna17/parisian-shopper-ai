/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { StreamableFile } from '@nestjs/common';
import {
  type AssetStoragePort,
  type CreativeExportRecord,
  type CreativeExportRepository,
  type ExportDownloadTokenService,
  type GetCurrentEmployeeUseCase,
  type SanitizedEmployeeDto,
  CreativeExportNotFoundError,
  Permission,
  UnauthorizedSessionError,
} from '@parisian-shopper/application';
import { ForbiddenError, NotFoundError } from '@parisian-shopper/common';
import { type Request, type Response } from 'express';

import { CreativeExportsController } from './creative-exports.controller.js';

describe('CreativeExportsController (W32-D)', () => {
  let controller: CreativeExportsController;
  let mockExportRepo: jest.Mocked<CreativeExportRepository>;
  let mockStorage: jest.Mocked<AssetStoragePort>;
  let mockTokenService: jest.Mocked<ExportDownloadTokenService>;
  let mockGetCurrentEmployeeUseCase: jest.Mocked<GetCurrentEmployeeUseCase>;

  const exportId = 'exp-1234-5678-abcd';
  const sampleExportRecord: CreativeExportRecord = {
    id: exportId,
    creativeJobId: 'job-111',
    visualAssetId: 'asset-222',
    format: 'STORY_1080_1920',
    encoding: 'PNG',
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    byteSize: 1024,
    sha256: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    storageKey: 'cas/creative/sample.png',
    quality: undefined,
    validationStatus: 'PASSED',
    exportedByUserId: 'user-001',
    createdAt: new Date(),
  };

  const sampleBuffer = Buffer.from('fake-png-content');

  const createMockResponse = (): jest.Mocked<Response> =>
    ({
      setHeader: jest.fn(),
    }) as unknown as jest.Mocked<Response>;

  const mockEmployeeWithExportRole: SanitizedEmployeeDto = {
    id: 'emp-001',
    displayName: 'Marketing Lead',
    status: 'ACTIVE',
    roles: ['MARKETING_APPROVER'],
    permissions: [Permission.EXPORT_CREATIVE, Permission.VIEW_ALL_CONTENT],
  };

  const mockEmployeeWithoutExportRole: SanitizedEmployeeDto = {
    id: 'emp-viewer',
    displayName: 'Viewer User',
    status: 'ACTIVE',
    roles: ['VIEWER'],
    permissions: [Permission.VIEW_ALL_CONTENT],
  };

  beforeEach(() => {
    mockExportRepo = {
      findById: jest
        .fn<CreativeExportRepository['findById']>()
        .mockResolvedValue(sampleExportRecord),
      findByAssetAndFormat: jest
        .fn<CreativeExportRepository['findByAssetAndFormat']>()
        .mockResolvedValue(null),
      createExport: jest
        .fn<CreativeExportRepository['createExport']>()
        .mockResolvedValue(sampleExportRecord),
      listByJobId: jest.fn<CreativeExportRepository['listByJobId']>().mockResolvedValue([]),
      listByVisualAssetId: jest
        .fn<CreativeExportRepository['listByVisualAssetId']>()
        .mockResolvedValue([]),
    };

    mockStorage = {
      saveAsset: jest.fn<AssetStoragePort['saveAsset']>(),
      getMetadata: jest.fn<AssetStoragePort['getMetadata']>(),
      getAssetBuffer: jest.fn<AssetStoragePort['getAssetBuffer']>().mockResolvedValue(sampleBuffer),
      assetExists: jest.fn<AssetStoragePort['assetExists']>().mockResolvedValue(true),
    };

    mockTokenService = {
      generateToken: jest.fn<ExportDownloadTokenService['generateToken']>(),
      verifyToken: jest.fn<ExportDownloadTokenService['verifyToken']>().mockReturnValue({
        isValid: true,
        exportId,
        userId: 'user-001',
        expiresAt: new Date(Date.now() + 3600_000),
      }),
    } as unknown as jest.Mocked<ExportDownloadTokenService>;

    mockGetCurrentEmployeeUseCase = {
      execute: jest
        .fn<GetCurrentEmployeeUseCase['execute']>()
        .mockResolvedValue(mockEmployeeWithExportRole),
    } as unknown as jest.Mocked<GetCurrentEmployeeUseCase>;

    controller = new CreativeExportsController(
      mockExportRepo,
      mockStorage,
      mockTokenService,
      mockGetCurrentEmployeeUseCase,
    );
  });

  describe('GET /v1/creatives/exports/:id/download', () => {
    it('successfully streams binary with valid download token and sets attachment headers', async () => {
      const res = createMockResponse();
      const req = { headers: {} } as Request;

      const file = await controller.downloadExport(
        exportId,
        { token: 'valid-base64url-token' },
        req,
        res,
      );

      expect(file).toBeInstanceOf(StreamableFile);
      expect(mockTokenService.verifyToken).toHaveBeenCalledWith('valid-base64url-token', exportId);
      expect(mockExportRepo.findById).toHaveBeenCalledWith(exportId);
      expect(mockStorage.getAssetBuffer).toHaveBeenCalledWith(sampleExportRecord.storageKey);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('attachment; filename='),
      );
      expect(res.setHeader).toHaveBeenCalledWith('Content-Length', String(sampleBuffer.byteLength));
      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'private, max-age=3600, immutable',
      );
      expect(res.setHeader).toHaveBeenCalledWith('ETag', `"${sampleExportRecord.sha256}"`);
    });

    it('sets image/jpeg and .jpg extension when export encoding is JPEG', async () => {
      mockExportRepo.findById.mockResolvedValueOnce({
        ...sampleExportRecord,
        encoding: 'JPEG',
      });
      const res = createMockResponse();
      const req = { headers: {} } as Request;

      const file = await controller.downloadExport(exportId, { token: 'valid-token' }, req, res);

      expect(file).toBeInstanceOf(StreamableFile);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('.jpg'),
      );
    });

    it('successfully streams binary with valid session cookie when token is not provided', async () => {
      const res = createMockResponse();
      const req = {
        headers: {
          cookie: 'ps_session=valid-session-secret',
        },
      } as unknown as Request;

      const file = await controller.downloadExport(exportId, {}, req, res);

      expect(file).toBeInstanceOf(StreamableFile);
      expect(mockGetCurrentEmployeeUseCase.execute).toHaveBeenCalledWith({
        rawSessionToken: 'valid-session-secret',
      });
      expect(mockTokenService.verifyToken).not.toHaveBeenCalled();
    });

    it('throws ForbiddenError when download token is expired', async () => {
      mockTokenService.verifyToken.mockReturnValueOnce({
        isValid: false,
        reason: 'EXPIRED',
      });

      const res = createMockResponse();
      const req = { headers: {} } as Request;

      await expect(
        controller.downloadExport(exportId, { token: 'expired-token' }, req, res),
      ).rejects.toThrow(ForbiddenError);
    });

    it('throws ForbiddenError when download token has mismatched exportId', async () => {
      mockTokenService.verifyToken.mockReturnValueOnce({
        isValid: false,
        reason: 'EXPORT_MISMATCH',
      });

      const res = createMockResponse();
      const req = { headers: {} } as Request;

      await expect(
        controller.downloadExport(exportId, { token: 'mismatched-token' }, req, res),
      ).rejects.toThrow(ForbiddenError);
    });

    it('throws ForbiddenError when download token has invalid or tampered signature', async () => {
      mockTokenService.verifyToken.mockReturnValueOnce({
        isValid: false,
        reason: 'INVALID_SIGNATURE',
      });

      const res = createMockResponse();
      const req = { headers: {} } as Request;

      await expect(
        controller.downloadExport(exportId, { token: 'tampered-token' }, req, res),
      ).rejects.toThrow(ForbiddenError);
    });

    it('throws UnauthorizedSessionError when neither token nor session cookie is provided', async () => {
      const res = createMockResponse();
      const req = { headers: {} } as Request;

      await expect(controller.downloadExport(exportId, {}, req, res)).rejects.toThrow(
        UnauthorizedSessionError,
      );
    });

    it('throws ForbiddenError when user has active session but lacks EXPORT_CREATIVE permission', async () => {
      mockGetCurrentEmployeeUseCase.execute.mockResolvedValueOnce(mockEmployeeWithoutExportRole);

      const res = createMockResponse();
      const req = {
        headers: {
          cookie: 'ps_session=viewer-session',
        },
      } as unknown as Request;

      await expect(controller.downloadExport(exportId, {}, req, res)).rejects.toThrow(
        ForbiddenError,
      );
    });

    it('throws CreativeExportNotFoundError when export record is not found in database', async () => {
      mockExportRepo.findById.mockResolvedValueOnce(null);

      const res = createMockResponse();
      const req = { headers: {} } as Request;

      await expect(
        controller.downloadExport(exportId, { token: 'valid-token' }, req, res),
      ).rejects.toThrow(CreativeExportNotFoundError);
    });

    it('throws NotFoundError when binary is not found in CAS storage', async () => {
      mockStorage.getAssetBuffer.mockResolvedValueOnce(null);

      const res = createMockResponse();
      const req = { headers: {} } as Request;

      await expect(
        controller.downloadExport(exportId, { token: 'valid-token' }, req, res),
      ).rejects.toThrow(NotFoundError);
    });
  });
});
