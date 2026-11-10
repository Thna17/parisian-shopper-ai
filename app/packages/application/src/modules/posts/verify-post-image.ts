import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { ValidationError } from '@parisian-shopper/common';
export interface ApprovedImageDescription {
  width: number;
  height: number;
  mimeType: string;
  sha256: string;
  byteSize: number;
  extension: string;
}
/** Verify, never resize/re-encode: exported bytes must be exactly the approved bytes. */
export async function verifyPostImage(
  bytes: Buffer,
  expected: { sha256: string; width: number; height: number; mimeType: string },
): Promise<ApprovedImageDescription> {
  try {
    if (
      bytes.length > 15 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/.test(expected.sha256) ||
      createHash('sha256').update(bytes).digest('hex') !== expected.sha256
    )
      throw new Error('integrity');
    const image = sharp(bytes, { limitInputPixels: 16_777_216, failOn: 'warning' });
    const metadata = await image.metadata();
    const formats = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
    const format = metadata.format;
    if (
      !format ||
      !(format in formats) ||
      formats[format as keyof typeof formats] !== expected.mimeType ||
      metadata.width !== expected.width ||
      metadata.height !== expected.height ||
      (metadata.pages ?? 1) !== 1
    )
      throw new Error('dimensions or format');
    await image.resize(1, 1).toBuffer(); // Force a bounded full decode; reject truncated/corrupt bodies.
    return {
      width: expected.width,
      height: expected.height,
      mimeType: expected.mimeType,
      sha256: expected.sha256,
      byteSize: bytes.length,
      extension: format === 'jpeg' ? 'jpg' : format,
    };
  } catch {
    throw new ValidationError({
      publicMessage:
        'The saved poster failed its byte, image-format or dimension check. Restore or rebuild the poster before downloading.',
    });
  }
}
