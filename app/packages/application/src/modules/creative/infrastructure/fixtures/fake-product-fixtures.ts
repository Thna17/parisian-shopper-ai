import * as zlib from 'node:zlib';
import { calculateCrc32 } from './fake-background-fixtures.js';

export interface TransparentProductFixtureOptions {
  readonly width: number;
  readonly height: number;
  /**
   * Product bounding box within the canvas (centered by default)
   */
  readonly productWidth?: number;
  readonly productHeight?: number;
  /**
   * Fill color for the opaque product region
   */
  readonly productColor?: {
    readonly r: number;
    readonly g: number;
    readonly b: number;
    readonly a?: number;
  };
}

/**
 * Generates an RGBA PNG with a transparent perimeter and an opaque interior product shape.
 * STRICTLY FOR UNIT TEST FIXTURES ONLY. PROHIBITED IN PRODUCTION PATHS.
 */
export function generateTransparentProductPng_TEST_ONLY(
  options: TransparentProductFixtureOptions,
): Buffer {
  const { width, height } = options;
  const prodW = options.productWidth ?? Math.floor(width * 0.6);
  const prodH = options.productHeight ?? Math.floor(height * 0.6);
  const prodX = Math.floor((width - prodW) / 2);
  const prodY = Math.floor((height - prodH) / 2);
  const color = options.productColor ?? { r: 200, g: 20, b: 30, a: 255 };
  const alpha = color.a ?? 255;

  // 1. Signature
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // 2. IHDR Chunk (Color type 6: RGBA)
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // Bit depth: 8
  ihdrData.writeUInt8(6, 9); // Color type: 6 (RGBA)
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);

  const ihdrTypeAndData = Buffer.concat([Buffer.from('IHDR'), ihdrData]);
  const ihdrCrc = Buffer.alloc(4);
  ihdrCrc.writeUInt32BE(calculateCrc32(ihdrTypeAndData), 0);
  const ihdrChunk = Buffer.concat([Buffer.alloc(4), ihdrTypeAndData, ihdrCrc]);
  ihdrChunk.writeUInt32BE(13, 0);

  // 3. Scanlines and IDAT Chunk
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowSize);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData.writeUInt8(0, rowOffset); // Filter type: 0 (None)
    const inY = y >= prodY && y < prodY + prodH;

    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const inX = x >= prodX && x < prodX + prodW;

      if (inY && inX) {
        rawData.writeUInt8(color.r, pixelOffset);
        rawData.writeUInt8(color.g, pixelOffset + 1);
        rawData.writeUInt8(color.b, pixelOffset + 2);
        rawData.writeUInt8(alpha, pixelOffset + 3);
      } else {
        // Fully transparent
        rawData.writeUInt8(0, pixelOffset);
        rawData.writeUInt8(0, pixelOffset + 1);
        rawData.writeUInt8(0, pixelOffset + 2);
        rawData.writeUInt8(0, pixelOffset + 3);
      }
    }
  }

  const compressed = zlib.deflateSync(rawData, { level: 1 });
  const idatTypeAndData = Buffer.concat([Buffer.from('IDAT'), compressed]);
  const idatCrc = Buffer.alloc(4);
  idatCrc.writeUInt32BE(calculateCrc32(idatTypeAndData), 0);
  const idatChunk = Buffer.concat([Buffer.alloc(4), idatTypeAndData, idatCrc]);
  idatChunk.writeUInt32BE(compressed.length, 0);

  // 4. IEND Chunk
  const iendType = Buffer.from('IEND');
  const iendCrc = Buffer.alloc(4);
  iendCrc.writeUInt32BE(calculateCrc32(iendType), 0);
  const iendChunk = Buffer.concat([Buffer.alloc(4), iendType, iendCrc]);
  iendChunk.writeUInt32BE(0, 0);

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * Generates an opaque PNG (color type 2: RGB, zero alpha channel).
 */
export function generateOpaqueProductPng(width = 400, height = 400): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8);
  ihdrData.writeUInt8(2, 9); // Color type 2 (RGB)
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);

  const ihdrTypeAndData = Buffer.concat([Buffer.from('IHDR'), ihdrData]);
  const ihdrCrc = Buffer.alloc(4);
  ihdrCrc.writeUInt32BE(calculateCrc32(ihdrTypeAndData), 0);
  const ihdrChunk = Buffer.concat([Buffer.alloc(4), ihdrTypeAndData, ihdrCrc]);
  ihdrChunk.writeUInt32BE(13, 0);

  const rowSize = 1 + width * 3;
  const rawData = Buffer.alloc(height * rowSize);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData.writeUInt8(0, rowOffset);
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 3;
      rawData.writeUInt8(180, pixelOffset);
      rawData.writeUInt8(50, pixelOffset + 1);
      rawData.writeUInt8(70, pixelOffset + 2);
    }
  }

  const compressed = zlib.deflateSync(rawData, { level: 1 });
  const idatTypeAndData = Buffer.concat([Buffer.from('IDAT'), compressed]);
  const idatCrc = Buffer.alloc(4);
  idatCrc.writeUInt32BE(calculateCrc32(idatTypeAndData), 0);
  const idatChunk = Buffer.concat([Buffer.alloc(4), idatTypeAndData, idatCrc]);
  idatChunk.writeUInt32BE(compressed.length, 0);

  const iendType = Buffer.from('IEND');
  const iendCrc = Buffer.alloc(4);
  iendCrc.writeUInt32BE(calculateCrc32(iendType), 0);
  const iendChunk = Buffer.concat([Buffer.alloc(4), iendType, iendCrc]);
  iendChunk.writeUInt32BE(0, 0);

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * @deprecated Use generateTransparentProductPng_TEST_ONLY instead.
 */
export const generateTransparentProductPng = generateTransparentProductPng_TEST_ONLY;
