import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { type ProductAssetValidationStatus } from '../../../products/domain/product-asset.js';
import { ProductAssetMaskDimensionMismatchError } from '../../../products/domain/product-asset-errors.js';
import {
  AssetDigestMismatchError,
  CanonicalProductOpaqueError,
  CreativePixelLimitExceededError,
  CreativeUnsupportedImageFormatError,
  KnownPlaceholderRejectedError,
  ProductAssetValidationError,
} from '../creative-errors.js';

export const PRODUCT_ASSET_VALIDATOR = Symbol('PRODUCT_ASSET_VALIDATOR');
export const CURRENT_VALIDATOR_VERSION = '1.0.0';

export const KNOWN_PLACEHOLDER_HASHES: ReadonlySet<string> = new Set([
  // Gold rectangular block from legacy fake product fixture (width: 600, height: 600)
  '119f6d45a02aa0bb92591baaee926f322e33eb2221544f5e4cfb2187988734a3',
  // Cosmetic rectangular block from legacy fake product fixture (width: 600, height: 600)
  '1f811e16ed7a46c70c11b338b27bb22c345cab109aa3da725e4724eda2017d08',
]);

export interface ValidateProductAssetInput {
  readonly assetBuffer: Buffer;
  readonly expectedSku: string;
  readonly expectedSha256?: string | undefined;
  readonly mimeType?: string | undefined;
  readonly maxFileSizeBytes?: number | undefined;
  readonly maxDecodedPixels?: number | undefined;
  readonly maxDimension?: number | undefined;
  readonly minDimension?: number | undefined;
  readonly minVisibleRatio?: number | undefined; // default: 0.05 (5%)
  readonly maxVisibleRatio?: number | undefined; // default: 0.98 (98%)
  readonly role?: string | undefined; // 'HERO_CUTOUT' | 'ORIGINAL_SOURCE' etc. Default is HERO_CUTOUT
}

export interface TrimmedBounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly rightPadding: number;
  readonly bottomPadding: number;
}

export interface ProductAssetValidationResult {
  readonly isValid: boolean;
  readonly status: ProductAssetValidationStatus;
  readonly validatorVersion: string;
  readonly actualSha256: string;
  readonly mimeType: string;
  readonly format: string;
  readonly width: number;
  readonly height: number;
  readonly hasAlpha: boolean;
  readonly visiblePixelCount: number;
  readonly totalPixelCount: number;
  readonly visibleRatio: number;
  readonly trimmedBounds: TrimmedBounds;
  readonly trimmedBuffer: Buffer;
  readonly findings: readonly string[];
  readonly reasonCodes: readonly string[];
}

export interface ProductAssetValidatorOptions {
  readonly maxFileSizeBytes?: number;
  readonly maxDecodedPixels?: number;
  readonly maxDimension?: number;
  readonly minVisibleRatio?: number;
  readonly maxVisibleRatio?: number;
  readonly knownPlaceholderHashes?: ReadonlySet<string>;
}

const DEFAULT_OPTIONS: Required<ProductAssetValidatorOptions> = {
  maxFileSizeBytes: 20 * 1024 * 1024, // 20 MB
  maxDecodedPixels: 16_000_000, // 16 megapixels
  maxDimension: 8192,
  minVisibleRatio: 0.05, // 5%
  maxVisibleRatio: 0.98, // 98%
  knownPlaceholderHashes: KNOWN_PLACEHOLDER_HASHES,
};

const HERO_SUPPORTED_FORMATS = new Set(['png', 'webp']);
const SOURCE_SUPPORTED_FORMATS = new Set(['png', 'webp', 'jpeg', 'jpg']);

const HERO_SUPPORTED_MIMES = new Set(['image/png', 'image/webp']);
const SOURCE_SUPPORTED_MIMES = new Set(['image/png', 'image/webp', 'image/jpeg', 'image/jpg']);

export class ProductAssetValidator {
  private readonly options: Required<ProductAssetValidatorOptions>;

  public constructor(options?: ProductAssetValidatorOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  public get version(): string {
    return CURRENT_VALIDATOR_VERSION;
  }

  public async validate(input: ValidateProductAssetInput): Promise<ProductAssetValidationResult> {
    const findings: string[] = [];
    const reasonCodes: string[] = [];
    const isHero = !input.role || input.role === 'HERO_CUTOUT';

    // 1. Buffer existence and minimum size
    if (!input.assetBuffer || input.assetBuffer.length === 0) {
      findings.push('Product asset buffer is empty or missing');
      reasonCodes.push('EMPTY_BUFFER');
      return this.buildResult(input, {
        actualSha256: '',
        mimeType: input.mimeType ?? 'application/octet-stream',
        format: 'unknown',
        width: 0,
        height: 0,
        hasAlpha: false,
        visiblePixelCount: 0,
        totalPixelCount: 0,
        visibleRatio: 0,
        trimmedBounds: { left: 0, top: 0, width: 0, height: 0, rightPadding: 0, bottomPadding: 0 },
        trimmedBuffer: Buffer.alloc(0),
        findings,
        reasonCodes,
      });
    }

    // 2. Compute actual SHA-256
    const actualSha256 = createHash('sha256').update(input.assetBuffer).digest('hex').toLowerCase();

    // 3. Known placeholder detection
    if (this.options.knownPlaceholderHashes.has(actualSha256)) {
      findings.push(
        `Known placeholder image detected (digest: ${actualSha256}). Authentic product photography required.`,
      );
      reasonCodes.push('KNOWN_PLACEHOLDER');
    }

    // 4. Digest verification
    if (input.expectedSha256) {
      const expected = input.expectedSha256.trim().toLowerCase();
      if (actualSha256 !== expected) {
        findings.push(`Asset digest mismatch: expected ${expected}, got ${actualSha256}`);
        reasonCodes.push('DIGEST_MISMATCH');
      }
    }

    // 5. File size limits
    const maxBytes = input.maxFileSizeBytes ?? this.options.maxFileSizeBytes;
    if (input.assetBuffer.length > maxBytes) {
      findings.push(
        `File size (${input.assetBuffer.length} bytes) exceeds limit of ${maxBytes} bytes`,
      );
      reasonCodes.push('FILE_SIZE_LIMIT_EXCEEDED');
    }

    // 6. Decode image metadata using Sharp
    let metadata: sharp.Metadata;
    try {
      metadata = await sharp(input.assetBuffer).metadata();
    } catch (err) {
      findings.push(`Image decode failed: ${err instanceof Error ? err.message : String(err)}`);
      reasonCodes.push('DECODE_FAILED');
      return this.buildResult(input, {
        actualSha256,
        mimeType: input.mimeType ?? 'application/octet-stream',
        format: 'unknown',
        width: 0,
        height: 0,
        hasAlpha: false,
        visiblePixelCount: 0,
        totalPixelCount: 0,
        visibleRatio: 0,
        trimmedBounds: { left: 0, top: 0, width: 0, height: 0, rightPadding: 0, bottomPadding: 0 },
        trimmedBuffer: input.assetBuffer,
        findings,
        reasonCodes,
      });
    }

    const format = (metadata.format ?? 'unknown').toLowerCase();
    const supportedFormats = isHero ? HERO_SUPPORTED_FORMATS : SOURCE_SUPPORTED_FORMATS;
    const supportedMimes = isHero ? HERO_SUPPORTED_MIMES : SOURCE_SUPPORTED_MIMES;

    if (!supportedFormats.has(format)) {
      findings.push(
        isHero
          ? `Unsupported image format: "${format}". Canonical product must be PNG or WebP with alpha transparency.`
          : `Unsupported image format: "${format}". Expected PNG, WebP, or JPEG.`,
      );
      reasonCodes.push('UNSUPPORTED_FORMAT');
    }

    if (input.mimeType && !supportedMimes.has(input.mimeType.toLowerCase())) {
      findings.push(
        isHero
          ? `Unsupported MIME type: "${input.mimeType}". Expected image/png or image/webp.`
          : `Unsupported MIME type: "${input.mimeType}". Expected image/png, image/webp, or image/jpeg.`,
      );
      reasonCodes.push('UNSUPPORTED_MIME');
    }

    // Single-frame static image check
    if (metadata.pages && metadata.pages > 1) {
      findings.push('Animated or multi-frame images are not permitted as product assets');
      reasonCodes.push('ANIMATED_IMAGE_REJECTED');
    }

    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    const maxDim = input.maxDimension ?? this.options.maxDimension;

    if (width <= 0 || height <= 0) {
      findings.push(`Invalid image dimensions: ${width}x${height}`);
      reasonCodes.push('INVALID_DIMENSIONS');
    } else if (width > maxDim || height > maxDim) {
      findings.push(`Dimensions ${width}x${height} exceed maximum permitted dimension ${maxDim}px`);
      reasonCodes.push('DIMENSIONS_EXCEEDED');
    } else if (input.minDimension && (width < input.minDimension || height < input.minDimension)) {
      findings.push(
        `Dimensions ${width}x${height} are below minimum permitted dimension ${input.minDimension}px`,
      );
      reasonCodes.push('DIMENSIONS_BELOW_MINIMUM');
    }

    const totalPixelCount = width * height;
    const maxPixels = input.maxDecodedPixels ?? this.options.maxDecodedPixels;
    if (totalPixelCount > maxPixels) {
      findings.push(
        `Decoded pixel count (${totalPixelCount}) exceeds maximum limit (${maxPixels})`,
      );
      reasonCodes.push('PIXEL_COUNT_EXCEEDED');
    }

    // 7. Alpha channel verification
    if (isHero && !metadata.hasAlpha) {
      findings.push(
        'Canonical product image has an opaque background. Please supply a transparent PNG.',
      );
      reasonCodes.push('OPAQUE_HERO_REJECTED');
    }

    // 8. Pixel analysis & transparency verification
    let visiblePixelCount = 0;
    let visibleRatio = 0;
    let hasTransparentPixel = false;

    if (metadata.hasAlpha && width > 0 && height > 0) {
      try {
        const { data: alphaData } = await sharp(input.assetBuffer)
          .ensureAlpha()
          .extractChannel('alpha')
          .raw()
          .toBuffer({ resolveWithObject: true });

        for (let i = 0; i < alphaData.length; i++) {
          const a = alphaData[i]!;
          if (a > 10) {
            visiblePixelCount++;
          }
          if (a < 250) {
            hasTransparentPixel = true;
          }
        }

        visibleRatio = totalPixelCount > 0 ? visiblePixelCount / totalPixelCount : 0;

        if (isHero && !hasTransparentPixel) {
          findings.push(
            'Canonical product image has an opaque background. Please supply a transparent PNG.',
          );
          reasonCodes.push('OPAQUE_HERO_REJECTED');
        }

        if (isHero) {
          const minVis = input.minVisibleRatio ?? this.options.minVisibleRatio;
          const maxVis = input.maxVisibleRatio ?? this.options.maxVisibleRatio;

          if (visibleRatio < minVis) {
            findings.push(
              `Product visible area occupies ${(visibleRatio * 100).toFixed(1)}% of canvas, below minimum threshold of ${(minVis * 100).toFixed(1)}%`,
            );
            reasonCodes.push('VISIBLE_RATIO_TOO_LOW');
          }

          if (visibleRatio > maxVis) {
            findings.push(
              `Product visible area occupies ${(visibleRatio * 100).toFixed(1)}% of canvas with insufficient transparent margin (max ${(maxVis * 100).toFixed(1)}%)`,
            );
            reasonCodes.push('VISIBLE_RATIO_TOO_HIGH');
          }
        }
      } catch (err) {
        findings.push(
          `Failed to inspect alpha channel: ${err instanceof Error ? err.message : String(err)}`,
        );
        reasonCodes.push('ALPHA_INSPECTION_FAILED');
      }
    }

    // 9. Transparent bound trimming
    let trimmedBounds: TrimmedBounds = {
      left: 0,
      top: 0,
      width,
      height,
      rightPadding: 0,
      bottomPadding: 0,
    };
    let trimmedBuffer = input.assetBuffer;

    if (metadata.hasAlpha && hasTransparentPixel && width > 0 && height > 0) {
      try {
        const trimmedResult = await sharp(input.assetBuffer)
          .trim()
          .png({ compressionLevel: 9 })
          .toBuffer({ resolveWithObject: true });

        const trimLeft = Math.abs(trimmedResult.info.trimOffsetLeft ?? 0);
        const trimTop = Math.abs(trimmedResult.info.trimOffsetTop ?? 0);
        const trimWidth = trimmedResult.info.width;
        const trimHeight = trimmedResult.info.height;
        const rightPad = Math.max(0, width - (trimLeft + trimWidth));
        const bottomPad = Math.max(0, height - (trimTop + trimHeight));

        trimmedBounds = {
          left: trimLeft,
          top: trimTop,
          width: trimWidth,
          height: trimHeight,
          rightPadding: rightPad,
          bottomPadding: bottomPad,
        };
        trimmedBuffer = trimmedResult.data;
      } catch {
        // Keep original bounds on trim error
      }
    }

    return this.buildResult(input, {
      actualSha256,
      mimeType: input.mimeType ?? `image/${format}`,
      format,
      width,
      height,
      hasAlpha: Boolean(metadata.hasAlpha),
      visiblePixelCount,
      totalPixelCount,
      visibleRatio,
      trimmedBounds,
      trimmedBuffer,
      findings,
      reasonCodes,
    });
  }

  private buildResult(
    input: ValidateProductAssetInput,
    data: {
      actualSha256: string;
      mimeType: string;
      format: string;
      width: number;
      height: number;
      hasAlpha: boolean;
      visiblePixelCount: number;
      totalPixelCount: number;
      visibleRatio: number;
      trimmedBounds: TrimmedBounds;
      trimmedBuffer: Buffer;
      findings: readonly string[];
      reasonCodes: readonly string[];
    },
  ): ProductAssetValidationResult {
    const isValid = data.findings.length === 0;
    const status: ProductAssetValidationStatus = isValid ? 'PASS' : 'FAIL';

    return {
      isValid,
      status,
      validatorVersion: CURRENT_VALIDATOR_VERSION,
      actualSha256: data.actualSha256,
      mimeType: data.mimeType,
      format: data.format,
      width: data.width,
      height: data.height,
      hasAlpha: data.hasAlpha,
      visiblePixelCount: data.visiblePixelCount,
      totalPixelCount: data.totalPixelCount,
      visibleRatio: data.visibleRatio,
      trimmedBounds: data.trimmedBounds,
      trimmedBuffer: data.trimmedBuffer,
      findings: data.findings,
      reasonCodes: data.reasonCodes,
    };
  }

  /**
   * Validates a mask asset against its parent asset dimensions.
   */
  public async validateMask(
    maskBuffer: Buffer,
    parentWidth: number,
    parentHeight: number,
  ): Promise<ProductAssetValidationResult> {
    const result = await this.validate({
      assetBuffer: maskBuffer,
      expectedSku: 'MASK',
      role: 'MASK',
    });

    if (result.width !== parentWidth || result.height !== parentHeight) {
      throw new ProductAssetMaskDimensionMismatchError(
        parentWidth,
        parentHeight,
        result.width,
        result.height,
      );
    }

    return result;
  }

  /**
   * Asserts that the product asset is valid, throwing a domain error if any check fails.
   */
  public async assertValid(
    input: ValidateProductAssetInput,
  ): Promise<ProductAssetValidationResult> {
    const computedSha = createHash('sha256').update(input.assetBuffer).digest('hex').toLowerCase();

    if (this.options.knownPlaceholderHashes.has(computedSha)) {
      throw new KnownPlaceholderRejectedError(computedSha);
    }

    if (input.expectedSha256 && computedSha !== input.expectedSha256.trim().toLowerCase()) {
      throw new AssetDigestMismatchError(input.expectedSha256, computedSha);
    }

    const result = await this.validate(input);

    if (!result.isValid) {
      const opaqueFinding = result.findings.find((f) =>
        f.toLowerCase().includes('opaque background'),
      );
      if (opaqueFinding) {
        throw new CanonicalProductOpaqueError(opaqueFinding);
      }

      const placeholderFinding = result.findings.find((f) =>
        f.toLowerCase().includes('placeholder'),
      );
      if (placeholderFinding) {
        throw new KnownPlaceholderRejectedError(result.actualSha256);
      }

      const hashFinding = result.findings.find((f) => f.toLowerCase().includes('digest mismatch'));
      if (hashFinding) {
        throw new AssetDigestMismatchError(input.expectedSha256 ?? 'unknown', result.actualSha256);
      }

      const formatFinding = result.findings.find(
        (f) => f.includes('Unsupported image format') || f.includes('Unsupported MIME'),
      );
      if (formatFinding) {
        throw new CreativeUnsupportedImageFormatError(result.mimeType, ['png', 'webp']);
      }

      const pixelLimitFinding = result.findings.find((f) => f.includes('exceeds maximum limit'));
      if (pixelLimitFinding) {
        throw new CreativePixelLimitExceededError(
          result.totalPixelCount,
          input.maxDecodedPixels ?? this.options.maxDecodedPixels,
        );
      }

      throw new ProductAssetValidationError(result.findings.join('; '));
    }

    return result;
  }
}
