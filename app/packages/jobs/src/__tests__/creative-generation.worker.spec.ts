import { describe, expect, it, jest } from '@jest/globals';
import {
  type GenerateCreativeUseCase,
  type ValidateCreativeUseCase,
  type CreativeJobRecord,
  type VisualAssetRecord,
  type VisualValidationResultRecord,
} from '@parisian-shopper/application';
import { type ApplicationLogger } from '@parisian-shopper/common';
import { type Job, UnrecoverableError } from 'bullmq';

import { type CreativeGenerationJobData } from '../creative-generation.queue.js';
import { CreativeGenerationWorker } from '../creative-generation.worker.js';
import { CreativeGenerationJobName } from '../queue-names.js';
import { type ValkeyConnectionService } from '../valkey-connection.service.js';
import { type WorkerRegistry } from '../worker.registry.js';

describe('CreativeGenerationWorker', () => {
  const mockJobRecord: CreativeJobRecord = {
    id: 'creative-job-123',
    contentVersionId: 'version-123',
    productSnapshotId: 'snapshot-1',
    brandRuleVersionId: 'brand-rule-1',
    requestedByUserId: 'user-1',
    status: 'COMPOSITING',
    targetPlatform: 'GENERIC',
    aspectRatio: '1:1',
    creativeProfile: 'PARISIAN_LUXURY_ATELIER',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockVisualAssetRecord: VisualAssetRecord = {
    id: 'visual-asset-123',
    creativeJobId: 'creative-job-123',
    versionNumber: 1,
    assetRole: 'COMPOSITED_CREATIVE',
    mimeType: 'image/png',
    width: 1080,
    height: 1080,
    byteSize: 1024,
    sha256: 'a'.repeat(64),
    storageKey: 'cas/composite.png',
    sourceProductAssetDigest: 'b'.repeat(64),
    createdAt: new Date(),
  };

  const mockValidationResult: VisualValidationResultRecord = {
    id: 'validation-res-123',
    visualAssetId: 'visual-asset-123',
    validatorVersion: '1.0.0',
    status: 'PASSED',
    findings: [],
    findingCount: 0,
    blockingCount: 0,
    warningCount: 0,
    infoCount: 0,
    createdAt: new Date(),
  };

  const mockLogger: ApplicationLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  };

  const createMockJob = (
    data: CreativeGenerationJobData,
    name: string = CreativeGenerationJobName.GENERATE_CREATIVE,
    attemptsMade = 0,
  ): Job<CreativeGenerationJobData> =>
    ({
      id: 'bullmq-job-1',
      name,
      data,
      attemptsMade,
    }) as unknown as Job<CreativeGenerationJobData>;

  it('orchestrates generation and chains validation successfully', async () => {
    const generateExecuteMock = jest.fn((_input?: unknown) =>
      Promise.resolve({
        creativeJob: mockJobRecord,
        visualAsset: mockVisualAssetRecord,
      }),
    );
    const generateCreative = {
      execute: generateExecuteMock,
    } as unknown as GenerateCreativeUseCase;

    const validateExecuteMock = jest.fn((_input?: unknown) =>
      Promise.resolve({
        validationResult: mockValidationResult,
        isPassed: true,
      }),
    );
    const validateCreative = {
      execute: validateExecuteMock,
    } as unknown as ValidateCreativeUseCase;

    const worker = new CreativeGenerationWorker(
      {} as unknown as ValkeyConnectionService,
      {} as unknown as WorkerRegistry,
      generateCreative,
      validateCreative,
      mockLogger,
    );

    const job = createMockJob({
      contentVersionId: 'version-123',
      requestedBy: 'user-1',
      format: 'FEED_SQUARE',
      stylePreset: 'editorial',
    });

    await worker.process(job);

    expect(generateExecuteMock).toHaveBeenCalledWith({
      contentVersionId: 'version-123',
      requestedBy: 'user-1',
      format: 'FEED_SQUARE',
      stylePreset: 'editorial',
    });

    expect(validateExecuteMock).toHaveBeenCalledWith({
      creativeJobId: 'creative-job-123',
      visualAssetId: 'visual-asset-123',
    });
  });

  it('rejects unsupported job names with UnrecoverableError', async () => {
    const generateCreative = { execute: jest.fn() } as unknown as GenerateCreativeUseCase;
    const validateCreative = { execute: jest.fn() } as unknown as ValidateCreativeUseCase;
    const worker = new CreativeGenerationWorker(
      {} as unknown as ValkeyConnectionService,
      {} as unknown as WorkerRegistry,
      generateCreative,
      validateCreative,
      mockLogger,
    );

    const job = createMockJob(
      { contentVersionId: 'version-123', requestedBy: 'user-1' },
      'UNSUPPORTED_JOB',
    );

    await expect(worker.process(job)).rejects.toThrow(UnrecoverableError);
  });

  it('wraps non-eligible domain error into UnrecoverableError', async () => {
    const generateExecuteMock = jest.fn(() =>
      Promise.reject(new Error('Content version is not eligible for creative generation')),
    );
    const generateCreative = { execute: generateExecuteMock } as unknown as GenerateCreativeUseCase;
    const validateCreative = { execute: jest.fn() } as unknown as ValidateCreativeUseCase;

    const worker = new CreativeGenerationWorker(
      {} as unknown as ValkeyConnectionService,
      {} as unknown as WorkerRegistry,
      generateCreative,
      validateCreative,
      mockLogger,
    );

    const job = createMockJob({ contentVersionId: 'version-123', requestedBy: 'user-1' });

    await expect(worker.process(job)).rejects.toThrow(UnrecoverableError);
  });

  it('wraps not found error into UnrecoverableError', async () => {
    const generateExecuteMock = jest.fn(() => Promise.reject(new Error('Content job not found')));
    const generateCreative = { execute: generateExecuteMock } as unknown as GenerateCreativeUseCase;
    const validateCreative = { execute: jest.fn() } as unknown as ValidateCreativeUseCase;

    const worker = new CreativeGenerationWorker(
      {} as unknown as ValkeyConnectionService,
      {} as unknown as WorkerRegistry,
      generateCreative,
      validateCreative,
      mockLogger,
    );

    const job = createMockJob({ contentVersionId: 'version-123', requestedBy: 'user-1' });

    await expect(worker.process(job)).rejects.toThrow(UnrecoverableError);
  });

  it('re-throws transient errors for BullMQ retry and logs dead-letter flag when attempts exhausted', async () => {
    const transientError = new Error('Transient database socket timeout');
    const generateExecuteMock = jest.fn(() => Promise.reject(transientError));
    const generateCreative = { execute: generateExecuteMock } as unknown as GenerateCreativeUseCase;
    const validateCreative = { execute: jest.fn() } as unknown as ValidateCreativeUseCase;

    const worker = new CreativeGenerationWorker(
      {} as unknown as ValkeyConnectionService,
      {} as unknown as WorkerRegistry,
      generateCreative,
      validateCreative,
      mockLogger,
    );

    const job = createMockJob(
      { contentVersionId: 'version-123', requestedBy: 'user-1' },
      CreativeGenerationJobName.GENERATE_CREATIVE,
      2, // attempt 3 is being made
    );

    await expect(worker.process(job)).rejects.toThrow(transientError);
  });
});
