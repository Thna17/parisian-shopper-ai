import { HardGateCode, type HardGateFailure } from './hard-visual-gates.port.js';
import {
  FACTUAL_CONSISTENCY_GATE_VERSION,
  type FactualDiscrepancy,
  type FactualGateInput,
  type FactualGateOutcome,
  type IFactualConsistencyGate,
} from './factual-consistency-gate.port.js';
import { type TypographyPriceBadge } from '../scene/creative-scene.types.js';

export function canonicalizePrice(val: string | number | undefined | null): string | null {
  if (val === undefined || val === null) {
    return null;
  }
  const str = String(val).trim();
  // Extract digits and optional decimal point
  const match = /(\d+(?:[.,]\d+)?)/.exec(str);
  if (!match || !match[1]) {
    return null;
  }
  const clean = match[1].replace(',', '.');
  const num = parseFloat(clean);
  if (Number.isNaN(num)) {
    return null;
  }
  return num.toFixed(2);
}

export function normalizeCurrency(val: string | undefined | null): string | null {
  if (!val) {
    return null;
  }
  const clean = val.trim().toUpperCase();
  if (clean === '$' || clean === 'USD') return 'USD';
  if (clean === '€' || clean === 'EUR') return 'EUR';
  if (clean === '£' || clean === 'GBP') return 'GBP';
  if (clean === '៛' || clean === 'KHR') return 'KHR';
  return clean;
}

export function extractCurrencyFromText(text: string): string | null {
  if (text.includes('$')) return 'USD';
  if (text.includes('€')) return 'EUR';
  if (text.includes('£')) return 'GBP';
  if (text.includes('៛')) return 'KHR';
  const isoMatch = /\b(USD|EUR|GBP|KHR)\b/i.exec(text);
  if (isoMatch && isoMatch[1]) {
    return isoMatch[1].toUpperCase();
  }
  return null;
}

export const detectCurrency = extractCurrencyFromText;

export function extractDiscountPercentage(text: string): number | null {
  const match = /(?:-\s*(\d+)%|(\d+)%\s*off|save\s*(\d+)%|(\d+)\s*%\s*(?:discount|off)?)/i.exec(
    text,
  );
  if (match) {
    const raw = match[1] ?? match[2] ?? match[3] ?? match[4];
    if (raw) {
      const num = parseInt(raw, 10);
      if (!Number.isNaN(num)) return num;
    }
  }
  return null;
}

export class FactualConsistencyGate implements IFactualConsistencyGate {
  public evaluate(input: FactualGateInput): FactualGateOutcome {
    const failures: HardGateFailure[] = [];
    const discrepancies: FactualDiscrepancy[] = [];
    const evaluatedAt = new Date().toISOString();

    const snapshot = input.productSnapshot;
    const envelope = snapshot.product;
    const product =
      'product' in envelope && envelope.product
        ? envelope.product
        : (envelope as unknown as {
            sku: string;
            price: string;
            currency: string;
            promo_price?: string | undefined;
            discount?: { type: string; value: string } | undefined;
          });

    // Resolve priceBadge
    let priceBadge: TypographyPriceBadge | undefined = input.priceBadge;
    if (!priceBadge && input.sceneVersion?.layers) {
      for (const layer of input.sceneVersion.layers) {
        if (layer.layerGroup === 'TYPOGRAPHY' && layer.payload && 'priceBadge' in layer.payload) {
          priceBadge = (layer.payload as { priceBadge?: TypographyPriceBadge }).priceBadge;
          if (priceBadge) break;
        }
      }
    }

    // 1. SKU Integrity
    const sceneSku =
      input.sceneSku ??
      (input.sceneVersion?.metadata && typeof input.sceneVersion.metadata['sku'] === 'string'
        ? input.sceneVersion.metadata['sku']
        : undefined);

    if (sceneSku && sceneSku !== product.sku) {
      const discrepancy: FactualDiscrepancy = {
        code: HardGateCode.GATE_FACTUAL_SKU_MISMATCH,
        field: 'sku',
        message: `Scene SKU '${sceneSku}' does not match governed product snapshot SKU '${product.sku}'.`,
        expected: product.sku,
        actual: sceneSku,
        remediationAction: 'Rebind scene version to the correct active product snapshot record.',
      };
      discrepancies.push(discrepancy);
      failures.push({
        code: HardGateCode.GATE_FACTUAL_SKU_MISMATCH,
        field: 'sku',
        message: discrepancy.message,
        remediationAction: discrepancy.remediationAction,
        metadata: { expectedSku: product.sku, actualSku: sceneSku },
      });
    }

    // 2. Snapshot Staleness & Provenance
    if (input.renderedSnapshotHash) {
      if (input.renderedSnapshotHash !== snapshot.snapshotHash) {
        const discrepancy: FactualDiscrepancy = {
          code: HardGateCode.GATE_SNAPSHOT_STALE,
          field: 'snapshotHash',
          message: `Scene rendered against stale product snapshot hash '${input.renderedSnapshotHash}'; current active hash is '${snapshot.snapshotHash}'.`,
          expected: snapshot.snapshotHash,
          actual: input.renderedSnapshotHash,
          remediationAction:
            'Regenerate scene version against the updated product snapshot to incorporate price/stock changes.',
        };
        discrepancies.push(discrepancy);
        failures.push({
          code: HardGateCode.GATE_SNAPSHOT_STALE,
          field: 'snapshotHash',
          message: discrepancy.message,
          remediationAction: discrepancy.remediationAction,
          metadata: {
            expectedSnapshotHash: snapshot.snapshotHash,
            actualSnapshotHash: input.renderedSnapshotHash,
          },
        });
      }
    } else if (input.sceneVersion) {
      if (
        input.sceneVersion.productSnapshotId &&
        input.sceneVersion.productSnapshotId !== snapshot.id
      ) {
        const discrepancy: FactualDiscrepancy = {
          code: HardGateCode.GATE_SNAPSHOT_STALE,
          field: 'productSnapshotId',
          message: `Scene references product snapshot ID '${input.sceneVersion.productSnapshotId}', but active snapshot ID is '${snapshot.id}'.`,
          expected: snapshot.id,
          actual: input.sceneVersion.productSnapshotId,
          remediationAction: 'Update scene version to target the latest product snapshot ID.',
        };
        discrepancies.push(discrepancy);
        failures.push({
          code: HardGateCode.GATE_SNAPSHOT_STALE,
          field: 'productSnapshotId',
          message: discrepancy.message,
          remediationAction: discrepancy.remediationAction,
          metadata: {
            expectedSnapshotId: snapshot.id,
            actualSnapshotId: input.sceneVersion.productSnapshotId,
          },
        });
      }
    }

    // 3. Regular Price Verification
    const expectedCanonicalPrice = canonicalizePrice(product.price);
    const expectedCurrency = normalizeCurrency(product.currency) ?? 'USD';

    let renderedPriceText: string | undefined;
    let renderedCurrencyText: string | undefined;

    if (priceBadge?.regularPrice) {
      renderedPriceText = priceBadge.regularPrice;
      renderedCurrencyText = priceBadge.currency;
    } else if (input.typographyBlocks) {
      const priceBlock = input.typographyBlocks.find(
        (b) => b.role === 'price' || b.role === 'priceBadge',
      );
      if (priceBlock) {
        renderedPriceText = priceBlock.text;
      } else {
        // Fallback: check if headline or body contains explicit price pattern like $195
        for (const block of input.typographyBlocks) {
          if (/(?:[$€£៛]\s*\d+|\d+\s*[$€£៛]|\d+\s*(?:USD|EUR|GBP|KHR))/i.test(block.text)) {
            renderedPriceText = block.text;
            break;
          }
        }
      }
    }

    if (renderedPriceText) {
      const actualCanonicalPrice = canonicalizePrice(renderedPriceText);
      const detectedCurrency =
        normalizeCurrency(renderedCurrencyText) ??
        extractCurrencyFromText(renderedPriceText) ??
        normalizeCurrency(priceBadge?.currency);

      // Check currency mismatch
      if (detectedCurrency && detectedCurrency !== expectedCurrency) {
        const discrepancy: FactualDiscrepancy = {
          code: HardGateCode.GATE_FACTUAL_PRICE_MISMATCH,
          field: 'currency',
          message: `Rendered currency '${detectedCurrency}' does not match product snapshot currency '${expectedCurrency}'.`,
          expected: expectedCurrency,
          actual: detectedCurrency,
          remediationAction: `Update poster currency symbol to '${expectedCurrency}'.`,
        };
        discrepancies.push(discrepancy);
        failures.push({
          code: HardGateCode.GATE_FACTUAL_PRICE_MISMATCH,
          field: 'currency',
          message: discrepancy.message,
          remediationAction: discrepancy.remediationAction,
          metadata: { expectedCurrency, actualCurrency: detectedCurrency },
        });
      }

      // Check price mismatch
      if (actualCanonicalPrice !== expectedCanonicalPrice) {
        const discrepancy: FactualDiscrepancy = {
          code: HardGateCode.GATE_FACTUAL_PRICE_MISMATCH,
          field: 'price',
          message: `Rendered price '${renderedPriceText}' (${actualCanonicalPrice}) does not match governed product snapshot price '${product.price}' (${expectedCanonicalPrice}).`,
          expected: expectedCanonicalPrice,
          actual: actualCanonicalPrice,
          remediationAction: `Rebuild scene typography with current product price '${product.price} ${product.currency}'.`,
        };
        discrepancies.push(discrepancy);
        failures.push({
          code: HardGateCode.GATE_FACTUAL_PRICE_MISMATCH,
          field: 'price',
          message: discrepancy.message,
          remediationAction: discrepancy.remediationAction,
          metadata: {
            expectedPrice: expectedCanonicalPrice,
            actualPrice: actualCanonicalPrice,
            rawRenderedPrice: renderedPriceText,
          },
        });
      }
    }

    // 4. Promotional Price & Unauthorized Discount Verification
    let renderedPromoPrice: string | undefined;
    let renderedDiscountText: string | undefined;

    if (priceBadge?.promoPrice) {
      renderedPromoPrice = priceBadge.promoPrice;
    }
    if (priceBadge?.discountText) {
      renderedDiscountText = priceBadge.discountText;
    }

    if (input.typographyBlocks) {
      const promoBlock = input.typographyBlocks.find(
        (b) => b.role === 'promotionalPrice' || b.role === 'promoPrice',
      );
      if (promoBlock) {
        renderedPromoPrice = promoBlock.text;
      }

      for (const block of input.typographyBlocks) {
        if (extractDiscountPercentage(block.text) !== null) {
          renderedDiscountText =
            (renderedDiscountText ? `${renderedDiscountText} ` : '') + block.text;
        }
      }
    }

    const hasPromotionalRender = Boolean(renderedPromoPrice || renderedDiscountText);

    if (hasPromotionalRender) {
      const hasActivePromoInSnapshot = Boolean(product.promo_price || product.discount);

      if (!hasActivePromoInSnapshot) {
        const discrepancy: FactualDiscrepancy = {
          code: HardGateCode.GATE_FACTUAL_PROMO_MISMATCH,
          field: 'promotionalPrice',
          message:
            'Unauthorized promotional discount rendered on poster when active product snapshot has no promotion.',
          expected: null,
          actual: renderedPromoPrice ?? renderedDiscountText,
          remediationAction:
            'Remove promotional pricing slot or synchronize an active promotion campaign into the product snapshot.',
        };
        discrepancies.push(discrepancy);
        failures.push({
          code: HardGateCode.GATE_FACTUAL_PROMO_MISMATCH,
          field: 'promotionalPrice',
          message: discrepancy.message,
          remediationAction: discrepancy.remediationAction,
          metadata: { renderedPromoPrice, renderedDiscountText },
        });
      } else {
        // If snapshot has promo_price, verify exact match
        if (renderedPromoPrice && product.promo_price) {
          const actualCanonicalPromo = canonicalizePrice(renderedPromoPrice);
          const expectedCanonicalPromo = canonicalizePrice(product.promo_price);

          if (actualCanonicalPromo !== expectedCanonicalPromo) {
            const discrepancy: FactualDiscrepancy = {
              code: HardGateCode.GATE_FACTUAL_PROMO_MISMATCH,
              field: 'promo_price',
              message: `Rendered promotional price '${renderedPromoPrice}' (${actualCanonicalPromo}) does not match snapshot promo price '${product.promo_price}' (${expectedCanonicalPromo}).`,
              expected: expectedCanonicalPromo,
              actual: actualCanonicalPromo,
              remediationAction: `Correct promotional price to '${product.promo_price}'.`,
            };
            discrepancies.push(discrepancy);
            failures.push({
              code: HardGateCode.GATE_FACTUAL_PROMO_MISMATCH,
              field: 'promo_price',
              message: discrepancy.message,
              remediationAction: discrepancy.remediationAction,
              metadata: {
                expectedPromoPrice: expectedCanonicalPromo,
                actualPromoPrice: actualCanonicalPromo,
              },
            });
          }
        }

        // If discount percentage is rendered, verify match
        if (renderedDiscountText) {
          const renderedPct = extractDiscountPercentage(renderedDiscountText);
          if (renderedPct !== null) {
            let expectedPct: number | null = null;
            if (product.discount?.value && product.discount.type === 'percentage') {
              expectedPct = Math.round(parseFloat(product.discount.value));
            } else if (product.price && product.promo_price) {
              const reg = parseFloat(product.price);
              const pro = parseFloat(product.promo_price);
              if (reg > 0) {
                expectedPct = Math.round(((reg - pro) / reg) * 100);
              }
            }

            if (expectedPct !== null && Math.abs(renderedPct - expectedPct) > 1) {
              const discrepancy: FactualDiscrepancy = {
                code: HardGateCode.GATE_FACTUAL_PROMO_MISMATCH,
                field: 'discountPercentage',
                message: `Rendered discount '${renderedPct}%' does not match snapshot discount '${expectedPct}%'.`,
                expected: expectedPct,
                actual: renderedPct,
                remediationAction: `Update discount badge to show authorized '${expectedPct}%' off.`,
              };
              discrepancies.push(discrepancy);
              failures.push({
                code: HardGateCode.GATE_FACTUAL_PROMO_MISMATCH,
                field: 'discountPercentage',
                message: discrepancy.message,
                remediationAction: discrepancy.remediationAction,
                metadata: {
                  expectedDiscountPercent: expectedPct,
                  actualDiscountPercent: renderedPct,
                },
              });
            }
          }
        }
      }
    }

    return {
      isPassed: failures.length === 0,
      validatorVersion: FACTUAL_CONSISTENCY_GATE_VERSION,
      evaluatedAt,
      failures,
      discrepancies,
    };
  }
}
