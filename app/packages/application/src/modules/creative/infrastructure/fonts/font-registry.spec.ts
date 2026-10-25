import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  PosterFontIntegrityError,
  PosterFontNotFoundError,
  PosterFontWeightUnsupportedError,
} from '../../domain/creative-errors.js';
import { APPROVED_FONT_MANIFEST, verifyFontIntegrity } from './font-manifest.js';
import { FontRegistry } from './font-registry.js';

describe('FontRegistry and FontManifest (W21 Deliverables A & B)', () => {
  beforeEach(() => {
    FontRegistry.clearCacheForTests();
  });

  afterEach(() => {
    FontRegistry.clearCacheForTests();
  });

  describe('Font Manifest & Integrity Verification', () => {
    it('has exactly 4 approved font assets in manifest', () => {
      expect(APPROVED_FONT_MANIFEST).toHaveLength(4);
      const ids = APPROVED_FONT_MANIFEST.map((e) => e.id);
      expect(ids).toEqual([
        'playfair-display-variable',
        'montserrat-variable',
        'noto-sans-khmer-regular',
        'noto-sans-khmer-bold',
      ]);
    });

    it('loads all 4 approved fonts and verifies exact SHA-256 and byte size integrity', () => {
      const registry = FontRegistry.getInstance();
      const allFonts = registry.getAllLoadedFonts();
      expect(allFonts).toHaveLength(4);

      for (const loaded of allFonts) {
        expect(loaded.buffer.length).toBe(loaded.manifest.byteSize);
        expect(loaded.manifest.licenseId).toBe('OFL-1.1');
        expect(loaded.base64.length).toBeGreaterThan(1000);
        expect(loaded.upem).toBeGreaterThan(0);
        expect(loaded.unicodes.size).toBeGreaterThan(0);
      }
    });

    it('throws PosterFontIntegrityError when font binary bytes are modified', () => {
      const entry = APPROVED_FONT_MANIFEST[0]!;
      const tamperedBuffer = Buffer.from('TAMPERED_FONT_DATA_CORRUPT_BYTES');

      expect(() => {
        verifyFontIntegrity(entry, tamperedBuffer);
      }).toThrow(PosterFontIntegrityError);
    });

    it('throws PosterFontIntegrityError when byte size matches but sha256 differs', () => {
      const entry = APPROVED_FONT_MANIFEST[0]!;
      const fakeBuffer = Buffer.alloc(entry.byteSize, 0x41);

      expect(() => {
        verifyFontIntegrity(entry, fakeBuffer);
      }).toThrow(PosterFontIntegrityError);
    });

    it('verifies license file integrity for all approved manifest entries', () => {
      const registry = FontRegistry.getInstance();
      expect(() => registry.verifyAllLicenses()).not.toThrow();
    });

    it('throws PosterFontNotFoundError when a font file is missing from asset search paths', () => {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-font-dir-'));
      try {
        const isolatedRegistry = new FontRegistry({ assetRoots: [emptyDir] });
        expect(() => {
          isolatedRegistry.getFontById('playfair-display-variable');
        }).toThrow(PosterFontNotFoundError);
      } finally {
        fs.rmSync(emptyDir, { recursive: true, force: true });
      }
    });

    it('never falls back to host system directories like /Library/Fonts', () => {
      // Create registry with an isolated empty directory
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-host-fallback-'));
      try {
        const isolatedRegistry = new FontRegistry({ assetRoots: [emptyDir] });
        expect(() => {
          isolatedRegistry.resolveAssetFilePath('noto-sans-khmer/NotoSansKhmer-Regular.ttf');
        }).toThrow(PosterFontNotFoundError);
      } finally {
        fs.rmSync(emptyDir, { recursive: true, force: true });
      }
    });
  });

  describe('Supported Weight Validation', () => {
    it('accepts Playfair Display at weights 400-900', () => {
      const registry = FontRegistry.getInstance();
      expect(() => registry.validateWeight('Playfair Display', 400)).not.toThrow();
      expect(() => registry.validateWeight('Playfair Display', 700)).not.toThrow();
      expect(() => registry.validateWeight('Playfair Display', 900)).not.toThrow();
    });

    it('rejects Playfair Display at weights below 400 or above 900', () => {
      const registry = FontRegistry.getInstance();
      expect(() => registry.validateWeight('Playfair Display', 300)).toThrow(
        PosterFontWeightUnsupportedError,
      );
      expect(() => registry.validateWeight('Playfair Display', 1000)).toThrow(
        PosterFontWeightUnsupportedError,
      );
    });

    it('accepts Montserrat at weights 100-900', () => {
      const registry = FontRegistry.getInstance();
      expect(() => registry.validateWeight('Montserrat', 100)).not.toThrow();
      expect(() => registry.validateWeight('Montserrat', 400)).not.toThrow();
      expect(() => registry.validateWeight('Montserrat', 900)).not.toThrow();
    });

    it('rejects Montserrat at weights below 100 or above 900', () => {
      const registry = FontRegistry.getInstance();
      expect(() => registry.validateWeight('Montserrat', 50)).toThrow(
        PosterFontWeightUnsupportedError,
      );
      expect(() => registry.validateWeight('Montserrat', 950)).toThrow(
        PosterFontWeightUnsupportedError,
      );
    });

    it('accepts Noto Sans Khmer strictly at weights 400 and 700', () => {
      const registry = FontRegistry.getInstance();
      expect(() => registry.validateWeight('Noto Sans Khmer', 400)).not.toThrow();
      expect(() => registry.validateWeight('Noto Sans Khmer', 700)).not.toThrow();
    });

    it('rejects Noto Sans Khmer at unsupported weights (e.g. 300, 500, 600, 800)', () => {
      const registry = FontRegistry.getInstance();
      expect(() => registry.validateWeight('Noto Sans Khmer', 300)).toThrow(
        PosterFontWeightUnsupportedError,
      );
      expect(() => registry.validateWeight('Noto Sans Khmer', 500)).toThrow(
        PosterFontWeightUnsupportedError,
      );
      expect(() => registry.validateWeight('Noto Sans Khmer', 600)).toThrow(
        PosterFontWeightUnsupportedError,
      );
    });
  });

  describe('CSS Embedding and Font Face Declarations', () => {
    it('generates valid @font-face CSS containing base64 data URIs for all approved families', () => {
      const registry = FontRegistry.getInstance();
      const css = registry.getFontFaceCss();

      expect(css).toContain("font-family: 'Noto Sans Khmer'");
      expect(css).toContain("font-family: 'Playfair Display'");
      expect(css).toContain("font-family: 'Montserrat'");
      expect(css).toContain("data:font/ttf;base64,");

      // Verify Playfair Display declared weight range is 400 900 (not 100 900)
      expect(css).toContain('font-weight: 400 900;');
    });
  });
});
