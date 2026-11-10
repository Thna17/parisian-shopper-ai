import { DeterministicFactualValidator } from '../../validation/domain/factual-validator.js';
import { marketingSafeSnapshot } from './product-marketing-facts.js';
import type { AIContentOutput } from '../../ai/domain/ai-output.schema.js';
import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  CLOCK,
  SystemClock,
  ConflictError,
  ValidationError,
  type Clock,
} from '@parisian-shopper/common';
import { AppConfigService } from '@parisian-shopper/config';
import {
  FRESHNESS_POLICY_REPOSITORY,
  type FreshnessPolicyRepository,
} from '../domain/freshness-policy.js';
import { FreshnessEvaluator } from '../domain/freshness-evaluator.js';
import { SourceAvailability } from '../domain/freshness-state.js';
import {
  normalizedProductEnvelopeSchema,
  type NormalizedProductEnvelope,
} from '../domain/product.schema.js';
import { PromotionStrategy, ScentPyramidStrategy } from '../../content/domain/content-strategy.js';
import { readPostCreationPlan } from '../../posts/post-creation-plan.js';
import type { PostActor } from '../../posts/post-policy.js';
import {
  PRODUCT_SNAPSHOT_REPOSITORY,
  PRODUCT_NORMALIZER_VERSION,
  type ProductSnapshotRepository,
} from './product-snapshot.repository.js';
import { PRODUCT_SOURCE, type ProductSource } from './product-source.port.js';
import {
  PRODUCT_FRESHNESS_ASSESSMENT_REPOSITORY,
  type ProductFreshnessAssessmentRepository,
} from './product-freshness-assessment.repository.js';
import {
  calculateProductDependencyHashes,
  ALL_PRODUCT_DEPENDENCY_SCOPES,
  type ProductDependencyScope,
} from './product-snapshot-hash.js';
import {
  PRODUCT_MARKETING_HISTORY,
  type ProductMarketingHistory,
  type RecentProductConcept,
} from './product-marketing-history.port.js';
export type MarketingProductAction =
  'DRAFT' | 'GENERATE' | 'REVIEW' | 'EXPORT' | 'SCHEDULE' | 'PUBLISH';
export interface MarketingProductInput {
  snapshotId: string;
  creationPlan?: unknown;
  brief?: string;
  campaignId?: string | null;
  postId?: string;
  action: MarketingProductAction;
  recheck?: boolean;
  caption?: AIContentOutput | null;
}
export interface ProductMarketingCheck {
  assessmentId: string | null;
  eligible: boolean;
  action: MarketingProductAction;
  snapshotId: string;
  issues: { code: string; message: string; alternatives: string[]; blocking: boolean }[];
  source: {
    system: string;
    url: string | null;
    asOf: string;
    sourceUpdatedAt: string;
    checkedAt: string | null;
    status: 'CACHED' | 'AVAILABLE' | 'UNAVAILABLE' | 'MOCK';
    freshness: string;
  };
  policy: { id: string; version: string; hash: string; stockAction: string | null } | null;
  changedScopes: ProductDependencyScope[];
  currentSnapshotId: string | null;
  historyWarnings: { code: string; message: string; postId: string }[];
}
const concept = (value: string): string =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase('und')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim();
export function productConceptWarnings(
  rows: RecentProductConcept[],
  brief: string,
  purpose: string,
  campaignId?: string | null,
): ProductMarketingCheck['historyWarnings'] {
  return rows.map((row) => ({
    postId: row.postId,
    code:
      campaignId && row.campaignId === campaignId
        ? 'CAMPAIGN_REPEAT'
        : concept(brief) && concept(brief) === concept(row.brief) && purpose === row.purpose
          ? 'CONCEPT_REPEAT'
          : 'RECENT_PRODUCT',
    message:
      campaignId && row.campaignId === campaignId
        ? 'This product already has a post in this campaign. Repeating it may be intentional; check the previous angle before continuing.'
        : concept(brief) && concept(brief) === concept(row.brief) && purpose === row.purpose
          ? 'A recent post uses the same product and concept. Consider a different angle, or continue for an intentional repeat.'
          : 'This product has recent content. Check its previous posts to avoid repeating the same message.',
  }));
}
@Injectable()
export class ProductMarketingEligibilityService {
  private readonly clock: Clock;
  constructor(
    @Inject(PRODUCT_SNAPSHOT_REPOSITORY) private readonly snapshots: ProductSnapshotRepository,
    @Inject(FRESHNESS_POLICY_REPOSITORY) private readonly policies: FreshnessPolicyRepository,
    @Inject(PRODUCT_SOURCE) private readonly source: ProductSource,
    @Inject(PRODUCT_FRESHNESS_ASSESSMENT_REPOSITORY)
    private readonly assessments: ProductFreshnessAssessmentRepository,
    @Inject(PRODUCT_MARKETING_HISTORY) private readonly history: ProductMarketingHistory,
    private readonly config: AppConfigService,
    @Optional() @Inject(CLOCK) clock?: Clock,
  ) {
    this.clock = clock ?? new SystemClock();
  }
  async check(input: MarketingProductInput, actor: PostActor): Promise<ProductMarketingCheck> {
    const snapshot = await this.snapshots.findById(input.snapshotId);
    if (!snapshot)
      throw new ValidationError({
        publicMessage: 'Product facts are missing. Choose a product from the catalog again.',
      });
    const plan = readPostCreationPlan(input.creationPlan),
      now = this.clock.now();
    const policy = await this.policies.findActivePolicy(this.config.nodeEnvironment, now);
    const result: ProductMarketingCheck = {
      assessmentId: null,
      eligible: true,
      action: input.action,
      snapshotId: snapshot.id,
      issues: [],
      source: {
        system: snapshot.product.source_system,
        url: snapshot.product.product.product_url ?? null,
        asOf: snapshot.product.retrieved_at,
        sourceUpdatedAt: snapshot.product.source_updated_at,
        checkedAt: null,
        status: 'CACHED',
        freshness: 'NOT_CHECKED',
      },
      policy: policy
        ? {
            id: policy.policyId,
            version: policy.version,
            hash: policy.policyHash,
            stockAction: null,
          }
        : null,
      changedScopes: [],
      currentSnapshotId: null,
      historyWarnings: productConceptWarnings(
        await this.history.recent(snapshot.product.product.sku, input.postId, actor),
        input.brief ?? '',
        plan.purpose,
        input.campaignId,
      ),
    };
    const issue = (
      code: string,
      message: string,
      alternatives: string[],
      blocking = true,
    ): number => result.issues.push({ code, message, alternatives, blocking });
    if (!policy || policy.lifecycleState !== 'APPROVED')
      issue(
        'POLICY_MISSING',
        'No approved freshness policy is configured. Ask an administrator to approve one.',
        ['You can save and edit this draft.'],
      );
    const evaluator = new FreshnessEvaluator();
    let facts = snapshot.product,
      live: NormalizedProductEnvelope | null | undefined;
    if (input.recheck) {
      result.source.checkedAt = now.toISOString();
      let availability: SourceAvailability = SourceAvailability.AVAILABLE;
      try {
        const value = await this.source.getBySku(facts.product.sku);
        live = value === null ? null : normalizedProductEnvelopeSchema.parse(value);
        if (
          live &&
          (live.product.sku !== facts.product.sku ||
            Date.parse(live.retrieved_at) > this.clock.nowEpochMs())
        )
          throw new Error('Invalid source identity or timestamp');
      } catch {
        live = undefined;
        result.source.freshness = 'SOURCE_UNAVAILABLE';
        availability = SourceAvailability.UNREACHABLE;
        result.source.status = 'UNAVAILABLE';
        issue(
          'SOURCE_UNAVAILABLE',
          'The product source could not be checked. Saved facts have not been marked freshly verified.',
          ['Keep this draft and try the source check again later.'],
        );
      }
      const mock = /mock|fixture|fake/iu.test(this.source.adapterName);
      if (availability === 'AVAILABLE') {
        result.source.status = mock ? 'MOCK' : 'AVAILABLE';
        if (!live)
          issue('PRODUCT_UNAVAILABLE', 'The product no longer exists in the source.', [
            'Choose another product.',
          ]);
        else if (policy) {
          const evaluation = evaluator.evaluateRevalidation({
            snapshot,
            policy,
            clock: this.clock,
            sourceAvailability: availability,
            upstreamProduct: live,
          });
          result.changedScopes = [...evaluation.changedScopes];
          const decay = evaluator.evaluateTimeDecay({
            snapshot: { ...snapshot, product: live },
            policy,
            clock: this.clock,
          });
          result.source.freshness = decay.freshnessState;
          if (decay.freshnessState !== 'FRESH')
            issue(
              'SOURCE_DATA_STALE',
              'The source returned old product data; receiving a response does not make those facts fresh.',
              ['Ask the catalog owner to refresh the source.'],
            );
          if (result.changedScopes.length) {
            issue(
              'FACTS_CHANGED',
              `Product information changed: ${result.changedScopes.join(', ')}. Create a new revision using the latest facts, regenerate affected content and send it for review.`,
              ['Use the latest product facts in a new revision.'],
            );
            const candidate = await this.snapshots.findLatestBySku?.(facts.product.sku);
            const saved =
              candidate &&
              calculateProductDependencyHashes(candidate.product).full ===
                calculateProductDependencyHashes(live).full
                ? candidate
                : await this.snapshots.create({
                    product: live,
                    snapshotHash: calculateProductDependencyHashes(live).full,
                    dependencyHashes: calculateProductDependencyHashes(live),
                    normalizerVersion: PRODUCT_NORMALIZER_VERSION,
                  });
            result.currentSnapshotId = saved.id;
          }
        }
      }
      if (policy) {
        const evaluation = evaluator.evaluateRevalidation({
          snapshot,
          policy,
          clock: this.clock,
          sourceAvailability: availability,
          upstreamProduct: live ?? null,
        });
        const assessedState =
          availability === 'AVAILABLE' && live
            ? evaluator.evaluateTimeDecay({
                snapshot: { ...snapshot, product: live },
                policy,
                clock: this.clock,
              }).freshnessState
            : evaluation.freshnessState;
        const assessment = await this.assessments.create({
          snapshotId: snapshot.id,
          evaluatedAt: now,
          policyId: policy.policyId,
          policyVersion: policy.version,
          freshnessState: assessedState,
          revalidationOutcome: evaluation.revalidationOutcome,
          sourceAvailability: availability,
          reasonCodes: [
            ...evaluation.reasonCodes.filter(
              (code) => assessedState === 'FRESH' || code !== 'OK_FRESH',
            ),
            ...result.issues.filter((i) => i.blocking).map((i) => i.code),
          ],
          evidence: {
            action: input.action,
            sourceAdapter: this.source.adapterName,
            changedScopes: result.changedScopes,
            sourceRetrievedAt: live?.retrieved_at ?? null,
            currentSnapshotId: result.currentSnapshotId,
            sourceHashes: live ? calculateProductDependencyHashes(live) : null,
            postId: input.postId ?? null,
          },
          actorUserId: actor.id,
        });
        result.assessmentId = assessment.id;
      }
      if (live) facts = live;
      if (mock && this.config.nodeEnvironment === 'production')
        issue('MOCK_SOURCE', 'A test product source cannot authorize production release.', [
          'Configure the real product source.',
        ]);
    } else if (policy) {
      const latest = await this.assessments.findLatestForSnapshot(snapshot.id);
      if (latest) {
        result.assessmentId = latest.id;
        result.source.checkedAt = latest.evaluatedAt.toISOString();
        if (latest.sourceAvailability !== 'AVAILABLE') result.source.status = 'UNAVAILABLE';
        const hash = (latest.evidence.sourceHashes as { full?: string } | null)?.full;
        if (
          latest.sourceAvailability === 'AVAILABLE' &&
          hash === calculateProductDependencyHashes(snapshot.product).full &&
          typeof latest.evidence.sourceRetrievedAt === 'string'
        )
          facts = { ...snapshot.product, retrieved_at: latest.evidence.sourceRetrievedAt };
        if (latest.sourceAvailability !== 'AVAILABLE')
          issue(
            'SOURCE_UNAVAILABLE',
            'The last source check failed. These are cached facts, not fresh verification.',
            ['Retry the source check before generating or releasing.'],
          );
        if (hash && hash !== calculateProductDependencyHashes(snapshot.product).full) {
          result.changedScopes = Array.isArray(latest.evidence.changedScopes)
            ? latest.evidence.changedScopes.filter(
                (s): s is ProductDependencyScope =>
                  typeof s === 'string' &&
                  ALL_PRODUCT_DEPENDENCY_SCOPES.includes(s as ProductDependencyScope),
              )
            : [];
          result.currentSnapshotId =
            typeof latest.evidence.currentSnapshotId === 'string'
              ? latest.evidence.currentSnapshotId
              : null;
        }
        if (hash && hash !== calculateProductDependencyHashes(snapshot.product).full)
          issue(
            'FACTS_CHANGED',
            'The last check found changed product facts. Keep the approved version unchanged and create a new revision.',
            ['Check the source and use updated facts.'],
          );
      }
      result.source.freshness = evaluator.evaluateTimeDecay({
        snapshot: { ...snapshot, product: facts },
        policy,
        clock: this.clock,
      }).freshnessState;
      if (result.source.status === 'UNAVAILABLE' && result.source.freshness !== 'INVALID')
        result.source.freshness = 'SOURCE_UNAVAILABLE';
      if (result.source.freshness !== 'FRESH')
        issue(
          'SNAPSHOT_STALE',
          'These saved product facts need a source check before generating, approval or release.',
          ['Check the source. You can keep editing the draft.'],
        );
    }
    const product = facts.product;
    if (facts.lifecycle_status !== 'active' || product.stock_status === 'discontinued')
      issue('INACTIVE_PRODUCT', 'This product is inactive or discontinued.', [
        'Choose an active product.',
      ]);
    const stockAction =
      policy?.marketing?.stockActions[product.stock_status] ??
      (product.stock_status === 'in_stock' ? 'ALLOW' : null);
    if (result.policy) result.policy.stockAction = stockAction;
    if (stockAction === null)
      issue(
        'STOCK_POLICY_MISSING',
        `The product is ${product.stock_status.replaceAll('_', ' ')}. The business has not approved how this stock state should be marketed.`,
        ['Ask a manager to set the stock policy, or choose another product.'],
      );
    if (stockAction === 'BLOCK')
      issue(
        'STOCK_BLOCKED',
        `The approved policy blocks marketing products marked ${product.stock_status.replaceAll('_', ' ')}.`,
        ['Choose another product or wait for a verified stock change.'],
      );
    if (stockAction === 'WARN')
      issue(
        'STOCK_WARNING',
        `The approved policy allows this ${product.stock_status.replaceAll('_', ' ')} product with a warning. Do not add unverified availability or urgency claims.`,
        ['Check stock before each release.'],
        false,
      );
    if (plan.purpose === 'PROMOTION') {
      try {
        new PromotionStrategy(() => now).assertPrerequisites(product);
      } catch {
        issue(
          'PROMOTION_NOT_APPROVED',
          'Promotion content needs an approved source promotion, a verified promotional price and valid start/end dates.',
          [
            'Choose Product spotlight without an offer, or ask the catalog owner to supply approved promotion data.',
          ],
        );
      }
    }
    if (plan.purpose === 'EDUCATIONAL' && plan.educationMode === 'FRAGRANCE_NOTES') {
      try {
        new ScentPyramidStrategy().assertPrerequisites(product);
      } catch {
        issue(
          'NOTES_MISSING',
          'Verified fragrance notes are missing. A note-based educational post cannot be generated.',
          ['Choose education using general verified product facts, or Product spotlight.'],
        );
      }
    }
    if (plan.purpose === 'NEW_ARRIVAL')
      issue(
        'ARRIVAL_UNVERIFIED',
        'The catalog does not provide verified arrival-date evidence. A recent import is not proof of a new arrival.',
        ['Choose Product spotlight.'],
      );
    if (input.caption) {
      const validation = new DeterministicFactualValidator().validate({
        productSnapshot: marketingSafeSnapshot(snapshot, now),
        contentVersion: {
          id: 'eligibility-check',
          contentJobId: input.postId ?? snapshot.id,
          versionNumber: 1,
          brandRuleVersionId: 'eligibility-check',
          productSnapshotId: snapshot.id,
          generationAttemptId: 'eligibility-check',
          provider: 'eligibility-check',
          model: 'none',
          promptVersion: 'none',
          structuredOutput: input.caption,
          createdAt: now,
        },
      });
      if (validation.blockingCount)
        issue(
          'CAPTION_FACTS_INVALID',
          'The saved caption contains claims that are not supported by currently usable facts or approved promotions.',
          ['Correct the caption and request a new review.'],
        );
    }
    result.eligible = !result.issues.some((i) => i.blocking);
    return result;
  }
  async assert(input: MarketingProductInput, actor: PostActor): Promise<ProductMarketingCheck> {
    const result = await this.check({ ...input, recheck: true }, actor);
    if (!result.eligible)
      throw new ConflictError({
        publicMessage: result.issues
          .filter((i) => i.blocking)
          .map((i) => `${i.message} ${i.alternatives.join(' ')}`)
          .join(' '),
      });
    return result;
  }
  async latestRevisionFacts(input: MarketingProductInput, actor: PostActor): Promise<string> {
    const checked = await this.check({ ...input, action: 'DRAFT', recheck: true }, actor);
    if (
      checked.source.status === 'UNAVAILABLE' ||
      checked.issues.some((i) =>
        ['PRODUCT_UNAVAILABLE', 'SOURCE_DATA_STALE', 'POLICY_MISSING'].includes(i.code),
      )
    )
      throw new ConflictError({
        publicMessage:
          'The source could not provide current facts. Keep the existing revision and try again later.',
      });
    return checked.currentSnapshotId ?? input.snapshotId;
  }
}
