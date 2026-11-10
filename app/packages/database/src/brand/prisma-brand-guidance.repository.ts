import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConflictError, ForbiddenError, ValidationError } from '@parisian-shopper/common';
import {
  canonicalJson,
  sanitizeBrandSourceCaption,
  brandGuidanceInputSchema,
  type BrandGuidanceRepository,
  type BrandGuidanceInput,
  type GuidanceView,
  type ReferenceView,
  type ReferenceSnapshot,
  type BrandReferenceInput,
  type PinnedBrandGuidance,
  type PostActor,
} from '@parisian-shopper/application';
import { PrismaService } from '../prisma.service.js';
import { PrismaBrandProfileRepository } from './prisma-brand-profile.repository.js';
import { PrismaBrandRuleRepository } from './prisma-brand-rule.repository.js';
const digest = (v: unknown): string => createHash('sha256').update(canonicalJson(v)).digest('hex');
const json = (v: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const admin = (actor: PostActor): void => {
  if (!actor.permissions.includes('ADMIN'))
    throw new ForbiddenError({
      publicMessage: 'An administrator must manage and approve brand guidance.',
    });
};
@Injectable()
export class PrismaBrandGuidanceRepository implements BrandGuidanceRepository {
  constructor(private readonly prisma: PrismaService) {}
  async list(): Promise<GuidanceView[]> {
    const rows = await this.prisma.brandProfileVersion.findMany({
      where: { guidance: { not: Prisma.DbNull } },
      orderBy: [{ createdAt: 'desc' }],
    });
    return Promise.all(
      rows.map(async (r) => {
        const input = brandGuidanceInputSchema.parse(r.guidance);
        const value = {
          profileId: r.id,
          versionNumber: r.versionNumber,
          input,
          ruleVersionId: r.guidanceRuleVersionId,
          datasetVersionId: r.guidanceDatasetVersionId,
        };
        const hash = digest(value);
        const approval = await this.prisma.brandProfileApproval.findUnique({
          where: { profileId_digest: { profileId: r.id, digest: hash } },
        });
        return {
          id: r.id,
          name: r.name,
          versionNumber: r.versionNumber,
          status: r.status,
          guidance: input,
          ruleVersionId: r.guidanceRuleVersionId!,
          datasetVersionId: r.guidanceDatasetVersionId!,
          digest: hash,
          approvalId: approval?.id ?? null,
          benchmarkReport: approval
            ? ((approval.snapshot as { benchmarkReport?: unknown }).benchmarkReport ?? null)
            : r.benchmarkReport,
          createdByUserId: approval
            ? ((approval.snapshot as { createdByUserId?: string }).createdByUserId ??
              r.approvedByUserId)
            : r.approvedByUserId,
        };
      }),
    );
  }
  async create(input: BrandGuidanceInput, actor: PostActor): Promise<GuidanceView> {
    admin(actor);
    const parsed = brandGuidanceInputSchema.parse(input);
    const id = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`brand-guidance:${parsed.name}`},0))`;
      const profiles = new PrismaBrandProfileRepository(tx as unknown as PrismaService);
      const latest = await tx.brandProfileVersion.findFirst({
        where: { name: parsed.name },
        orderBy: { versionNumber: 'desc' },
      });
      const number = (latest?.versionNumber ?? 0) + 1;
      const rule = await new PrismaBrandRuleRepository(tx as unknown as PrismaService).create({
        name: `${parsed.name} · caption rules`,
        version: number,
        status: 'DRAFT',
        rules: parsed.captionRules,
      });
      const dataset = await tx.brandDatasetVersion.create({
        data: {
          name: `${parsed.name} · references`,
          versionString: `profile-${randomUUID()}`,
          status: 'CURATING',
          sourceArchiveIds: parsed.referenceSourceIds,
          assetCount: parsed.referenceSourceIds.length,
        },
      });
      const profile = await profiles.createDraft({
        name: parsed.name,
        evaluationPolicyId: 'default-anti-regurgitation-policy-v1',
        languagePolicy: {
          formality: parsed.formality,
          primaryLanguage: 'BILINGUAL',
          khmerConventions: {
            scriptStyle: 'Noto Sans Khmer',
            spacingRules: parsed.khmerTone,
            disallowedLoanwords: [],
          },
          englishConventions: { tone: parsed.tone, capitalization: parsed.capitalization },
        },
        toneRules: {
          luxuryAttributes: [parsed.tone],
          prohibitedHyperbole: parsed.claimsRestrictions,
          allowedEmojis: [],
          maxEmojisPerPost: parsed.emojiLimit,
        },
        visualAestheticRules: {
          approvedColorPalettes: [{ name: 'Business-provided palette', hexCodes: parsed.colors }],
          lightingStyles: [parsed.lighting],
          textures: [],
          pedestals: [],
        },
        typographyRules: {
          headlineFont: parsed.headlineFont,
          bodyFontKhmer: parsed.khmerFont,
          bodyFontLatin: parsed.englishFont,
          minimumLeadingRatio: 1.4,
        },
        logoRules: {
          clearSpaceRatio: 0.25,
          allowedPlacements: ['TOP_LEFT'],
          defaultVariant: 'AS_UPLOADED',
        },
        approvedExampleIds: parsed.referenceSourceIds,
        prohibitedPatterns: parsed.claimsRestrictions,
        approvedByUserId: actor.id,
      });
      await tx.brandProfileVersion.update({
        where: { id: profile.id },
        data: {
          guidance: json(parsed),
          guidanceRuleVersionId: rule.id,
          guidanceDatasetVersionId: dataset.id,
        },
      });
      return profile.id;
    });
    return (await this.list()).find((r) => r.id === id)!;
  }
  async references(): Promise<ReferenceView[]> {
    const rows = await this.prisma.brandSourceArchive.findMany({
      include: { reviewEvents: { orderBy: { sequence: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => {
      const review = r.reviewEvents[0];
      return {
        id: r.id,
        sourceUrl: r.sourceUrl,
        sourceSystem: r.sourceSystem,
        captionText: r.sanitizedCaptionText,
        copyrightDeclared: r.copyrightDeclared,
        copyrightOwner: r.copyrightOwner,
        licenseReference: r.licenseReference,
        tags: r.tags,
        mediaCasKeys: r.mediaCasKeys,
        version: r.referenceVersion,
        groupId: r.referenceGroupId,
        status: review?.decision ?? 'UNREVIEWED',
        reviewEventId: review?.id ?? null,
        sourceDigest: r.sha256Hex,
        media: (review?.mediaSnapshot ?? []) as unknown as ReferenceSnapshot['media'],
        reviewHistory: r.reviewEvents.map((e) => ({
          id: e.id,
          decision: e.decision,
          notes: e.notes,
          actorUserId: e.actorUserId,
          createdAt: e.createdAt.toISOString(),
        })),
        history: rows
          .filter((s) => (s.referenceGroupId ?? s.id) === (r.referenceGroupId ?? r.id))
          .map((s) => ({ id: s.id, version: s.referenceVersion })),
      };
    });
  }
  async createReference(input: BrandReferenceInput, actor: PostActor): Promise<ReferenceView> {
    admin(actor);
    const id = await this.prisma.$transaction(async (tx) => {
      let group: string = randomUUID();
      let version = 1;
      if (input.previousSourceId) {
        const previous = await tx.brandSourceArchive.findUniqueOrThrow({
          where: { id: input.previousSourceId },
        });
        group = previous.referenceGroupId ?? previous.id;
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${group},0))`;
        const latest = await tx.brandSourceArchive.findFirst({
          where: { OR: [{ referenceGroupId: group }, { id: group }] },
          orderBy: { referenceVersion: 'desc' },
        });
        version = (latest?.referenceVersion ?? 1) + 1;
      }
      const caption = sanitizeBrandSourceCaption(input.captionText);
      const record = await tx.brandSourceArchive.create({
        data: {
          sourceSystem: input.sourceSystem,
          sourceUrl: input.sourceUrl,
          captionText: input.captionText,
          sanitizedCaptionText: caption,
          copyrightDeclared: input.copyrightDeclared,
          copyrightOwner: input.copyrightOwner,
          licenseReference: input.licenseReference,
          tags: input.tags,
          mediaCasKeys: input.mediaCasKeys,
          referenceGroupId: group,
          referenceVersion: version,
          sha256Hex: digest({ ...input, caption }),
          ingestedByUserId: actor.id,
        },
      });
      return record.id;
    });
    return (await this.references()).find((r) => r.id === id)!;
  }
  async reviewReference(
    id: string,
    hash: string,
    decision: 'APPROVED' | 'REJECTED' | 'REVOKED',
    notes: string,
    media: ReferenceSnapshot['media'],
    actor: PostActor,
    expectedReviewEventId?: string | null,
  ): Promise<ReferenceView> {
    admin(actor);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM brand_source_archives WHERE id=${id}::uuid FOR UPDATE`;
      const source = await tx.brandSourceArchive.findUniqueOrThrow({ where: { id } });
      if (source.sha256Hex !== hash)
        throw new ConflictError({
          publicMessage: 'The reference changed. Preview its current version before reviewing.',
        });
      if (
        decision === 'APPROVED' &&
        (!source.copyrightDeclared ||
          !source.copyrightOwner.trim() ||
          !source.licenseReference.trim() ||
          !media.length)
      )
        throw new ValidationError({
          publicMessage:
            'Verify source, image bytes, ownership and permission before approving this reference.',
        });
      const last = await tx.brandSourceReview.findFirst({
        where: { sourceId: id },
        orderBy: { sequence: 'desc' },
      });
      if (expectedReviewEventId !== undefined && (last?.id ?? null) !== expectedReviewEventId)
        throw new ConflictError({
          publicMessage: 'The reference review changed. Refresh before deciding.',
        });
      if (last?.decision === decision && last.sourceDigest === hash) return;
      await tx.brandSourceReview.create({
        data: {
          sourceId: id,
          sourceDigest: hash,
          decision,
          notes,
          mediaSnapshot: json(media),
          actorUserId: actor.id,
          sequence: (last?.sequence ?? 0) + 1,
        },
      });
    });
    return (await this.references()).find((r) => r.id === id)!;
  }
  private reference(r: ReferenceView | undefined): ReferenceSnapshot {
    if (
      !r ||
      r.status !== 'APPROVED' ||
      !r.reviewEventId ||
      !r.copyrightDeclared ||
      !r.media.length
    )
      throw new ValidationError({
        publicMessage:
          'Only explicitly approved references with verified rights and saved images can be used. Review the library first.',
      });
    return {
      sourceId: r.id,
      version: r.version,
      sourceUrl: r.sourceUrl,
      sourceDigest: r.sourceDigest,
      reviewEventId: r.reviewEventId,
      captionText: r.captionText,
      tags: r.tags,
      media: r.media,
      copyrightOwner: r.copyrightOwner,
      licenseReference: r.licenseReference,
    };
  }
  async pin(id: string, referenceIds: string[]): Promise<PinnedBrandGuidance> {
    const p = (await this.list()).find((r) => r.id === id);
    if (!p || !p.approvalId || !['ACTIVE', 'RETIRED'].includes(p.status))
      throw new ValidationError({
        publicMessage:
          'Select a business-approved brand profile. Legacy activation or a draft is not an approved brand pack.',
      });
    if (
      new Set(referenceIds).size !== referenceIds.length ||
      referenceIds.some((ref) => !p.guidance.referenceSourceIds.includes(ref))
    )
      throw new ValidationError({
        publicMessage: 'Select only references approved for this profile version.',
      });
    const rule = await new PrismaBrandRuleRepository(this.prisma).findById(p.ruleVersionId);
    const dataset = await this.prisma.brandDatasetVersion.findUnique({
      where: { id: p.datasetVersionId },
    });
    if (
      !rule ||
      canonicalJson(rule.rules) !== canonicalJson(p.guidance.captionRules) ||
      !dataset ||
      canonicalJson(dataset.sourceArchiveIds) !== canonicalJson(p.guidance.referenceSourceIds)
    )
      throw new ConflictError({
        publicMessage:
          'Linked rules or reference collection changed. Prepare a new reviewed brand version.',
      });
    const sources = await this.references();
    const references = referenceIds.map((ref) => this.reference(sources.find((r) => r.id === ref)));
    const logo = p.guidance.logoSourceId
      ? this.reference(sources.find((r) => r.id === p.guidance.logoSourceId))
      : null;
    const { captionRules: _rules, referenceSourceIds: _refs, ...guidance } = p.guidance;
    return {
      profileId: p.id,
      versionNumber: p.versionNumber,
      name: p.name,
      digest: p.digest,
      approvalId: p.approvalId,
      ruleVersionId: p.ruleVersionId,
      datasetVersionId: p.datasetVersionId,
      guidance,
      references,
      logo,
      benchmarkReport:
        (
          (
            await this.prisma.brandProfileApproval.findUniqueOrThrow({
              where: { id: p.approvalId },
            })
          ).snapshot as { benchmarkReport?: unknown }
        ).benchmarkReport ?? null,
    };
  }
  async approve(id: string, hash: string, actor: PostActor): Promise<GuidanceView> {
    admin(actor);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended('brand-guidance-activation',0))`;
      await tx.$queryRaw`SELECT id FROM brand_profile_versions WHERE id=${id}::uuid FOR UPDATE`;
      const view = (
        await new PrismaBrandGuidanceRepository(tx as unknown as PrismaService).list()
      ).find((p) => p.id === id);
      if (!view || view.digest !== hash)
        throw new ConflictError({
          publicMessage: 'The profile changed. Review the current preview before approving.',
        });
      if (view.status === 'ACTIVE' && view.approvalId) return;
      if (!['DRAFT', 'PENDING_SIGN_OFF', 'BENCHMARKING'].includes(view.status))
        throw new ConflictError({
          publicMessage: 'Create a new draft to approve another brand version.',
        });
      const repo = new PrismaBrandGuidanceRepository(tx as unknown as PrismaService);
      for (const sourceId of [
        ...new Set([
          ...view.guidance.referenceSourceIds,
          ...(view.guidance.logoSourceId ? [view.guidance.logoSourceId] : []),
        ]),
      ].sort())
        await tx.$queryRaw`SELECT id FROM brand_source_archives WHERE id=${sourceId}::uuid FOR UPDATE`;
      const sources = await repo.references();
      for (const ref of view.guidance.referenceSourceIds)
        repo.reference(sources.find((r) => r.id === ref));
      if (view.guidance.logoSourceId)
        repo.reference(sources.find((r) => r.id === view.guidance.logoSourceId));
      const rules = await new PrismaBrandRuleRepository(tx as unknown as PrismaService).findById(
        view.ruleVersionId,
      );
      if (!rules || canonicalJson(rules.rules) !== canonicalJson(view.guidance.captionRules))
        throw new ConflictError({
          publicMessage: 'Linked caption rules changed. Create and review a new version.',
        });
      const rulesDigest = digest(rules.rules);
      const old = await tx.postCaptionBrandApproval.findUnique({
        where: {
          brandRuleVersionId_rulesDigest: {
            brandRuleVersionId: rules.id,
            rulesDigest: rulesDigest,
          },
        },
      });
      if (!old)
        await tx.postCaptionBrandApproval.create({
          data: {
            brandRuleVersionId: rules.id,
            rulesDigest,
            rulesSnapshot: json(rules.rules),
            approvedByUserId: actor.id,
          },
        });
      await tx.brandDatasetVersion.update({
        where: { id: view.datasetVersionId },
        data: { status: 'ACTIVE', approvedByUserId: actor.id },
      });
      await tx.brandProfileVersion.updateMany({
        where: { status: 'ACTIVE' },
        data: { status: 'RETIRED' },
      });
      await tx.brandProfileApproval.create({
        data: { profileId: id, digest: hash, snapshot: json(view), actorUserId: actor.id },
      });
      await tx.brandProfileVersion.update({
        where: { id },
        data: { status: 'ACTIVE', approvedByUserId: actor.id, activatedAt: new Date() },
      });
    });
    return (await this.list()).find((p) => p.id === id)!;
  }
}
