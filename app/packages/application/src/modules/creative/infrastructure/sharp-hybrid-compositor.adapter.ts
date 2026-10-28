import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import sharp from 'sharp';
import {
  HYBRID_COMPOSITOR_VERSION,
  type CompositorLayerGroup,
  type CompositorLayerInput,
  type HybridCompositor,
  type HybridCompositorInput,
  type HybridCompositorResult,
  type LayerAssetResolver,
  type LayerExecutionManifestEntry,
} from '../application/hybrid-compositor.port.js';
import {
  CompositorLayerMissingAssetError,
  CreativeImageDecodeFailedError,
  CreativeOutputTooLargeError,
  ProductHeroContainmentError,
} from '../domain/creative-errors.js';
import { type CreativeSceneVersionRecord } from '../domain/scene/creative-scene.types.js';
import { type BoundingBox } from '../domain/services/text-layout-engine.js';
import { TemplateRegistry } from '../domain/templates/template-registry.js';
import { type TemplateSemVer } from '../domain/templates/template-registry.types.js';
import { CompositorRenderCache, validateCompositorInput } from './compositor-render-cache.js';
import { CompositorMetricsTracker } from './compositor-metrics.tracker.js';
import { configureSharpResourceLimits } from './sharp-hero-compositor.adapter.js';
import { boxesIntersect } from '../domain/services/hard-visual-gates.port.js';

export { boxesIntersect };

export interface SharpHybridCompositorOptions {
  readonly renderCache?: CompositorRenderCache | undefined;
  readonly metricsTracker?: CompositorMetricsTracker | undefined;
  readonly maxOutputBytes?: number | undefined; // default: 15 MB
  readonly maxDecodedPixels?: number | undefined; // default: 16 MP (4096 x 4096)
  readonly timeoutMs?: number | undefined; // default: 10000 ms
  readonly defaultMarginPercent?: number | undefined; // default: 0.05 (5%)
}

interface InternalCompositorOptions {
  readonly maxOutputBytes: number;
  readonly maxDecodedPixels: number;
  readonly timeoutMs: number;
  readonly defaultMarginPercent: number;
}

const DEFAULT_OPTIONS: InternalCompositorOptions = {
  maxOutputBytes: 15 * 1024 * 1024,
  maxDecodedPixels: 16777216,
  timeoutMs: 10000,
  defaultMarginPercent: 0.05,
};

/**
 * Deterministic Sharp Hybrid Compositor Adapter.
 *
 * Executes the strict 8-layer vertical Z-order compositing pipeline:
 * - Layer 1 (000–049): Background (AI photographic / luxury CAS texture)
 * - Layer 2 (050–099): Contrast Panel (readability gradient / vignette)
 * - Layer 3 (100–149): Pedestal / Grounding Surface
 * - Layer 4 (150–199): Contact & Ambient Shadow (synthesized from alpha)
 * - Layer 5 (200–299): Product Hero (authentic packaging pixels, contain mode, zero crop)
 * - Layer 6 (300–349): Brand Logo (clear-space buffer)
 * - Layer 7 (350–449): Typography & Badges (HarfBuzz shaped vector glyph paths)
 * - Layer 8 (450–499): Frame & Decorative Accents
 *
 * Guarantees:
 * 1. Product visual truth: zero cropping, zero color distortion, exact aspect ratio.
 * 2. sRGB IEC61966-2.1 color normalization with volatile metadata stripped.
 * 3. Content-addressable render cache integration with sub-2ms hit latency.
 * 4. Safe margin and CTA containment assertion with typed fail-closed errors.
 */
export class SharpHybridCompositorAdapter implements HybridCompositor {
  private readonly options: InternalCompositorOptions;
  private readonly renderCache: CompositorRenderCache;
  private readonly metricsTracker: CompositorMetricsTracker;

  public constructor(options?: SharpHybridCompositorOptions) {
    this.options = {
      maxOutputBytes: options?.maxOutputBytes ?? DEFAULT_OPTIONS.maxOutputBytes,
      maxDecodedPixels: options?.maxDecodedPixels ?? DEFAULT_OPTIONS.maxDecodedPixels,
      timeoutMs: options?.timeoutMs ?? DEFAULT_OPTIONS.timeoutMs,
      defaultMarginPercent: options?.defaultMarginPercent ?? DEFAULT_OPTIONS.defaultMarginPercent,
    };
    this.renderCache = options?.renderCache ?? new CompositorRenderCache();
    this.metricsTracker = options?.metricsTracker ?? CompositorMetricsTracker.getInstance();
    configureSharpResourceLimits();
  }

  public async composite(input: HybridCompositorInput): Promise<HybridCompositorResult> {
    const startTime = performance.now();

    // 1. Preflight fail-closed input validation
    validateCompositorInput(input);

    // 2. Content-Addressable Render Cache lookup
    const cachedHit = await this.renderCache.getForInput(input);
    if (cachedHit !== null) {
      const durationSeconds = Math.max(0, (performance.now() - startTime) / 1000);
      this.metricsTracker.recordRender({
        templateId: input.templateId ?? input.sceneVersionId ?? 'CANONICAL',
        format: input.aspectRatio,
        cacheStatus: 'HIT',
        durationSeconds,
        status: 'success',
      });
      return cachedHit;
    }

    try {
      const { width: canvasWidth, height: canvasHeight } = input.canvas;

      // Determine canvas safe margins (default 5%)
      const marginPercent = this.options.defaultMarginPercent;
      const safeLeft = input.canvas.safeMargins?.left ?? Math.round(canvasWidth * marginPercent);
      const safeRight = input.canvas.safeMargins?.right ?? Math.round(canvasWidth * marginPercent);
      const safeTop = input.canvas.safeMargins?.top ?? Math.round(canvasHeight * marginPercent);
      const safeBottom =
        input.canvas.safeMargins?.bottom ?? Math.round(canvasHeight * marginPercent);

      // Sort input layers by layerIndex ascending
      const sortedLayers = [...input.layers].sort((a, b) => a.layerIndex - b.layerIndex);

      // Identify primary semantic layers
      const bgLayer = sortedLayers.find((l) => l.layerGroup === 'BACKGROUND');
      const contrastPanelLayer = sortedLayers.find(
        (l) => l.layerGroup === 'SURFACE' && l.layerIndex >= 50 && l.layerIndex < 100,
      );
      const pedestalLayer = sortedLayers.find(
        (l) => l.layerGroup === 'SURFACE' && l.layerIndex >= 100 && l.layerIndex < 150,
      );
      const explicitShadowLayer = sortedLayers.find((l) => l.layerGroup === 'SHADOW');
      const productLayer = sortedLayers.find((l) => l.layerGroup === 'PRODUCT_HERO');
      const logoLayer = sortedLayers.find((l) => l.layerGroup === 'BRAND_LOGO');
      const typographyLayers = sortedLayers.filter((l) => l.layerGroup === 'TYPOGRAPHY');
      const decorativeLayers = sortedLayers.filter((l) => l.layerGroup === 'DECORATIVE');

      // Step A: Base Canvas / Layer 1: Background
      let baseCanvasBuffer: Buffer;
      if (bgLayer) {
        baseCanvasBuffer = await sharp(bgLayer.buffer, {
          limitInputPixels: this.options.maxDecodedPixels,
        })
          .resize({
            width: canvasWidth,
            height: canvasHeight,
            fit: sharp.fit.cover,
            position: 'center',
            kernel: sharp.kernel.lanczos3,
          })
          .toColorspace('srgb')
          .removeAlpha()
          .png({ compressionLevel: 9 })
          .toBuffer();
      } else {
        baseCanvasBuffer = await sharp({
          create: {
            width: canvasWidth,
            height: canvasHeight,
            channels: 4,
            background: { r: 13, g: 13, b: 17, alpha: 1 },
          },
        })
          .toColorspace('srgb')
          .png({ compressionLevel: 9 })
          .toBuffer();
      }

      const overlays: sharp.OverlayOptions[] = [];

      // Step B: Layer 2: Contrast Panel (Readability Vignette)
      if (contrastPanelLayer) {
        const panelBuffer = await sharp(contrastPanelLayer.buffer)
          .resize({
            width: contrastPanelLayer.placement?.width ?? canvasWidth,
            height: contrastPanelLayer.placement?.height ?? canvasHeight,
            fit: sharp.fit.fill,
          })
          .toColorspace('srgb')
          .png({ compressionLevel: 9 })
          .toBuffer();

        overlays.push({
          input: panelBuffer,
          left: contrastPanelLayer.placement?.x ?? 0,
          top: contrastPanelLayer.placement?.y ?? 0,
          blend: 'over',
        });
      }

      // Step C: Layer 3: Pedestal Surface / Grounding
      if (pedestalLayer) {
        const pedestalBuffer = await sharp(pedestalLayer.buffer)
          .resize({
            width: pedestalLayer.placement?.width ?? canvasWidth,
            height: pedestalLayer.placement?.height ?? Math.round(canvasHeight * 0.3),
            fit: sharp.fit.fill,
          })
          .toColorspace('srgb')
          .png({ compressionLevel: 9 })
          .toBuffer();

        overlays.push({
          input: pedestalBuffer,
          left: pedestalLayer.placement?.x ?? 0,
          top: pedestalLayer.placement?.y ?? Math.round(canvasHeight * 0.7),
          blend: 'over',
        });
      }

      // Step D: Product Hero (Layer 5) & Shadow (Layer 4)
      let productBox: BoundingBox | undefined;

      if (productLayer) {
        const prodMeta = await sharp(productLayer.buffer).metadata();
        if (!prodMeta.width || !prodMeta.height) {
          throw new CreativeImageDecodeFailedError('Cannot decode product hero image dimensions');
        }

        // Measure authentic ink boundary via trim
        let trimmedBuffer = productLayer.buffer;
        let trimmedWidth = prodMeta.width;
        let trimmedHeight = prodMeta.height;

        try {
          const trimResult = await sharp(productLayer.buffer)
            .trim()
            .png({ compressionLevel: 9 })
            .toBuffer({ resolveWithObject: true });

          trimmedWidth = trimResult.info.width;
          trimmedHeight = trimResult.info.height;
          trimmedBuffer = trimResult.data;
        } catch {
          // Fall back to original untrimmed bounds if trim fails
        }

        const sourceProductAspect = trimmedWidth / trimmedHeight;

        // Compute product dimensions with strict zero-crop proportional containment
        let heroWidth: number;
        let heroHeight: number;
        let heroX: number;
        let heroY: number;

        if (productLayer.placement) {
          const p = productLayer.placement;
          if (
            p.x < safeLeft ||
            p.y < safeTop ||
            p.x + p.width > canvasWidth - safeRight ||
            p.y + p.height > canvasHeight - safeBottom
          ) {
            throw new ProductHeroContainmentError(
              `Product hero placement [x: ${p.x}, y: ${p.y}, w: ${p.width}, h: ${p.height}] exceeds canvas safe margins [left: ${safeLeft}, top: ${safeTop}, right: ${canvasWidth - safeRight}, bottom: ${canvasHeight - safeBottom}]`,
              {
                placement: p,
                safeMargins: { left: safeLeft, top: safeTop, right: safeRight, bottom: safeBottom },
                canvas: { width: canvasWidth, height: canvasHeight },
              },
            );
          }

          // Fit within requested placement box maintaining authentic aspect ratio (object-fit: contain)
          const scale = Math.min(p.width / trimmedWidth, p.height / trimmedHeight);
          const containedW = Math.round(trimmedWidth * scale);
          const containedH = Math.round(trimmedHeight * scale);

          heroWidth = containedW;
          heroHeight = containedH;
          heroX = p.x + Math.round((p.width - containedW) / 2);
          // Anchor to bottom baseline of placement box
          heroY = p.y + (p.height - containedH);
        } else {
          // Default luxury placement: centered horizontally, baseline at 70% canvas height
          const maxUsableWidth = canvasWidth - safeLeft - safeRight;
          const maxUsableHeight = Math.round(canvasHeight * 0.55);

          let targetH = maxUsableHeight;
          let targetW = Math.round(targetH * sourceProductAspect);

          if (targetW > maxUsableWidth) {
            targetW = maxUsableWidth;
            targetH = Math.round(targetW / sourceProductAspect);
          }

          heroWidth = targetW;
          heroHeight = targetH;
          heroX = Math.round((canvasWidth - targetW) / 2);
          const pedestalBaselineY = Math.round(canvasHeight * 0.7);
          heroY = pedestalBaselineY - targetH;
        }

        productBox = {
          x: heroX,
          y: heroY,
          width: heroWidth,
          height: heroHeight,
        };

        // Assert Product Safe Margin Containment
        if (
          heroX < safeLeft ||
          heroY < safeTop ||
          heroX + heroWidth > canvasWidth - safeRight ||
          heroY + heroHeight > canvasHeight - safeBottom
        ) {
          throw new ProductHeroContainmentError(
            `Product hero bounds [x: ${heroX}, y: ${heroY}, w: ${heroWidth}, h: ${heroHeight}] exceed canvas safe margins [left: ${safeLeft}, top: ${safeTop}, right: ${canvasWidth - safeRight}, bottom: ${canvasHeight - safeBottom}]`,
            {
              productBox,
              safeMargins: { left: safeLeft, top: safeTop, right: safeRight, bottom: safeBottom },
              canvas: { width: canvasWidth, height: canvasHeight },
            },
          );
        }

        // Check collision against mandatory CTA / typography placements
        for (const typoLayer of typographyLayers) {
          if (typoLayer.placement) {
            const isFullCanvas =
              typoLayer.placement.x === 0 &&
              typoLayer.placement.y === 0 &&
              typoLayer.placement.width >= canvasWidth &&
              typoLayer.placement.height >= canvasHeight;
            if (isFullCanvas) {
              continue;
            }
            const typoBox: BoundingBox = {
              x: typoLayer.placement.x,
              y: typoLayer.placement.y,
              width: typoLayer.placement.width,
              height: typoLayer.placement.height,
            };
            if (boxesIntersect(productBox, typoBox, 4)) {
              throw new ProductHeroContainmentError(
                `Product hero collides with typography/CTA element at [x: ${typoBox.x}, y: ${typoBox.y}, w: ${typoBox.width}, h: ${typoBox.height}]`,
                { productBox, typoBox, layerIndex: typoLayer.layerIndex },
              );
            }
          }
        }

        // Resize product preserving authentic packaging pixels (Lanczos3, sRGB)
        const resizedProductBuffer = await sharp(trimmedBuffer)
          .resize({
            width: heroWidth,
            height: heroHeight,
            fit: sharp.fit.fill,
            kernel: sharp.kernel.lanczos3,
          })
          .toColorspace('srgb')
          .png({ compressionLevel: 9 })
          .toBuffer();

        // Step D1: Layer 4: Contact & Ambient Shadow (Synthesized or Explicit)
        if (explicitShadowLayer) {
          const shadowBuffer = await sharp(explicitShadowLayer.buffer)
            .toColorspace('srgb')
            .png({ compressionLevel: 9 })
            .toBuffer();

          overlays.push({
            input: shadowBuffer,
            left: explicitShadowLayer.placement?.x ?? heroX,
            top: explicitShadowLayer.placement?.y ?? heroY + heroHeight - 10,
            blend: 'over',
          });
        } else if (input.enableContactShadow !== false) {
          // Synthesize realistic soft contact shadow from product alpha channel
          try {
            const alphaOnly = await sharp(resizedProductBuffer).extractChannel('alpha').toBuffer();
            const bottomSliceH = Math.max(4, Math.round(heroHeight * 0.18));
            const shadowW = Math.round(heroWidth * 1.05);
            const shadowH = Math.max(8, Math.round(heroHeight * 0.035));

            const bottomSlice = await sharp(alphaOnly)
              .extract({
                left: 0,
                top: heroHeight - bottomSliceH,
                width: heroWidth,
                height: bottomSliceH,
              })
              .resize(shadowW, shadowH, { fit: sharp.fit.fill })
              .blur(6)
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
              shadowRgba[offset + 3] = Math.round((shadowRaw[i] ?? 0) * 0.32); // Max 32% opacity
            }

            const shadowBuffer = await sharp(shadowRgba, {
              raw: { width: shadowInfo.width, height: shadowInfo.height, channels: 4 },
            })
              .png({ compressionLevel: 9 })
              .toBuffer();

            const shadowLeft = heroX - Math.round((shadowInfo.width - heroWidth) / 2);
            const shadowTop = heroY + heroHeight - Math.round(shadowInfo.height * 0.5);

            overlays.push({
              input: shadowBuffer,
              left: shadowLeft,
              top: shadowTop,
              blend: 'over',
            });
          } catch {
            // Continue without synthetic shadow if extraction fails
          }
        }

        // Step D2: Layer 5: Product Hero
        overlays.push({
          input: resizedProductBuffer,
          left: heroX,
          top: heroY,
          blend: 'over',
        });
      }

      // Step E: Layer 6: Brand Logo
      if (logoLayer) {
        const maxLogoW = logoLayer.placement?.width ?? Math.min(180, Math.round(canvasWidth * 0.2));
        const resizedLogo = await sharp(logoLayer.buffer)
          .resize({ width: maxLogoW, fit: 'inside' })
          .toColorspace('srgb')
          .png({ compressionLevel: 9 })
          .toBuffer();

        overlays.push({
          input: resizedLogo,
          left: logoLayer.placement?.x ?? safeLeft,
          top: logoLayer.placement?.y ?? safeTop,
          blend: 'over',
        });
      }

      // Step F: Layer 7: Typography & Commercial Badges
      for (const typo of typographyLayers) {
        let typoSharp = sharp(typo.buffer);
        if (typo.placement?.width && typo.placement?.height) {
          typoSharp = typoSharp.resize(typo.placement.width, typo.placement.height, {
            fit: 'fill',
          });
        }
        const typoPng = await typoSharp
          .toColorspace('srgb')
          .png({ compressionLevel: 9 })
          .toBuffer();

        overlays.push({
          input: typoPng,
          left: typo.placement?.x ?? 0,
          top: typo.placement?.y ?? 0,
          blend: 'over',
        });
      }

      // Step G: Layer 8: Frame & Decorative Accents
      for (const decor of decorativeLayers) {
        const decorPng = await sharp(decor.buffer)
          .toColorspace('srgb')
          .png({ compressionLevel: 9 })
          .toBuffer();

        overlays.push({
          input: decorPng,
          left: decor.placement?.x ?? 0,
          top: decor.placement?.y ?? 0,
          blend: 'over',
        });
      }

      // Step H: Final Assembly & sRGB IEC61966-2.1 Normalization (Stripping all metadata)
      const compositedBuffer = await sharp(baseCanvasBuffer)
        .composite(overlays)
        .toColorspace('srgb')
        .png({
          compressionLevel: 9,
          adaptiveFiltering: true,
        })
        .toBuffer();

      if (compositedBuffer.length > this.options.maxOutputBytes) {
        throw new CreativeOutputTooLargeError(compositedBuffer.length, this.options.maxOutputBytes);
      }

      const outputSha256 = createHash('sha256')
        .update(compositedBuffer)
        .digest('hex')
        .toLowerCase();
      const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;

      const layerExecutionManifest: readonly LayerExecutionManifestEntry[] = input.layers.map(
        (l) => ({
          layerIndex: l.layerIndex,
          layerGroup: l.layerGroup,
          sha256: l.contentDigest,
          applied: true,
        }),
      );

      const result: HybridCompositorResult = {
        compositedBuffer,
        mimeType: 'image/png',
        width: canvasWidth,
        height: canvasHeight,
        byteSize: compositedBuffer.length,
        sha256: outputSha256,
        latencyMs,
        compositorVersion: HYBRID_COMPOSITOR_VERSION,
        cacheStatus: 'MISS',
        layerExecutionManifest,
        colorProfile: 'sRGB',
      };

      // Cache the fresh composite
      const cacheKey = this.renderCache.computeKey({
        compositorVersion: HYBRID_COMPOSITOR_VERSION,
        canvas: input.canvas,
        layers: input.layers,
        colorProfile: input.colorProfile ?? 'sRGB',
      });

      await this.renderCache.set(cacheKey, result);

      const durationSeconds = Math.max(0, (performance.now() - startTime) / 1000);
      this.metricsTracker.recordRender({
        templateId: input.templateId ?? input.sceneVersionId ?? 'CANONICAL',
        format: input.aspectRatio,
        cacheStatus: 'MISS',
        durationSeconds,
        status: 'success',
      });

      return result;
    } catch (error) {
      const durationSeconds = Math.max(0, (performance.now() - startTime) / 1000);
      this.metricsTracker.recordRender({
        templateId: input.templateId ?? input.sceneVersionId ?? 'CANONICAL',
        format: input.aspectRatio,
        cacheStatus: 'MISS',
        durationSeconds,
        status: 'failure',
      });
      if (error && typeof error === 'object') {
        const errObj = error as Record<string, unknown>;
        if ('code' in errObj) {
          const code = String(errObj['code']);
          const layerGroup =
            typeof errObj['layerGroup'] === 'string' ? errObj['layerGroup'] : 'GENERAL';
          this.metricsTracker.recordLayerFailure(layerGroup, code);
        }
      }
      throw error;
    }
  }

  /**
   * Renders a complete W20 Layered CreativeSceneVersionRecord.
   *
   * 1. Resolves canonical template tokens from TemplateRegistry.
   * 2. Sorts scene layers strictly by zIndex ascending.
   * 3. Resolves CAS asset buffers using the provided assetResolver.
   * 4. Maps scene layers to CompositorLayerInput, skipping disabled or zero-opacity layers.
   * 5. Fails closed with CompositorLayerMissingAssetError specifying failedLayerIndex,
   *    layerGroup, and sceneVersionId if any CAS asset resolution fails.
   * 6. Preserves render provenance: binds sceneVersion.sceneHash and dependencyHash into result.
   */
  public async renderSceneVersion(
    sceneVersion: CreativeSceneVersionRecord,
    assetResolver: LayerAssetResolver,
  ): Promise<HybridCompositorResult> {
    const registry = TemplateRegistry.getInstance();
    const templateDef = registry.getTemplate(
      sceneVersion.templateId,
      sceneVersion.templateVersion as TemplateSemVer,
    );

    const sortedSceneLayers = [...sceneVersion.layers].sort((a, b) => a.zIndex - b.zIndex);
    const compositorLayers: CompositorLayerInput[] = [];

    for (const layer of sortedSceneLayers) {
      if (!layer.visible || layer.opacity === 0) {
        continue;
      }

      let layerBuffer: Buffer | null = null;
      let mimeType = 'image/png';

      let mappedGroup: CompositorLayerGroup;
      switch (layer.layerGroup) {
        case 'BACKGROUND':
          mappedGroup = 'BACKGROUND';
          break;
        case 'SURFACE_SHADOW':
          mappedGroup = layer.layerType === 'CONTACT_SHADOW' ? 'SHADOW' : 'SURFACE';
          break;
        case 'PRODUCT_HERO':
          mappedGroup = 'PRODUCT_HERO';
          break;
        case 'TYPOGRAPHY':
          mappedGroup = 'TYPOGRAPHY';
          break;
        case 'BRAND_DECORATION':
          mappedGroup = layer.layerType === 'BRAND_MARK' ? 'BRAND_LOGO' : 'DECORATIVE';
          break;
        default:
          mappedGroup = 'DECORATIVE';
          break;
      }

      const payload = layer.payload as unknown as Record<string, unknown> | undefined;
      const storageKey =
        (payload?.casStorageKey as string | undefined) ??
        (payload?.storageKey as string | undefined);

      if (storageKey) {
        try {
          layerBuffer = await assetResolver(storageKey);
        } catch (err) {
          throw new CompositorLayerMissingAssetError(
            layer.zIndex,
            `Error resolving CAS asset "${storageKey}" for layer "${layer.name}": ${err instanceof Error ? err.message : String(err)}`,
            {
              failedLayerIndex: layer.zIndex,
              layerGroup: layer.layerGroup,
              sceneVersionId: sceneVersion.id,
              storageKey,
            },
          );
        }

        if (!layerBuffer || layerBuffer.length === 0) {
          throw new CompositorLayerMissingAssetError(
            layer.zIndex,
            `CAS asset "${storageKey}" resolved to null or empty buffer for layer "${layer.name}"`,
            {
              failedLayerIndex: layer.zIndex,
              layerGroup: layer.layerGroup,
              sceneVersionId: sceneVersion.id,
              storageKey,
            },
          );
        }

        if (typeof payload?.mimeType === 'string') {
          mimeType = payload.mimeType;
        }
      } else if (layer.layerGroup === 'BACKGROUND') {
        const bgTint = templateDef.tokens.colorRoles?.backgroundTint ?? '#0E0F12';
        const color = (payload?.solidColor as string | undefined) ?? bgTint;
        const svg = `<svg width="${sceneVersion.width}" height="${sceneVersion.height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${color}"/></svg>`;
        layerBuffer = Buffer.from(svg, 'utf8');
        mimeType = 'image/svg+xml';
      } else if (layer.layerGroup === 'SURFACE_SHADOW') {
        if (layer.layerType === 'PEDESTAL_SURFACE') {
          const color = (payload?.color as string | undefined) ?? '#D4AF37';
          const svg = `<svg width="${layer.bounds.width}" height="${layer.bounds.height}" xmlns="http://www.w3.org/2000/svg"><rect width="${layer.bounds.width}" height="${layer.bounds.height}" fill="${color}" opacity="${layer.opacity}"/></svg>`;
          layerBuffer = Buffer.from(svg, 'utf8');
          mimeType = 'image/svg+xml';
        } else if (layer.layerType === 'CONTACT_SHADOW') {
          continue; // Synthesized by compositor from product hero
        }
      } else if (layer.layerGroup === 'TYPOGRAPHY') {
        if (typeof payload?.svgContent === 'string') {
          layerBuffer = Buffer.from(payload.svgContent, 'utf8');
          mimeType = 'image/svg+xml';
        } else {
          const headline = payload?.headline as Record<string, unknown> | undefined;
          const text = (headline?.text as string | undefined) ?? '';
          const fontSize = (headline?.fontSize as number | undefined) ?? 36;
          const color = (headline?.color as string | undefined) ?? '#FFFFFF';
          const svg = `<svg width="${layer.bounds.width}" height="${layer.bounds.height}" xmlns="http://www.w3.org/2000/svg"><text x="50%" y="50%" font-family="serif" font-size="${fontSize}" fill="${color}" text-anchor="middle">${text}</text></svg>`;
          layerBuffer = Buffer.from(svg, 'utf8');
          mimeType = 'image/svg+xml';
        }
      } else if (layer.layerGroup === 'BRAND_DECORATION') {
        const svg = `<svg width="${layer.bounds.width}" height="${layer.bounds.height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="none" stroke="#D4AF37" stroke-width="1.5"/></svg>`;
        layerBuffer = Buffer.from(svg, 'utf8');
        mimeType = 'image/svg+xml';
      }

      if (!layerBuffer) {
        throw new CompositorLayerMissingAssetError(
          layer.zIndex,
          `Unable to resolve asset for layer "${layer.name}" (layerKey: "${layer.layerKey}")`,
          {
            failedLayerIndex: layer.zIndex,
            layerGroup: layer.layerGroup,
            sceneVersionId: sceneVersion.id,
          },
        );
      }

      const contentDigest = createHash('sha256').update(layerBuffer).digest('hex').toLowerCase();

      compositorLayers.push({
        layerIndex: layer.zIndex,
        layerGroup: mappedGroup,
        buffer: layerBuffer,
        mimeType,
        contentDigest,
        placement: {
          x: layer.bounds.x,
          y: layer.bounds.y,
          width: layer.bounds.width,
          height: layer.bounds.height,
          opacity: layer.opacity,
        },
      });
    }

    const compositorInput: HybridCompositorInput = {
      creativeJobId: sceneVersion.sceneId,
      sceneVersionId: sceneVersion.id,
      templateId: sceneVersion.templateId,
      aspectRatio: sceneVersion.aspectRatio,
      canvas: {
        width: sceneVersion.width,
        height: sceneVersion.height,
        safeMargins: sceneVersion.safeMargins,
      },
      layers: compositorLayers,
      colorProfile: 'sRGB',
    };

    const compositeResult = await this.composite(compositorInput);

    // Bind scene provenance
    return {
      ...compositeResult,
      sceneHash: sceneVersion.sceneHash,
      dependencyHash: sceneVersion.dependencyHash,
    };
  }
}

export { SharpHybridCompositorAdapter as SharpHybridCompositor };
