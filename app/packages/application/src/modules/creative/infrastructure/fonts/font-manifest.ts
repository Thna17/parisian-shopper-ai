import { createHash } from 'node:crypto';
import { PosterFontIntegrityError } from '../../domain/creative-errors.js';

export type FontRole = 'LATIN_DISPLAY' | 'LATIN_BODY' | 'KHMER';

export interface FontManifestEntry {
  readonly id: string;
  readonly family: 'Playfair Display' | 'Montserrat' | 'Noto Sans Khmer';
  readonly role: FontRole;
  readonly assetPath: string;
  readonly supportedWeights: readonly number[] | { readonly min: number; readonly max: number };
  readonly sha256: string;
  readonly byteSize: number;
  readonly upstreamProject: string;
  readonly upstreamUrl: string;
  readonly upstreamRef: string;
  readonly licenseId: 'OFL-1.1';
  readonly licensePath: string;
  readonly licenseSha256: string;
  readonly licenseByteSize: number;
  readonly supportedScripts: readonly string[];
  readonly version: string;
}

export const APPROVED_FONT_MANIFEST: readonly FontManifestEntry[] = [
  {
    id: 'playfair-display-variable',
    family: 'Playfair Display',
    role: 'LATIN_DISPLAY',
    assetPath: 'playfair-display/PlayfairDisplay-Variable.ttf',
    supportedWeights: { min: 400, max: 900 },
    sha256: 'c40f2293766a503bc70cce9e512ef844a4ccb7cbcde792fe2ea31d191917d8d6',
    byteSize: 300724,
    upstreamProject: 'Google Fonts / clausgg/Playfair',
    upstreamUrl: 'https://github.com/google/fonts/tree/main/ofl/playfairdisplay',
    upstreamRef: 'commit 29288e89 / v2.000',
    licenseId: 'OFL-1.1',
    licensePath: 'playfair-display/OFL.txt',
    licenseSha256: '566be814f8e96e93dfa16101331557eb6b5467e9e03f627c0910fe93ca12300e',
    licenseByteSize: 4449,
    supportedScripts: ['Latin', 'Latin-Ext', 'Cyrillic', 'Vietnamese'],
    version: '1.203',
  },
  {
    id: 'montserrat-variable',
    family: 'Montserrat',
    role: 'LATIN_BODY',
    assetPath: 'montserrat/Montserrat-Variable.ttf',
    supportedWeights: { min: 100, max: 900 },
    sha256: '0f7b311b2f3279e4eef9b2f968bcdbab6e28f4daeb1f049f4f278a902bcd82f7',
    byteSize: 744936,
    upstreamProject: 'Google Fonts / JulietaUla/Montserrat',
    upstreamUrl: 'https://github.com/google/fonts/tree/main/ofl/montserrat',
    upstreamRef: 'commit 4a3e8dc / v7.222',
    licenseId: 'OFL-1.1',
    licensePath: 'montserrat/OFL.txt',
    licenseSha256: '8b7141c03fa4f8d44e6345d5d4931709290f0f67875e452e95ac1fd3a027802e',
    licenseByteSize: 4400,
    supportedScripts: ['Latin', 'Latin-Ext', 'Cyrillic', 'Vietnamese'],
    version: '9.000',
  },
  {
    id: 'noto-sans-khmer-regular',
    family: 'Noto Sans Khmer',
    role: 'KHMER',
    assetPath: 'noto-sans-khmer/NotoSansKhmer-Regular.ttf',
    supportedWeights: [400],
    sha256: 'cc8af91f5558ac8e53fce83213328dada31b22edb562e44938f04238a2a65b6a',
    byteSize: 147792,
    upstreamProject: 'Google Noto Fonts (notofonts/khmer)',
    upstreamUrl: 'https://github.com/notofonts/khmer/releases/tag/NotoSansKhmer-v2.004',
    upstreamRef: 'NotoSansKhmer-v2.004',
    licenseId: 'OFL-1.1',
    licensePath: 'noto-sans-khmer/OFL.txt',
    licenseSha256: 'be0407f060aea48787ff9e75d8d3aedef70aef113b3ce9aca26fdaacd10b1870',
    licenseByteSize: 4381,
    supportedScripts: ['Khmer'],
    version: '2.004',
  },
  {
    id: 'noto-sans-khmer-bold',
    family: 'Noto Sans Khmer',
    role: 'KHMER',
    assetPath: 'noto-sans-khmer/NotoSansKhmer-Bold.ttf',
    supportedWeights: [700],
    sha256: '4cf9803a479d68cb637fa8094fdf7bbd6b63ea546856e406e435101c12a6b24d',
    byteSize: 148708,
    upstreamProject: 'Google Noto Fonts (notofonts/khmer)',
    upstreamUrl: 'https://github.com/notofonts/khmer/releases/tag/NotoSansKhmer-v2.004',
    upstreamRef: 'NotoSansKhmer-v2.004',
    licenseId: 'OFL-1.1',
    licensePath: 'noto-sans-khmer/OFL.txt',
    licenseSha256: 'be0407f060aea48787ff9e75d8d3aedef70aef113b3ce9aca26fdaacd10b1870',
    licenseByteSize: 4381,
    supportedScripts: ['Khmer'],
    version: '2.004',
  },
] as const;

export function getManifestEntryForPath(relativePath: string): FontManifestEntry | undefined {
  return APPROVED_FONT_MANIFEST.find(
    (entry) => entry.assetPath === relativePath || relativePath.endsWith(entry.assetPath),
  );
}

export function getManifestEntryById(id: string): FontManifestEntry | undefined {
  return APPROVED_FONT_MANIFEST.find((entry) => entry.id === id);
}

export function verifyFontIntegrity(entry: FontManifestEntry, buffer: Buffer): void {
  if (buffer.length !== entry.byteSize) {
    throw new PosterFontIntegrityError(
      entry.id,
      `${entry.byteSize} bytes (sha256: ${entry.sha256})`,
      `${buffer.length} bytes`,
    );
  }

  const actualSha = createHash('sha256').update(buffer).digest('hex').toLowerCase();
  if (actualSha !== entry.sha256) {
    throw new PosterFontIntegrityError(entry.id, entry.sha256, actualSha);
  }
}

export function verifyLicenseIntegrity(entry: FontManifestEntry, buffer: Buffer): void {
  if (buffer.length !== entry.licenseByteSize) {
    throw new PosterFontIntegrityError(
      `${entry.id}-license`,
      `${entry.licenseByteSize} bytes (sha256: ${entry.licenseSha256})`,
      `${buffer.length} bytes`,
    );
  }

  const actualSha = createHash('sha256').update(buffer).digest('hex').toLowerCase();
  if (actualSha !== entry.licenseSha256) {
    throw new PosterFontIntegrityError(`${entry.id}-license`, entry.licenseSha256, actualSha);
  }
}
