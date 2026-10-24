#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');

const sharp = (
  await import(path.join(appRoot, 'packages/application/node_modules/sharp/lib/index.js'))
).default;

const { PosterCopyBuilder } = await import(
  path.join(
    appRoot,
    'packages/application/dist/modules/creative/domain/services/poster-copy-builder.js',
  )
);
const { SharpPosterCompositor } = await import(
  path.join(
    appRoot,
    'packages/application/dist/modules/creative/infrastructure/sharp-poster-compositor.adapter.js',
  )
);
const { ProductAssetValidator } = await import(
  path.join(
    appRoot,
    'packages/application/dist/modules/creative/domain/services/product-asset-validator.js',
  )
);
const { getPresetFixture } = await import(
  path.join(
    appRoot,
    'packages/application/dist/modules/creative/infrastructure/fixtures/fake-background-fixtures.js',
  )
);

async function main() {
  console.log('Generating POSTER-2 golden poster fixtures for all 4 templates...\n');

  const outputDir = path.resolve(appRoot, '.data/fixtures/poster-samples');
  fs.mkdirSync(outputDir, { recursive: true });

  const compositor = new SharpPosterCompositor();
  const validator = new ProductAssetValidator();

  // Load authentic product image
  const productPath = path.resolve(appRoot, '.data/assets/products/GEP-KING-EDP-100.png');
  const rawProductBuffer = fs.readFileSync(productPath);
  const validatedProduct = await validator.assertValid({
    assetBuffer: rawProductBuffer,
    expectedSku: 'GEP-KING-EDP-100',
  });

  const productInput = {
    sku: 'GEP-KING-EDP-100',
    title: 'Yes I Am The King',
    brand: 'Geparlys',
    priceAmount: 48,
    currency: 'USD',
    volumeMl: 100,
    concentration: 'Eau de Parfum',
    fragranceNotes: {
      top: ['Bergamot', 'Grapefruit', 'Apple'],
      heart: ['Lavender', 'Elemi Resin', 'Geranium'],
      base: ['Ambergris', 'Vetiver', 'Patchouli'],
    },
  };

  const templates = [
    {
      id: 'EDITORIAL_SPLIT',
      preset: 'noir',
      content: {
        headline: 'Yes I Am The King',
        bodyText:
          'A royal, charismatic fragrance crafted in Paris with sparkling Italian bergamot.',
        cta: 'Shop Now',
      },
      options: { templateId: 'EDITORIAL_SPLIT', promotionalPrice: '$39' },
    },
    {
      id: 'CENTERED_HERO',
      preset: 'cream',
      content: {
        headline: 'The Scent of Royalty',
        secondaryHeadline: 'PARISIAN HAUTE PARFUMERIE',
        bodyText: 'Sophisticated elegance and magnetic presence in every drop.',
        cta: 'Discover More',
      },
      options: { templateId: 'CENTERED_HERO', paletteId: 'NOCTURNE_GOLD' },
    },
    {
      id: 'SCENT_STORY',
      preset: 'gold',
      content: {
        headline: 'Discover The Notes',
        cta: 'Explore Pyramid',
      },
      options: { templateId: 'SCENT_STORY', paletteId: 'NOCTURNE_GOLD' },
    },
    {
      id: 'KHMER_SEASONAL',
      preset: 'noir',
      content: {
        headline: 'ទឹកអប់ Yes I Am The King',
        secondaryHeadline: 'ក្លិនក្រអូបបែបប្រណីតពីប៉ារីស',
        cta: 'ទិញឥឡូវនេះ',
      },
      options: {
        templateId: 'KHMER_SEASONAL',
        campaignLabel: 'ពិធីបុណ្យភ្ជុំបិណ្ឌ',
        promotionalPrice: '$39',
        paletteId: 'KHMER_ROYAL',
      },
    },
  ];

  for (const t of templates) {
    console.log(`Rendering ${t.id}...`);
    const spec = PosterCopyBuilder.buildSpec(productInput, t.content, t.options);

    const bgRaw = getPresetFixture(t.preset, 1080, 1080);
    const bgBuffer = await sharp(bgRaw).png().toBuffer();
    const bgSha = createHash('sha256').update(bgBuffer).digest('hex');

    const result = await compositor.renderPoster({
      creativeJobId: `sample-${t.id.toLowerCase()}`,
      posterSpec: spec,
      canonicalProductBuffer: rawProductBuffer,
      canonicalProductMimeType: 'image/png',
      canonicalProductSha256: validatedProduct.actualSha256,
      backgroundBuffer: bgBuffer,
      backgroundMimeType: 'image/png',
      backgroundSha256: bgSha,
      generateDebugLayout: true,
    });

    const posterFile = path.join(outputDir, `${t.id.toLowerCase()}-poster.png`);
    const debugFile = path.join(outputDir, `${t.id.toLowerCase()}-debug.png`);
    const manifestFile = path.join(outputDir, `${t.id.toLowerCase()}-manifest.json`);

    fs.writeFileSync(posterFile, result.posterBuffer);
    if (result.debugLayoutBuffer) {
      fs.writeFileSync(debugFile, result.debugLayoutBuffer);
    }
    fs.writeFileSync(manifestFile, JSON.stringify(result.layoutManifest, null, 2));

    console.log(`  ✓ Saved ${posterFile} (${(result.posterBuffer.length / 1024).toFixed(1)} KB)`);
    console.log(`  ✓ Saved ${manifestFile}`);
  }

  console.log('\nAll 4 golden poster fixtures generated successfully!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
