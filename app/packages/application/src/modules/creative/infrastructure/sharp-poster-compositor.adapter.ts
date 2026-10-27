import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  type PosterCompositor,
  type RenderPosterInput,
  type RenderPosterResult,
  POSTER_COMPOSITOR_VERSION,
} from '../application/poster-compositor.port.js';
import { type CompositorLayerInput } from '../application/hybrid-compositor.port.js';
import { SharpHybridCompositorAdapter } from './sharp-hybrid-compositor.adapter.js';
import { configureSharpResourceLimits } from './sharp-hero-compositor.adapter.js';
import {
  PosterTemplateRenderer,
  type ComputedTemplateLayout,
  type LayoutManifestElement,
} from '../domain/poster-templates.js';
import { loadEmbeddedFonts } from './fonts/font-loader.js';
import { CreativeCompositionFailedError, PosterCollisionError } from '../domain/creative-errors.js';
import { TextLayoutEngine, type BoundingBox } from '../domain/services/text-layout-engine.js';

export interface SharpPosterCompositorOptions {
  readonly maxOutputBytes?: number;
  readonly maxDecodedPixels?: number;
  readonly timeoutMs?: number;
}

const DEFAULT_OPTIONS: Required<SharpPosterCompositorOptions> = {
  maxOutputBytes: 15 * 1024 * 1024,
  maxDecodedPixels: 16777216,
  timeoutMs: 10000,
};

export class SharpPosterCompositor implements PosterCompositor {
  private readonly options: Required<SharpPosterCompositorOptions>;
  private readonly hybridCompositor: SharpHybridCompositorAdapter;

  public constructor(options?: SharpPosterCompositorOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    configureSharpResourceLimits();
    this.hybridCompositor = new SharpHybridCompositorAdapter({
      maxOutputBytes: this.options.maxOutputBytes,
      maxDecodedPixels: this.options.maxDecodedPixels,
      timeoutMs: this.options.timeoutMs,
    });
  }

  public async renderPoster(input: RenderPosterInput): Promise<RenderPosterResult> {
    const startTime = Date.now();

    // 1. Verify input digest integrity
    const actualProductSha = createHash('sha256')
      .update(input.canonicalProductBuffer)
      .digest('hex');
    if (actualProductSha !== input.canonicalProductSha256) {
      throw new CreativeCompositionFailedError(
        `Canonical product SHA-256 mismatch. Expected: ${input.canonicalProductSha256}, Actual: ${actualProductSha}`,
      );
    }

    const actualBackgroundSha = createHash('sha256').update(input.backgroundBuffer).digest('hex');
    if (actualBackgroundSha !== input.backgroundSha256) {
      throw new CreativeCompositionFailedError(
        `Background SHA-256 mismatch. Expected: ${input.backgroundSha256}, Actual: ${actualBackgroundSha}`,
      );
    }

    // 2. Load embedded OFL fonts
    const fonts = loadEmbeddedFonts();

    // 3. Compute deterministic layout from spec
    const { width: targetWidth, height: targetHeight } = input.posterSpec.outputFormat;
    const computedLayout: ComputedTemplateLayout = PosterTemplateRenderer.renderTemplate(
      input.posterSpec,
      fonts.fontFaceCss,
      { allowNonApprovedForTesting: input.allowNonApprovedForTesting },
    );

    // 4. Measure & trim authentic product image
    const prodMeta = await sharp(input.canonicalProductBuffer).metadata();
    if (!prodMeta.width || !prodMeta.height) {
      throw new CreativeCompositionFailedError('Cannot read canonical product image dimensions');
    }

    let trimmedBuffer = input.canonicalProductBuffer;
    let trimmedWidth = prodMeta.width;
    let trimmedHeight = prodMeta.height;
    let _trimmedX = 0;
    let _trimmedY = 0;

    try {
      const trimResult = await sharp(input.canonicalProductBuffer)
        .trim()
        .png({ compressionLevel: 9 })
        .toBuffer({ resolveWithObject: true });

      _trimmedX = Math.abs(trimResult.info.trimOffsetLeft ?? 0);
      _trimmedY = Math.abs(trimResult.info.trimOffsetTop ?? 0);
      trimmedWidth = trimResult.info.width;
      trimmedHeight = trimResult.info.height;
      trimmedBuffer = trimResult.data;
    } catch {
      // Keep untrimmed if trim fails
    }

    // 5. Proportionally scale product within hero zone (contain, never stretch)
    const { maxHeroWidth, maxHeroHeight, pedestalYPercent, placement } =
      computedLayout.productHeroZone;
    const productAspect = trimmedWidth / trimmedHeight;

    const safeTop = computedLayout.manifest.safeMargins.top;
    const pedestalBaselineY = Math.round(targetHeight * pedestalYPercent);
    const maxAvailableHeight = Math.min(maxHeroHeight, pedestalBaselineY - safeTop);

    let targetHeroHeight = maxAvailableHeight;
    let targetHeroWidth = Math.round(targetHeroHeight * productAspect);

    if (targetHeroWidth > maxHeroWidth) {
      targetHeroWidth = maxHeroWidth;
      targetHeroHeight = Math.round(targetHeroWidth / productAspect);
    }

    if (targetHeroHeight > maxAvailableHeight) {
      targetHeroHeight = maxAvailableHeight;
      targetHeroWidth = Math.round(targetHeroHeight * productAspect);
    }

    // Anchor bottom on pedestal baseline
    const heroY = pedestalBaselineY - targetHeroHeight;

    // Horizontal placement
    let heroX: number;
    switch (placement) {
      case 'LEFT':
        heroX =
          computedLayout.productHeroZone.boundingBox.x +
          Math.round((computedLayout.productHeroZone.boundingBox.width - targetHeroWidth) / 2);
        break;
      case 'RIGHT':
        heroX =
          computedLayout.productHeroZone.boundingBox.x +
          Math.round((computedLayout.productHeroZone.boundingBox.width - targetHeroWidth) / 2);
        break;
      case 'CENTER':
      default:
        heroX = Math.round((targetWidth - targetHeroWidth) / 2);
        break;
    }

    const actualProductBox: BoundingBox = {
      x: heroX,
      y: heroY,
      width: targetHeroWidth,
      height: targetHeroHeight,
    };

    // 6. Collision Detection: Ensure product does not collide with major text elements
    for (const el of computedLayout.manifest.elements) {
      if (el.type === 'TEXT') {
        if (TextLayoutEngine.boxesIntersect(actualProductBox, el.boundingBox, 4)) {
          throw new PosterCollisionError('authentic_product', el.id, {
            productBox: actualProductBox,
            textBox: el.boundingBox,
            text: el.text,
          });
        }
      }
    }

    // Update product bounding box in manifest
    const manifestElements: LayoutManifestElement[] = computedLayout.manifest.elements.map((el) => {
      if (el.id === 'product_hero_zone') {
        return {
          ...el,
          boundingBox: actualProductBox,
        };
      }
      return el;
    });

    // 8. Generate Separate Contact Shadow Layer from Alpha Mask
    let contactShadowBox: BoundingBox | undefined;
    let shadowBuffer: Buffer | undefined;

    try {
      const alphaOnly = await sharp(trimmedBuffer)
        .resize(targetHeroWidth, targetHeroHeight, {
          fit: sharp.fit.fill,
          kernel: sharp.kernel.lanczos3,
        })
        .extractChannel('alpha')
        .toBuffer();
      const bottomSliceH = Math.max(4, Math.round(targetHeroHeight * 0.18));
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
        shadowRgba[offset] = 0;
        shadowRgba[offset + 1] = 0;
        shadowRgba[offset + 2] = 0;
        shadowRgba[offset + 3] = Math.round((shadowRaw[i] ?? 0) * 0.35); // 35% shadow opacity
      }

      shadowBuffer = await sharp(shadowRgba, {
        raw: { width: shadowInfo.width, height: shadowInfo.height, channels: 4 },
      })
        .png({ compressionLevel: 9 })
        .toBuffer();

      const shadowLeft = heroX - Math.round((shadowInfo.width - targetHeroWidth) / 2);
      const shadowTop = heroY + targetHeroHeight - Math.round(shadowInfo.height / 2);

      contactShadowBox = {
        x: shadowLeft,
        y: shadowTop,
        width: shadowInfo.width,
        height: shadowInfo.height,
      };

      manifestElements.push({
        id: 'contact_shadow',
        type: 'SHADOW',
        boundingBox: contactShadowBox,
      });
    } catch {
      // Continue without contact shadow if mask extraction fails
    }

    // 9. Delegate to SharpHybridCompositor
    const layers: CompositorLayerInput[] = [
      {
        layerIndex: 0,
        layerGroup: 'BACKGROUND',
        buffer: input.backgroundBuffer,
        mimeType: input.backgroundMimeType,
        contentDigest: actualBackgroundSha,
        placement: {
          x: 0,
          y: 0,
          width: targetWidth,
          height: targetHeight,
        },
      },
    ];

    if (shadowBuffer && contactShadowBox) {
      const shadowSha = createHash('sha256').update(shadowBuffer).digest('hex');
      layers.push({
        layerIndex: 1,
        layerGroup: 'SHADOW',
        buffer: shadowBuffer,
        mimeType: 'image/png',
        contentDigest: shadowSha,
        placement: contactShadowBox,
      });
    }

    layers.push({
      layerIndex: 2,
      layerGroup: 'PRODUCT_HERO',
      buffer: input.canonicalProductBuffer,
      mimeType: input.canonicalProductMimeType,
      contentDigest: actualProductSha,
      placement: actualProductBox,
    });

    if (input.logoBuffer) {
      const logoW = Math.min(180, Math.round(targetWidth * 0.2));
      const logoSha = createHash('sha256').update(input.logoBuffer).digest('hex');
      layers.push({
        layerIndex: 3,
        layerGroup: 'BRAND_LOGO',
        buffer: input.logoBuffer,
        mimeType: 'image/png',
        contentDigest: logoSha,
        placement: {
          x: computedLayout.manifest.safeMargins.left,
          y: computedLayout.manifest.safeMargins.top,
          width: logoW,
          height: logoW,
        },
      });
    }

    const svgBuffer = Buffer.from(computedLayout.svgOverlay, 'utf8');
    const svgSha = createHash('sha256').update(svgBuffer).digest('hex');
    layers.push({
      layerIndex: 4,
      layerGroup: 'TYPOGRAPHY',
      buffer: svgBuffer,
      mimeType: 'image/svg+xml',
      contentDigest: svgSha,
      placement: {
        x: 0,
        y: 0,
        width: targetWidth,
        height: targetHeight,
      },
    });

    const hybridResult = await this.hybridCompositor.composite({
      creativeJobId: input.creativeJobId,
      templateId: input.posterSpec.templateId,
      aspectRatio: input.posterSpec.outputFormat.aspectRatio,
      canvas: {
        width: targetWidth,
        height: targetHeight,
        safeMargins: computedLayout.manifest.safeMargins,
      },
      layers,
      colorProfile: 'sRGB',
      enableContactShadow: false,
      allowNonApprovedForTesting: input.allowNonApprovedForTesting,
    });

    const posterBuffer = hybridResult.compositedBuffer;
    const outputDigest = hybridResult.sha256;
    const latencyMs = Date.now() - startTime;

    // 14. Optional Debug Layout Rendering (draws bounding boxes for QA/manifest validation)
    let debugLayoutBuffer: Buffer | undefined;
    if (input.generateDebugLayout) {
      const debugSvgBoxes = manifestElements
        .map((el) => {
          const color =
            el.type === 'PRODUCT'
              ? '#00FFCC'
              : el.type === 'TEXT'
                ? '#FF007F'
                : el.type === 'BUTTON'
                  ? '#00E5FF'
                  : el.type === 'BADGE'
                    ? '#FFB300'
                    : '#7C4DFF';
          return `
            <rect x="${el.boundingBox.x}" y="${el.boundingBox.y}" width="${el.boundingBox.width}" height="${el.boundingBox.height}" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="4,2" />
            <text x="${el.boundingBox.x + 4}" y="${el.boundingBox.y + 14}" font-family="monospace" font-size="11" fill="${color}" font-weight="bold">${escapeXml(el.id)}</text>
          `;
        })
        .join('\n');

      const debugSvg = `
        <svg width="${targetWidth}" height="${targetHeight}" xmlns="http://www.w3.org/2000/svg">
          ${debugSvgBoxes}
        </svg>
      `;

      debugLayoutBuffer = await sharp(posterBuffer)
        .composite([{ input: Buffer.from(debugSvg), left: 0, top: 0, blend: 'over' }])
        .png()
        .toBuffer();
    }

    const layoutManifest = {
      ...computedLayout.manifest,
      elements: manifestElements,
    };

    return {
      posterBuffer,
      mimeType: 'image/png',
      width: targetWidth,
      height: targetHeight,
      byteSize: posterBuffer.length,
      sha256: outputDigest,
      latencyMs,
      compositorVersion: POSTER_COMPOSITOR_VERSION,
      layoutManifest,
      debugLayoutBuffer,
      productDigest: actualProductSha,
      backgroundDigest: actualBackgroundSha,
      outputDigest,
    };
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
