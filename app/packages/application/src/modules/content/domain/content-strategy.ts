import { type NormalizedProduct } from '../../products/domain/product.schema.js';
import { ContentGenerationError } from './content-errors.js';
import { type ContentType } from './content.js';

export interface ContentStrategy {
  contentType: ContentType;
  requiredProductFields: readonly (keyof NormalizedProduct)[];
  optionalProductFields: readonly (keyof NormalizedProduct)[];
  objective: string;
  instructions: readonly string[];
  constraints: readonly string[];
  assertPrerequisites(product: NormalizedProduct): void;
}

abstract class BaseStrategy implements ContentStrategy {
  public abstract readonly contentType: ContentType;
  public abstract readonly requiredProductFields: readonly (keyof NormalizedProduct)[];
  public abstract readonly objective: string;
  public readonly optionalProductFields: readonly (keyof NormalizedProduct)[] = [];
  public readonly instructions = [
    'Use only supplied product facts.',
    'Return the canonical structured output.',
  ];
  public readonly constraints = ['Do not invent claims, promotions, or product attributes.'];

  public assertPrerequisites(product: NormalizedProduct): void {
    for (const field of this.requiredProductFields) {
      const value = product[field];
      if (value === undefined || value === null) this.missing(field);
    }
  }

  protected missing(field: keyof NormalizedProduct): never {
    throw new ContentGenerationError({
      code: 'MISSING_REQUIRED_PRODUCT_DATA',
      publicMessage: 'The product lacks data required by this content strategy.',
      details: { contentType: this.contentType, field },
    });
  }
}

export class ProductSpotlightStrategy extends BaseStrategy {
  public readonly contentType = 'PRODUCT_SPOTLIGHT';
  public readonly requiredProductFields = [
    'sku',
    'product_name',
    'brand',
    'price',
    'currency',
  ] as const;
  public readonly objective = 'Present a concise source-backed product spotlight.';
  public override readonly optionalProductFields = [
    'description',
    'size',
    'concentration',
    'promo_price',
  ] as const;
}

export class PromotionStrategy extends BaseStrategy {
  public readonly contentType = 'PROMOTION';
  public readonly requiredProductFields = ['promo_price', 'discount'] as const;
  public readonly objective = 'Present only an explicitly source-controlled active promotion.';

  public constructor(private readonly now: () => Date = () => new Date()) {
    super();
  }

  public override assertPrerequisites(product: NormalizedProduct): void {
    super.assertPrerequisites(product);
    if (product.discount?.starts_at === undefined || product.discount.ends_at === undefined) {
      this.missing('discount');
    }
    const now = this.now().toISOString();
    if (now < product.discount.starts_at || now > product.discount.ends_at) {
      throw new ContentGenerationError({
        code: 'MISSING_REQUIRED_PRODUCT_DATA',
        publicMessage: 'The product does not have a source-controlled active promotion.',
        details: { contentType: this.contentType, field: 'discount' },
      });
    }
  }
}

export class ScentPyramidStrategy extends BaseStrategy {
  public readonly contentType = 'SCENT_PYRAMID';
  public readonly requiredProductFields = ['fragrance_notes'] as const;
  public readonly objective = 'Describe the verified top, heart, and base fragrance-note pyramid.';

  public override assertPrerequisites(product: NormalizedProduct): void {
    super.assertPrerequisites(product);
    const notes = product.fragrance_notes;
    if (notes === undefined || notes.top.length + notes.heart.length + notes.base.length === 0) {
      this.missing('fragrance_notes');
    }
  }
}

export class EducationalStrategy extends BaseStrategy {
  public readonly contentType = 'EDUCATIONAL';
  public readonly requiredProductFields = ['sku', 'product_name', 'brand', 'category'] as const;
  public readonly objective =
    'Explain only verified product characteristics without unsupported claims.';
}

export class EngagementStrategy extends BaseStrategy {
  public readonly contentType = 'ENGAGEMENT';
  public readonly requiredProductFields = ['sku', 'product_name', 'brand'] as const;
  public readonly objective = 'Invite non-factual audience engagement around the verified product.';
}

export class ContentStrategyRegistry {
  private readonly strategies: ReadonlyMap<ContentType, ContentStrategy>;

  public constructor(strategies: readonly ContentStrategy[] = defaultStrategies()) {
    this.strategies = new Map(strategies.map((strategy) => [strategy.contentType, strategy]));
  }

  public get(contentType: ContentType): ContentStrategy {
    const strategy = this.strategies.get(contentType);
    if (strategy === undefined) {
      throw new ContentGenerationError({
        code: 'CONTENT_STRATEGY_NOT_FOUND',
        publicMessage: 'The requested content strategy is unavailable.',
        details: { contentType },
      });
    }
    return strategy;
  }
}

function defaultStrategies(): ContentStrategy[] {
  return [
    new ProductSpotlightStrategy(),
    new PromotionStrategy(),
    new ScentPyramidStrategy(),
    new EducationalStrategy(),
    new EngagementStrategy(),
  ];
}
