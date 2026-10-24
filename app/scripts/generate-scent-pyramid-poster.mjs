import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');

// Load environment
const envContent = fs.readFileSync(path.join(appRoot, '.env'), 'utf8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2]?.trim().replace(/^['"](.*)['"]$/, '$1');
  }
}

const { CodexCliCreativeProvider } = await import(
  path.join(appRoot, 'packages/creative-providers/dist/index.js')
);
const sharp = (
  await import(path.join(appRoot, 'packages/application/node_modules/sharp/lib/index.js'))
).default;
const { Bot, InputFile } = await import(
  path.join(
    appRoot,
    'node_modules/.pnpm/grammy@1.46.0_supports-color@8.1.1/node_modules/grammy/out/mod.js',
  )
);

const briefText = `Commercial fragrance still-life advertisement set for a scent pyramid showcase. 
A dark graphite mineral stone slab resting on a polished dark walnut surface with soft reflections. 
Artfully arranged around the base perimeter are natural fragrance elements in sharp, crisp detail: a slice of glistening Italian bergamot with fine citrus oil droplets, a few fresh sprigs of French lavender, a chunk of glowing raw ambergris resin, and smoky vetiver roots. 
The center of the mineral slab is completely clean, flat, and empty for the hero bottle. 
Cinematic studio lighting with subtle rim lights, soft fog in the background, 100mm macro lens, f/4 aperture, pin-sharp foreground elements with gentle background falloff.`;

const negativePrompt = `No perfume bottle, no bottles, no synthetic elements, no human, no text, no watermark, no digital noise, no cluttered center, no distorted fruits.`;

console.log('='.repeat(70));
console.log('GENERATING SCENT PYRAMID ELEMENTS POSTER VIA CODEX CLI');
console.log('='.repeat(70));

const provider = new CodexCliCreativeProvider({
  timeoutMs: 300_000,
});

console.log('\n[1/4] Spawning Codex CLI imagegen for Scent Pyramid Elements background...');
const bgStartTime = Date.now();
const bgResult = await provider.generateBackground({
  creativeJobId: `scent-pyramid-${Date.now()}`,
  contentVersionId: 'version-scent-pyramid-001',
  briefText,
  stylePrompt: 'SCENT_PYRAMID_BOTANICAL_MINERAL',
  negativePrompt,
  targetWidth: 1080,
  targetHeight: 1080,
  aspectRatio: '1:1',
  creativeProfile: 'SCENT_PYRAMID_EDITORIAL',
});

const bgDurationMs = Date.now() - bgStartTime;
console.log(
  `✓ Background generated in ${(bgDurationMs / 1000).toFixed(1)}s (${bgResult.imageBuffer.length} bytes)`,
);

fs.writeFileSync('/tmp/scent-pyramid-bg.png', bgResult.imageBuffer);

console.log('\n[2/4] Compositing authentic Yes I Am The King bottle with macro lighting shadow...');
const bottleBuffer = fs.readFileSync(
  path.join(appRoot, '.data/assets/products/GEP-KING-EDP-100.png'),
);

// Resize bottle to height 570 (ideal hero scale on mineral slab)
const resizedBottle = await sharp(bottleBuffer).resize({ height: 570, fit: 'inside' }).toBuffer();

const bottleMeta = await sharp(resizedBottle).metadata();
const bottleW = bottleMeta.width;
const bottleH = bottleMeta.height;
const left = Math.round((1080 - bottleW) / 2);
const top = Math.round(1080 * 0.44 - bottleH / 2);

// Realistic mineral stone contact shadow & subtle dark walnut reflection
const shadowSvg = `<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="occlusion" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#050608" stop-opacity="0.9" />
      <stop offset="45%" stop-color="#101318" stop-opacity="0.55" />
      <stop offset="85%" stop-color="#181d24" stop-opacity="0.12" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="diffuse" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#14110e" stop-opacity="0.4" />
      <stop offset="65%" stop-color="#1a1612" stop-opacity="0.15" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </radialGradient>
  </defs>
  <ellipse cx="${left + bottleW / 2}" cy="${top + bottleH - 2}" rx="${bottleW * 0.45}" ry="8" fill="url(#occlusion)" />
  <ellipse cx="${left + bottleW / 2}" cy="${top + bottleH + 10}" rx="${bottleW * 0.54}" ry="20" fill="url(#diffuse)" />
</svg>`;

const shadowLayer = await sharp(Buffer.from(shadowSvg)).png().toBuffer();

// Subtle glass base reflection on the dark polished mineral surface
const reflH = Math.round(bottleH * 0.18);
const reflection = await sharp(resizedBottle)
  .extract({ left: 0, top: bottleH - reflH, width: bottleW, height: reflH })
  .flip()
  .blur(2)
  .linear(0.25, 0)
  .toBuffer();

const finalComposite = await sharp(bgResult.imageBuffer)
  .composite([
    { input: shadowLayer, left: 0, top: 0 },
    { input: reflection, left, top: top + bottleH - 3, blend: 'over' },
    { input: resizedBottle, left, top },
  ])
  .png()
  .toBuffer();

fs.writeFileSync('/tmp/scent-pyramid-final-composite.png', finalComposite);
console.log('✓ Scent Pyramid Elements luxury poster composited successfully!');

console.log('\n[3/4] Delivering new poster to Telegram bot (@parisian_shopper_bot)...');
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
await bot.api.sendPhoto(909395067, new InputFile(finalComposite, 'scent_pyramid_elements.png'), {
  caption:
    `🌿 *Yes I Am The King Eau de Parfum — Scent Pyramid Edition*\n\n` +
    `✨ *Art Direction:* Dark graphite mineral slab surrounded by real notes: Italian bergamot, French lavender, raw ambergris & smoky vetiver.\n` +
    `🛡 *Product:* Authentic flacon with silver lion crest on dark walnut macro set.\n` +
    `📐 *Format:* 1:1 Feed Post (1080x1080 PNG)\n\n` +
    `_Generated by Codex CLI with custom Scent Pyramid Elements prompt._`,
  parse_mode: 'Markdown',
});

console.log('✓ Delivered directly to your Telegram chat!\n');
