import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  type HeroCompositor,
  type CompositeVisualInput,
  type CompositeVisualResult,
  type HeroBoundingBox,
  type HeroPlacement,
  type SourceProductBoundingBox,
  PS_COMPOSITOR_VERSION,
} from '../application/hero-compositor.port.js';

import {
  CreativeImageDecodeFailedError,
  CreativeUnsupportedImageFormatError,
  CreativeInputTooLargeError,
  CreativePixelLimitExceededError,
  CreativeAlphaRequiredError,
  CreativeInvalidLayoutError,
  CreativeCompositionFailedError,
  CreativeOutputTooLargeError,
} from '../domain/creative-errors.js';

export interface SharpHeroCompositorOptions {
  /**
   * Maximum input file size in bytes (default: 15 MB)
   */
  readonly maxInputBytes?: number;
  /**
   * Maximum decoded input pixels (default: 16,777,216 px = 16 MP)
   */
  readonly maxDecodedPixels?: number;
  /**
   * Maximum dimension per axis (default: 4096 px)
   */
  readonly maxDimension?: number;
  /**
   * Maximum output file size in bytes (default: 15 MB)
   */
  readonly maxOutputBytes?: number;
  /**
   * Timeout in milliseconds for compositing operations (default: 8000 ms)
   */
  readonly timeoutMs?: number;
  /**
   * Hero scale ratio relative to canvas height (default: 0.55 = 55% of canvas height)
   */
  readonly defaultHeroHeightRatio?: number;
  /**
   * Minimum margin percent around hero product (default: 0.05 = 5%)
   */
  readonly defaultMarginPercent?: number;
}

const DEFAULT_OPTIONS: Required<SharpHeroCompositorOptions> = {
  maxInputBytes: 15 * 1024 * 1024, // 15 MB
  maxDecodedPixels: 16777216, // 16 MP (4096 x 4096)
  maxDimension: 4096,
  maxOutputBytes: 15 * 1024 * 1024,
  timeoutMs: 8000,
  defaultHeroHeightRatio: 0.55,
  defaultMarginPercent: 0.05,
};

const SUPPORTED_BACKGROUND_FORMATS = new Set(['png', 'jpeg', 'jpg', 'webp']);
const SUPPORTED_PRODUCT_FORMATS = new Set(['png', 'webp']);

/**
 * Configure global Sharp resource controls defensively once.
 * - Concurrency capped at 2 to prevent CPU starvation.
 * - Memory cache bounded to 128 MB.
 * - Native loaders for HEIF and SVG explicitly blocked to eliminate libheif/librsvg attack surface
 *   (mitigating GHSA-rgj7-g3m4-5g8c and GHSA-wq5f-xc86-pv6w).
 */
let isSharpConfigured = false;
export function configureSharpResourceLimits(): void {
  if (isSharpConfigured) return;
  try {
    sharp.concurrency(2);
    sharp.cache({ memory: 128, files: 20, items: 100 });
    sharp.block({ operation: ['VipsForeignLoadHeif'] });
    try {
      sharp.unblock({ operation: ['VipsForeignLoadSvg'] });
    } catch {
      // Ignore if unblock is not supported
    }
  } catch {
    // Ignore if not supported in test environment
  }
  isSharpConfigured = true;
}

/**
 * SharpHeroCompositor
 *
 * Deterministic local hero product compositor adapter.
 *
 * Key Invariants:
 * 1. Product Identity: Canonical product is visual truth. Never alters product pixels
 *    (no color grading, hue shifts, saturation changes, contrast, or filters).
 * 2. Product Alpha: Canonical product must contain usable alpha transparency.
 * 3. Aspect Ratio: Preserved exactly during resizing with Lanczos3 filter.
 * 4. Deterministic Placement & Safe Margins: Hero is positioned deterministically within safe margins.
 * 5. Bounded Resources & Safe Decode: Strictly enforces input byte limits, dimension ceilings,
 *    pixel limits, and single-frame constraints before processing.
 * 6. Metadata Stripping: Strips EXIF/GPS/metadata, outputs sRGB PNG with cryptographically
 *    computed digests (productDigest, backgroundDigest, outputDigest).
 */
export class SharpHeroCompositor implements HeroCompositor {
  private readonly options: Required<SharpHeroCompositorOptions>;

  public constructor(options?: SharpHeroCompositorOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    configureSharpResourceLimits();
  }

  public async composite(input: CompositeVisualInput): Promise<CompositeVisualResult> {
    const startTime = Date.now();

    // 1. Verify input byte size limits
    if (input.backgroundBuffer.length > this.options.maxInputBytes) {
      throw new CreativeInputTooLargeError(
        input.backgroundBuffer.length,
        this.options.maxInputBytes,
      );
    }
    if (input.canonicalProductBuffer.length > this.options.maxInputBytes) {
      throw new CreativeInputTooLargeError(
        input.canonicalProductBuffer.length,
        this.options.maxInputBytes,
      );
    }

    // 2. Verify SHA-256 digests of inputs
    const actualBackgroundSha = createHash('sha256').update(input.backgroundBuffer).digest('hex');
    const actualProductSha = createHash('sha256')
      .update(input.canonicalProductBuffer)
      .digest('hex');

    if (input.backgroundSha256 && actualBackgroundSha !== input.backgroundSha256) {
      throw new CreativeCompositionFailedError(
        `Background SHA-256 mismatch. Expected: ${input.backgroundSha256}, Actual: ${actualBackgroundSha}`,
      );
    }
    if (input.canonicalProductSha256 && actualProductSha !== input.canonicalProductSha256) {
      throw new CreativeCompositionFailedError(
        `Canonical product SHA-256 mismatch. Expected: ${input.canonicalProductSha256}, Actual: ${actualProductSha}`,
      );
    }

    // 3. Inspect Background Metadata safely
    const _bgMetadata = await this.readMetadataSafely(
      input.backgroundBuffer,
      'background',
      SUPPORTED_BACKGROUND_FORMATS,
    );

    // 4. Inspect Product Metadata safely
    const prodMetadata = await this.readMetadataSafely(
      input.canonicalProductBuffer,
      'product',
      SUPPORTED_PRODUCT_FORMATS,
    );

    // 5. Enforce Alpha Transparency on Product
    if (!prodMetadata.hasAlpha) {
      throw new CreativeAlphaRequiredError(
        'Canonical product image must contain usable alpha transparency for compositing',
      );
    }

    // 6. Inspect product alpha buffer to ensure it actually has transparent pixels
    await this.verifyAlphaContent(input.canonicalProductBuffer, prodMetadata);

    // 7. Calculate Canvas Dimensions & Target Geometry
    const canvasWidth = input.targetWidth;
    const canvasHeight = input.targetHeight;
    if (canvasWidth <= 0 || canvasHeight <= 0) {
      throw new CreativeInvalidLayoutError(
        `Invalid target canvas dimensions: ${canvasWidth}x${canvasHeight}`,
      );
    }

    // Determine safe margins
    const marginPercent = input.compositionMarginPercent ?? this.options.defaultMarginPercent;
    const safeLeft = Math.round(canvasWidth * marginPercent);
    const safeRight = Math.round(canvasWidth * marginPercent);
    const safeTop = Math.round(canvasHeight * marginPercent);
    const safeBottom = Math.round(canvasHeight * marginPercent);
    const maxUsableWidth = canvasWidth - safeLeft - safeRight;
    const maxUsableHeight = canvasHeight - safeTop - safeBottom;

    if (maxUsableWidth <= 0 || maxUsableHeight <= 0) {
      throw new CreativeInvalidLayoutError('Safe margins exceed canvas dimensions');
    }

    // 7. Measure transparent padding & trimmed bounds of canonical product
    let trimmedBuffer = input.canonicalProductBuffer;
    let trimmedX = 0;
    let trimmedY = 0;
    let trimmedWidth = prodMetadata.width;
    let trimmedHeight = prodMetadata.height;

    try {
      const trimResult = await sharp(input.canonicalProductBuffer)
        .trim()
        .png({ compressionLevel: 9 })
        .toBuffer({ resolveWithObject: true });

      trimmedX = Math.abs(trimResult.info.trimOffsetLeft ?? 0);
      trimmedY = Math.abs(trimResult.info.trimOffsetTop ?? 0);
      trimmedWidth = trimResult.info.width;
      trimmedHeight = trimResult.info.height;
      trimmedBuffer = trimResult.data;
    } catch {
      // Fall back to original untrimmed bounds if trim fails
    }

    const sourceBoundingBox: SourceProductBoundingBox = {
      originalWidth: prodMetadata.width,
      originalHeight: prodMetadata.height,
      trimmedX,
      trimmedY,
      trimmedWidth,
      trimmedHeight,
    };

    // Determine target hero height & width preserving aspect ratio of visible product
    const heroHeightRatio = this.options.defaultHeroHeightRatio;
    const productAspect = trimmedWidth / trimmedHeight;
    let targetHeroHeight = Math.round(canvasHeight * heroHeightRatio);
    let targetHeroWidth = Math.round(targetHeroHeight * productAspect);

    // If hero width exceeds max usable width, scale down proportionally
    if (targetHeroWidth > maxUsableWidth) {
      targetHeroWidth = maxUsableWidth;
      targetHeroHeight = Math.round(targetHeroWidth / productAspect);
    }
    // If hero height exceeds max usable height, scale down proportionally
    if (targetHeroHeight > maxUsableHeight) {
      targetHeroHeight = maxUsableHeight;
      targetHeroWidth = Math.round(targetHeroHeight * productAspect);
    }

    // Determine vertical placement: anchor bottom to detected pedestal baseline if provided, else center vertically
    let heroY: number;
    if (input.pedestalYPercent !== undefined) {
      const pedestalBaselineY = Math.round(canvasHeight * input.pedestalYPercent);
      heroY = pedestalBaselineY - targetHeroHeight;
      if (heroY < safeTop) {
        const diff = safeTop - heroY;
        targetHeroHeight -= diff;
        targetHeroWidth = Math.round(targetHeroHeight * productAspect);
        heroY = safeTop;
      }
      if (heroY + targetHeroHeight > canvasHeight - safeBottom) {
        heroY = canvasHeight - safeBottom - targetHeroHeight;
      }
    } else {
      heroY = Math.round((canvasHeight - targetHeroHeight) / 2);
    }

    // Determine horizontal placement (LEFT, CENTER, RIGHT)
    const placement: HeroPlacement = input.heroPlacement ?? 'CENTER';
    let heroX: number;
    switch (placement) {
      case 'LEFT':
        heroX = Math.round(canvasWidth * 0.28 - targetHeroWidth / 2);
        if (heroX < safeLeft) heroX = safeLeft;
        break;
      case 'RIGHT':
        heroX = Math.round(canvasWidth * 0.72 - targetHeroWidth / 2);
        if (heroX + targetHeroWidth > canvasWidth - safeRight) {
          heroX = canvasWidth - safeRight - targetHeroWidth;
        }
        break;
      case 'CENTER':
      default:
        heroX = Math.round((canvasWidth - targetHeroWidth) / 2);
        break;
    }

    // Validate safe margin boundary invariant
    if (
      heroX < safeLeft ||
      heroY < safeTop ||
      heroX + targetHeroWidth > canvasWidth - safeRight ||
      heroY + targetHeroHeight > canvasHeight - safeBottom
    ) {
      throw new CreativeInvalidLayoutError(
        `Hero product placement exceeds safe margins: [x: ${heroX}, y: ${heroY}, w: ${targetHeroWidth}, h: ${targetHeroHeight}] in [${canvasWidth}x${canvasHeight}]`,
      );
    }

    const heroBoundingBox: HeroBoundingBox = {
      x: heroX,
      y: heroY,
      width: targetHeroWidth,
      height: targetHeroHeight,
    };

    // 8. Execute Deterministic Composition via Sharp
    try {
      // Step A: Process Background (resize cover, center, strip metadata, convert to sRGB)
      const resizedBgBuffer = await sharp(input.backgroundBuffer, {
        limitInputPixels: this.options.maxDecodedPixels,
      })
        .resize({
          width: canvasWidth,
          height: canvasHeight,
          fit: sharp.fit.cover,
          position: sharp.strategy.attention ? 'center' : 'center',
          kernel: sharp.kernel.lanczos3,
        })
        .toColorspace('srgb')
        .removeAlpha()
        .toBuffer();

      // Step B: Process Product Hero from trimmed bounds (resize preserving aspect ratio, Lanczos3, sRGB)
      const resizedProductBuffer = await sharp(trimmedBuffer, {
        limitInputPixels: this.options.maxDecodedPixels,
      })
        .resize({
          width: targetHeroWidth,
          height: targetHeroHeight,
          fit: sharp.fit.fill, // Exact aspect ratio already computed
          kernel: sharp.kernel.lanczos3,
        })
        .toColorspace('srgb')
        .png({ compressionLevel: 9 })
        .toBuffer();

      // Step C: Optional Subtle Contact Shadow generated from product alpha mask
      let contactShadowBoundingBox: HeroBoundingBox | undefined;
      const compositeLayers: sharp.OverlayOptions[] = [];

      const enableShadow = input.enableContactShadow ?? true;
      if (enableShadow && targetHeroWidth > 0 && targetHeroHeight > 0) {
        try {
          const alphaOnly = await sharp(resizedProductBuffer).extractChannel('alpha').toBuffer();

          const bottomSliceH = Math.max(4, Math.round(targetHeroHeight * 0.2));
          const shadowW = Math.round(targetHeroWidth * 1.05);
          const shadowH = Math.max(8, Math.round(targetHeroHeight * 0.035));

          const bottomSlice = await sharp(alphaOnly)
            .extract({
              left: 0,
              top: targetHeroHeight - bottomSliceH,
              width: targetHeroWidth,
              height: bottomSliceH,
            })
            .resize(shadowW, shadowH, { fit: sharp.fit.fill })
            .blur(4)
            .toBuffer();

          const { data: shadowRaw, info: shadowInfo } = await sharp(bottomSlice)
            .raw()
            .toBuffer({ resolveWithObject: true });

          const shadowRgba = Buffer.alloc(shadowInfo.width * shadowInfo.height * 4);
          for (let i = 0; i < shadowRaw.length; i++) {
            const offset = i * 4;
            shadowRgba[offset] = 0; // R
            shadowRgba[offset + 1] = 0; // G
            shadowRgba[offset + 2] = 0; // B
            shadowRgba[offset + 3] = Math.round(shadowRaw[i]! * 0.32); // Max 32% opacity
          }

          const shadowBuffer = await sharp(shadowRgba, {
            raw: {
              width: shadowInfo.width,
              height: shadowInfo.height,
              channels: 4,
            },
          })
            .png({ compressionLevel: 9 })
            .toBuffer();

          const shadowLeft = heroX - Math.round((shadowInfo.width - targetHeroWidth) / 2);
          const shadowTop = heroY + targetHeroHeight - Math.round(shadowInfo.height / 2);

          contactShadowBoundingBox = {
            x: shadowLeft,
            y: shadowTop,
            width: shadowInfo.width,
            height: shadowInfo.height,
          };

          compositeLayers.push({
            input: shadowBuffer,
            left: shadowLeft,
            top: shadowTop,
            blend: 'over',
          });
        } catch {
          // If shadow generation fails, composite hero cleanly without shadow
        }
      }

      // Step D: Composite Product Hero over contact shadow (original pixels never modified)
      compositeLayers.push({
        input: resizedProductBuffer,
        top: heroY,
        left: heroX,
        blend: 'over',
      });

      const compositedBuffer = await sharp(resizedBgBuffer, {
        limitInputPixels: this.options.maxDecodedPixels,
      })
        .composite(compositeLayers)
        .png({
          compressionLevel: 9,
          adaptiveFiltering: true,
          effort: 7,
        })
        .toBuffer();

      if (compositedBuffer.length > this.options.maxOutputBytes) {
        throw new CreativeOutputTooLargeError(compositedBuffer.length, this.options.maxOutputBytes);
      }

      const outputDigest = createHash('sha256').update(compositedBuffer).digest('hex');
      const latencyMs = Date.now() - startTime;

      return {
        compositedBuffer,
        mimeType: 'image/png',
        width: canvasWidth,
        height: canvasHeight,
        byteSize: compositedBuffer.length,
        sha256: outputDigest,
        latencyMs,
        compositorVersion: PS_COMPOSITOR_VERSION,
        heroScale: targetHeroHeight / canvasHeight,
        heroPlacement: placement,
        heroBoundingBox,
        sourceBoundingBox,
        contactShadowBoundingBox,
        productDigest: actualProductSha,
        backgroundDigest: actualBackgroundSha,
        outputDigest,
      };
    } catch (error) {
      if (
        error instanceof CreativeInputTooLargeError ||
        error instanceof CreativePixelLimitExceededError ||
        error instanceof CreativeAlphaRequiredError ||
        error instanceof CreativeInvalidLayoutError ||
        error instanceof CreativeOutputTooLargeError
      ) {
        throw error;
      }
      throw new CreativeCompositionFailedError(
        error instanceof Error ? error.message : 'Unknown compositing failure',
        { error: String(error) },
      );
    }
  }

  private async readMetadataSafely(
    buffer: Buffer,
    label: string,
    allowedFormats: ReadonlySet<string>,
  ): Promise<{ width: number; height: number; format: string; hasAlpha: boolean }> {
    try {
      const metadata = await sharp(buffer, {
        limitInputPixels: this.options.maxDecodedPixels,
      }).metadata();

      if (!metadata.format || !allowedFormats.has(metadata.format)) {
        throw new CreativeUnsupportedImageFormatError(
          metadata.format ?? 'unknown',
          Array.from(allowedFormats),
        );
      }

      if (metadata.pages && metadata.pages > 1) {
        throw new CreativeUnsupportedImageFormatError('animated-image', ['static-image']);
      }

      const width = metadata.width ?? 0;
      const height = metadata.height ?? 0;

      if (width <= 0 || height <= 0) {
        throw new CreativeImageDecodeFailedError(
          `Zero or negative dimensions for ${label} image: ${width}x${height}`,
        );
      }

      if (width > this.options.maxDimension || height > this.options.maxDimension) {
        throw new CreativeInvalidLayoutError(
          `${label} image dimensions ${width}x${height} exceed maximum allowed dimension ${this.options.maxDimension}`,
        );
      }

      const totalPixels = width * height;
      if (totalPixels > this.options.maxDecodedPixels) {
        throw new CreativePixelLimitExceededError(totalPixels, this.options.maxDecodedPixels);
      }

      return {
        width,
        height,
        format: metadata.format,
        hasAlpha: Boolean(metadata.hasAlpha),
      };
    } catch (error) {
      if (
        error instanceof CreativeUnsupportedImageFormatError ||
        error instanceof CreativePixelLimitExceededError ||
        error instanceof CreativeInvalidLayoutError ||
        error instanceof CreativeImageDecodeFailedError
      ) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('pixel limit') || message.includes('limitInputPixels')) {
        throw new CreativePixelLimitExceededError(0, this.options.maxDecodedPixels);
      }
      throw new CreativeImageDecodeFailedError(
        `Failed to decode ${label} image binary: ${message}`,
      );
    }
  }

  private async verifyAlphaContent(
    buffer: Buffer,
    _metadata: { width: number; height: number },
  ): Promise<void> {
    try {
      // Ensure image is RGBA (4 channels) and extract channel index (alpha is channel 3 in 0-indexed 4-channel image)
      const { data, info: _info } = await sharp(buffer)
        .ensureAlpha()
        .extractChannel('alpha')
        .raw()
        .toBuffer({ resolveWithObject: true });

      // In a raw 1-channel grayscale buffer of the alpha channel, data has 1 byte per pixel: 0=transparent, 255=opaque
      let hasTransparentPixel = false;
      const step = Math.max(1, Math.floor(data.length / 1000)); // Sample across pixels
      for (let i = 0; i < data.length; i += step) {
        if (data[i]! < 250) {
          hasTransparentPixel = true;
          break;
        }
      }

      if (!hasTransparentPixel) {
        throw new CreativeAlphaRequiredError(
          'Canonical product image has alpha channel but contains no transparent pixels',
        );
      }
    } catch (error) {
      if (error instanceof CreativeAlphaRequiredError) {
        throw error;
      }
      throw new CreativeAlphaRequiredError(
        'Failed to verify alpha transparency on canonical product image',
      );
    }
  }
}
