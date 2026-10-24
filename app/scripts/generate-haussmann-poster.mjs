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

const briefText = `Editorial luxury still-life product photography for a Parisian haute parfumerie. 
A monolithic, low rectangular block of rough-hewn ivory French travertine limestone with natural porous textures and chiseled organic edges. 
Warm golden-hour morning sunlight streaming through classic tall Parisian balcony windows from the left, casting soft, elegant botanical shadows (wild lavender stems and olive branches) across the stone and floor. 
The background is an out-of-focus, warm greige and cream Haussmannian interior with soft boiserie wall paneling in creamy bokeh. 
Shot on 85mm f/2.0 portrait prime lens, soft diffused highlights, photorealistic textures, zero distortion. 
Generous flat negative space on top of the limestone slab for product placement. Straight-on camera perspective.`;

const negativePrompt = `No products, no bottles, no perfume, no packaging, no humans, no limbs, no text, no letters, no branding, no floating items, no steep angle, no oversaturated colors, no plastic textures.`;

console.log('='.repeat(70));
console.log('GENERATING ATELIER HAUSSMANN LUXURY PERFUME POSTER VIA CODEX CLI');
console.log('='.repeat(70));

const provider = new CodexCliCreativeProvider({
  timeoutMs: 300_000,
});

console.log('\n[1/4] Spawning Codex CLI imagegen for Atelier Haussmann background...');
const bgStartTime = Date.now();
const bgResult = await provider.generateBackground({
  creativeJobId: `haussmann-${Date.now()}`,
  contentVersionId: 'version-haussmann-001',
  briefText,
  stylePrompt: 'ATELIER_HAUSSMANN_TRAVERTINE',
  negativePrompt,
  targetWidth: 1080,
  targetHeight: 1080,
  aspectRatio: '1:1',
  creativeProfile: 'ATELIER_HAUSSMANN',
});

const bgDurationMs = Date.now() - bgStartTime;
console.log(
  `✓ Background generated in ${(bgDurationMs / 1000).toFixed(1)}s (${bgResult.imageBuffer.length} bytes)`,
);

fs.writeFileSync('/tmp/haussmann-bg.png', bgResult.imageBuffer);

console.log('\n[2/4] Compositing authentic Yes I Am The King bottle with morning light shadow...');
const bottleBuffer = fs.readFileSync(
  path.join(appRoot, '.data/assets/products/GEP-KING-EDP-100.png'),
);

// Resize bottle to height 570 (ideal hero scale on travertine slab)
const resizedBottle = await sharp(bottleBuffer).resize({ height: 570, fit: 'inside' }).toBuffer();

const bottleMeta = await sharp(resizedBottle).metadata();
const bottleW = bottleMeta.width;
const bottleH = bottleMeta.height;
const left = Math.round((1080 - bottleW) / 2);
const top = Math.round(1080 * 0.45 - bottleH / 2); // seated naturally on the limestone block

// Morning sunlight from left -> soft directional shadow cast towards the right
const shadowSvg = `<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="occlusion" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#2a241b" stop-opacity="0.8" />
      <stop offset="50%" stop-color="#3d3326" stop-opacity="0.45" />
      <stop offset="85%" stop-color="#4d4234" stop-opacity="0.1" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="sunDirectional" cx="40%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#2f271e" stop-opacity="0.4" />
      <stop offset="65%" stop-color="#3d3326" stop-opacity="0.15" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </radialGradient>
  </defs>
  <!-- Tight contact occlusion under base -->
  <ellipse cx="${left + bottleW / 2}" cy="${top + bottleH - 2}" rx="${bottleW * 0.45}" ry="8" fill="url(#occlusion)" />
  <!-- Directional morning shadow cast rightwards -->
  <ellipse cx="${left + bottleW / 2 + 35}" cy="${top + bottleH + 12}" rx="${bottleW * 0.58}" ry="20" fill="url(#sunDirectional)" />
</svg>`;

const shadowLayer = await sharp(Buffer.from(shadowSvg)).png().toBuffer();

const finalComposite = await sharp(bgResult.imageBuffer)
  .composite([
    { input: shadowLayer, left: 0, top: 0 },
    { input: resizedBottle, left, top },
  ])
  .png()
  .toBuffer();

fs.writeFileSync('/tmp/haussmann-final-composite.png', finalComposite);
console.log('✓ Atelier Haussmann luxury poster composited successfully!');

console.log('\n[3/4] Delivering new poster to Telegram bot (@parisian_shopper_bot)...');
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
await bot.api.sendPhoto(909395067, new InputFile(finalComposite, 'atelier_haussmann.png'), {
  caption:
    `🏛 *Yes I Am The King Eau de Parfum — Atelier Haussmann Edition*\n\n` +
    `✨ *Art Direction:* Monolithic French travertine limestone with morning window sunlight & botanical lavender shadows.\n` +
    `🛡 *Product:* Authentic flacon with silver lion crest on rough-hewn ivory stone.\n` +
    `📐 *Format:* 1:1 Feed Post (1080x1080 PNG)\n\n` +
    `_Generated by Codex CLI with custom Atelier Haussmann prompt._`,
  parse_mode: 'Markdown',
});

console.log('✓ Delivered directly to your Telegram chat!\n');
