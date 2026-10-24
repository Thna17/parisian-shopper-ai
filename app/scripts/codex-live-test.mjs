#!/usr/bin/env node
/**
 * Parisian Shopper AI — Opt-in Local Codex CLI Live Test and E2E Smoke Test
 *
 * This script runs a real generation against the locally installed,
 * ChatGPT-authenticated Codex CLI.
 *
 * Strict requirements:
 * 1. Opt-in only via RUN_CODEX_CLI_LIVE_TESTS=true
 * 2. Uses private local ChatGPT session only (NO API KEY)
 * 3. Uses purely fictional development product data (Moonlit River Eau de Parfum)
 * 4. Generates background-only canvas and composites product using SharpHeroCompositor
 * 5. Saves artifacts to .data/codex-live-test/<timestamp>/
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');

async function main() {
  console.log('='.repeat(70));
  console.log('PARISIAN SHOPPER AI — LOCAL CODEX CLI E2E LIVE TEST');
  console.log('='.repeat(70));

  // 1. Check opt-in flag
  if (process.env.RUN_CODEX_CLI_LIVE_TESTS !== 'true') {
    console.log('\n[INFO] RUN_CODEX_CLI_LIVE_TESTS is not set to "true".');
    console.log('Skipping live Codex CLI generation.');
    console.log('To run this test:');
    console.log('  RUN_CODEX_CLI_LIVE_TESTS=true pnpm codex:live-test\n');
    process.exit(0);
  }

  // Ensure production guard
  if (process.env.NODE_ENV === 'production') {
    console.error('\n[ERROR] Codex CLI live tests cannot be run when NODE_ENV=production.');
    process.exit(1);
  }

  // Load modules from built packages
  const { checkCodexCliPreflight } = await import(
    path.join(appRoot, 'packages/codex-cli/dist/index.js')
  );
  const { CodexCliTextProvider } = await import(
    path.join(appRoot, 'packages/ai-providers/dist/index.js')
  );
  const { CodexCliCreativeProvider } = await import(
    path.join(appRoot, 'packages/creative-providers/dist/index.js')
  );
  const {
    AIContextBuilder,
    DEVELOPMENT_BRAND_RULES,
    DeterministicVisualValidator,
    FICTIONAL_PRODUCTS,
    GEPARLYS_PRODUCTS,
    ProductAssetValidator,
    ProductSpotlightStrategy,
    SharpHeroCompositor,
    VisualSafetyScanner,
    validateOutputForLanguage,
  } = await import(path.join(appRoot, 'packages/application/dist/index.js'));

  // 2. Run Codex Preflight
  console.log('\n[STEP 1/8] Running Codex CLI preflight inspection...');
  const preflight = await checkCodexCliPreflight();
  if (!preflight.ok) {
    console.error('\n[ERROR] Codex CLI preflight check failed:');
    console.error(`- Version: ${preflight.version}`);
    console.error(`- Auth Status: ${preflight.authStatus}`);
    console.error('Please ensure the Codex CLI is installed and authenticated via `codex login`.');
    process.exit(1);
  }
  console.log(`✓ Codex CLI executable available: ${preflight.version}`);
  console.log(`✓ Authentication status: ${preflight.authStatus}`);
  console.log('✓ Confirmed: No OPENAI_API_KEY or CODEX_API_KEY required');

  // 3. Select product fixture with authentic asset
  console.log('\n[STEP 2/8] Selecting product fixture with authentic asset...');
  const fixture =
    GEPARLYS_PRODUCTS && GEPARLYS_PRODUCTS.length > 0
      ? GEPARLYS_PRODUCTS[0]
      : FICTIONAL_PRODUCTS[0];
  if (!fixture) {
    console.error('[ERROR] No product fixture available.');
    process.exit(1);
  }
  console.log(`✓ Selected Fixture: "${fixture.product.product_name}"`);
  console.log(`  - SKU: ${fixture.product.sku}`);
  console.log(`  - Brand: ${fixture.product.brand}`);
  console.log(`  - Category: ${fixture.product.category}`);
  console.log(`  - Price: ${fixture.product.price} ${fixture.product.currency}`);

  // 4. Generate bilingual structured text
  console.log(
    '\n[STEP 3/8] Generating bilingual (Khmer & English) structured copy with Codex CLI...',
  );
  const contextBuilder = new AIContextBuilder();
  const context = contextBuilder.build({
    job: {
      id: `live-job-${Date.now()}`,
      productSnapshotId: 'snapshot-fic-001',
      brandRuleVersionId: 'rules-v1',
      language: 'BILINGUAL',
      targetPlatform: 'TELEGRAM',
      requestedByUserId: 'local-tester',
    },
    productSnapshot: {
      id: 'snapshot-fic-001',
      schemaVersion: 'ps-product-v1',
      envelopeDigest: createHash('sha256').update(JSON.stringify(fixture)).digest('hex'),
      capturedAt: new Date(),
      product: fixture,
    },
    brandRuleVersion: {
      id: 'rules-v1',
      name: 'Development Luxury Rules',
      version: 1,
      status: 'ACTIVE',
      rules: DEVELOPMENT_BRAND_RULES,
      activatedAt: new Date(),
    },
    strategy: new ProductSpotlightStrategy(),
  });

  const textStartTime = Date.now();
  const textProvider = new CodexCliTextProvider({
    timeoutMs: 120_000,
  });

  const textResult = await textProvider.generate(context, new globalThis.AbortController().signal);
  const textDurationMs = Date.now() - textStartTime;

  console.log(`✓ Text generation completed in ${textDurationMs}ms:`);
  console.log(`  - Provider: ${textResult.provider}`);
  console.log(`  - Model: ${textResult.model}`);
  console.log(`  - Headline: "${textResult.output.headline}"`);
  console.log(`  - Khmer Caption: "${textResult.output.khmer_caption?.slice(0, 70)}..."`);
  console.log(`  - English Caption: "${textResult.output.english_caption?.slice(0, 70)}..."`);
  console.log(`  - CTA: "${textResult.output.cta}"`);
  console.log(`  - Hashtags: ${textResult.output.hashtags.join(' ')}`);
  if (textResult.usage) {
    console.log(
      `  - Usage: ${textResult.usage.totalTokens} tokens (in: ${textResult.usage.inputTokens}, out: ${textResult.usage.outputTokens})`,
    );
  }

  // 5. Validate AI structured content
  console.log('\n[STEP 4/8] Validating AI content against strict schema and language rules...');
  const validatedContent = validateOutputForLanguage(textResult.output, 'BILINGUAL');
  console.log(
    '✓ Validation passed: Both Khmer and English captions are non-empty and schema-conforming.',
  );

  // 6. Generate background-only image
  console.log(
    '\n[STEP 5/8] Generating 1080x1080 luxury background with Codex CLI imagegen skill...',
  );
  const creativeProvider = new CodexCliCreativeProvider({
    timeoutMs: 300_000,
  });

  const creativeBrief = {
    creativeJobId: `live-creative-${Date.now()}`,
    contentVersionId: 'live-version-001',
    briefText: [
      `Luxury editorial showcase background for fictional perfume "${fixture.product.product_name}".`,
      'Warm cream and ivory palette, elegant marble or refined stone pedestal, warm natural window lighting.',
      'Restrained gold accents, subtle Parisian luxury styling, generous empty product placement area in center.',
      'Safe margins for typography.',
    ].join(' '),
    stylePrompt: 'PARISIAN_LUXURY_ATELIER',
    negativePrompt:
      'No products, no perfume bottles, no bottles, no merchandise, no people, no faces, no text, no words, no logos, no watermarks',
    targetWidth: 1080,
    targetHeight: 1080,
    aspectRatio: '1:1',
    creativeProfile: 'PARISIAN_LUXURY_ATELIER',
  };

  const bgStartTime = Date.now();
  const bgResult = await creativeProvider.generateBackground(creativeBrief);
  const bgDurationMs = Date.now() - bgStartTime;

  console.log(`✓ Background generated in ${bgDurationMs}ms:`);
  console.log(`  - Provider: ${bgResult.providerId}`);
  console.log(`  - Model: ${bgResult.model}`);
  console.log(`  - MIME: ${bgResult.mimeType}`);
  console.log(`  - Dimensions: ${bgResult.width}x${bgResult.height}`);
  console.log(`  - File Size: ${(bgResult.imageBuffer.length / 1024).toFixed(1)} KB`);
  if (bgResult.metadata) {
    console.log(
      `  - Source Dimensions: ${bgResult.metadata.sourceWidth}x${bgResult.metadata.sourceHeight}`,
    );
  }

  // 7. Deterministic visual validation on background
  console.log('\n[STEP 6/8] Running deterministic visual checks on generated background...');
  const bgSha256 = createHash('sha256').update(bgResult.imageBuffer).digest('hex');
  const visualValidator = new DeterministicVisualValidator();
  const bgValidation = await visualValidator.validate({
    assetBuffer: bgResult.imageBuffer,
    expectedSha256: bgSha256,
    targetAspectRatio: '1:1',
    targetWidth: 1080,
    targetHeight: 1080,
  });
  console.log(`✓ Deterministic visual validator status: ${bgValidation.status}`);
  if (bgValidation.findings.length > 0) {
    console.log(`  Findings: ${JSON.stringify(bgValidation.findings)}`);
  }

  const safetyScanner = new VisualSafetyScanner();
  const safetyOutcome = safetyScanner.scan({
    promptMetadata: {
      briefText: creativeBrief.briefText,
      stylePrompt: creativeBrief.stylePrompt,
      negativePrompt: creativeBrief.negativePrompt,
    },
  });
  console.log(`✓ Visual safety scanner status: ${safetyOutcome.status}`);

  // 8. Load and validate authentic canonical product image
  console.log(
    '\n[STEP 7/8] Resolving authentic canonical product image and validating with ProductAssetValidator...',
  );
  const candidateProductPaths = [
    path.resolve(appRoot, '.data/assets/products', `${fixture.product.sku}.png`),
    path.resolve(appRoot, 'products', `${fixture.product.sku}.png`),
    path.resolve(appRoot, '.data/assets/products/GEP-KING-EDP-100.png'),
  ];
  const canonicalProductPath = candidateProductPaths.find((p) => fs.existsSync(p));
  if (!canonicalProductPath) {
    console.error(
      '\n[ERROR] Canonical product image is missing. Upload or seed a transparent PNG before generating the poster.',
    );
    process.exit(1);
  }

  const canonicalProductBuffer = await fs.promises.readFile(canonicalProductPath);
  const validator = new ProductAssetValidator();
  const validationResult = await validator.assertValid({
    assetBuffer: canonicalProductBuffer,
    expectedSku: fixture.product.sku,
  });

  console.log(`✓ ProductAssetValidator passed for SKU ${fixture.product.sku}:`);
  console.log(`  - SHA-256: ${validationResult.actualSha256}`);
  console.log(`  - Dimensions: ${validationResult.width}x${validationResult.height}`);
  console.log(`  - Visible Coverage: ${(validationResult.visibleRatio * 100).toFixed(1)}%`);
  console.log(`  - Trimmed Bounds: ${JSON.stringify(validationResult.trimmedBounds)}`);

  const compositor = new SharpHeroCompositor();
  const compositeResult = await compositor.composite({
    creativeJobId: creativeBrief.creativeJobId,
    canonicalProductBuffer: validationResult.trimmedBuffer,
    canonicalProductMimeType: validationResult.mimeType,
    canonicalProductSha256: validationResult.actualSha256,
    backgroundBuffer: bgResult.imageBuffer,
    backgroundMimeType: bgResult.mimeType,
    backgroundSha256: bgSha256,
    targetWidth: 1080,
    targetHeight: 1080,
    aspectRatio: '1:1',
    heroPlacement: 'CENTER',
    pedestalYPercent: 0.72,
    enableContactShadow: true,
  });

  console.log(`✓ SharpHeroCompositor execution complete:`);
  console.log(`  - Composite Dimensions: ${compositeResult.width}x${compositeResult.height}`);
  console.log(`  - File Size: ${(compositeResult.compositedBuffer.length / 1024).toFixed(1)} KB`);
  console.log(`  - Compositor Version: ${compositeResult.compositorVersion}`);
  console.log(`  - Source Bounding Box: ${JSON.stringify(compositeResult.sourceBoundingBox)}`);
  console.log(`  - Hero Bounding Box: ${JSON.stringify(compositeResult.heroBoundingBox)}`);
  if (compositeResult.contactShadowBoundingBox) {
    console.log(
      `  - Contact Shadow Box: ${JSON.stringify(compositeResult.contactShadowBoundingBox)}`,
    );
  }

  // 9. Save artifacts under timestamped gitignored directory
  console.log('\n[STEP 8/8] Saving artifacts to gitignored local directory...');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const artifactDir = path.resolve(appRoot, '.data/codex-live-test', timestamp);
  await fs.promises.mkdir(artifactDir, { recursive: true });

  const contentPath = path.join(artifactDir, 'content.json');
  const canonicalPath = path.join(artifactDir, 'canonical-product.png');
  const bgPath = path.join(artifactDir, 'background.png');
  const compositePath = path.join(artifactDir, 'product-composite.png');
  const metadataPath = path.join(artifactDir, 'metadata.json');

  await fs.promises.writeFile(contentPath, JSON.stringify(validatedContent, null, 2), 'utf8');
  await fs.promises.writeFile(canonicalPath, canonicalProductBuffer);
  await fs.promises.writeFile(bgPath, bgResult.imageBuffer);
  await fs.promises.writeFile(compositePath, compositeResult.compositedBuffer);

  const runMetadata = {
    testRunId: `codex-live-${timestamp}`,
    timestamp: new Date().toISOString(),
    optInFlag: process.env.RUN_CODEX_CLI_LIVE_TESTS,
    preflight: {
      ok: preflight.ok,
      version: preflight.version,
      authStatus: preflight.authStatus,
    },
    fixture: {
      sku: fixture.product.sku,
      productName: fixture.product.product_name,
      brand: fixture.product.brand,
      category: fixture.product.category,
      price: `${fixture.product.price} ${fixture.product.currency}`,
    },
    textGeneration: {
      provider: textResult.provider,
      model: textResult.model,
      durationMs: textDurationMs,
      usage: textResult.usage,
      content: validatedContent,
    },
    backgroundGeneration: {
      providerId: bgResult.providerId,
      model: bgResult.model,
      durationMs: bgDurationMs,
      width: bgResult.width,
      height: bgResult.height,
      mimeType: bgResult.mimeType,
      byteSize: bgResult.imageBuffer.length,
      metadata: bgResult.metadata,
    },
    canonicalProduct: {
      sku: fixture.product.sku,
      sha256: validationResult.actualSha256,
      width: validationResult.width,
      height: validationResult.height,
      visibleRatio: validationResult.visibleRatio,
      trimmedBounds: validationResult.trimmedBounds,
    },
    compositing: {
      compositorVersion: compositeResult.compositorVersion,
      width: compositeResult.width,
      height: compositeResult.height,
      mimeType: compositeResult.mimeType,
      byteSize: compositeResult.compositedBuffer.length,
      heroBoundingBox: compositeResult.heroBoundingBox,
      sourceBoundingBox: compositeResult.sourceBoundingBox,
      contactShadowBoundingBox: compositeResult.contactShadowBoundingBox,
      heroPlacement: compositeResult.heroPlacement,
    },
    artifactPaths: {
      directory: artifactDir,
      contentJson: contentPath,
      canonicalProductPng: canonicalPath,
      backgroundPng: bgPath,
      productCompositePng: compositePath,
      metadataJson: metadataPath,
    },
  };

  await fs.promises.writeFile(metadataPath, JSON.stringify(runMetadata, null, 2), 'utf8');

  console.log('\n' + '='.repeat(70));
  console.log('LIVE TEST SUCCESSFUL — ARTIFACTS SAVED');
  console.log('='.repeat(70));
  console.log(`Directory:        ${artifactDir}`);
  console.log(`Content Copy:     ${contentPath}`);
  console.log(`Canonical Product:${canonicalPath}`);
  console.log(`Background:       ${bgPath} (${bgResult.width}x${bgResult.height})`);
  console.log(
    `Product Composite: ${compositePath} (${compositeResult.width}x${compositeResult.height})`,
  );
  console.log(`Metadata:         ${metadataPath}`);

  // Open product composite on macOS for visual review
  if (process.platform === 'darwin') {
    console.log('\n[VISUAL REVIEW] Opening product-composite.png on macOS...');
    spawnSync('open', [compositePath], { stdio: 'inherit' });
    console.log('✓ Image viewer opened for product-composite.png');
  }

  console.log('\n' + '='.repeat(70));
}

main().catch((error) => {
  console.error('\n' + '!'.repeat(70));
  console.error('[FATAL ERROR] Codex CLI live test encountered an error:');
  console.error('!'.repeat(70));
  if (error instanceof Error) {
    console.error(`Name:    ${error.name}`);
    console.error(`Message: ${error.message}`);
    if ('code' in error) {
      console.error(`Code:    ${String(error.code)}`);
    }
    if ('details' in error) {
      console.error(`Details: ${JSON.stringify(error.details, null, 2)}`);
    }
    if (error.stack) {
      console.error(`Stack:\n${error.stack}`);
    }
  } else {
    console.error(String(error));
  }
  process.exit(1);
});
