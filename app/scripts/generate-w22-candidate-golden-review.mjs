#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');

// Import Sharp from application package
const sharp = (
  await import(path.join(appRoot, 'packages/application/node_modules/sharp/lib/index.js'))
).default;

// Import application modules from compiled dist
const { SharpPosterCompositor } = await import(
  path.join(
    appRoot,
    'packages/application/dist/modules/creative/infrastructure/sharp-poster-compositor.adapter.js',
  )
);
const { GOLDEN_TEMPLATE_VECTORS } = await import(
  path.join(
    appRoot,
    'packages/application/dist/modules/creative/domain/templates/__fixtures__/golden-templates.fixture.js',
  )
);
const { TemplateRegistry } = await import(
  path.join(
    appRoot,
    'packages/application/dist/modules/creative/domain/templates/template-registry.js',
  )
);
const { CANONICAL_TEMPLATE_IDS } = await import(
  path.join(
    appRoot,
    'packages/application/dist/modules/creative/domain/templates/template-registry.types.js',
  )
);

async function main() {
  console.log('======================================================================');
  console.log('   W22 Candidate Golden Review Bundle Generator');
  console.log('   Rendering 50 Candidate Posters Across 5 Template Families');
  console.log('======================================================================\n');

  const reviewDir = path.resolve(appRoot, '.data/w22-golden-review');
  const candidatesDir = path.join(reviewDir, 'candidates');
  const contactSheetsDir = path.join(reviewDir, 'contact-sheets');

  fs.mkdirSync(candidatesDir, { recursive: true });
  fs.mkdirSync(contactSheetsDir, { recursive: true });

  const compositor = new SharpPosterCompositor();
  const registry = TemplateRegistry.getInstance();

  // Load authentic product PNG
  const productPath = path.resolve(appRoot, '.data/assets/products/GEP-KING-EDP-100.png');
  const canonicalProductBuffer = fs.readFileSync(productPath);
  const canonicalProductSha256 = createHash('sha256').update(canonicalProductBuffer).digest('hex');

  console.log(`Loaded authentic product asset: ${productPath}`);
  console.log(`Product SHA-256: ${canonicalProductSha256}\n`);

  // Cache for procedural photographic background buffers by resolution
  const backgroundCache = new Map();

  async function getBackgroundBuffer(width, height, paletteId) {
    const key = `${width}x${height}-${paletteId || 'default'}`;
    if (backgroundCache.has(key)) {
      return backgroundCache.get(key);
    }

    // Procedural luxury studio background with deep radial vignette
    const bgSvg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="vignette" cx="50%" cy="45%" r="75%">
            <stop offset="0%" stop-color="#22262d" />
            <stop offset="55%" stop-color="#14171c" />
            <stop offset="100%" stop-color="#0b0d10" />
          </radialGradient>
          <linearGradient id="subtleSheen" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ffffff" stop-opacity="0.03" />
            <stop offset="100%" stop-color="#000000" stop-opacity="0.4" />
          </linearGradient>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#vignette)" />
        <rect width="${width}" height="${height}" fill="url(#subtleSheen)" />
      </svg>
    `;

    const buffer = await sharp(Buffer.from(bgSvg)).jpeg({ quality: 95 }).toBuffer();
    const sha256 = createHash('sha256').update(buffer).digest('hex');

    const entry = { buffer, sha256 };
    backgroundCache.set(key, entry);
    return entry;
  }

  const manifestRecords = [];
  const familyRecords = new Map();

  for (const templateId of CANONICAL_TEMPLATE_IDS) {
    familyRecords.set(templateId, []);
  }

  console.log(`Rendering ${GOLDEN_TEMPLATE_VECTORS.length} candidate posters...`);

  for (let i = 0; i < GOLDEN_TEMPLATE_VECTORS.length; i++) {
    const vector = GOLDEN_TEMPLATE_VECTORS[i];
    const { width, height } = vector.spec.outputFormat;
    const bg = await getBackgroundBuffer(width, height, vector.spec.palette?.id);

    const startTime = Date.now();
    const renderResult = await compositor.renderPoster({
      creativeJobId: `candidate-review-${vector.id}`,
      posterSpec: vector.spec,
      canonicalProductBuffer,
      canonicalProductMimeType: 'image/png',
      canonicalProductSha256,
      backgroundBuffer: bg.buffer,
      backgroundMimeType: 'image/jpeg',
      backgroundSha256: bg.sha256,
      allowNonApprovedForTesting: true,
    });
    const latencyMs = Date.now() - startTime;

    const candidateFileName = `candidate_${vector.id}.png`;
    const candidateFilePath = path.join(candidatesDir, candidateFileName);
    fs.writeFileSync(candidateFilePath, renderResult.posterBuffer);

    const candidateSha256 = createHash('sha256').update(renderResult.posterBuffer).digest('hex');

    const templateDef = registry.getTemplate(vector.templateId, '1.0.0');

    const record = {
      index: i + 1,
      id: vector.id,
      templateId: vector.templateId,
      version: '1.0.0',
      aspectRatio: vector.aspectRatio,
      dimensions: { width, height },
      language: vector.language,
      description: vector.description,
      candidateFileName,
      candidatePath: `candidates/${candidateFileName}`,
      candidateSha256,
      byteSize: renderResult.posterBuffer.length,
      latencyMs,
      templateContentDigest: templateDef.provenance.contentDigest,
      approvalState: templateDef.provenance.approvalState,
    };

    manifestRecords.push(record);
    familyRecords.get(vector.templateId)?.push(record);

    console.log(
      `[${String(i + 1).padStart(2, ' ')}/50] Rendered ${vector.id.padEnd(35, ' ')} | ${vector.aspectRatio.padEnd(5, ' ')} | ${vector.language.padEnd(9, ' ')} | SHA-256: ${candidateSha256.slice(0, 16)}... (${renderResult.posterBuffer.length} bytes, ${latencyMs}ms)`,
    );
  }

  // Generate Manifest JSON
  const manifestData = {
    schemaVersion: '1.0.0',
    title: 'W22 Candidate Golden Review Manifest',
    generatedAt: new Date().toISOString(),
    totalCandidates: manifestRecords.length,
    canonicalFamilies: CANONICAL_TEMPLATE_IDS,
    status: 'IMPLEMENTED — AWAITING TEMPLATE OWNER APPROVAL',
    records: manifestRecords,
  };

  const manifestPath = path.join(reviewDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2), 'utf8');
  console.log(`\nSaved review manifest: ${manifestPath}`);

  // Generate Contact Sheets for each of the 5 template families
  console.log('\nGenerating contact sheets for all 5 template families...');

  for (const [familyId, records] of familyRecords.entries()) {
    if (records.length === 0) continue;

    console.log(`Building contact sheet for ${familyId} (${records.length} variants)...`);

    // Grid layout: 3 columns (1:1, 4:5, 9:16)
    const cols = 3;
    const rows = Math.ceil(records.length / cols);

    const cellWidth = 360;
    const cellHeight = 540;
    const padding = 30;
    const headerHeight = 120;
    const footerHeight = 60;

    const sheetWidth = cols * cellWidth + (cols + 1) * padding;
    const sheetHeight = headerHeight + rows * cellHeight + (rows + 1) * padding + footerHeight;

    const composites = [];

    // Header banner SVG
    const templateDef = registry.getTemplate(familyId, '1.0.0');
    const headerSvg = `
      <svg width="${sheetWidth}" height="${headerHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${sheetWidth}" height="${headerHeight}" fill="#111317" />
        <text x="30" y="45" font-family="Montserrat, sans-serif" font-size="24" font-weight="700" fill="#E5C07B">
          W22 CANDIDATE CONTACT SHEET: ${familyId} v1.0.0
        </text>
        <text x="30" y="75" font-family="Montserrat, sans-serif" font-size="14" font-weight="500" fill="#D0D0D0">
          Template Digest: ${templateDef.provenance.contentDigest.slice(0, 32)}... | Status: CANDIDATE AWAITING OWNER APPROVAL
        </text>
        <text x="30" y="98" font-family="Montserrat, sans-serif" font-size="12" font-weight="400" fill="#888888">
          ${templateDef.description}
        </text>
      </svg>
    `;
    composites.push({ input: Buffer.from(headerSvg), top: 0, left: 0 });

    for (let idx = 0; idx < records.length; idx++) {
      const rec = records[idx];
      const col = idx % cols;
      const row = Math.floor(idx / cols);

      const cellX = padding + col * (cellWidth + padding);
      const cellY = headerHeight + padding + row * (cellHeight + padding);

      // Load and resize candidate poster to fit cell
      const candidateFull = fs.readFileSync(path.join(candidatesDir, rec.candidateFileName));
      const thumbMaxW = cellWidth - 20;
      const thumbMaxH = cellHeight - 90;

      const thumbBuffer = await sharp(candidateFull)
        .resize({
          width: thumbMaxW,
          height: thumbMaxH,
          fit: 'inside',
        })
        .png()
        .toBuffer();

      const thumbMeta = await sharp(thumbBuffer).metadata();
      const thumbX = cellX + Math.round((cellWidth - thumbMeta.width) / 2);
      const thumbY = cellY + 10 + Math.round((thumbMaxH - thumbMeta.height) / 2);

      // Label card SVG
      const labelCardSvg = `
        <svg width="${cellWidth}" height="75" xmlns="http://www.w3.org/2000/svg">
          <rect width="${cellWidth}" height="75" rx="4" fill="#1b1e24" />
          <text x="12" y="22" font-family="Montserrat, sans-serif" font-size="13" font-weight="700" fill="#FFFFFF">
            ${rec.id}
          </text>
          <text x="12" y="42" font-family="Montserrat, sans-serif" font-size="11" font-weight="500" fill="#E5C07B">
            ${rec.aspectRatio} | ${rec.language} | ${rec.dimensions.width}×${rec.dimensions.height}
          </text>
          <text x="12" y="62" font-family="monospace" font-size="10" font-weight="400" fill="#999999">
            SHA: ${rec.candidateSha256.slice(0, 24)}...
          </text>
        </svg>
      `;

      composites.push({ input: thumbBuffer, top: thumbY, left: thumbX });
      composites.push({
        input: Buffer.from(labelCardSvg),
        top: cellY + cellHeight - 75,
        left: cellX,
      });
    }

    // Render Contact Sheet
    const sheetBuffer = await sharp({
      create: {
        width: sheetWidth,
        height: sheetHeight,
        channels: 4,
        background: { r: 12, g: 14, b: 18, alpha: 1 },
      },
    })
      .composite(composites)
      .png({ compressionLevel: 8 })
      .toBuffer();

    const sheetPath = path.join(contactSheetsDir, `contact-sheet-${familyId}.png`);
    fs.writeFileSync(sheetPath, sheetBuffer);
    console.log(`Saved contact sheet: ${sheetPath} (${sheetBuffer.length} bytes)`);
  }

  // Generate Review Gallery index.html
  console.log('\nGenerating review gallery index.html...');
  const indexHtml = generateReviewHtml(manifestData, familyRecords);
  const indexHtmlPath = path.join(reviewDir, 'index.html');
  fs.writeFileSync(indexHtmlPath, indexHtml, 'utf8');
  console.log(`Saved review gallery: ${indexHtmlPath}`);

  // Generate README.md
  console.log('\nGenerating review bundle README.md...');
  const readmeMd = generateReviewReadme(manifestData);
  const readmePath = path.join(reviewDir, 'README.md');
  fs.writeFileSync(readmePath, readmeMd, 'utf8');
  console.log(`Saved review README: ${readmePath}`);

  console.log('\n======================================================================');
  console.log('   W22 Candidate Golden Review Bundle Generated Successfully!');
  console.log(`   Location: ${reviewDir}`);
  console.log('   Review Gallery: index.html');
  console.log('   Review Readme:  README.md');
  console.log('   Status: IMPLEMENTED — AWAITING TEMPLATE OWNER APPROVAL');
  console.log('======================================================================\n');
}

function generateReviewHtml(manifest, familyRecords) {
  const familySections = manifest.canonicalFamilies
    .map((familyId) => {
      const records = familyRecords.get(familyId) || [];
      const cardsHtml = records
        .map(
          (rec) => `
        <div class="card" data-family="${rec.templateId}" data-format="${rec.aspectRatio}" data-lang="${rec.language}">
          <div class="card-image-wrap">
            <a href="candidates/${rec.candidateFileName}" target="_blank" title="Click to view full resolution">
              <img src="candidates/${rec.candidateFileName}" alt="${rec.id}" loading="lazy" />
            </a>
          </div>
          <div class="card-meta">
            <div class="card-id">${rec.id}</div>
            <div class="card-badges">
              <span class="badge format">${rec.aspectRatio} (${rec.dimensions.width}×${rec.dimensions.height})</span>
              <span class="badge lang">${rec.language}</span>
              <span class="badge size">${(rec.byteSize / 1024).toFixed(1)} KB</span>
            </div>
            <div class="card-desc">${rec.description}</div>
            <div class="card-hash" title="Candidate SHA-256">
              <code>${rec.candidateSha256}</code>
            </div>
          </div>
        </div>
      `,
        )
        .join('\n');

      return `
      <section class="family-section" id="family-${familyId}">
        <div class="family-header">
          <h2>${familyId} <span class="tag">v1.0.0 Candidate</span></h2>
          <div class="family-actions">
            <a href="contact-sheets/contact-sheet-${familyId}.png" target="_blank" class="btn btn-outline">
              View Contact Sheet (${familyId})
            </a>
          </div>
        </div>
        <div class="grid">
          ${cardsHtml}
        </div>
      </section>
    `;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>W22 Template Families Candidate Golden Review (v1.0.0)</title>
  <style>
    :root {
      --bg: #0b0d10;
      --card-bg: #15181f;
      --card-border: #232832;
      --gold: #E5C07B;
      --gold-dim: rgba(229, 192, 123, 0.15);
      --text: #F0F2F5;
      --text-muted: #8E95A3;
      --cyan: #56B6C2;
      --green: #98C379;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      padding: 32px 24px;
      line-height: 1.5;
    }
    .container { max-width: 1440px; margin: 0 auto; }
    header {
      background: #11141a;
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 32px;
      margin-bottom: 32px;
    }
    h1 { color: var(--gold); font-size: 28px; margin-bottom: 8px; }
    .subtitle { color: var(--text-muted); font-size: 15px; margin-bottom: 20px; }
    .stats-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      margin-top: 16px;
    }
    .stat-pill {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 10px 16px;
      font-size: 13px;
    }
    .stat-pill strong { color: var(--gold); font-size: 16px; display: block; }
    .approval-banner {
      background: rgba(229, 192, 123, 0.08);
      border: 1px solid var(--gold);
      border-radius: 8px;
      padding: 20px;
      margin: 24px 0;
    }
    .approval-banner h3 { color: var(--gold); margin-bottom: 8px; font-size: 16px; }
    .approval-banner p { font-size: 14px; color: var(--text); margin-bottom: 12px; }
    .approval-statement {
      background: #090a0d;
      border: 1px dashed var(--gold);
      border-radius: 6px;
      padding: 14px 18px;
      font-style: italic;
      color: #FFFFFF;
      font-size: 13px;
    }
    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 28px;
      align-items: center;
      background: #11141a;
      padding: 16px;
      border-radius: 8px;
    }
    .filters span { font-size: 13px; font-weight: 600; color: var(--text-muted); margin-right: 8px; }
    .btn {
      background: var(--card-bg);
      color: var(--text);
      border: 1px solid var(--card-border);
      padding: 8px 14px;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      text-decoration: none;
      display: inline-block;
      transition: all 0.2s;
    }
    .btn:hover, .btn.active {
      background: var(--gold);
      color: #000;
      border-color: var(--gold);
      font-weight: 600;
    }
    .btn-outline {
      border-color: var(--gold);
      color: var(--gold);
    }
    .family-section { margin-bottom: 48px; }
    .family-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 12px;
    }
    .family-header h2 { font-size: 22px; color: #FFFFFF; }
    .family-header .tag {
      font-size: 12px;
      background: var(--gold-dim);
      color: var(--gold);
      border: 1px solid var(--gold);
      padding: 2px 8px;
      border-radius: 4px;
      margin-left: 10px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
      gap: 24px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .card-image-wrap {
      background: #000;
      padding: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 380px;
    }
    .card-image-wrap img {
      max-width: 100%;
      max-height: 420px;
      object-fit: contain;
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    }
    .card-meta { padding: 16px; flex: 1; display: flex; flex-direction: column; }
    .card-id { font-weight: 700; font-size: 14px; margin-bottom: 8px; color: #FFFFFF; }
    .card-badges { display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; }
    .badge {
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 4px;
      font-weight: 600;
    }
    .badge.format { background: rgba(86, 182, 194, 0.15); color: var(--cyan); }
    .badge.lang { background: rgba(152, 195, 121, 0.15); color: var(--green); }
    .badge.size { background: rgba(255, 255, 255, 0.08); color: var(--text-muted); }
    .card-desc { font-size: 12px; color: var(--text-muted); margin-bottom: 12px; flex: 1; }
    .card-hash {
      background: #0e1014;
      padding: 8px;
      border-radius: 4px;
      border: 1px solid #1a1e26;
      font-size: 10px;
      word-break: break-all;
      color: #A0A8B7;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>W22 Template Families Candidate Golden Review (v1.0.0)</h1>
      <div class="subtitle">Authoritative Visual Review Bundle for Human Brand Owner Sign-off · 50 Multi-Script Candidate Posters</div>

      <div class="approval-banner">
        <h3>Human Brand Owner Approval Action Required</h3>
        <p>In accordance with W03-DEC-006 and W22 governance, canonical template versions start in <code>DRAFT</code> state. Production creative generation is strictly fail-closed until the human owner reviews the candidate visual renders and provides explicit sign-off.</p>
        <div class="approval-statement">
          "I have reviewed the W22 candidate golden renders for CENTERED_HERO, EDITORIAL_SPLIT, KHMER_SEASONAL, SCENT_STORY, and PROMOTION_PRICE_CTA across 1:1, 4:5, and 9:16 in English, Khmer, and bilingual modes. I approve these immutable W22 v1.0.0 template versions and their recorded content digests for production use."
        </div>
      </div>

      <div class="stats-bar">
        <div class="stat-pill"><strong>50</strong> Candidates Rendered</div>
        <div class="stat-pill"><strong>5</strong> Canonical Families</div>
        <div class="stat-pill"><strong>3</strong> Supported Formats (1:1, 4:5, 9:16)</div>
        <div class="stat-pill"><strong>3</strong> Language Modes (EN, KM, BILINGUAL)</div>
        <div class="stat-pill"><strong>Pure W21</strong> HarfBuzz Glyph Outlines</div>
        <div class="stat-pill"><strong>AWAITING</strong> Owner Sign-Off</div>
      </div>
    </header>

    <div class="filters">
      <span>Filter Family:</span>
      <button class="btn active" onclick="filterFamily('ALL')">All (50)</button>
      <button class="btn" onclick="filterFamily('CENTERED_HERO')">CENTERED_HERO</button>
      <button class="btn" onclick="filterFamily('EDITORIAL_SPLIT')">EDITORIAL_SPLIT</button>
      <button class="btn" onclick="filterFamily('KHMER_SEASONAL')">KHMER_SEASONAL</button>
      <button class="btn" onclick="filterFamily('SCENT_STORY')">SCENT_STORY</button>
      <button class="btn" onclick="filterFamily('PROMOTION_PRICE_CTA')">PROMOTION_PRICE_CTA</button>
    </div>

    ${familySections}
  </div>

  <script>
    function filterFamily(familyId) {
      document.querySelectorAll('.filters .btn').forEach(b => b.classList.remove('active'));
      event.target.classList.add('active');

      document.querySelectorAll('.family-section').forEach(sec => {
        if (familyId === 'ALL' || sec.id === 'family-' + familyId) {
          sec.style.display = 'block';
        } else {
          sec.style.display = 'none';
        }
      });
    }
  </script>
</body>
</html>`;
}

function generateReviewReadme(manifest) {
  let tableRows = '';
  for (const rec of manifest.records) {
    tableRows += `| ${rec.index} | \`${rec.id}\` | ${rec.templateId} | ${rec.aspectRatio} | ${rec.language} | \`${rec.candidateSha256.slice(0, 16)}...\` | ${(rec.byteSize / 1024).toFixed(1)} KB |\n`;
  }

  return `# W22 Candidate Golden Poster Review Bundle

**Current Classification:** \`IMPLEMENTED — AWAITING TEMPLATE OWNER APPROVAL\`
**Generated At:** ${manifest.generatedAt}
**Total Candidate Posters:** 50 multi-script renders
**Governing Decision:** [W03-DEC-006: Template Family Selection and Typography Standardization](../../docs/specifications/w03-business-decision-register.md)

---

## 1. Executive Summary

This review bundle contains 50 production-candidate PNG renders generated by \`SharpPosterCompositor\` across the five canonical template families, three governed aspect ratios (1:1, 4:5, 9:16), and three language modes (English, Khmer, and Bilingual).

All text in every poster is rendered via **pure W21 HarfBuzz glyph outline paths** (\`mode: 'GLYPH_PATHS'\`), guaranteeing bit-exact layout-to-rasterization fidelity, Khmer Coeng subscript preservation, atomic currency/SKU formatting, and complete immunity to host OS font divergence.

---

## 2. Five Canonical Template Families (v1.0.0 Candidates)

| Template ID | Category | Version | Status | Content Digest | Description |
|:---|:---|:---:|:---:|:---:|:---|
| **CENTERED_HERO** | HERO | 1.0.0 | \`DRAFT\` (Candidate) | See manifest.json | Centered luxury product focal point with controlled central symmetry and governed negative space. |
| **EDITORIAL_SPLIT** | EDITORIAL | 1.0.0 | \`DRAFT\` (Candidate) | See manifest.json | Disciplined 2-column editorial grid (1:1/4:5) with responsive vertical stacking (9:16). |
| **KHMER_SEASONAL** | CULTURAL | 1.0.0 | \`DRAFT\` (Candidate) | See manifest.json | Culturally respectful Khmer-first layout with governed lotus ornament and corner accents. |
| **SCENT_STORY** | OLFACTORY | 1.0.0 | \`DRAFT\` (Candidate) | See manifest.json | Olfactory education pyramid presenting verified top, heart, and base fragrance notes. |
| **PROMOTION_PRICE_CTA** | COMMERCIAL | 1.0.0 | \`DRAFT\` (Candidate) | See manifest.json | Commercial promotional layout with verified pricing provenance and optional Haussmann styling. |

---

## 3. Visual Contact Sheets

Contact sheets compiling all variations for each family are available in \`contact-sheets/\`:
- \`contact-sheets/contact-sheet-CENTERED_HERO.png\`
- \`contact-sheets/contact-sheet-EDITORIAL_SPLIT.png\`
- \`contact-sheets/contact-sheet-KHMER_SEASONAL.png\`
- \`contact-sheets/contact-sheet-SCENT_STORY.png\`
- \`contact-sheets/contact-sheet-PROMOTION_PRICE_CTA.png\`

To view the interactive visual gallery, open:
\`\`\`bash
open app/.data/w22-golden-review/index.html
\`\`\`

---

## 4. Complete Candidate Corpus Matrix (50 Vectors)

| # | Vector ID | Template ID | Ratio | Lang | Candidate PNG SHA-256 (Prefix) | Size |
|---|:---|:---|:---:|:---:|:---|:---:|
${tableRows}

---

## 5. Human Brand Owner Approval Requirement

In accordance with W03-DEC-006 and W22 fail-closed governance:
- All canonical templates currently reside in immutable \`DRAFT\` state with \`approverRef: null\` and \`approvedAt: null\`.
- Only explicitly approved templates may be selected for production creative generation.
- To transition these candidates to \`APPROVED\` status, the human owner must review the renders and provide the exact sign-off statement:

> **"I have reviewed the W22 candidate golden renders for CENTERED_HERO, EDITORIAL_SPLIT, KHMER_SEASONAL, SCENT_STORY, and PROMOTION_PRICE_CTA across 1:1, 4:5, and 9:16 in English, Khmer, and bilingual modes. I approve these immutable W22 v1.0.0 template versions and their recorded content digests for production use."**
`;
}

main().catch((err) => {
  console.error('Fatal error during W22 candidate review bundle generation:', err);
  process.exit(1);
});
