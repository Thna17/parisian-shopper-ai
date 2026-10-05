import {
  normalizeConcentration,
  normalizeCountry,
  normalizeDecimal,
  normalizeFragranceNote,
  normalizeIdentity,
  normalizeSize,
  normalizeText,
} from './normalization.js';
import { type FactualValidationRule } from './factual-rule.js';
import {
  contentTextSegments,
  FindingCode,
  FindingSeverity,
  type ContentTextSegment,
  type FactualValidationInput,
  type ValidationFindingDraft,
} from './validation.js';

const RULE_VERSION = '1';

abstract class Rule implements FactualValidationRule {
  public abstract readonly id: string;
  public readonly version = RULE_VERSION;
  public abstract validate(input: FactualValidationInput): readonly ValidationFindingDraft[];
  protected finding(
    code: keyof typeof FindingCode,
    field: string,
    message: string,
    segment: ContentTextSegment,
    expectedValue?: unknown,
    actualValue?: unknown,
    severity: 'WARNING' | 'BLOCKING' = 'BLOCKING',
  ): ValidationFindingDraft {
    return {
      code: FindingCode[code],
      severity: FindingSeverity[severity],
      field,
      message,
      contentPath: segment.path,
      ...(expectedValue === undefined ? {} : { expectedValue }),
      ...(actualValue === undefined ? {} : { actualValue }),
    };
  }
}

export class IdentityRule extends Rule {
  public readonly id = 'identity';
  public validate(input: FactualValidationInput): readonly ValidationFindingDraft[] {
    const product = input.productSnapshot.product.product;
    const findings: ValidationFindingDraft[] = [];
    for (const segment of contentTextSegments(input.contentVersion)) {
      for (const match of segment.text.matchAll(
        /(?:promo(?:tional)?|sale|special)\s+price\s*[:=]?\s*(?:[$€៛]|USD|EUR|KHR)?\s*(\d{1,12}(?:[.,]\d{1,4})?)/giu,
      )) {
        const amount = match[1];
        if (amount === undefined) continue;
        if (product.promo_price === undefined) {
          findings.push(
            this.finding(
              'UNSUPPORTED_PROMOTION',
              'promo_price',
              `Generated promotional price "${match[0]}" is absent from source data.`,
              segment,
              undefined,
              match[0],
            ),
          );
        } else if (normalizeDecimal(amount) !== normalizeDecimal(product.promo_price)) {
          findings.push(
            this.finding(
              'PROMO_PRICE_MISMATCH',
              'promo_price',
              `Generated promotional price "${match[0]}" does not match source promotional price.`,
              segment,
              product.promo_price,
              amount,
            ),
          );
        }
      }
      for (const match of segment.text.matchAll(
        /\bsku\s*[-:#=]\s*([a-z0-9][a-z0-9._/-]{0,63})/giu,
      )) {
        const actual = match[1]?.replace(/[.,;:!?]+$/u, '');
        if (
          actual !== undefined &&
          actual.toLocaleUpperCase('en-US') !== product.sku.toLocaleUpperCase('en-US')
        )
          findings.push(
            this.finding(
              'SKU_MISMATCH',
              'sku',
              `Generated SKU "${actual}" does not match the source SKU.`,
              segment,
              product.sku,
              actual,
            ),
          );
      }
      for (const [label, expected, code, field] of [
        ['brand', product.brand, 'BRAND_MISMATCH', 'brand'],
        [
          '(?:product_name|product name|name)',
          product.product_name,
          'PRODUCT_NAME_MISMATCH',
          'product_name',
        ],
      ] as const) {
        const regex = new RegExp(`(?:^|\\b)${label}\\s*[:=]\\s*([^,;\\n]+)`, 'giu');
        for (const match of segment.text.matchAll(regex)) {
          const actual = match[1]?.trim();
          if (actual !== undefined && normalizeIdentity(actual) !== normalizeIdentity(expected))
            findings.push(
              this.finding(
                code,
                field,
                `Generated ${field.replace('_', ' ')} does not match the source.`,
                segment,
                expected,
                actual,
              ),
            );
        }
      }
    }
    return findings;
  }
}

interface MoneyClaim {
  amount: string;
  currency: string;
  raw: string;
}
function moneyClaims(text: string): MoneyClaim[] {
  const claims: MoneyClaim[] = [];
  const patterns: readonly [RegExp, (match: RegExpMatchArray) => MoneyClaim | null][] = [
    [
      /([$€៛])\s*(\d{1,12}(?:[.,]\d{1,4})?)/gu,
      (m): MoneyClaim | null =>
        m[1] === undefined || m[2] === undefined
          ? null
          : {
              amount: normalizeDecimal(m[2]),
              currency: m[1] === '$' ? 'USD' : m[1] === '€' ? 'EUR' : 'KHR',
              raw: m[0],
            },
    ],
    [
      /\b(USD|EUR|KHR)\s*(\d{1,12}(?:[.,]\d{1,4})?)/giu,
      (m): MoneyClaim | null =>
        m[1] === undefined || m[2] === undefined
          ? null
          : { amount: normalizeDecimal(m[2]), currency: m[1].toUpperCase(), raw: m[0] },
    ],
    [
      /(\d{1,12}(?:[.,]\d{1,4})?)\s*(USD|EUR|KHR)\b/giu,
      (m): MoneyClaim | null =>
        m[1] === undefined || m[2] === undefined
          ? null
          : { amount: normalizeDecimal(m[1]), currency: m[2].toUpperCase(), raw: m[0] },
    ],
  ];
  for (const [pattern, map] of patterns)
    for (const match of text.matchAll(pattern)) {
      const claim = map(match);
      if (
        claim !== null &&
        !claims.some(
          (item) =>
            item.raw === claim.raw &&
            item.amount === claim.amount &&
            item.currency === claim.currency,
        )
      )
        claims.push(claim);
    }
  return claims;
}

export class MoneyRule extends Rule {
  public readonly id = 'money';
  public validate(input: FactualValidationInput): readonly ValidationFindingDraft[] {
    const product = input.productSnapshot.product.product;
    const allowed = [
      normalizeDecimal(product.price),
      ...(product.promo_price === undefined ? [] : [normalizeDecimal(product.promo_price)]),
    ];
    const findings: ValidationFindingDraft[] = [];
    for (const segment of contentTextSegments(input.contentVersion))
      for (const claim of moneyClaims(segment.text)) {
        if (claim.currency !== product.currency)
          findings.push(
            this.finding(
              'CURRENCY_MISMATCH',
              'currency',
              `Generated currency "${claim.currency}" does not match source currency "${product.currency}".`,
              segment,
              product.currency,
              claim.currency,
            ),
          );
        if (!allowed.includes(claim.amount))
          findings.push(
            this.finding(
              'PRICE_MISMATCH',
              'price',
              `Generated price "${claim.raw}" does not match a source-controlled price.`,
              segment,
              { price: product.price, promoPrice: product.promo_price, currency: product.currency },
              claim,
            ),
          );
      }
    return findings;
  }
}

export class PromotionRule extends Rule {
  public readonly id = 'promotion';
  public validate(input: FactualValidationInput): readonly ValidationFindingDraft[] {
    const product = input.productSnapshot.product.product;
    const findings: ValidationFindingDraft[] = [];
    for (const segment of contentTextSegments(input.contentVersion)) {
      for (const match of segment.text.matchAll(
        /(\d{1,3}(?:\.\d{1,4})?)\s*%\s*(?:off|discount|បញ្ចុះតម្លៃ)?/giu,
      )) {
        const actual = match[1];
        if (actual === undefined) continue;
        const expected =
          product.discount?.type === 'percentage'
            ? normalizeDecimal(product.discount.value)
            : undefined;
        if (expected === undefined)
          findings.push(
            this.finding(
              'UNSUPPORTED_DISCOUNT',
              'discount',
              `Generated discount "${match[0]}" is absent from source data.`,
              segment,
              undefined,
              match[0],
            ),
          );
        else if (normalizeDecimal(actual) !== expected)
          findings.push(
            this.finding(
              'DISCOUNT_MISMATCH',
              'discount',
              `Generated discount "${match[0]}" does not match source discount "${expected}%".`,
              segment,
              expected,
              actual,
            ),
          );
      }
      if (
        /(?:special offer|limited[- ]time (?:offer|deal|discount)|ការផ្តល់ជូនពិសេស)/iu.test(
          segment.text,
        ) &&
        product.discount === undefined &&
        product.promo_price === undefined
      )
        findings.push(
          this.finding(
            'UNSUPPORTED_PROMOTION',
            'promotion',
            'Generated generic promotion language is not grounded in source promotion data.',
            segment,
            undefined,
            'generic promotion language',
            'WARNING',
          ),
        );
    }
    return findings;
  }
}

export class StockRule extends Rule {
  public readonly id = 'stock';
  public validate(input: FactualValidationInput): readonly ValidationFindingDraft[] {
    const product = input.productSnapshot.product.product;
    const findings: ValidationFindingDraft[] = [];
    for (const segment of contentTextSegments(input.contentVersion)) {
      const available =
        /\b(?:available now|in stock|order today|shop now)\b|មានក្នុងស្តុក|បញ្ជាទិញឥឡូវ/iu.test(
          segment.text,
        );
      if (
        (available && ['out_of_stock', 'discontinued'].includes(product.stock_status)) ||
        (available &&
          ['discontinued', 'deleted'].includes(input.productSnapshot.product.lifecycle_status))
      )
        findings.push(
          this.finding(
            'STOCK_CONTRADICTION',
            'stock_status',
            'Generated availability language contradicts the source availability state.',
            segment,
            {
              stock: product.stock_status,
              lifecycle: input.productSnapshot.product.lifecycle_status,
            },
            'available',
          ),
        );
      if (/\bonly\s+\d+\s+(?:left|remaining)\b|នៅសល់តែ\s*\d+/iu.test(segment.text))
        findings.push(
          this.finding(
            'STOCK_CONTRADICTION',
            'stock_status',
            'Generated stock quantity is not source-backed.',
            segment,
            product.stock_status,
            'invented quantity',
          ),
        );
      if (
        /\b(?:only a few left|few remaining)\b/iu.test(segment.text) &&
        product.stock_status === 'low_stock'
      )
        findings.push(
          this.finding(
            'STOCK_CONTRADICTION',
            'stock_status',
            'Low-stock urgency wording requires business confirmation.',
            segment,
            product.stock_status,
            'few left',
            'WARNING',
          ),
        );
    }
    return findings;
  }
}

export class SizeRule extends Rule {
  public readonly id = 'size';
  public validate(input: FactualValidationInput): readonly ValidationFindingDraft[] {
    const expected = input.productSnapshot.product.product.size;
    const findings: ValidationFindingDraft[] = [];
    for (const segment of contentTextSegments(input.contentVersion))
      for (const match of segment.text.matchAll(
        /\b(\d{1,6}(?:\.\d{1,4})?)\s*(ml|g|kg|oz|cm|mm)\b/giu,
      )) {
        const value = match[1];
        const unit = match[2];
        if (value === undefined || unit === undefined) continue;
        const actual = normalizeSize(value, unit);
        if (expected === undefined || actual !== normalizeSize(expected.value, expected.unit))
          findings.push(
            this.finding(
              'SIZE_MISMATCH',
              'size',
              `Generated size "${match[0]}" does not match source size.`,
              segment,
              expected,
              match[0],
            ),
          );
      }
    return findings;
  }
}

export class ConcentrationRule extends Rule {
  public readonly id = 'concentration';
  public validate(input: FactualValidationInput): readonly ValidationFindingDraft[] {
    const source = input.productSnapshot.product.product.concentration;
    const expected =
      source === undefined
        ? null
        : (normalizeConcentration(source.code) ??
          normalizeConcentration(source.label) ??
          source.code.toUpperCase());
    const findings: ValidationFindingDraft[] = [];
    for (const segment of contentTextSegments(input.contentVersion))
      for (const match of segment.text.matchAll(
        /\b(eau\s+de\s+parfum|eau\s+de\s+toilette|edp|edt|parfum|perfume)\b/giu,
      )) {
        const actual = normalizeConcentration(match[0]);
        if (actual !== null && actual !== expected)
          findings.push(
            this.finding(
              'CONCENTRATION_MISMATCH',
              'concentration',
              `Generated concentration "${match[0]}" does not match source concentration.`,
              segment,
              source,
              match[0],
            ),
          );
      }
    return findings;
  }
}

export class FragranceNotesRule extends Rule {
  public readonly id = 'fragrance-notes';
  public validate(input: FactualValidationInput): readonly ValidationFindingDraft[] {
    const source = input.productSnapshot.product.product.fragrance_notes;
    if (
      source === undefined &&
      !/fragrance|perfume|parfum/iu.test(input.productSnapshot.product.product.category)
    )
      return [];
    const findings: ValidationFindingDraft[] = [];
    for (const segment of contentTextSegments(input.contentVersion))
      for (const match of segment.text.matchAll(
        /\b(top|heart|base)(?:\s+notes?)?\s*[-:=]\s*([^.;\n]+)/giu,
      )) {
        const tier = match[1]?.toLowerCase() as 'top' | 'heart' | 'base' | undefined;
        const list = match[2];
        if (tier === undefined || list === undefined) continue;
        const allowed = source?.[tier].map(normalizeFragranceNote) ?? [];
        for (const note of list
          .split(/,|\band\b/iu)
          .map((value) => value.trim())
          .filter(Boolean))
          if (!allowed.includes(normalizeFragranceNote(note)))
            findings.push(
              this.finding(
                'UNSUPPORTED_FRAGRANCE_NOTE',
                'fragrance_notes',
                `Generated ${tier} note "${note}" is not present in source ${tier} notes.`,
                segment,
                source?.[tier],
                note,
              ),
            );
      }
    return findings;
  }
}

export class FactsUsedRule extends Rule {
  public readonly id = 'facts-used';
  public validate(input: FactualValidationInput): readonly ValidationFindingDraft[] {
    const product = input.productSnapshot.product.product;
    const findings: ValidationFindingDraft[] = [];
    input.contentVersion.structuredOutput.facts_used.forEach((fact, index) => {
      const match =
        /^(sku|price|promo_price|currency|discount|stock|size|concentration|country_of_origin)\s*[:=]\s*(.+)$/iu.exec(
          fact,
        );
      if (match === null) return;
      const key = match[1]?.toLowerCase();
      const actual = match[2]?.trim();
      if (key === undefined || actual === undefined) return;
      let valid = true;
      let expected: unknown;
      switch (key) {
        case 'sku':
          expected = product.sku;
          valid = actual.toUpperCase() === product.sku.toUpperCase();
          break;
        case 'price':
          expected = product.price;
          valid =
            normalizeDecimal(actual.replace(/[^\d.,]/gu, '')) === normalizeDecimal(product.price);
          break;
        case 'promo_price':
          expected = product.promo_price;
          valid =
            product.promo_price !== undefined &&
            normalizeDecimal(actual.replace(/[^\d.,]/gu, '')) ===
              normalizeDecimal(product.promo_price);
          break;
        case 'currency':
          expected = product.currency;
          valid = actual.toUpperCase() === product.currency;
          break;
        case 'discount':
          expected = product.discount;
          valid =
            product.discount !== undefined &&
            normalizeDecimal(actual.replace(/[^\d.,]/gu, '')) ===
              normalizeDecimal(product.discount.value);
          break;
        case 'stock':
          expected = product.stock_status;
          valid = normalizeText(actual).replace(/\s/gu, '_') === product.stock_status;
          break;
        case 'size':
          expected = product.size;
          valid =
            product.size !== undefined &&
            normalizeText(actual) === normalizeText(product.size.display);
          break;
        case 'concentration':
          expected = product.concentration;
          valid =
            product.concentration !== undefined &&
            normalizeConcentration(actual) === normalizeConcentration(product.concentration.code);
          break;
        case 'country_of_origin':
          expected = product.country_of_origin;
          valid =
            product.country_of_origin !== undefined &&
            normalizeCountry(actual) === product.country_of_origin.code;
          break;
      }
      if (!valid) {
        findings.push({
          field: key,
          severity: FindingSeverity.BLOCKING,
          code: FindingCode.FACTS_USED_MISMATCH,
          message: `Reported fact "${key}" does not match the product snapshot.`,
          expectedValue: expected,
          actualValue: actual,
          contentPath: `facts_used[${index}]`,
        });
      }
    });
    return findings;
  }
}

export class OriginRule extends Rule {
  public readonly id = 'origin';
  public validate(input: FactualValidationInput): readonly ValidationFindingDraft[] {
    const source = input.productSnapshot.product.product.country_of_origin;
    const findings: ValidationFindingDraft[] = [];
    for (const segment of contentTextSegments(input.contentVersion)) {
      const patterns = [
        /(?:made in\s+|ផលិតនៅប្រទេស\s*)([\p{L}\p{M}]+)/giu,
        /\b([a-z]+)[- ]made\b/giu,
      ];
      for (const pattern of patterns)
        for (const match of segment.text.matchAll(pattern)) {
          const raw = match[1];
          if (raw === undefined) continue;
          const actual = normalizeCountry(raw);
          if (source === undefined)
            findings.push(
              this.finding(
                'UNSUPPORTED_ORIGIN',
                'country_of_origin',
                `Generated origin claim "${match[0]}" is absent from source data.`,
                segment,
                undefined,
                match[0],
              ),
            );
          else if (actual === null || actual !== source.code)
            findings.push(
              this.finding(
                'ORIGIN_MISMATCH',
                'country_of_origin',
                `Generated origin claim "${match[0]}" does not match source origin.`,
                segment,
                source,
                match[0],
              ),
            );
        }
    }
    return findings;
  }
}

export class SimilarityRule extends Rule {
  public readonly id = 'similarity';
  public validate(input: FactualValidationInput): readonly ValidationFindingDraft[] {
    const approved = input.productSnapshot.product.product.similarity_claims ?? [];
    const findings: ValidationFindingDraft[] = [];
    for (const segment of contentTextSegments(input.contentVersion))
      for (const match of segment.text.matchAll(
        /\b(similar to|smells like|inspired by|identical to)\s+([^.;!\n]+)|ស្រដៀងនឹង\s+([^។\n]+)/giu,
      )) {
        const wording = (match[1] ?? 'ស្រដៀងនឹង').toLowerCase();
        const target = (match[2] ?? match[3])?.trim();
        if (target === undefined) continue;
        const supported = approved.some((claim) =>
          normalizeText(claim.text).includes(normalizeText(target)),
        );
        if (!supported)
          findings.push(
            this.finding(
              'UNSUPPORTED_SIMILARITY_CLAIM',
              'similarity_claims',
              `Generated similarity claim about "${target}" is not approved in source data.`,
              segment,
              approved.map((claim) => claim.text),
              target,
            ),
          );
        else if (wording === 'identical to')
          findings.push(
            this.finding(
              'SIMILARITY_WORDING_EXCEEDS_APPROVAL',
              'similarity_claims',
              'Generated identity wording exceeds the approved similarity claim.',
              segment,
              approved.map((claim) => claim.text),
              match[0],
            ),
          );
      }
    return findings;
  }
}

export class UnsupportedPerformanceRule extends Rule {
  public readonly id = 'unsupported-performance';
  public validate(input: FactualValidationInput): readonly ValidationFindingDraft[] {
    const findings: ValidationFindingDraft[] = [];
    for (const segment of contentTextSegments(input.contentVersion))
      for (const pattern of [
        /\b(?:lasts?|longevity)\s*(?:for\s*)?\d{1,3}\s*(?:hours?|hrs?)\b/giu,
        /\b\d{1,3}[- ]hour\s+longevity\b/giu,
        /\bwaterproof(?:\s+to)?\s*\d+/giu,
        /\bclinically proven\b/giu,
        /ជាប់បាន\s*\d{1,3}\s*ម៉ោង/gu,
      ])
        for (const match of segment.text.matchAll(pattern))
          findings.push(
            this.finding(
              'UNSUPPORTED_PERFORMANCE_CLAIM',
              'performance',
              `Generated performance claim "${match[0]}" is not supported by the product contract.`,
              segment,
              undefined,
              match[0],
            ),
          );
    return findings;
  }
}

export function defaultFactualRules(): FactualValidationRule[] {
  return [
    new IdentityRule(),
    new MoneyRule(),
    new PromotionRule(),
    new StockRule(),
    new SizeRule(),
    new ConcentrationRule(),
    new FragranceNotesRule(),
    new OriginRule(),
    new SimilarityRule(),
    new UnsupportedPerformanceRule(),
    new FactsUsedRule(),
  ];
}
