export function encodeFileName(val?: string) {
  if (!val) {
    return '';
  }

  try {
    // First, try to fix the filename if it was corrupted by multer
    // Multer often interprets UTF-8 bytes as Latin-1, so we need to reverse this
    let correctedFilename = val;

    // Check if this looks like a UTF-8 string that was interpreted as Latin-1
    // This is a heuristic to detect corrupted filenames
    try {
      const asLatin1Buffer = Buffer.from(val, 'latin1');
      const asUtf8 = asLatin1Buffer.toString('utf-8');

      // If the UTF-8 conversion results in valid characters and is different from original,
      // it's likely the original was corrupted
      if (asUtf8 !== val && asUtf8.length < val.length) {
        correctedFilename = asUtf8;
      }
    } catch {
      // If conversion fails, keep original
    }

    // For HTTP headers, we need to encode non-ASCII characters
    // Check if the corrected string contains only ASCII characters
    // eslint-disable-next-line no-control-regex
    if (/^[\x00-\x7F]*$/.test(correctedFilename)) {
      return correctedFilename; // ASCII only, return as-is
    }

    // Contains non-ASCII characters, encode as base64
    const base64 = Buffer.from(correctedFilename, 'utf-8').toString('base64');
    return `=?UTF-8?B?${base64}?=`; // RFC 2047 encoded-word format
  } catch {
    // Fallback: replace non-ASCII characters with underscores
    // eslint-disable-next-line no-control-regex
    return val.replace(/[^\x00-\x7F]/g, '_');
  }
}

export function decodeFileName(val?: string): string {
  if (!val) {
    return '';
  }

  try {
    // Check if it's RFC 2047 encoded-word format
    const match = val.match(/^=\?UTF-8\?B\?(.+)\?=$/);
    if (match) {
      const base64 = match[1];
      return Buffer.from(base64, 'base64').toString('utf-8');
    }

    // Not encoded, return as-is
    return val;
  } catch {
    // Fallback: return original value
    return val;
  }
}

// Helper function to get the original filename for display purposes
export function getOriginalFileName(val?: string): string {
  if (!val) {
    return '';
  }

  try {
    // First try to decode if it's encoded
    const decoded = decodeFileName(val);
    if (decoded !== val) {
      return decoded;
    }

    // If not encoded, check if it looks like a corrupted UTF-8 string
    try {
      const asLatin1Buffer = Buffer.from(val, 'latin1');
      const asUtf8 = asLatin1Buffer.toString('utf-8');

      // If the UTF-8 conversion results in valid characters and is different from original,
      // it's likely the original was corrupted
      if (asUtf8 !== val && asUtf8.length < val.length) {
        return asUtf8;
      }
    } catch {
      // If conversion fails, keep original
    }

    return val;
  } catch {
    return val;
  }
}
