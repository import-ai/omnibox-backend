export const COMMENT_IMAGE_MAX_SIZE = 20 * 1024 * 1024;
export const COMMENT_ATTACHMENT_TTL_MS = 24 * 60 * 60 * 1000;

export const COMMENT_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

// Detect raster signatures; never interpret a caller-supplied MIME as proof.
export function detectCommentImageType(bytes: Buffer): string | null {
  if (
    bytes.length >= 24 &&
    bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
    bytes.toString('ascii', 12, 16) === 'IHDR' &&
    bytes.readUInt32BE(16) > 0 &&
    bytes.readUInt32BE(20) > 0
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff &&
    bytes[3] !== 0x00 &&
    bytes[3] !== 0xff
  ) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 13 &&
    ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6)) &&
    bytes.readUInt16LE(6) > 0 &&
    bytes.readUInt16LE(8) > 0
  ) {
    return 'image/gif';
  }
  if (
    bytes.length >= 20 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP' &&
    ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii', 12, 16)) &&
    bytes.readUInt32LE(4) === bytes.length - 8
  ) {
    return 'image/webp';
  }
  return null;
}
