import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '../../auth/domain/permissions.js';
import {
  InsufficientBrandPermissionError,
  UnlicensedAssetIngestionError,
} from '../domain/brand-errors.js';
import type {
  BrandSourceArchiveRecord,
  IngestBrandSourceInput,
} from '../domain/brand-profile.types.js';
import { BRAND_SOURCE_REPOSITORY, type BrandSourceRepository } from './brand-source.repository.js';

@Injectable()
export class IngestBrandSourceUseCase {
  public constructor(
    @Inject(BRAND_SOURCE_REPOSITORY)
    private readonly brandSourceRepo: BrandSourceRepository,
  ) {}

  public async execute(input: IngestBrandSourceInput): Promise<BrandSourceArchiveRecord> {
    if (!input.permissions.includes(Permission.ADMIN)) {
      throw new InsufficientBrandPermissionError(Permission.ADMIN);
    }

    if (
      !input.copyrightDeclared ||
      !input.copyrightOwner ||
      input.copyrightOwner.trim().length === 0 ||
      !input.licenseReference ||
      input.licenseReference.trim().length === 0
    ) {
      throw new UnlicensedAssetIngestionError();
    }

    const sanitizedCaption = this.scrubPii(input.captionText);

    const sha256Hex = createHash('sha256')
      .update(`${input.sourceSystem}:${sanitizedCaption}:${input.licenseReference}`)
      .digest('hex');

    const existing = await this.brandSourceRepo.findBySha256(sha256Hex);
    if (existing) {
      return existing;
    }

    return this.brandSourceRepo.storeRawPost({
      sourceSystem: input.sourceSystem,
      externalPostId: input.externalPostId ?? null,
      captionText: input.captionText,
      sanitizedCaptionText: sanitizedCaption,
      copyrightDeclared: true,
      copyrightOwner: input.copyrightOwner.trim(),
      licenseReference: input.licenseReference.trim(),
      mediaCasKeys: input.mediaCasKeys ?? [],
      tags: input.tags ?? [],
      sha256Hex,
      ingestedByUserId: input.actorUserId,
    });
  }

  private scrubPii(text: string): string {
    return (
      text
        // Redact email addresses
        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]')
        // Redact phone numbers (Cambodian with/without spaces/dots/hyphens, and international formats)
        .replace(/(?:\+?855[\s.-]?|0)[1-9](?:[\s.-]?\d){7,8}\b/g, '[REDACTED_PHONE]')
        .replace(
          /\b(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/g,
          '[REDACTED_PHONE]',
        )
        // Redact social handles
        .replace(/@[a-zA-Z0-9_.-]+/g, '[REDACTED_HANDLE]')
        // Redact telegram links
        .replace(/t\.me\/[a-zA-Z0-9_]+/gi, '[REDACTED_LINK]')
        .trim()
    );
  }
}
