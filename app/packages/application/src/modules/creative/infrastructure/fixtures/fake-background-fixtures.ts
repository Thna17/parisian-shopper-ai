import * as zlib from 'node:zlib';

export interface DeterministicPngOptions {
  readonly width: number;
  readonly height: number;
  readonly seed?: number;
  readonly profile?: string;
  readonly palette?: { readonly r: number; readonly g: number; readonly b: number };
}

export const DEFAULT_FIXTURE_SEED = 19283746;
export const DEFAULT_FIXTURE_WIDTH = 1080;
export const DEFAULT_FIXTURE_HEIGHT = 1080;

/**
 * Calculates standard IEEE 802.3 CRC32 checksum.
 * Uses node:zlib built-in crc32 when available with a pure bitwise fallback.
 */
export function calculateCrc32(buffer: Buffer): number {
  if (typeof (zlib as { crc32?: (b: Buffer) => number }).crc32 === 'function') {
    return (zlib as unknown as { crc32: (b: Buffer) => number }).crc32(buffer);
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i]!;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Checks whether a buffer starts with standard PNG magic signature.
 */
export function isPngBuffer(buffer: Buffer): boolean {
  if (buffer.length < 8) return false;
  return (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  );
}

/**
 * Generates a 100% valid, deterministic PNG byte buffer using pure Node.js built-ins.
 * Requires NO external dependencies (Sharp, Canvas, libvips).
 * Output bytes are strictly deterministic for any identical option combination.
 */
export function generateDeterministicBackgroundPng(options: DeterministicPngOptions): Buffer {
  const { width, height, seed = 0, profile = 'PARISIAN_LUXURY_ATELIER' } = options;

  if (width <= 0 || height <= 0) {
    throw new Error('Image width and height must be positive integers');
  }

  // Base luxury color choices
  let baseR = 248; // Cream #F8F6F0
  let baseG = 246;
  let baseB = 240;

  if (options.palette !== undefined) {
    baseR = options.palette.r;
    baseG = options.palette.g;
    baseB = options.palette.b;
  } else if (profile.includes('NOIR') || Math.abs(seed) % 3 === 1) {
    // Luxury Noir #1A1A1A
    baseR = 26;
    baseG = 26;
    baseB = 26;
  } else if (profile.includes('GOLD') || Math.abs(seed) % 3 === 2) {
    // Primary Gold #D4AF37
    baseR = 212;
    baseG = 175;
    baseB = 55;
  }

  // Modulate slightly with seed to yield distinct deterministic byte sequences
  const seedShift = Math.abs(seed) % 8;
  const r = Math.min(255, Math.max(0, baseR - seedShift));
  const g = Math.min(255, Math.max(0, baseG - seedShift));
  const b = Math.min(255, Math.max(0, baseB - seedShift));

  // 1. Standard PNG Signature (8 bytes)
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // 2. IHDR Chunk (13 bytes payload)
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // Bit depth: 8
  ihdrData.writeUInt8(2, 9); // Color type: 2 (RGB)
  ihdrData.writeUInt8(0, 10); // Compression method: 0 (deflate)
  ihdrData.writeUInt8(0, 11); // Filter method: 0 (adaptive)
  ihdrData.writeUInt8(0, 12); // Interlace method: 0 (no interlace)

  const ihdrTypeAndData = Buffer.concat([Buffer.from('IHDR'), ihdrData]);
  const ihdrCrc = Buffer.alloc(4);
  ihdrCrc.writeUInt32BE(calculateCrc32(ihdrTypeAndData), 0);
  const ihdrChunk = Buffer.concat([Buffer.alloc(4), ihdrTypeAndData, ihdrCrc]);
  ihdrChunk.writeUInt32BE(13, 0);

  // 3. Scanlines and IDAT Chunk
  const rowSize = 1 + width * 3;
  const rawData = Buffer.alloc(height * rowSize);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData.writeUInt8(0, rowOffset); // Filter type: 0 (None)
    const yGradient = (y % 8) - 4;
    const pixelR = Math.min(255, Math.max(0, r + yGradient));
    const pixelG = Math.min(255, Math.max(0, g + yGradient));
    const pixelB = Math.min(255, Math.max(0, b + yGradient));

    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 3;
      rawData.writeUInt8(pixelR, pixelOffset);
      rawData.writeUInt8(pixelG, pixelOffset + 1);
      rawData.writeUInt8(pixelB, pixelOffset + 2);
    }
  }

  const compressed = zlib.deflateSync(rawData, { level: 1 });
  const idatTypeAndData = Buffer.concat([Buffer.from('IDAT'), compressed]);
  const idatCrc = Buffer.alloc(4);
  idatCrc.writeUInt32BE(calculateCrc32(idatTypeAndData), 0);
  const idatChunk = Buffer.concat([Buffer.alloc(4), idatTypeAndData, idatCrc]);
  idatChunk.writeUInt32BE(compressed.length, 0);

  // 4. IEND Chunk (0 bytes payload)
  const iendType = Buffer.from('IEND');
  const iendCrc = Buffer.alloc(4);
  iendCrc.writeUInt32BE(calculateCrc32(iendType), 0);
  const iendChunk = Buffer.concat([Buffer.alloc(4), iendType, iendCrc]);
  iendChunk.writeUInt32BE(0, 0);

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * Creates preset background fixture buffers for testing.
 */
export function getPresetFixture(
  preset: 'cream' | 'noir' | 'gold',
  width = DEFAULT_FIXTURE_WIDTH,
  height = DEFAULT_FIXTURE_HEIGHT,
): Buffer {
  const palette =
    preset === 'cream'
      ? { r: 248, g: 246, b: 240 }
      : preset === 'noir'
        ? { r: 26, g: 26, b: 26 }
        : { r: 212, g: 175, b: 55 };

  return generateDeterministicBackgroundPng({
    width,
    height,
    seed: preset === 'cream' ? 100 : preset === 'noir' ? 200 : 300,
    profile: `PRESET_${preset.toUpperCase()}`,
    palette,
  });
}
