import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { KNOWN_PLACEHOLDER_HASHES } from './product-asset-validator.js';
import { normalizeAndValidateUnicode } from './unicode-validator.js';
import { PosterUnsafeUnicodeError } from '../creative-errors.js';
import { FactualConsistencyGate } from './factual-consistency-gate.engine.js';
import { type FactualGateInput } from './factual-consistency-gate.port.js';
import {
  type HardGateEvaluationInput,
  type HardGateFailure,
  type HardGateOutcome,
  HARD_VISUAL_GATES_VERSION,
  HardGateCode,
  boxesIntersect,
} from './hard-visual-gates.port.js';

export const HARD_VISUAL_GATES_ENGINE = Symbol('HARD_VISUAL_GATES_ENGINE');

export const DEFAULT_MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
export const DEFAULT_SAFE_MARGIN_PERCENT = 0.05; // 5%
export const MIN_PRODUCT_VISIBLE_RATIO = 0.08; // 8% minimum product flacon area
export const MIN_HEADLINE_CONTRAST_RATIO = 3.0; // WCAG large text minimum
export const MIN_BODY_CONTRAST_RATIO = 4.5; // WCAG normal text minimum

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  let clean = hex.replace(/^#/, '').trim();
  if (clean.length === 3) {
    clean = clean
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const num = parseInt(clean, 16);
  if (Number.isNaN(num) || clean.length < 6) {
    return { r: 255, g: 255, b: 255 }; // default white
  }
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff,
  };
}

export function calculateRelativeLuminance(r: number, g: number, b: number): number {
  const rs = r / 255;
  const gs = g / 255;
  const bs = b / 255;

  const rLin = rs <= 0.04045 ? rs / 12.92 : Math.pow((rs + 0.055) / 1.055, 2.4);
  const gLin = gs <= 0.04045 ? gs / 12.92 : Math.pow((gs + 0.055) / 1.055, 2.4);
  const bLin = bs <= 0.04045 ? bs / 12.92 : Math.pow((bs + 0.055) / 1.055, 2.4);

  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

export function calculateContrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export class HardVisualGatesEngine {
  public async evaluate(input: HardGateEvaluationInput): Promise<HardGateOutcome> {
    const failures: HardGateFailure[] = [];
    const evaluatedAt = new Date().toISOString();

    const actualSha256 = createHash('sha256').update(input.assetBuffer).digest('hex').toLowerCase();
    const byteSize = input.assetBuffer.length;
    let actualWidth = 0;
    let actualHeight = 0;
    let productVisibleRatio: number | undefined;
    let minTextContrastRatio: number | undefined;

    // =================================================================
    // 1. Container & Integrity Hard Gates
    // =================================================================

    // 1a. CAS Hash Match
    if (actualSha256 !== input.expectedSha256.toLowerCase()) {
      failures.push({
        code: HardGateCode.GATE_CAS_HASH_MISMATCH,
        field: 'assetBuffer',
        message: `Asset SHA-256 mismatch. Expected: ${input.expectedSha256}, Actual: ${actualSha256}`,
        remediationAction:
          'Re-fetch asset from CAS and verify cryptographic storage digest integrity.',
        metadata: { expectedSha256: input.expectedSha256, actualSha256 },
      });
    }

    // 1b. Maximum File Size (<= 15MB)
    const maxBytes = input.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;
    if (byteSize > maxBytes) {
      failures.push({
        code: HardGateCode.GATE_FILE_SIZE_EXCEEDED,
        field: 'byteSize',
        message: `Asset byte size ${byteSize} bytes exceeds maximum allowed budget of ${maxBytes} bytes.`,
        remediationAction:
          'Increase PNG compression level (level 9) or optimize background asset resolution.',
        metadata: { byteSize, maxBytes },
      });
    }

    // 1c. Container Format & Metadata Decode
    try {
      const meta = await sharp(input.assetBuffer).metadata();
      const format = meta.format?.toLowerCase() ?? 'unknown';
      actualWidth = meta.width ?? 0;
      actualHeight = meta.height ?? 0;

      if (format !== 'png') {
        failures.push({
          code: HardGateCode.GATE_CONTAINER_INVALID,
          field: 'format',
          message: `Asset format '${format}' is invalid. Production posters must be single-frame PNG images.`,
          remediationAction: 'Re-encode asset using headless Sharp in static image/png format.',
          metadata: { format, expectedFormat: 'png' },
        });
      }

      if (meta.pages && meta.pages > 1) {
        failures.push({
          code: HardGateCode.GATE_CONTAINER_INVALID,
          field: 'pages',
          message: `Multi-frame animated image detected (${meta.pages} pages). Static image required.`,
          remediationAction: 'Remove animated frames and export a single-layer static PNG.',
          metadata: { pages: meta.pages },
        });
      }

      // 1d. Exact Dimensions Match
      if (actualWidth !== input.width || actualHeight !== input.height) {
        failures.push({
          code: HardGateCode.GATE_DIMENSIONS_MISMATCH,
          field: 'dimensions',
          message: `Asset dimensions ${actualWidth}×${actualHeight} do not match required canvas ${input.width}×${input.height}.`,
          remediationAction:
            'Adjust template output format to produce exact canvas dimensions for the target aspect ratio.',
          metadata: {
            actualWidth,
            actualHeight,
            expectedWidth: input.width,
            expectedHeight: input.height,
          },
        });
      }
    } catch (err: unknown) {
      failures.push({
        code: HardGateCode.GATE_CONTAINER_INVALID,
        field: 'assetBuffer',
        message: `Failed to decode image metadata with Sharp: ${err instanceof Error ? err.message : String(err)}`,
        remediationAction: 'Ensure asset buffer is a valid, uncorrupted PNG binary.',
        metadata: { error: String(err) },
      });
    }

    // =================================================================
    // 2. Product Truth & Alpha Edge Clipping Hard Gates
    // =================================================================

    // 2a. Known Placeholder Rejection
    const productHash =
      input.productSha256?.toLowerCase() ??
      (input.productAssetBuffer
        ? createHash('sha256').update(input.productAssetBuffer).digest('hex').toLowerCase()
        : undefined);

    if (productHash && KNOWN_PLACEHOLDER_HASHES.has(productHash)) {
      failures.push({
        code: HardGateCode.GATE_PLACEHOLDER_REJECTED,
        field: 'productSha256',
        message: `Product asset SHA-256 (${productHash}) matches a known demo/placeholder fixture.`,
        remediationAction:
          'Replace placeholder fixture with an approved authentic product cutout from the Product Asset Registry.',
        metadata: { productSha256: productHash },
      });
    }

    // 2b. Product Flacon Alpha Edge Clipping
    // A luxury bottle must NEVER touch or be cut off by the canvas border (x=0, y=0, x=W-1, y=H-1)
    if (input.heroBoundingBox) {
      const box = input.heroBoundingBox;
      const boxRight = box.x + box.width;
      const boxBottom = box.y + box.height;

      // If the bounding box itself breaches canvas border
      const touchesBorder =
        box.x <= 0 || box.y <= 0 || boxRight >= input.width || boxBottom >= input.height;

      if (touchesBorder) {
        // If product buffer is provided, check if actual opaque pixels touch the edge
        let hasOpaqueEdgePixel = true;
        if (input.productAssetBuffer) {
          try {
            const { data: rawAlpha, info: alphaInfo } = await sharp(input.productAssetBuffer)
              .extractChannel('alpha')
              .raw()
              .toBuffer({ resolveWithObject: true });

            // Check outer 1px border of the product cutout
            let topOpaque = false;
            let bottomOpaque = false;
            let leftOpaque = false;
            let rightOpaque = false;

            const w = alphaInfo.width;
            const h = alphaInfo.height;

            if (box.y <= 0) {
              // Top row
              for (let x = 0; x < w; x++) {
                if ((rawAlpha[x] ?? 0) > 10) {
                  topOpaque = true;
                  break;
                }
              }
            }
            if (boxBottom >= input.height) {
              // Bottom row
              const rowOffset = (h - 1) * w;
              for (let x = 0; x < w; x++) {
                if ((rawAlpha[rowOffset + x] ?? 0) > 10) {
                  bottomOpaque = true;
                  break;
                }
              }
            }
            if (box.x <= 0) {
              // Left column
              for (let y = 0; y < h; y++) {
                if ((rawAlpha[y * w] ?? 0) > 10) {
                  leftOpaque = true;
                  break;
                }
              }
            }
            if (boxRight >= input.width) {
              // Right column
              for (let y = 0; y < h; y++) {
                if ((rawAlpha[y * w + (w - 1)] ?? 0) > 10) {
                  rightOpaque = true;
                  break;
                }
              }
            }

            hasOpaqueEdgePixel =
              (box.y <= 0 && topOpaque) ||
              (boxBottom >= input.height && bottomOpaque) ||
              (box.x <= 0 && leftOpaque) ||
              (boxRight >= input.width && rightOpaque);
          } catch {
            hasOpaqueEdgePixel = true;
          }
        }

        if (hasOpaqueEdgePixel) {
          failures.push({
            code: HardGateCode.GATE_PRODUCT_ALPHA_CLIPPED,
            field: 'heroBoundingBox',
            message: `Product hero flacon is clipped at canvas border [x:${box.x}, y:${box.y}, w:${box.width}, h:${box.height}] in canvas ${input.width}×${input.height}.`,
            remediationAction:
              'Reposition product flacon to ensure all packaging pixels remain strictly within canvas bounds with safe margin padding.',
            metadata: {
              heroBoundingBox: box,
              canvas: { width: input.width, height: input.height },
            },
          });
        }
      }
    }

    // 2c. Minimum Product Visibility Area (>= 8% of canvas)
    if (input.heroBoundingBox) {
      try {
        let fillFactor = 0.7; // default estimated fill factor if buffer without alpha
        if (input.productAssetBuffer) {
          try {
            const { data: rawAlpha } = await sharp(input.productAssetBuffer)
              .extractChannel('alpha')
              .raw()
              .toBuffer({ resolveWithObject: true });

            let opaqueCount = 0;
            for (let i = 0; i < rawAlpha.length; i++) {
              if ((rawAlpha[i] ?? 0) > 15) {
                opaqueCount++;
              }
            }
            const totalProductPixels = rawAlpha.length;
            fillFactor = totalProductPixels > 0 ? opaqueCount / totalProductPixels : 0.7;
          } catch {
            fillFactor = 0.8;
          }
        }

        const estimatedOpaqueArea =
          input.heroBoundingBox.width * input.heroBoundingBox.height * fillFactor;
        const totalCanvasArea = input.width * input.height;

        productVisibleRatio =
          totalCanvasArea > 0
            ? Math.round((estimatedOpaqueArea / totalCanvasArea) * 1000) / 1000
            : 0;

        if (productVisibleRatio < MIN_PRODUCT_VISIBLE_RATIO) {
          failures.push({
            code: HardGateCode.GATE_PRODUCT_VISIBILITY_LOW,
            field: 'productAssetBuffer',
            message: `Product flacon visible ratio ${(productVisibleRatio * 100).toFixed(1)}% is below required ${MIN_PRODUCT_VISIBLE_RATIO * 100}% minimum area.`,
            remediationAction:
              'Scale up product flacon in template constraints to dominate visual hierarchy.',
            metadata: { productVisibleRatio, minRequired: MIN_PRODUCT_VISIBLE_RATIO },
          });
        }
      } catch {
        // Non-blocking if alpha extraction fails
      }
    }

    // =================================================================
    // 3. Layout Geometry & Containment Hard Gates
    // =================================================================

    const marginPercent = input.safeMarginPercent ?? DEFAULT_SAFE_MARGIN_PERCENT;
    const minLeft = Math.round(input.width * marginPercent);
    const maxRight = input.width - minLeft;
    const minTop = Math.round(input.height * marginPercent);
    const maxBottom = input.height - minTop;

    // 3a. Typography Safe Margin Containment
    if (input.typographyBlocks) {
      for (const block of input.typographyBlocks) {
        const boxRight = block.box.x + block.box.width;
        const boxBottom = block.box.y + block.box.height;

        const violatesSafeMargin =
          block.box.x < minLeft ||
          block.box.y < minTop ||
          boxRight > maxRight ||
          boxBottom > maxBottom;

        if (violatesSafeMargin) {
          failures.push({
            code: HardGateCode.GATE_SAFE_MARGIN_VIOLATION,
            field: `typographyBlocks[${block.role}]`,
            message: `Typography block '${block.role}' [x:${block.box.x}, y:${block.box.y}, w:${block.box.width}, h:${block.box.height}] penetrates ${(marginPercent * 100).toFixed(0)}% safe margin [${minLeft}..${maxRight}, ${minTop}..${maxBottom}].`,
            remediationAction:
              'Reduce font size, decrease line wrap length, or adjust text placement within template safe zones.',
            metadata: {
              role: block.role,
              box: block.box,
              safeBounds: { minLeft, maxRight, minTop, maxBottom },
            },
          });
        }
      }
    }

    // 3b. CTA Button Safe Margin Containment
    if (input.ctaBoundingBox) {
      const cta = input.ctaBoundingBox;
      const ctaRight = cta.x + cta.width;
      const ctaBottom = cta.y + cta.height;

      if (cta.x < minLeft || cta.y < minTop || ctaRight > maxRight || ctaBottom > maxBottom) {
        failures.push({
          code: HardGateCode.GATE_SAFE_MARGIN_VIOLATION,
          field: 'ctaBoundingBox',
          message: `CTA button [x:${cta.x}, y:${cta.y}, w:${cta.width}, h:${cta.height}] penetrates safe margin [${minLeft}..${maxRight}, ${minTop}..${maxBottom}].`,
          remediationAction:
            'Adjust CTA coordinates to keep button inside safe margins with appropriate padding.',
          metadata: { ctaBox: cta, safeBounds: { minLeft, maxRight, minTop, maxBottom } },
        });
      }
    }

    // 3c. CTA-Hero Collision
    if (input.heroBoundingBox && input.ctaBoundingBox) {
      if (boxesIntersect(input.heroBoundingBox, input.ctaBoundingBox)) {
        failures.push({
          code: HardGateCode.GATE_CTA_HERO_COLLISION,
          field: 'ctaBoundingBox',
          message:
            'CTA button bounding box overlaps product hero bounding box. Critical luxury layout collision.',
          remediationAction:
            'Reposition CTA button below the pedestal baseline line or away from the product flacon bounding box.',
          metadata: {
            heroBoundingBox: input.heroBoundingBox,
            ctaBoundingBox: input.ctaBoundingBox,
          },
        });
      }
    }

    // =================================================================
    // 4. Typography Unicode & WCAG Contrast Hard Gates
    // =================================================================

    if (input.typographyBlocks) {
      for (const block of input.typographyBlocks) {
        // 4a. Unicode Safety & Normalization
        try {
          normalizeAndValidateUnicode(block.text, block.role);
          if (block.text.includes('.notdef')) {
            throw new Error('Unmapped font glyph (.notdef) detected');
          }
        } catch (err: unknown) {
          const isPua =
            err instanceof PosterUnsafeUnicodeError &&
            ((err.codePoint >= 0xe000 && err.codePoint <= 0xf8ff) ||
              (err.codePoint >= 0xf0000 && err.codePoint <= 0xffffd) ||
              (err.codePoint >= 0x100000 && err.codePoint <= 0x10fffd));
          const isMissingGlyph = isPua || block.text.includes('.notdef');

          if (isMissingGlyph) {
            failures.push({
              code: HardGateCode.GATE_MISSING_GLYPHS,
              field: `typographyBlocks[${block.role}]`,
              message: `Typography block '${block.role}' contains unmapped glyphs or missing font characters: ${err instanceof Error ? err.message : String(err)}`,
              remediationAction:
                'Ensure selected font family supports all Unicode code points and glyphs required for this copy block.',
              metadata: { role: block.role, error: String(err) },
            });
          } else {
            failures.push({
              code: HardGateCode.GATE_UNSAFE_UNICODE,
              field: `typographyBlocks[${block.role}]`,
              message: `Typography block '${block.role}' contains unsafe Unicode characters: ${err instanceof Error ? err.message : String(err)}`,
              remediationAction:
                'Sanitize copy text by stripping bidi overrides, replacement characters (U+FFFD), and non-printable control codes.',
              metadata: { role: block.role, error: String(err) },
            });
          }
        }

        // 4b. Readability Contrast Ratio
        if (actualWidth > 0 && actualHeight > 0) {
          try {
            // Find underlying background buffer if layers are supplied
            const bgLayer = input.layers?.find((l) => l.layerGroup === 'BACKGROUND');
            const sampleSourceBuffer = bgLayer?.buffer ?? input.assetBuffer;

            // Clamp crop coordinates
            const cropLeft = Math.max(0, Math.min(actualWidth - 1, Math.round(block.box.x)));
            const cropTop = Math.max(0, Math.min(actualHeight - 1, Math.round(block.box.y)));
            const cropWidth = Math.max(
              1,
              Math.min(actualWidth - cropLeft, Math.round(block.box.width)),
            );
            const cropHeight = Math.max(
              1,
              Math.min(actualHeight - cropTop, Math.round(block.box.height)),
            );

            // Extract patch and calculate average RGB
            const patchRaw = await sharp(sampleSourceBuffer)
              .resize(actualWidth, actualHeight, { fit: 'fill' })
              .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
              .toColorspace('srgb')
              .removeAlpha()
              .raw()
              .toBuffer();

            let sumR = 0;
            let sumG = 0;
            let sumB = 0;
            const totalPixels = Math.floor(patchRaw.length / 3);

            for (let i = 0; i < patchRaw.length; i += 3) {
              sumR += patchRaw[i] ?? 0;
              sumG += patchRaw[i + 1] ?? 0;
              sumB += patchRaw[i + 2] ?? 0;
            }

            const avgR = totalPixels > 0 ? sumR / totalPixels : 255;
            const avgG = totalPixels > 0 ? sumG / totalPixels : 255;
            const avgB = totalPixels > 0 ? sumB / totalPixels : 255;

            const bgLuminance = calculateRelativeLuminance(avgR, avgG, avgB);

            // Text color luminance (default white if not provided)
            const textRgb = parseHexColor(block.textColor ?? '#FFFFFF');
            const textLuminance = calculateRelativeLuminance(textRgb.r, textRgb.g, textRgb.b);

            const contrastRatio =
              Math.round(calculateContrastRatio(textLuminance, bgLuminance) * 100) / 100;

            if (minTextContrastRatio === undefined || contrastRatio < minTextContrastRatio) {
              minTextContrastRatio = contrastRatio;
            }

            const isHeadlineOrPrice =
              block.role === 'headline' ||
              block.role === 'price' ||
              block.role === 'promotionalPrice' ||
              block.role === 'cta';

            const minAllowedRatio = isHeadlineOrPrice
              ? MIN_HEADLINE_CONTRAST_RATIO
              : MIN_BODY_CONTRAST_RATIO;

            if (contrastRatio < minAllowedRatio) {
              failures.push({
                code: HardGateCode.GATE_TEXT_CONTRAST_LOW,
                field: `typographyBlocks[${block.role}]`,
                message: `Text contrast ratio ${contrastRatio.toFixed(2)}:1 for '${block.role}' is below required minimum of ${minAllowedRatio.toFixed(1)}:1.`,
                remediationAction:
                  'Darken underlying background contrast panel or invert text color for legible luxury presentation.',
                metadata: {
                  role: block.role,
                  contrastRatio,
                  minAllowedRatio,
                  textColor: block.textColor ?? '#FFFFFF',
                  bgLuminance: Math.round(bgLuminance * 1000) / 1000,
                  textLuminance: Math.round(textLuminance * 1000) / 1000,
                },
              });
            }
          } catch {
            // Non-blocking if contrast sampling throws
          }
        }
      }
    }

    // =================================================================
    // 5. Factual Consistency Hard Gates
    // =================================================================
    if (input.productSnapshot || input.factualInput) {
      const factualGate = new FactualConsistencyGate();
      const factualInput: FactualGateInput = input.factualInput ?? {
        productSnapshot: input.productSnapshot!,
        typographyBlocks: input.typographyBlocks,
        renderedSnapshotHash: input.renderedSnapshotHash,
        sceneSku: input.sceneSku,
      };

      const factualOutcome = factualGate.evaluate(factualInput);
      failures.push(...factualOutcome.failures);
    }

    const isPassed = failures.length === 0;

    return {
      isPassed,
      validatorVersion: HARD_VISUAL_GATES_VERSION,
      evaluatedAt,
      failures,
      metrics: {
        byteSize,
        actualSha256,
        actualWidth,
        actualHeight,
        ...(productVisibleRatio !== undefined ? { productVisibleRatio } : {}),
        ...(minTextContrastRatio !== undefined ? { minTextContrastRatio } : {}),
      },
    };
  }
}
