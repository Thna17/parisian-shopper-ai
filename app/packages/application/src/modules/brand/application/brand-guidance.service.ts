import { canonicalJson } from '../../products/application/product-snapshot-hash.js';
import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { ForbiddenError, ValidationError, ConflictError } from '@parisian-shopper/common';
import {
  ASSET_STORAGE,
  type AssetStoragePort,
} from '../../creative/application/asset-storage.port.js';
import type { PostActor } from '../../posts/post-policy.js';
import {
  brandGuidanceInputSchema,
  brandReferenceInputSchema,
  type PinnedBrandGuidance,
  type ReferenceSnapshot,
} from '../domain/brand-guidance.schema.js';
import {
  BRAND_GUIDANCE_REPOSITORY,
  type BrandGuidanceRepository,
  type BrandReferenceInput,
  type GuidanceView,
  type ReferenceView,
} from './brand-guidance.repository.js';
const admin = (actor: PostActor): void => {
  if (!actor.permissions.includes('ADMIN'))
    throw new ForbiddenError({
      publicMessage: 'Only administrators can change brand guidance or review source rights.',
    });
};
@Injectable()
export class BrandGuidanceService {
  constructor(
    @Inject(BRAND_GUIDANCE_REPOSITORY) private readonly repository: BrandGuidanceRepository,
    @Inject(ASSET_STORAGE) private readonly storage: AssetStoragePort,
  ) {}
  private read(actor: PostActor): void {
    if (!actor.permissions.includes('VIEW_OWN_CONTENT'))
      throw new ForbiddenError({ publicMessage: 'You cannot access brand guidance.' });
  }
  async list(actor: PostActor): Promise<GuidanceView[]> {
    this.read(actor);
    return (await this.repository.list()).filter(
      (p) => actor.permissions.includes('ADMIN') || (p.status === 'ACTIVE' && p.approvalId),
    );
  }
  async references(actor: PostActor): Promise<ReferenceView[]> {
    this.read(actor);
    return (await this.repository.references()).filter(
      (r) => actor.permissions.includes('ADMIN') || r.status === 'APPROVED',
    );
  }
  async create(value: unknown, actor: PostActor): Promise<GuidanceView> {
    admin(actor);
    const parsed = brandGuidanceInputSchema.safeParse(value);
    if (!parsed.success)
      throw new ValidationError({
        publicMessage: `Complete the business guidance: ${parsed.error.issues
          .slice(0, 4)
          .map((issue) => `${issue.path.join('.') || 'guidance'}: ${issue.message}`)
          .join('; ')}`,
        cause: parsed.error,
      });
    return this.repository.create(parsed.data, actor);
  }
  async approve(id: string, digest: string, actor: PostActor): Promise<GuidanceView> {
    admin(actor);
    const profile = (await this.repository.list()).find((p) => p.id === id);
    if (!profile || profile.digest !== digest)
      throw new ConflictError({
        publicMessage: 'Refresh and preview the exact version before approving.',
      });
    for (const sourceId of [
      ...profile.guidance.referenceSourceIds,
      ...(profile.guidance.logoSourceId ? [profile.guidance.logoSourceId] : []),
    ]) {
      const r = (await this.repository.references()).find((s) => s.id === sourceId);
      if (!r || r.status !== 'APPROVED')
        throw new ValidationError({
          publicMessage:
            'Review and approve each selected image and its rights before approving the brand profile.',
        });
      await this.verifyMedia(r.media);
    }
    if (profile.guidance.logoSourceId) {
      const logo = (await this.repository.references()).find(
        (r) => r.id === profile.guidance.logoSourceId,
      );
      if (!logo?.tags.includes('logo') || logo.media[0]?.mimeType !== 'image/png')
        throw new ValidationError({
          publicMessage:
            'Select a reviewed PNG tagged logo, or choose explicit text-only branding.',
        });
    }
    return this.repository.approve(id, digest, actor);
  }
  async upload(
    bytes: Buffer,
    mime: string,
    actor: PostActor,
  ): Promise<{ storageKey: string; sha256: string; mimeType: string }> {
    admin(actor);
    if (bytes.length > 512000 || !bytes.length)
      throw new ValidationError({
        publicMessage: 'Upload a PNG, JPEG or WebP image up to 500 KB.',
      });
    let meta: sharp.Metadata;
    try {
      meta = await sharp(bytes, { limitInputPixels: 20000000 }).metadata();
    } catch (error) {
      throw new ValidationError({
        publicMessage: 'This file is not a supported readable image.',
        cause: error,
      });
    }
    const formats: Record<string, string> = {
      png: 'image/png',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
    };
    const actual = formats[meta.format ?? ''];
    if (!actual || actual !== mime)
      throw new ValidationError({
        publicMessage: 'Image bytes and MIME type must match PNG, JPEG or WebP.',
      });
    if (!meta.width || !meta.height)
      throw new ValidationError({ publicMessage: 'Image dimensions are missing.' });
    const stored = await this.storage.saveAsset({
      buffer: bytes,
      mimeType: actual,
      assetRole: 'PREVIEW',
      width: meta.width,
      height: meta.height,
    });
    return { storageKey: stored.storageKey, sha256: stored.sha256Digest, mimeType: actual };
  }
  async createReference(input: BrandReferenceInput, actor: PostActor): Promise<ReferenceView> {
    admin(actor);
    try {
      input = brandReferenceInputSchema.parse(input);
    } catch (error) {
      throw new ValidationError({
        publicMessage: 'Provide valid source details and saved images.',
        cause: error,
      });
    }
    if (
      !['FACEBOOK', 'INSTAGRAM', 'BRAND_GUIDELINES', 'CAMPAIGN_COLLATERAL'].includes(
        input.sourceSystem,
      ) ||
      input.captionText.length > 10000 ||
      input.tags.length > 30 ||
      input.tags.some((t) => typeof t !== 'string' || t.length > 80) ||
      !input.mediaCasKeys.length ||
      input.mediaCasKeys.length > 4 ||
      input.copyrightOwner.length > 200 ||
      input.licenseReference.length > 200
    )
      throw new ValidationError({
        publicMessage: 'Provide source details, tags and one to four saved images.',
      });
    try {
      const url = new URL(input.sourceUrl);
      if (
        !['https:', 'http:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        input.sourceUrl.length > 2048
      )
        throw new Error('Invalid source');
    } catch (error) {
      throw new ValidationError({
        publicMessage:
          'Provide the original source or internal document URL. It is recorded only; nothing will be fetched.',
        cause: error,
      });
    }
    await this.inspectKeys(input.mediaCasKeys);
    return this.repository.createReference(input, actor);
  }
  async reviewReference(
    id: string,
    digest: string,
    decision: 'APPROVED' | 'REJECTED' | 'REVOKED',
    notes: string,
    rightsConfirmed: boolean,
    actor: PostActor,
    expectedReviewEventId?: string | null,
  ): Promise<ReferenceView> {
    admin(actor);
    if (
      !['APPROVED', 'REJECTED', 'REVOKED'].includes(decision) ||
      notes.trim().length < 3 ||
      notes.length > 1000
    )
      throw new ValidationError({
        publicMessage: 'Choose a review decision and provide a short reason.',
      });
    const source = (await this.repository.references()).find((r) => r.id === id);
    if (!source) throw new ValidationError({ publicMessage: 'Reference not found.' });
    if (expectedReviewEventId !== undefined && source.reviewEventId !== expectedReviewEventId)
      throw new ConflictError({
        publicMessage: 'The reference review changed. Refresh before deciding.',
      });
    if (decision === 'APPROVED' && (!rightsConfirmed || !source.sourceUrl))
      throw new ValidationError({
        publicMessage:
          'Confirm you reviewed the source and permission to use this image. A Facebook URL or copyright declaration alone is not approval.',
      });
    const media =
      decision === 'APPROVED' ? await this.inspectKeys(source.mediaCasKeys) : source.media;
    return this.repository.reviewReference(
      id,
      digest,
      decision,
      notes,
      media,
      actor,
      source.reviewEventId,
    );
  }
  private async inspectKeys(keys: readonly string[]): Promise<ReferenceSnapshot['media']> {
    return Promise.all(
      keys.map(async (storageKey) => {
        const meta = await this.storage.getMetadata(storageKey);
        const bytes = await this.storage.getAssetBuffer(storageKey);
        if (!bytes || !meta)
          throw new ValidationError({
            publicMessage:
              'The source contains metadata only or a missing image. Upload actual image bytes before review.',
          });
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        let dimensions: sharp.Metadata;
        try {
          dimensions = await sharp(bytes, { limitInputPixels: 20000000 }).metadata();
        } catch (error) {
          throw new ValidationError({
            publicMessage:
              'This historical image cannot be read. Upload a supported PNG, JPEG or WebP as a new reference version.',
            cause: error,
          });
        }
        const formats: Record<string, string> = {
          png: 'image/png',
          jpeg: 'image/jpeg',
          webp: 'image/webp',
        };
        if (
          !dimensions.width ||
          !dimensions.height ||
          formats[dimensions.format ?? ''] !== meta.mimeType
        )
          throw new ValidationError({
            publicMessage:
              'Reference must contain supported image bytes matching its declared format.',
          });
        if (sha256 !== meta.sha256Digest)
          throw new ValidationError({ publicMessage: 'Reference image integrity check failed.' });
        return { storageKey, sha256, mimeType: meta.mimeType };
      }),
    );
  }
  private async verifyMedia(media: ReferenceSnapshot['media']): Promise<void> {
    for (const image of media) {
      const bytes = await this.storage.getAssetBuffer(image.storageKey);
      if (!bytes || createHash('sha256').update(bytes).digest('hex') !== image.sha256)
        throw new ValidationError({
          publicMessage: 'An approved image is missing or changed. Review the reference again.',
        });
    }
  }
  async pin(id: string, ids: string[], actor: PostActor): Promise<PinnedBrandGuidance> {
    this.read(actor);
    const profile = (await this.repository.list()).find((p) => p.id === id);
    if (profile?.status !== 'ACTIVE')
      throw new ValidationError({
        publicMessage: 'Choose the current business-approved profile for a new caption.',
      });
    const pinned = await this.repository.pin(id, ids);
    await this.verifyPinned(pinned);
    return pinned;
  }
  async verifyPinned(snapshot: PinnedBrandGuidance): Promise<void> {
    const current = await this.repository.pin(
      snapshot.profileId,
      snapshot.references.map((r) => r.sourceId),
    );
    if (canonicalJson(current) !== canonicalJson(snapshot))
      throw new ConflictError({
        publicMessage:
          'Brand guidance or reference permission changed. Prepare and review a new draft rather than silently replacing its provenance.',
      });
    await this.verifyMedia(snapshot.references.flatMap((r) => r.media));
    if (snapshot.logo) await this.verifyMedia(snapshot.logo.media);
  }
  async image(
    id: string,
    index: number,
    actor: PostActor,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    this.read(actor);
    const ref = (await this.references(actor)).find((r) => r.id === id);
    if (!ref || !Number.isInteger(index) || index < 0 || index >= ref.mediaCasKeys.length)
      throw new ValidationError({ publicMessage: 'Reference image not available.' });
    const key = ref.mediaCasKeys[index]!;
    const media = (await this.inspectKeys([key]))[0]!;
    const buffer = (await this.storage.getAssetBuffer(key))!;
    return { buffer, mimeType: media.mimeType };
  }
  async logo(snapshot: PinnedBrandGuidance): Promise<Buffer | undefined> {
    await this.verifyPinned(snapshot);
    return snapshot.logo
      ? ((await this.storage.getAssetBuffer(snapshot.logo.media[0]!.storageKey)) ?? undefined)
      : undefined;
  }
}
