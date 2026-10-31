/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Permission } from '../../auth/domain/permissions.js';
import {
  InsufficientBrandPermissionError,
  UnlicensedAssetIngestionError,
} from '../domain/brand-errors.js';
import type {
  BrandSourceArchiveRecord,
  IngestBrandSourceInput,
} from '../domain/brand-profile.types.js';
import { type BrandSourceRepository } from './brand-source.repository.js';
import { IngestBrandSourceUseCase } from './ingest-brand-source.use-case.js';

describe('SEC-BRAND-15 to SEC-BRAND-19: Governed Brand Source Ingestion', () => {
  let mockSourceRepo: jest.Mocked<BrandSourceRepository>;
  let ingestUseCase: IngestBrandSourceUseCase;

  const validIngestInput: IngestBrandSourceInput = {
    sourceSystem: 'INSTAGRAM',
    externalPostId: 'ig-post-9876',
    captionText:
      'Explore timeless Paris luxury in Phnom Penh! Contact sophie@parisian.com or call +855 12 345 678. Follow @parisianshopper or join t.me/parisianvip.',
    copyrightDeclared: true,
    copyrightOwner: 'L’Atelier Parisien SARL',
    licenseReference: 'COMMERCIAL-INTERNAL-2026',
    mediaCasKeys: ['cas-key-101'],
    tags: ['handbag', 'campaign-2026'],
    actorUserId: 'usr-admin-01',
    permissions: [Permission.ADMIN, Permission.CREATE_CONTENT],
  };

  const sampleCreatedRecord: BrandSourceArchiveRecord = {
    id: 'src-arch-new-uuid',
    sourceSystem: 'INSTAGRAM',
    externalPostId: 'ig-post-9876',
    captionText: validIngestInput.captionText,
    sanitizedCaptionText:
      'Explore timeless Paris luxury in Phnom Penh! Contact [REDACTED_EMAIL] or call [REDACTED_PHONE]. Follow [REDACTED_HANDLE] or join [REDACTED_LINK].',
    copyrightDeclared: true,
    copyrightOwner: 'L’Atelier Parisien SARL',
    licenseReference: 'COMMERCIAL-INTERNAL-2026',
    mediaCasKeys: ['cas-key-101'],
    tags: ['handbag', 'campaign-2026'],
    sha256Hex: 'mocked-sha256-hex',
    ingestedByUserId: 'usr-admin-01',
    createdAt: new Date('2026-10-31T12:00:00Z'),
  };

  beforeEach(() => {
    mockSourceRepo = {
      storeRawPost: jest
        .fn<(...args: any[]) => Promise<any>>()
        .mockResolvedValue(sampleCreatedRecord),
      findById: jest.fn<(...args: any[]) => Promise<any>>(),
      findBySha256: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(null),
      listSources: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue([]),
    };

    ingestUseCase = new IngestBrandSourceUseCase(mockSourceRepo);
  });

  it('SEC-BRAND-15: requires Permission.ADMIN to ingest historical brand assets; denies non-admin users', async () => {
    const nonAdminInput: IngestBrandSourceInput = {
      ...validIngestInput,
      permissions: [Permission.CREATE_CONTENT],
    };

    await expect(ingestUseCase.execute(nonAdminInput)).rejects.toThrow(
      InsufficientBrandPermissionError,
    );
    expect(mockSourceRepo.storeRawPost).not.toHaveBeenCalled();
  });

  it('SEC-BRAND-16a: rejects ingestion when copyrightDeclared is false (W03-DEC-008)', async () => {
    const unverifiedInput: IngestBrandSourceInput = {
      ...validIngestInput,
      copyrightDeclared: false,
    };

    await expect(ingestUseCase.execute(unverifiedInput)).rejects.toThrow(
      UnlicensedAssetIngestionError,
    );
    expect(mockSourceRepo.storeRawPost).not.toHaveBeenCalled();
  });

  it('SEC-BRAND-16b: rejects ingestion when copyrightOwner or licenseReference is empty or whitespace', async () => {
    const missingOwnerInput: IngestBrandSourceInput = {
      ...validIngestInput,
      copyrightOwner: '   ',
    };

    await expect(ingestUseCase.execute(missingOwnerInput)).rejects.toThrow(
      UnlicensedAssetIngestionError,
    );

    const missingLicenseInput: IngestBrandSourceInput = {
      ...validIngestInput,
      licenseReference: '',
    };

    await expect(ingestUseCase.execute(missingLicenseInput)).rejects.toThrow(
      UnlicensedAssetIngestionError,
    );
    expect(mockSourceRepo.storeRawPost).not.toHaveBeenCalled();
  });

  it('SEC-BRAND-17: scrubs PII (emails, Cambodian phones, social handles, Telegram links) into sanitizedCaptionText', async () => {
    await ingestUseCase.execute(validIngestInput);

    expect(mockSourceRepo.storeRawPost).toHaveBeenCalledTimes(1);
    const storedPayload = mockSourceRepo.storeRawPost.mock.calls[0]?.[0];
    expect(storedPayload).toBeDefined();
    if (!storedPayload) throw new Error('Expected storedPayload');

    // Verify PII scrubbing
    expect(storedPayload.sanitizedCaptionText).toContain('[REDACTED_EMAIL]');
    expect(storedPayload.sanitizedCaptionText).toContain('[REDACTED_PHONE]');
    expect(storedPayload.sanitizedCaptionText).toContain('[REDACTED_HANDLE]');
    expect(storedPayload.sanitizedCaptionText).toContain('[REDACTED_LINK]');
    expect(storedPayload.sanitizedCaptionText).not.toContain('sophie@parisian.com');
    expect(storedPayload.sanitizedCaptionText).not.toContain('+855 12 345 678');
    expect(storedPayload.sanitizedCaptionText).not.toContain('@parisianshopper');
    expect(storedPayload.sanitizedCaptionText).not.toContain('t.me/parisianvip');

    // Original caption text is preserved in raw field for forensic traceability
    expect(storedPayload.captionText).toBe(validIngestInput.captionText);
  });

  it('SEC-BRAND-18: deduplicates identical content via SHA-256 fingerprint without creating duplicate archive records', async () => {
    mockSourceRepo.findBySha256.mockResolvedValueOnce(sampleCreatedRecord);

    const result = await ingestUseCase.execute(validIngestInput);

    expect(mockSourceRepo.findBySha256).toHaveBeenCalledTimes(1);
    expect(mockSourceRepo.storeRawPost).not.toHaveBeenCalled();
    expect(result.id).toBe(sampleCreatedRecord.id);
  });

  it('SEC-BRAND-19: preserves metadata (sourceSystem, externalPostId, mediaCasKeys, tags, ingestedByUserId) upon ingestion', async () => {
    await ingestUseCase.execute(validIngestInput);

    expect(mockSourceRepo.storeRawPost).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceSystem: 'INSTAGRAM',
        externalPostId: 'ig-post-9876',
        copyrightDeclared: true,
        copyrightOwner: 'L’Atelier Parisien SARL',
        licenseReference: 'COMMERCIAL-INTERNAL-2026',
        mediaCasKeys: ['cas-key-101'],
        tags: ['handbag', 'campaign-2026'],
        ingestedByUserId: 'usr-admin-01',
      }),
    );
  });
});
