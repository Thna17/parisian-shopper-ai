import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { BrandGuidanceService } from './brand-guidance.service.js';
import type {
  BrandGuidanceRepository,
  ReferenceView,
  GuidanceView,
} from './brand-guidance.repository.js';
import type { AssetStoragePort } from '../../creative/application/asset-storage.port.js';
import type { PinnedBrandGuidance } from '../domain/brand-guidance.schema.js';
const admin = { id: 'admin', permissions: ['ADMIN', 'VIEW_OWN_CONTENT'] };
const staff = { id: 'staff', permissions: ['VIEW_OWN_CONTENT'] };
describe('brand guidance rights and byte safeguards', () => {
  let bytes: Buffer;
  let reference: ReferenceView;
  let repository: BrandGuidanceRepository;
  let service: BrandGuidanceService;
  beforeEach(async () => {
    bytes = await sharp({ create: { width: 4, height: 4, channels: 4, background: '#ffffff' } })
      .png()
      .toBuffer();
    reference = {
      id: 'ref',
      sourceUrl: 'https://example.invalid',
      sourceSystem: 'FACEBOOK',
      captionText: 'Historical example',
      copyrightDeclared: true,
      copyrightOwner: 'Fixture',
      licenseReference: 'Fixture rights',
      tags: [],
      mediaCasKeys: ['key'],
      version: 1,
      groupId: 'group',
      status: 'UNREVIEWED',
      reviewEventId: null,
      sourceDigest: 'hash',
      media: [],
      history: [],
    };
    repository = {
      references: () => Promise.resolve([reference]),
      reviewReference: jest.fn<BrandGuidanceRepository['reviewReference']>(),
      list: () => Promise.resolve([]),
    } as unknown as BrandGuidanceRepository;
    const storage = {
      getAssetBuffer: () => Promise.resolve(bytes),
      getMetadata: () =>
        Promise.resolve({
          sha256Digest: createHash('sha256').update(bytes).digest('hex'),
          mimeType: 'image/png',
        }),
    } as unknown as AssetStoragePort;
    service = new BrandGuidanceService(repository, storage);
  });
  it('does not expose unreviewed Facebook sources to staff', async () => {
    expect(await service.references(staff)).toEqual([]);
    expect(await service.references(admin)).toHaveLength(1);
  });
  it('blocks nonadministrators from rights decisions even when rights are declared', async () => {
    await expect(
      service.reviewReference('ref', 'hash', 'APPROVED', 'Checked', true, staff),
    ).rejects.toThrow();
    expect(repository.reviewReference).not.toHaveBeenCalled();
  });
  it('requires explicit rights confirmation rather than a source declaration', async () => {
    await expect(
      service.reviewReference('ref', 'hash', 'APPROVED', 'Checked', false, admin),
    ).rejects.toThrow();
    expect(repository.reviewReference).not.toHaveBeenCalled();
  });
  it('records the actual image digest for an explicit review', async () => {
    await service.reviewReference('ref', 'hash', 'APPROVED', 'Checked fixture', true, admin);
    expect(repository.reviewReference).toHaveBeenCalledWith(
      'ref',
      'hash',
      'APPROVED',
      'Checked fixture',
      [
        {
          storageKey: 'key',
          sha256: createHash('sha256').update(bytes).digest('hex'),
          mimeType: 'image/png',
        },
      ],
      admin,
      null,
    );
  });
  it('refuses metadata-only historical sources', async () => {
    const storage = {
      getAssetBuffer: () => Promise.resolve(null),
      getMetadata: () => Promise.resolve(null),
    } as unknown as AssetStoragePort;
    await expect(
      new BrandGuidanceService(repository, storage).reviewReference(
        'ref',
        'hash',
        'APPROVED',
        'Checked',
        true,
        admin,
      ),
    ).rejects.toThrow(/missing image/);
  });
  it('refuses changed bytes even with a declared license', async () => {
    const storage = {
      getAssetBuffer: () => Promise.resolve(bytes),
      getMetadata: () => Promise.resolve({ sha256Digest: '0'.repeat(64), mimeType: 'image/png' }),
    } as unknown as AssetStoragePort;
    await expect(
      new BrandGuidanceService(repository, storage).reviewReference(
        'ref',
        'hash',
        'APPROVED',
        'Checked',
        true,
        admin,
      ),
    ).rejects.toThrow(/integrity/);
  });
  it('refuses files whose format disagrees with metadata', async () => {
    const storage = {
      getAssetBuffer: () => Promise.resolve(bytes),
      getMetadata: () =>
        Promise.resolve({
          sha256Digest: createHash('sha256').update(bytes).digest('hex'),
          mimeType: 'image/jpeg',
        }),
    } as unknown as AssetStoragePort;
    await expect(
      new BrandGuidanceService(repository, storage).reviewReference(
        'ref',
        'hash',
        'APPROVED',
        'Checked',
        true,
        admin,
      ),
    ).rejects.toThrow(/format/);
  });
  it('requires a business-approved logo to be an actual PNG tagged logo', async () => {
    reference.status = 'APPROVED';
    reference.media = [
      {
        storageKey: 'key',
        sha256: createHash('sha256').update(bytes).digest('hex'),
        mimeType: 'image/png',
      },
    ];
    repository.list = () =>
      Promise.resolve([
        {
          id: 'profile',
          digest: 'digest',
          guidance: { referenceSourceIds: [], logoSourceId: 'ref' },
        } as unknown as GuidanceView,
      ]);
    await expect(service.approve('profile', 'digest', admin)).rejects.toThrow(/tagged logo/);
  });
  it('detects forged snapshot guidance rather than trusting only its recorded digest', async () => {
    const snapshot = {
      profileId: 'profile',
      digest: 'digest',
      references: [],
      guidance: { tone: 'Approved' },
    } as unknown as PinnedBrandGuidance;
    repository.pin = () => Promise.resolve(snapshot);
    await expect(
      service.verifyPinned({ ...snapshot, guidance: { ...snapshot.guidance, tone: 'Forged' } }),
    ).rejects.toThrow(/permission changed/);
  });
  it('rejects incomplete placeholder guidance rather than inventing official rules', async () => {
    await expect(service.create({ name: 'TODO_BUSINESS_CONFIRMATION' }, admin)).rejects.toThrow(
      /Complete the business guidance/,
    );
  });
});
