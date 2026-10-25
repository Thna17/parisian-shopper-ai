import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as hb from 'harfbuzzjs';
import {
  PosterFontNotFoundError,
  PosterFontWeightUnsupportedError,
} from '../../domain/creative-errors.js';
import {
  APPROVED_FONT_MANIFEST,
  type FontManifestEntry,
  verifyFontIntegrity,
  verifyLicenseIntegrity,
} from './font-manifest.js';

export interface LoadedFont {
  readonly manifest: FontManifestEntry;
  readonly buffer: Buffer;
  readonly base64: string;
  readonly blob: hb.Blob;
  readonly face: hb.Face;
  readonly font: hb.Font;
  readonly unicodes: ReadonlySet<number>;
  readonly upem: number;
  readonly ascender: number;
  readonly descender: number;
  readonly lineGap: number;
}

export interface FontRegistryOptions {
  readonly assetRoots?: readonly string[];
  readonly verifyLicense?: boolean;
}

export class FontRegistry {
  private static instance: FontRegistry | null = null;
  private readonly assetRoots: readonly string[];
  private readonly verifyLicenseOnLoad: boolean;
  private readonly loadedFontsById = new Map<string, LoadedFont>();
  private embeddedCssCache: string | null = null;

  public constructor(options?: FontRegistryOptions) {
    this.verifyLicenseOnLoad = options?.verifyLicense ?? false;
    if (options?.assetRoots && options.assetRoots.length > 0) {
      this.assetRoots = options.assetRoots;
    } else {
      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      this.assetRoots = [
        path.resolve(currentDir, '../../../../../../../assets/fonts'),
        path.resolve(currentDir, '../../../../../../assets/fonts'),
        path.resolve(currentDir, '../../../../../assets/fonts'),
        path.resolve(process.cwd(), 'assets/fonts'),
        path.resolve(process.cwd(), 'app/assets/fonts'),
        path.resolve(process.cwd(), '../../assets/fonts'),
      ];
    }
  }

  public static getInstance(options?: FontRegistryOptions): FontRegistry {
    if (!FontRegistry.instance || options) {
      FontRegistry.instance = new FontRegistry(options);
    }
    return FontRegistry.instance;
  }

  public static clearCacheForTests(): void {
    FontRegistry.instance = null;
  }

  public resolveAssetFilePath(assetRelativePath: string): string {
    const searched: string[] = [];
    for (const root of this.assetRoots) {
      const candidate = path.resolve(root, assetRelativePath);
      searched.push(candidate);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    throw new PosterFontNotFoundError(path.basename(assetRelativePath), searched);
  }

  public getFontById(id: string): LoadedFont {
    const cached = this.loadedFontsById.get(id);
    if (cached) {
      return cached;
    }

    const manifestEntry = APPROVED_FONT_MANIFEST.find((entry) => entry.id === id);
    if (!manifestEntry) {
      throw new PosterFontNotFoundError(id, []);
    }

    const fullPath = this.resolveAssetFilePath(manifestEntry.assetPath);
    const buffer = fs.readFileSync(fullPath);

    // Fail-closed SHA-256 and byte-size integrity validation
    verifyFontIntegrity(manifestEntry, buffer);

    if (this.verifyLicenseOnLoad) {
      this.verifyLicenseIntegrityForEntry(manifestEntry);
    }

    const base64 = buffer.toString('base64');
    const blob = new hb.Blob(buffer);
    const face = new hb.Face(blob);
    const font = new hb.Font(face);

    const unicodesArray = face.collectUnicodes();
    const unicodes = new Set<number>(unicodesArray);
    const extents = font.hExtents();

    const loaded: LoadedFont = {
      manifest: manifestEntry,
      buffer,
      base64,
      blob,
      face,
      font,
      unicodes,
      upem: face.upem,
      ascender: extents.ascender,
      descender: extents.descender,
      lineGap: extents.lineGap,
    };

    this.loadedFontsById.set(id, loaded);
    return loaded;
  }

  public getFontForFamilyAndWeight(family: string, weight: number): LoadedFont {
    this.validateWeight(family, weight);

    if (family === 'Playfair Display') {
      return this.getFontById('playfair-display-variable');
    }

    if (family === 'Montserrat') {
      return this.getFontById('montserrat-variable');
    }

    if (family === 'Noto Sans Khmer') {
      if (weight >= 600) {
        return this.getFontById('noto-sans-khmer-bold');
      }
      return this.getFontById('noto-sans-khmer-regular');
    }

    throw new PosterFontNotFoundError(family, []);
  }

  public validateWeight(family: string, weight: number): void {
    if (family === 'Playfair Display') {
      if (weight < 400 || weight > 900) {
        throw new PosterFontWeightUnsupportedError('Playfair Display', weight, '400-900');
      }
      return;
    }

    if (family === 'Montserrat') {
      if (weight < 100 || weight > 900) {
        throw new PosterFontWeightUnsupportedError('Montserrat', weight, '100-900');
      }
      return;
    }

    if (family === 'Noto Sans Khmer') {
      if (weight !== 400 && weight !== 700) {
        throw new PosterFontWeightUnsupportedError('Noto Sans Khmer', weight, [400, 700]);
      }
      return;
    }

    throw new PosterFontNotFoundError(family, []);
  }

  public getAllLoadedFonts(): readonly LoadedFont[] {
    return APPROVED_FONT_MANIFEST.map((entry) => this.getFontById(entry.id));
  }

  public getFontFaceCss(): string {
    if (this.embeddedCssCache) {
      return this.embeddedCssCache;
    }

    const playfair = this.getFontById('playfair-display-variable');
    const montserrat = this.getFontById('montserrat-variable');
    const khmerRegular = this.getFontById('noto-sans-khmer-regular');
    const khmerBold = this.getFontById('noto-sans-khmer-bold');

    this.embeddedCssCache = `
    @font-face {
      font-family: 'Noto Sans Khmer';
      src: url('data:font/ttf;base64,${khmerRegular.base64}') format('truetype');
      font-weight: 400;
      font-style: normal;
    }
    @font-face {
      font-family: 'Noto Sans Khmer';
      src: url('data:font/ttf;base64,${khmerBold.base64}') format('truetype');
      font-weight: 700;
      font-style: normal;
    }
    @font-face {
      font-family: 'Playfair Display';
      src: url('data:font/ttf;base64,${playfair.base64}') format('truetype');
      font-weight: 400 900;
      font-style: normal;
    }
    @font-face {
      font-family: 'Montserrat';
      src: url('data:font/ttf;base64,${montserrat.base64}') format('truetype');
      font-weight: 100 900;
      font-style: normal;
    }
  `;

    return this.embeddedCssCache;
  }

  public verifyLicenseIntegrityForEntry(entry: FontManifestEntry): void {
    const licenseFullPath = this.resolveAssetFilePath(entry.licensePath);
    const licenseBuffer = fs.readFileSync(licenseFullPath);
    verifyLicenseIntegrity(entry, licenseBuffer);
  }

  public verifyLicenseIntegrityForId(id: string): void {
    const entry = APPROVED_FONT_MANIFEST.find((e) => e.id === id);
    if (!entry) {
      throw new PosterFontNotFoundError(id, []);
    }
    this.verifyLicenseIntegrityForEntry(entry);
  }

  public verifyAllLicenses(): void {
    for (const entry of APPROVED_FONT_MANIFEST) {
      this.verifyLicenseIntegrityForEntry(entry);
    }
  }
}
