#!/usr/bin/env node
/**
 * Parisian Shopper AI — AI Background Gallery Generator (POSTER-3)
 *
 * Opt-in script to generate, validate, and catalog AI backgrounds across all
 * 5 refined art-direction presets paired with template LayoutIntents.
 *
 * Guarded by RUN_CODEX_CLI_LIVE_TESTS=true.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');

async function main() {
  console.log('='.repeat(70));
  console.log('PARISIAN SHOPPER AI — AI BACKGROUND GALLERY GENERATOR (POSTER-3)');
  console.log('='.repeat(70));

  if (process.env.RUN_CODEX_CLI_LIVE_TESTS !== 'true') {
    console.log('\n[INFO] RUN_CODEX_CLI_LIVE_TESTS is not set to "true".');
    console.log('Skipping live AI background gallery generation.');
    console.log('To run this gallery generator:');
    console.log('  RUN_CODEX_CLI_LIVE_TESTS=true node scripts/generate-background-gallery.mjs\n');
    process.exit(0);
  }

  if (process.env.NODE_ENV === 'production') {
    console.error(
      '\n[ERROR] Live AI background generation cannot be run when NODE_ENV=production.',
    );
    process.exit(1);
  }

  // Load modules
  const { checkCodexCliPreflight } = await import(
    path.join(appRoot, 'packages/codex-cli/dist/index.js')
  );
  const { CodexCliCreativeProvider } = await import(
    path.join(appRoot, 'packages/creative-providers/dist/index.js')
  );
  const { resolveStylePreset } = await import(
    path.join(appRoot, 'packages/application/dist/modules/creative/domain/style-presets.js')
  );
  const { deriveLayoutIntentForTemplate } = await import(
    path.join(appRoot, 'packages/application/dist/modules/creative/domain/layout-intent.js')
  );
  const { BackgroundQualityValidator } = await import(
    path.join(
      appRoot,
      'packages/application/dist/modules/creative/domain/services/background-quality-validator.js',
    )
  );

  // Preflight inspection
  console.log('\n[STEP 1/3] Running Codex CLI preflight inspection...');
  const preflight = await checkCodexCliPreflight();
  if (!preflight.ok) {
    console.error('\n[ERROR] Codex CLI preflight check failed:');
    console.error(`- Version: ${preflight.version}`);
    console.error(`- Auth Status: ${preflight.authStatus}`);
    process.exit(1);
  }
  console.log(`✓ Codex CLI executable available: ${preflight.version} (${preflight.authStatus})`);

  const outputDir = path.resolve(appRoot, '.data/fixtures/background-gallery');
  fs.mkdirSync(outputDir, { recursive: true });

  const creativeProvider = new CodexCliCreativeProvider({ timeoutMs: 300_000 });
  const validator = new BackgroundQualityValidator();

  const presetsToGenerate = [
    {
      presetKey: 'PARISIAN_MORNING_ATELIER',
      templateId: 'EDITORIAL_SPLIT',
      width: 1080,
      height: 1080,
    },
    {
      presetKey: 'NOCTURNE_OBSIDIAN',
      templateId: 'CENTERED_HERO',
      width: 1080,
      height: 1080,
    },
    {
      presetKey: 'BOTANICAL_SCENT_STORY',
      templateId: 'SCENT_STORY',
      width: 1080,
      height: 1080,
    },
    {
      presetKey: 'CAMBODIAN_IVORY_CELEBRATION',
      templateId: 'KHMER_SEASONAL',
      width: 1080,
      height: 1080,
    },
    {
      presetKey: 'CLEAN_EDITORIAL_STUDIO',
      templateId: 'EDITORIAL_SPLIT',
      width: 1080,
      height: 1080,
    },
  ];

  console.log(
    `\n[STEP 2/3] Generating ${presetsToGenerate.length} art-directed backgrounds with layout intents...`,
  );
  const galleryManifest = [];

  for (let i = 0; i < presetsToGenerate.length; i++) {
    const config = presetsToGenerate[i];
    const preset = resolveStylePreset(config.presetKey);
    const layoutIntent = deriveLayoutIntentForTemplate(
      config.templateId,
      config.width,
      config.height,
    );

    console.log(
      `\n[${i + 1}/${presetsToGenerate.length}] Generating "${preset.name}" (${config.templateId})...`,
    );

    const prompt = preset.buildPrompt({ layoutIntent });
    console.log(`  Prompt: ${prompt.slice(0, 120)}...`);

    const brief = {
      creativeJobId: `gallery-${config.presetKey.toLowerCase()}-${Date.now()}`,
      contentVersionId: 'gallery-v1',
      briefText: prompt,
      stylePrompt: config.presetKey,
      negativePrompt: preset.negativePrompt,
      targetWidth: config.width,
      targetHeight: config.height,
      aspectRatio: '1:1',
      creativeProfile: config.presetKey,
      layoutIntent,
    };

    const startTime = Date.now();
    const bgResult = await creativeProvider.generateBackground(brief);
    const durationMs = Date.now() - startTime;

    console.log(
      `  ✓ Generated in ${durationMs}ms (${bgResult.width}x${bgResult.height}, ${(bgResult.imageBuffer.length / 1024).toFixed(1)} KB)`,
    );

    // Validate background quality
    const validation = await validator.validateBackground({
      backgroundBuffer: bgResult.imageBuffer,
      layoutIntent,
      mimeType: bgResult.mimeType,
    });

    console.log(
      `  ✓ Validation status: ${validation.status} (${validation.findings.length} findings, edgeDensity: ${validation.metrics.textZoneEdgeDensity.toFixed(4)})`,
    );

    const fileBaseName = `${config.presetKey.toLowerCase()}-${config.templateId.toLowerCase()}`;
    const imageFileName = `${fileBaseName}.png`;
    const imagePath = path.join(outputDir, imageFileName);
    fs.writeFileSync(imagePath, bgResult.imageBuffer);

    const manifestEntry = {
      presetId: config.presetKey,
      presetName: preset.name,
      templateId: config.templateId,
      width: bgResult.width,
      height: bgResult.height,
      durationMs,
      prompt,
      negativePrompt: preset.negativePrompt,
      validationStatus: validation.status,
      metrics: validation.metrics,
      findings: validation.findings,
      imageFile: imageFileName,
      generatedAt: new Date().toISOString(),
    };

    galleryManifest.push(manifestEntry);
  }

  // Write manifest
  const manifestPath = path.join(outputDir, 'gallery-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(galleryManifest, null, 2), 'utf-8');
  console.log(`\n[STEP 3/3] Gallery manifest saved to ${manifestPath}`);

  // Summary Table
  console.log('\n' + '='.repeat(80));
  console.log('BACKGROUND GALLERY SUMMARY:');
  console.log('='.repeat(80));
  console.table(
    galleryManifest.map((item) => ({
      Preset: item.presetName,
      Template: item.templateId,
      Status: item.validationStatus,
      'Edge Density': item.metrics.textZoneEdgeDensity.toFixed(4),
      Pedestal: item.metrics.pedestalDetected ? 'YES' : 'NO',
      'Time (s)': (item.durationMs / 1000).toFixed(1),
    })),
  );
  console.log(`\nAll gallery backgrounds saved in ${outputDir}\n`);
}

main().catch((err) => {
  console.error('\nFatal error generating background gallery:', err);
  process.exit(1);
});
