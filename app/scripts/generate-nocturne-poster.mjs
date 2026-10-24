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

const briefText = `Professional commercial luxury perfume still-life photography. 
A low, wide, seamless pedestal made of raw matte black volcanic slate and polished black obsidian with a mirror-finish top reflection. 
Dramatic chiaroscuro studio lighting: a powerful, warm golden-amber backlight glowing softly from behind the center, casting rim-light edge reflections. 
Subtle cool silver side rim light. 
A delicate, ethereal wisp of aromatic smoke and gentle mist curling low across the stone base. 
Macro commercial photography, Hasselblad H6D-100c, 90mm f/2.8 lens, shallow depth of field, silky smooth bokeh in background. 
Clean, uncluttered, generous empty flat space centered on the obsidian surface reserved for hero bottle placement. 
Straight-on eye-level camera angle, perfectly level horizon.`;

const negativePrompt = `No products, no perfume bottles, no merchandise, no people, no hands, no faces, no text, no logos, no typography, no watermarks, no distorted perspective, no floating objects, no high-angle tilt, no cartoon, no 3D render look.`;

console.log('='.repeat(70));
console.log('GENERATING NOCTURNE ROYALE LUXURY PERFUME POSTER VIA CODEX CLI');
console.log('='.repeat(70));

const provider = new CodexCliCreativeProvider({
  timeoutMs: 300_000,
});

console.log('\n[1/4] Spawning Codex CLI imagegen to synthesize background...');
const bgStartTime = Date.now();
const bgResult = await provider.generateBackground({
  creativeJobId: `nocturne-${Date.now()}`,
  contentVersionId: 'version-nocturne-001',
  briefText,
  stylePrompt: 'NOCTURNE_ROYALE_DARK_OBSIDIAN',
  negativePrompt,
  targetWidth: 1080,
  targetHeight: 1080,
  aspectRatio: '1:1',
  creativeProfile: 'NOCTURNE_ROYALE',
});

const bgDurationMs = Date.now() - bgStartTime;
console.log(
  `✓ Background generated in ${(bgDurationMs / 1000).toFixed(1)}s (${bgResult.imageBuffer.length} bytes)`,
);

fs.writeFileSync('/tmp/nocturne-bg.png', bgResult.imageBuffer);

console.log('\n[2/4] Compositing authentic Yes I Am The King bottle with contact shadows...');
const bottleBuffer = fs.readFileSync(
  path.join(appRoot, '.data/assets/products/GEP-KING-EDP-100.png'),
);

// Resize bottle to height 580 (proportional hero size)
const resizedBottle = await sharp(bottleBuffer).resize({ height: 580, fit: 'inside' }).toBuffer();

const bottleMeta = await sharp(resizedBottle).metadata();
const bottleW = bottleMeta.width;
const bottleH = bottleMeta.height;
const left = Math.round((1080 - bottleW) / 2);
// Grounded placement on the obsidian pedestal
const top = Math.round(1080 * 0.44 - bottleH / 2); // centered baseline

// Realistic contact shadow & ambient occlusion
const shadowSvg = `<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="occlusion" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.95" />
      <stop offset="40%" stop-color="#000000" stop-opacity="0.6" />
      <stop offset="85%" stop-color="#000000" stop-opacity="0.15" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="diffuse" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.5" />
      <stop offset="60%" stop-color="#000000" stop-opacity="0.2" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </radialGradient>
  </defs>
  <ellipse cx="${left + bottleW / 2}" cy="${top + bottleH - 2}" rx="${bottleW * 0.46}" ry="9" fill="url(#occlusion)" />
  <ellipse cx="${left + bottleW / 2}" cy="${top + bottleH + 10}" rx="${bottleW * 0.54}" ry="22" fill="url(#diffuse)" />
</svg>`;

const shadowLayer = await sharp(Buffer.from(shadowSvg)).png().toBuffer();

// Subtle glass base reflection on the obsidian surface
const reflH = Math.round(bottleH * 0.22);
const reflection = await sharp(resizedBottle)
  .extract({ left: 0, top: bottleH - reflH, width: bottleW, height: reflH })
  .flip()
  .blur(2)
  .linear(0.3, 0)
  .toBuffer();

const finalComposite = await sharp(bgResult.imageBuffer)
  .composite([
    { input: shadowLayer, left: 0, top: 0 },
    { input: reflection, left, top: top + bottleH - 3, blend: 'over' },
    { input: resizedBottle, left, top },
  ])
  .png()
  .toBuffer();

fs.writeFileSync('/tmp/nocturne-final-composite.png', finalComposite);
console.log('✓ Final luxury poster composited successfully!');

console.log('\n[3/4] Delivering new poster to Telegram bot (@parisian_shopper_bot)...');
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
await bot.api.sendPhoto(909395067, new InputFile(finalComposite, 'nocturne_royale.png'), {
  caption:
    `👑 *Yes I Am The King Eau de Parfum — Nocturne Royale Edition*\n\n` +
    `✨ *Art Direction:* Dark obsidian & chiaroscuro studio lighting (Hasselblad 90mm macro).\n` +
    `🛡 *Product:* Authentic flacon with silver lion crest on obsidian mirror pedestal.\n` +
    `📐 *Format:* 1:1 Feed Post (1080x1080 PNG)\n\n` +
    `_Generated by Codex CLI with custom user luxury prompt._`,
  parse_mode: 'Markdown',
});

console.log('✓ Delivered directly to your Telegram chat!\n');
