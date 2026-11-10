import { Inject, Injectable } from '@nestjs/common';
import { ConflictError } from '@parisian-shopper/common';
import {
  CONTENT_GENERATION_REPOSITORY,
  type ContentGenerationRepository,
} from '../../content/application/content-generation.repository.js';
import {
  ProductMarketingEligibilityService,
  type MarketingProductAction,
} from '../../products/application/product-marketing-eligibility.service.js';
import type { PostActor } from '../../posts/post-policy.js';
@Injectable()
export class PublicationProductGuard {
  constructor(
    @Inject(CONTENT_GENERATION_REPOSITORY) private readonly content: ContentGenerationRepository,
    private readonly products: ProductMarketingEligibilityService,
  ) {}
  async check(versionId: string, action: MarketingProductAction, actor: PostActor): Promise<void> {
    const version = await this.content.findVersionById(versionId);
    if (!version)
      throw new ConflictError({
        publicMessage: 'The saved caption version is missing. Choose an approved version again.',
      });
    const job = await this.content.findJobById(version.contentJobId);
    if (!job)
      throw new ConflictError({
        publicMessage: 'Product context is missing; release cannot proceed.',
      });
    const purpose =
      job.contentType === 'SCENT_PYRAMID'
        ? 'EDUCATIONAL'
        : ['PROMOTION', 'EDUCATIONAL'].includes(job.contentType)
          ? job.contentType
          : 'PRODUCT_SPOTLIGHT';
    await this.products.assert(
      {
        snapshotId: version.productSnapshotId,
        creationPlan: {
          purpose,
          ...(job.contentType === 'SCENT_PYRAMID' ? { educationMode: 'FRAGRANCE_NOTES' } : {}),
        },
        campaignId: job.campaignId ?? null,
        caption: version.structuredOutput,
        action,
      },
      actor,
    );
  }
}
