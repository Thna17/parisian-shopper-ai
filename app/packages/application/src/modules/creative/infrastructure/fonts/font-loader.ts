import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PosterFontNotFoundError } from '../../domain/creative-errors.js';

export interface EmbeddedFonts {
  readonly khmerRegularBase64: string;
  readonly khmerBoldBase64: string;
  readonly latinDisplayBase64: string;
  readonly latinBodyBase64: string;
  readonly fontFaceCss: string;
}

let cachedEmbeddedFonts: EmbeddedFonts | null = null;

function resolveFontPath(relativePath: string, fallbackSystemPath?: string): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidateRoots = [
    path.resolve(process.cwd(), 'assets/fonts'),
    path.resolve(process.cwd(), '../../assets/fonts'),
    path.resolve(currentDir, '../../../../../../../assets/fonts'),
    path.resolve(currentDir, '../../../../../../assets/fonts'),
  ];

  for (const root of candidateRoots) {
    const candidate = path.join(root, relativePath);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  if (fallbackSystemPath && fs.existsSync(fallbackSystemPath)) {
    return fallbackSystemPath;
  }

  throw new PosterFontNotFoundError(
    path.basename(relativePath),
    candidateRoots.map((r) => path.join(r, relativePath)),
  );
}

export function loadEmbeddedFonts(): EmbeddedFonts {
  if (cachedEmbeddedFonts) {
    return cachedEmbeddedFonts;
  }

  const khmerRegularPath = resolveFontPath(
    'noto-sans-khmer/NotoSansKhmer-Regular.ttf',
    '/Library/Fonts/NotoSansKhmer-Regular.ttf',
  );
  const khmerBoldPath = resolveFontPath(
    'noto-sans-khmer/NotoSansKhmer-Bold.ttf',
    '/Library/Fonts/NotoSansKhmer-Bold.ttf',
  );
  const latinDisplayPath = resolveFontPath('playfair-display/PlayfairDisplay-Variable.ttf');
  const latinBodyPath = resolveFontPath('montserrat/Montserrat-Variable.ttf');

  const khmerRegularBase64 = fs.readFileSync(khmerRegularPath).toString('base64');
  const khmerBoldBase64 = fs.readFileSync(khmerBoldPath).toString('base64');
  const latinDisplayBase64 = fs.readFileSync(latinDisplayPath).toString('base64');
  const latinBodyBase64 = fs.readFileSync(latinBodyPath).toString('base64');

  const fontFaceCss = `
    @font-face {
      font-family: 'Noto Sans Khmer';
      src: url('data:font/ttf;base64,${khmerRegularBase64}') format('truetype');
      font-weight: 400;
      font-style: normal;
    }
    @font-face {
      font-family: 'Noto Sans Khmer';
      src: url('data:font/ttf;base64,${khmerBoldBase64}') format('truetype');
      font-weight: 700;
      font-style: normal;
    }
    @font-face {
      font-family: 'Playfair Display';
      src: url('data:font/ttf;base64,${latinDisplayBase64}') format('truetype');
      font-weight: 100 900;
      font-style: normal;
    }
    @font-face {
      font-family: 'Montserrat';
      src: url('data:font/ttf;base64,${latinBodyBase64}') format('truetype');
      font-weight: 100 900;
      font-style: normal;
    }
  `;

  cachedEmbeddedFonts = {
    khmerRegularBase64,
    khmerBoldBase64,
    latinDisplayBase64,
    latinBodyBase64,
    fontFaceCss,
  };

  return cachedEmbeddedFonts;
}
