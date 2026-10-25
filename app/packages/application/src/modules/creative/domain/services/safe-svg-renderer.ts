import type { ShapedGlyph } from './text-shaper.port.js';

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface RenderShapedRunOptions {
  readonly x: number;
  readonly baselineY: number;
  readonly runs: readonly {
    readonly text: string;
    readonly fontFamily: string;
    readonly fontWeight: number;
    readonly fontSize: number;
    readonly advanceWidth?: number | undefined;
    readonly upem?: number | undefined;
    readonly glyphs?: readonly ShapedGlyph[] | undefined;
  }[];
  readonly color: string;
  readonly opacity?: number;
  readonly letterSpacing?: number;
  readonly textAnchor?: 'start' | 'middle' | 'end';
  readonly mode?: 'GLYPH_PATHS' | 'TEXT_TSPANS' | 'AUTO' | undefined;
}

export function renderShapedTextLineSvg(options: RenderShapedRunOptions): string {
  const {
    x,
    baselineY,
    runs,
    color,
    opacity,
    letterSpacing,
    textAnchor = 'start',
    mode = 'AUTO',
  } = options;
  const opacityAttr = opacity !== undefined ? ` fill-opacity="${opacity}"` : '';

  // 1. Direct HarfBuzz Glyph Outline Rendering
  // Eliminates divergence between HarfBuzz layout measurement and librsvg/Pango font rasterization
  const hasGlyphPaths =
    mode !== 'TEXT_TSPANS' && runs.some((run) => run.glyphs && run.glyphs.some((g) => g.path));

  if (hasGlyphPaths) {
    let totalAdvance = 0;
    for (const run of runs) {
      if (run.advanceWidth !== undefined) {
        totalAdvance += run.advanceWidth;
      } else if (run.glyphs && run.glyphs.length > 0) {
        for (const g of run.glyphs) {
          totalAdvance += g.xAdvance;
        }
      }
    }

    let penX = x;
    if (textAnchor === 'middle') {
      penX = x - totalAdvance / 2;
    } else if (textAnchor === 'end') {
      penX = x - totalAdvance;
    }

    const pathElements: string[] = [];
    const fullLineText = runs.map((r) => r.text).join('');

    for (const run of runs) {
      const upem = run.upem ?? 1000;
      const scale = run.fontSize / upem;
      const scaleStr = (Math.round(scale * 1000000) / 1000000).toString();
      const negScaleStr = (Math.round(-scale * 1000000) / 1000000).toString();

      if (run.glyphs && run.glyphs.length > 0) {
        for (const glyph of run.glyphs) {
          if (glyph.path && glyph.path.length > 0) {
            const gx = Math.round((penX + glyph.xOffset) * 100) / 100;
            const gy = Math.round((baselineY - glyph.yOffset) * 100) / 100;
            pathElements.push(
              `<path d="${glyph.path}" transform="translate(${gx}, ${gy}) scale(${scaleStr}, ${negScaleStr})" fill="${color}"${opacityAttr} />`,
            );
          }
          penX += glyph.xAdvance;
        }
      }
    }

    const accessibleText =
      mode !== 'GLYPH_PATHS'
        ? `<text x="${x}" y="${baselineY}" fill="none" stroke="none" opacity="0" pointer-events="none">${
            runs.length === 1 && runs[0] !== undefined
              ? `<tspan font-family="${runs[0].fontFamily}" font-weight="${runs[0].fontWeight}" font-size="${runs[0].fontSize}">${escapeXml(runs[0].text)}</tspan>`
              : runs
                  .map(
                    (run) =>
                      `<tspan font-family="${run.fontFamily}" font-weight="${run.fontWeight}" font-size="${run.fontSize}">${escapeXml(run.text)}</tspan>`,
                  )
                  .join('')
          }</text>`
        : '';

    return `<g role="img" aria-label="${escapeXml(fullLineText)}" data-engine="harfbuzz-shaped">${accessibleText}${pathElements.join('')}</g>`;
  }

  // 2. Fallback SVG <text> and <tspan> rendering when outline paths are not available
  const spacingAttr =
    letterSpacing !== undefined && letterSpacing > 0 ? ` letter-spacing="${letterSpacing}px"` : '';
  const anchorAttr = textAnchor !== 'start' ? ` text-anchor="${textAnchor}"` : '';

  if (runs.length === 1 && runs[0] !== undefined) {
    const single = runs[0];
    return `<text x="${x}" y="${baselineY}" font-family="${single.fontFamily}" font-weight="${single.fontWeight}" font-size="${single.fontSize}" fill="${color}"${opacityAttr}${spacingAttr}${anchorAttr}>${escapeXml(single.text)}</text>`;
  }

  const tspans = runs
    .map(
      (run) =>
        `<tspan font-family="${run.fontFamily}" font-weight="${run.fontWeight}" font-size="${run.fontSize}">${escapeXml(run.text)}</tspan>`,
    )
    .join('');

  return `<text x="${x}" y="${baselineY}" fill="${color}"${opacityAttr}${spacingAttr}${anchorAttr}>${tspans}</text>`;
}

export interface LotusOrnamentOptions {
  readonly centerX: number;
  readonly centerY: number;
  readonly color: string;
  readonly scale?: number;
}

export function renderLotusOrnamentSvg(options: LotusOrnamentOptions): string {
  const { centerX, centerY, color, scale = 1.0 } = options;
  const s = scale;
  return `
    <g transform="translate(${centerX}, ${centerY}) scale(${s})" stroke="${color}" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <!-- Center Lotus Petal -->
      <path d="M 0,-18 C -5,-10 -6,-2 0,6 C 6,-2 5,-10 0,-18 Z" fill="${color}" fill-opacity="0.12" />
      <!-- Left Petal -->
      <path d="M 0,4 C -10,0 -16,-6 -14,-13 C -11,-8 -6,-1 0,4 Z" fill="${color}" fill-opacity="0.08" />
      <!-- Right Petal -->
      <path d="M 0,4 C 10,0 16,-6 14,-13 C 11,-8 6,-1 0,4 Z" fill="${color}" fill-opacity="0.08" />
      <!-- Decorative Base Arc & Diamond Accents -->
      <path d="M -22,8 Q 0,11 22,8" />
      <circle cx="-26" cy="8" r="1.5" fill="${color}" stroke="none" />
      <circle cx="26" cy="8" r="1.5" fill="${color}" stroke="none" />
      <circle cx="0" cy="-22" r="1.5" fill="${color}" stroke="none" />
    </g>
  `;
}

export interface ElegantDividerOptions {
  readonly x1: number;
  readonly x2: number;
  readonly y: number;
  readonly color: string;
  readonly style?: 'SOLID_LINE' | 'DOUBLE_LINE' | 'DIAMOND_DOT';
}

export function renderDividerSvg(options: ElegantDividerOptions): string {
  const { x1, x2, y, color, style = 'SOLID_LINE' } = options;
  const midX = Math.round((x1 + x2) / 2);

  if (style === 'DOUBLE_LINE') {
    return `
      <line x1="${x1}" y1="${y - 1.5}" x2="${x2}" y2="${y - 1.5}" stroke="${color}" stroke-width="0.8" stroke-opacity="0.6" />
      <line x1="${x1}" y1="${y + 1.5}" x2="${x2}" y2="${y + 1.5}" stroke="${color}" stroke-width="0.8" stroke-opacity="0.6" />
    `;
  }

  if (style === 'DIAMOND_DOT') {
    return `
      <line x1="${x1}" y1="${y}" x2="${midX - 16}" y2="${y}" stroke="${color}" stroke-width="1" stroke-opacity="0.5" />
      <rect x="${midX - 4}" y="${y - 4}" width="8" height="8" transform="rotate(45 ${midX} ${y})" fill="${color}" />
      <line x1="${midX + 16}" y1="${y}" x2="${x2}" y2="${y}" stroke="${color}" stroke-width="1" stroke-opacity="0.5" />
    `;
  }

  return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${color}" stroke-width="1.2" stroke-opacity="0.6" />`;
}

export interface FrameBorderOptions {
  readonly width: number;
  readonly height: number;
  readonly margin: number;
  readonly color: string;
}

export function renderCornerAccentsSvg(options: FrameBorderOptions): string {
  const { width, height, margin, color } = options;
  const len = 32;
  const m = margin;
  const r = width - m;
  const b = height - m;

  return `
    <g stroke="${color}" stroke-width="1.5" fill="none" stroke-opacity="0.75">
      <!-- Top-Left -->
      <path d="M ${m + len},${m} L ${m},${m} L ${m},${m + len}" />
      <!-- Top-Right -->
      <path d="M ${r - len},${m} L ${r},${m} L ${r},${m + len}" />
      <!-- Bottom-Left -->
      <path d="M ${m + len},${b} L ${m},${b} L ${m},${b - len}" />
      <!-- Bottom-Right -->
      <path d="M ${r - len},${b} L ${r},${b} L ${r},${b - len}" />
    </g>
  `;
}
