import { Injectable } from '@nestjs/common';
import {
  readPostCreationPlan,
  type ProductMarketingHistory,
  type RecentProductConcept,
  type PostActor,
} from '@parisian-shopper/application';
import { PrismaService } from '../prisma.service.js';
@Injectable()
export class PrismaProductMarketingHistory implements ProductMarketingHistory {
  constructor(private readonly prisma: PrismaService) {}
  async recent(
    sku: string,
    excludePostId: string | undefined,
    actor: PostActor,
  ): Promise<RecentProductConcept[]> {
    const visibleAll =
      actor.permissions.includes('VIEW_ALL_CONTENT') ||
      actor.permissions.includes('APPROVE_CONTENT');
    // One current revision per Post. Regeneration attempts are not business-post repetition.
    const posts = await this.prisma.post.findMany({
      where: {
        ...(excludePostId ? { id: { not: excludePostId } } : {}),
        ...(visibleAll ? {} : { creatorUserId: actor.id }),
        revisions: { some: { productSnapshot: { sku } } },
      },
      include: {
        revisions: {
          orderBy: { revisionNumber: 'desc' },
          take: 1,
          include: { productSnapshot: { select: { sku: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return posts.flatMap((p) => {
      const r = p.revisions[0];
      return r && r.productSnapshot.sku === sku
        ? [
            {
              postId: p.id,
              purpose: readPostCreationPlan(r.creationPlan).purpose,
              brief: r.brief,
              campaignId: r.campaignId,
              createdAt: p.createdAt.toISOString(),
              status: p.status,
            },
          ]
        : [];
    });
  }
}
