import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  type VisualValidationFindingDraft,
  type VisualValidationOutcome,
  VISUAL_VALIDATOR_VERSION,
  VisualFindingCode,
  VisualValidationSeverity,
} from '../visual-validation.js';
import { type HeroBoundingBox } from '../../application/hero-compositor.port.js';
import {
  type HardGateEvaluationInput,
  type HardGateFailure,
  type HardGateOutcome,
  type TypographyBlockInput,
  HardGateCode,
} from './hard-visual-gates.port.js';
import { HardVisualGatesEngine } from './hard-visual-gates.engine.js';
import { type ProductSnapshot } from '../../../products/application/product-snapshot.repository.js';
import { type CompositorLayerInput } from '../../application/hybrid-compositor.port.js';

export const DETERMINISTIC_VISUAL_VALIDATOR = Symbol('DETERMINISTIC_VISUAL_VALIDATOR');

export interface ValidateVisualAssetInput {
  readonly assetBuffer: Buffer;
  readonly expectedSha256: string;
  readonly targetAspectRatio: string; // e.g. '1:1', '4:5', '9:16', '16:9'
  readonly targetWidth?: number;
  readonly targetHeight?: number;
  readonly heroBoundingBox?: HeroBoundingBox;
  readonly marginPercent?: number; // default: 0.05 (5%)
  readonly maxFileSizeBytes?: number; // default: 15MB
  readonly productAssetBuffer?: Buffer;
  readonly productSha256?: string;
  readonly ctaBoundingBox?: HeroBoundingBox;
  readonly typographyBlocks?: readonly TypographyBlockInput[];
  readonly productSnapshot?: ProductSnapshot;
  readonly renderedSnapshotHash?: string;
  readonly sceneSku?: string;
  readonly layers?: readonly CompositorLayerInput[];
}

export interface DeterministicVisualValidatorOptions {
  readonly maxFileSizeBytes?: number;
  readonly maxDecodedPixels?: number;
  readonly maxDimension?: number;
  readonly defaultMarginPercent?: number;
}

const DEFAULT_OPTIONS: Required<DeterministicVisualValidatorOptions> = {
  maxFileSizeBytes: 15 * 1024 * 1024, // 15MB
  maxDecodedPixels: 16777216, // 16MP (4096 x 4096)
  maxDimension: 4096,
  defaultMarginPercent: 0.05, // 5%
};

const SUPPORTED_FORMATS: ReadonlySet<string> = new Set(['png', 'jpeg', 'webp']);

/**
 * Maps a HardGateFailure to the legacy VisualValidationFindingDraft structure
 * preserving BLOCKING severity and adding operator remediation metadata.
 */
export function mapHardGateFailureToVisualFinding(
  failure: HardGateFailure,
): VisualValidationFindingDraft {
  let code: VisualFindingCode;
  switch (failure.code) {
    case HardGateCode.GATE_CAS_HASH_MISMATCH:
      code = VisualFindingCode.CAS_HASH_MISMATCH;
      break;
    case HardGateCode.GATE_FILE_SIZE_EXCEEDED:
      code = VisualFindingCode.FILE_SIZE_EXCEEDED;
      break;
    case HardGateCode.GATE_CONTAINER_INVALID:
      code = VisualFindingCode.CONTAINER_UNSUPPORTED;
      break;
    case HardGateCode.GATE_DIMENSIONS_MISMATCH:
      code = VisualFindingCode.DIMENSIONS_INVALID;
      break;
    case HardGateCode.GATE_SAFE_MARGIN_VIOLATION:
    case HardGateCode.GATE_CTA_HERO_COLLISION:
    case HardGateCode.GATE_PRODUCT_ALPHA_CLIPPED:
      code = VisualFindingCode.BOUNDING_BOX_OUT_OF_BOUNDS;
      break;
    case HardGateCode.GATE_PRODUCT_VISIBILITY_LOW:
    case HardGateCode.GATE_PLACEHOLDER_REJECTED:
      code = VisualFindingCode.SYNTHETIC_PRODUCT_DETECTED;
      break;
    case HardGateCode.GATE_TEXT_CONTRAST_LOW:
      code = VisualFindingCode.TEXT_CONTRAST_INSUFFICIENT;
      break;
    case HardGateCode.GATE_SNAPSHOT_STALE:
      code = VisualFindingCode.HERO_HASH_MISMATCH;
      break;
    case HardGateCode.GATE_UNSAFE_UNICODE:
    case HardGateCode.GATE_MISSING_GLYPHS:
    case HardGateCode.GATE_FACTUAL_PRICE_MISMATCH:
    case HardGateCode.GATE_FACTUAL_PROMO_MISMATCH:
    case HardGateCode.GATE_FACTUAL_SKU_MISMATCH:
      code = VisualFindingCode.UNEXPECTED_TEXT_DETECTED;
      break;
    default:
      code = VisualFindingCode.VALIDATOR_INTERNAL_ERROR;
  }

  return {
    field: failure.field,
    severity: VisualValidationSeverity.BLOCKING,
    code,
    message: failure.message,
    metadata: {
      ...failure.metadata,
      hardGateCode: failure.code,
      remediationAction: failure.remediationAction,
    },
  };
}

/**
 * Aspect ratio target tolerances:
 * 1:1 -> ratio 1.0 (e.g. 1080x1080, 2048x2048)
 * 4:5 -> ratio 0.8 (e.g. 1080x1350)
 * 9:16 -> ratio 9/16 = 0.5625 (e.g. 1080x1920)
 * 16:9 -> ratio 16/9 = 1.777777...
 */
function parseExpectedRatio(aspectRatioStr: string): number | null {
  const parts = aspectRatioStr.split(':');
  if (parts.length !== 2) return null;
  const num = Number(parts[0]);
  const den = Number(parts[1]);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
  return num / den;
}

export class DeterministicVisualValidator {
  private readonly options: Required<DeterministicVisualValidatorOptions>;
  public readonly hardGatesEngine: HardVisualGatesEngine;

  public constructor(options?: DeterministicVisualValidatorOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.hardGatesEngine = new HardVisualGatesEngine();
  }

  public async validate(input: ValidateVisualAssetInput): Promise<VisualValidationOutcome> {
    const findings: VisualValidationFindingDraft[] = [];

    // 1. CAS Integrity: Verify that SHA-256 of composite bytes strictly matches the expected storage hash
    const actualSha256 = createHash('sha256').update(input.assetBuffer).digest('hex');
    if (actualSha256.toLowerCase() !== input.expectedSha256.toLowerCase()) {
      findings.push({
        field: 'sha256',
        severity: VisualValidationSeverity.BLOCKING,
        code: VisualFindingCode.CAS_HASH_MISMATCH,
        message: `Asset SHA-256 hash mismatch. Expected: ${input.expectedSha256}, Actual: ${actualSha256}`,
        metadata: { expected: input.expectedSha256, actual: actualSha256 },
      });
    }

    // 2. Maximum file size limit: <= 15MB (or option limit)
    const maxBytes = input.maxFileSizeBytes ?? this.options.maxFileSizeBytes;
    if (input.assetBuffer.length > maxBytes) {
      findings.push({
        field: 'byteSize',
        severity: VisualValidationSeverity.BLOCKING,
        code: VisualFindingCode.FILE_SIZE_EXCEEDED,
        message: `Asset byte size ${input.assetBuffer.length} exceeds maximum allowed limit of ${maxBytes} bytes`,
        metadata: { byteSize: input.assetBuffer.length, maxBytes },
      });
    }

    // 3. Inspect image metadata via Sharp safely
    try {
      const metadata = await sharp(input.assetBuffer, {
        limitInputPixels: this.options.maxDecodedPixels,
      }).metadata();

      const format = metadata.format?.toLowerCase() ?? 'unknown';

      // Format check: Strictly PNG, JPEG, or WebP (reject SVG, GIF, animated formats, etc.)
      if (!SUPPORTED_FORMATS.has(format)) {
        findings.push({
          field: 'format',
          severity: VisualValidationSeverity.BLOCKING,
          code: VisualFindingCode.CONTAINER_UNSUPPORTED,
          message: `Unsupported container format '${format}'. Expected one of: ${Array.from(SUPPORTED_FORMATS).join(', ')}`,
          metadata: { format, supportedFormats: Array.from(SUPPORTED_FORMATS) },
        });
      }

      // Animated frame count check
      if (metadata.pages && metadata.pages > 1) {
        findings.push({
          field: 'pages',
          severity: VisualValidationSeverity.BLOCKING,
          code: VisualFindingCode.FRAME_COUNT_INVALID,
          message: `Multi-frame / animated image detected (${metadata.pages} frames). Static imagery required.`,
          metadata: { pages: metadata.pages },
        });
      }

      const width = metadata.width ?? 0;
      const height = metadata.height ?? 0;

      // Positive dimensions check
      if (width <= 0 || height <= 0) {
        findings.push({
          field: 'dimensions',
          severity: VisualValidationSeverity.BLOCKING,
          code: VisualFindingCode.DIMENSIONS_INVALID,
          message: `Invalid image dimensions: ${width}x${height}`,
          metadata: { width, height },
        });
      } else {
        // Maximum dimension check
        if (width > this.options.maxDimension || height > this.options.maxDimension) {
          findings.push({
            field: 'dimensions',
            severity: VisualValidationSeverity.BLOCKING,
            code: VisualFindingCode.DIMENSIONS_INVALID,
            message: `Dimensions ${width}x${height} exceed maximum allowed axis dimension of ${this.options.maxDimension}px`,
            metadata: { width, height, maxDimension: this.options.maxDimension },
          });
        }

        // Pixel ceiling check
        const totalPixels = width * height;
        if (totalPixels > this.options.maxDecodedPixels) {
          findings.push({
            field: 'pixels',
            severity: VisualValidationSeverity.BLOCKING,
            code: VisualFindingCode.PIXEL_CEILING_EXCEEDED,
            message: `Decoded pixel count ${totalPixels} exceeds ceiling of ${this.options.maxDecodedPixels}`,
            metadata: { totalPixels, maxDecodedPixels: this.options.maxDecodedPixels },
          });
        }

        // Target width/height exact match if specified
        if (input.targetWidth !== undefined && input.targetWidth !== width) {
          findings.push({
            field: 'width',
            severity: VisualValidationSeverity.BLOCKING,
            code: VisualFindingCode.DIMENSIONS_INVALID,
            message: `Image width ${width}px does not match target width ${input.targetWidth}px`,
            metadata: { width, expectedWidth: input.targetWidth },
          });
        }
        if (input.targetHeight !== undefined && input.targetHeight !== height) {
          findings.push({
            field: 'height',
            severity: VisualValidationSeverity.BLOCKING,
            code: VisualFindingCode.DIMENSIONS_INVALID,
            message: `Image height ${height}px does not match target height ${input.targetHeight}px`,
            metadata: { height, expectedHeight: input.targetHeight },
          });
        }

        // Aspect ratio verification
        const expectedRatio = parseExpectedRatio(input.targetAspectRatio);
        if (expectedRatio === null) {
          findings.push({
            field: 'aspectRatio',
            severity: VisualValidationSeverity.BLOCKING,
            code: VisualFindingCode.ASPECT_RATIO_MISMATCH,
            message: `Unrecognized target aspect ratio format: '${input.targetAspectRatio}'`,
            metadata: { targetAspectRatio: input.targetAspectRatio },
          });
        } else {
          const actualRatio = width / height;
          // Tolerance: 0.01 to allow slight integer rounding differences on standard ratios
          if (Math.abs(actualRatio - expectedRatio) > 0.01) {
            findings.push({
              field: 'aspectRatio',
              severity: VisualValidationSeverity.BLOCKING,
              code: VisualFindingCode.ASPECT_RATIO_MISMATCH,
              message: `Aspect ratio ${actualRatio.toFixed(3)} does not match target aspect ratio ${input.targetAspectRatio} (${expectedRatio.toFixed(3)})`,
              metadata: {
                actualRatio,
                expectedRatio,
                targetAspectRatio: input.targetAspectRatio,
                width,
                height,
              },
            });
          }
        }

        // 4. Bounding Box Containment: Ensure hero product placement sits completely inside canvas boundaries with safe margin (>= 5% padding)
        if (input.heroBoundingBox !== undefined) {
          const margin = input.marginPercent ?? this.options.defaultMarginPercent;
          const minLeft = Math.round(width * margin);
          const minTop = Math.round(height * margin);
          const maxRight = width - minLeft;
          const maxBottom = height - minTop;

          const box = input.heroBoundingBox;
          const boxRight = box.x + box.width;
          const boxBottom = box.y + box.height;

          if (
            box.x < minLeft ||
            box.y < minTop ||
            boxRight > maxRight ||
            boxBottom > maxBottom ||
            box.width <= 0 ||
            box.height <= 0
          ) {
            findings.push({
              field: 'heroBoundingBox',
              severity: VisualValidationSeverity.BLOCKING,
              code: VisualFindingCode.BOUNDING_BOX_OUT_OF_BOUNDS,
              message: `Hero bounding box [x:${box.x}, y:${box.y}, w:${box.width}, h:${box.height}] violates safe margin (${(margin * 100).toFixed(0)}%) within canvas [${width}x${height}]. Allowed bounds: [${minLeft}..${maxRight}, ${minTop}..${maxBottom}].`,
              metadata: {
                heroBoundingBox: box,
                safeBounds: { minLeft, minTop, maxRight, maxBottom },
                marginPercent: margin,
                canvasWidth: width,
                canvasHeight: height,
              },
            });
          }
        }
      }
    } catch (err: unknown) {
      findings.push({
        field: 'assetBuffer',
        severity: VisualValidationSeverity.BLOCKING,
        code: VisualFindingCode.VALIDATOR_INTERNAL_ERROR,
        message: `Failed to decode or inspect image binary: ${err instanceof Error ? err.message : String(err)}`,
        metadata: { error: String(err) },
      });
    }

    // 5. Extended Hard Visual Gates Evaluation (if domain hard gate inputs are supplied)
    if (
      input.typographyBlocks !== undefined ||
      input.productAssetBuffer !== undefined ||
      input.productSha256 !== undefined ||
      input.ctaBoundingBox !== undefined ||
      input.productSnapshot !== undefined
    ) {
      try {
        const hardGateOutcome = await this.hardGatesEngine.evaluate({
          assetBuffer: input.assetBuffer,
          expectedSha256: input.expectedSha256,
          aspectRatio: (input.targetAspectRatio as '1:1' | '4:5' | '9:16') || '1:1',
          width: input.targetWidth ?? 1080,
          height: input.targetHeight ?? 1080,
          heroBoundingBox: input.heroBoundingBox,
          ctaBoundingBox: input.ctaBoundingBox,
          typographyBlocks: input.typographyBlocks,
          productAssetBuffer: input.productAssetBuffer,
          productSha256: input.productSha256,
          productSnapshot: input.productSnapshot,
          renderedSnapshotHash: input.renderedSnapshotHash,
          sceneSku: input.sceneSku,
          layers: input.layers,
        });

        // Filter out duplicates for checks already performed deterministically above
        for (const failure of hardGateOutcome.failures) {
          if (
            failure.code !== HardGateCode.GATE_CAS_HASH_MISMATCH &&
            failure.code !== HardGateCode.GATE_FILE_SIZE_EXCEEDED &&
            failure.code !== HardGateCode.GATE_CONTAINER_INVALID &&
            failure.code !== HardGateCode.GATE_DIMENSIONS_MISMATCH
          ) {
            findings.push(mapHardGateFailureToVisualFinding(failure));
          }
        }
      } catch (err: unknown) {
        findings.push({
          field: 'hardVisualGates',
          severity: VisualValidationSeverity.BLOCKING,
          code: VisualFindingCode.VALIDATOR_INTERNAL_ERROR,
          message: `Hard visual gates evaluation encountered an internal error: ${err instanceof Error ? err.message : String(err)}`,
          metadata: { error: String(err) },
        });
      }
    }

    const blockingCount = findings.filter(
      (f) => f.severity === VisualValidationSeverity.BLOCKING,
    ).length;
    const warningCount = findings.filter(
      (f) => f.severity === VisualValidationSeverity.WARNING,
    ).length;
    const infoCount = findings.filter((f) => f.severity === VisualValidationSeverity.INFO).length;

    let status: 'PASSED' | 'PASSED_WITH_WARNINGS' | 'BLOCKED' | 'FAILED' = 'PASSED';
    if (blockingCount > 0) {
      status = 'FAILED';
    } else if (warningCount > 0) {
      status = 'PASSED_WITH_WARNINGS';
    }

    return {
      validatorVersion: VISUAL_VALIDATOR_VERSION,
      status,
      findings,
      findingCount: findings.length,
      blockingCount,
      warningCount,
      infoCount,
    };
  }

  /**
   * Directly evaluates the W24 Hard Visual Gates against input parameters.
   */
  public async evaluateHardGates(input: HardGateEvaluationInput): Promise<HardGateOutcome> {
    return this.hardGatesEngine.evaluate(input);
  }

  /**
   * Evaluates Hard Visual Gates and converts the result into legacy VisualValidationOutcome format.
   */
  public async validateWithHardGates(
    input: HardGateEvaluationInput,
  ): Promise<VisualValidationOutcome> {
    const outcome = await this.hardGatesEngine.evaluate(input);
    const findings: VisualValidationFindingDraft[] = outcome.failures.map(
      mapHardGateFailureToVisualFinding,
    );
    const blockingCount = findings.filter(
      (f) => f.severity === VisualValidationSeverity.BLOCKING,
    ).length;
    const warningCount = findings.filter(
      (f) => f.severity === VisualValidationSeverity.WARNING,
    ).length;
    const infoCount = findings.filter((f) => f.severity === VisualValidationSeverity.INFO).length;

    let status: 'PASSED' | 'PASSED_WITH_WARNINGS' | 'BLOCKED' | 'FAILED' = 'PASSED';
    if (blockingCount > 0) {
      status = 'FAILED';
    } else if (warningCount > 0) {
      status = 'PASSED_WITH_WARNINGS';
    }

    return {
      validatorVersion: VISUAL_VALIDATOR_VERSION,
      status,
      findings,
      findingCount: findings.length,
      blockingCount,
      warningCount,
      infoCount,
    };
  }
}
