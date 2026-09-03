const MP4_HEADER_BYTES = 8;

/** Reads the MPEG-4 movie duration without persisting the uploaded recording. */
export function getMp4DurationSeconds(buffer: Buffer): number | null {
  const mvhd = findAtom(buffer, 0, buffer.length, 'mvhd');
  if (!mvhd) return null;

  const version = buffer[mvhd.payloadOffset];
  if (version === 0) {
    if (mvhd.payloadOffset + 20 > mvhd.end) return null;
    const timescale = buffer.readUInt32BE(mvhd.payloadOffset + 12);
    const duration = buffer.readUInt32BE(mvhd.payloadOffset + 16);
    return timescale > 0 ? duration / timescale : null;
  }

  if (version === 1) {
    if (mvhd.payloadOffset + 32 > mvhd.end) return null;
    const timescale = buffer.readUInt32BE(mvhd.payloadOffset + 20);
    const duration = Number(buffer.readBigUInt64BE(mvhd.payloadOffset + 24));
    return timescale > 0 && Number.isSafeInteger(duration)
      ? duration / timescale
      : null;
  }

  return null;
}

function findAtom(
  buffer: Buffer,
  start: number,
  end: number,
  targetType: string,
): { end: number; payloadOffset: number } | null {
  let offset = start;
  while (offset + MP4_HEADER_BYTES <= end) {
    const size = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    let headerSize = MP4_HEADER_BYTES;
    let atomEnd: number;

    if (size === 1) {
      if (offset + 16 > end) return null;
      const extendedSize = Number(buffer.readBigUInt64BE(offset + 8));
      if (!Number.isSafeInteger(extendedSize)) return null;
      headerSize = 16;
      atomEnd = offset + extendedSize;
    } else if (size === 0) {
      atomEnd = end;
    } else {
      atomEnd = offset + size;
    }

    if (atomEnd <= offset + headerSize || atomEnd > end) return null;
    if (type === targetType) {
      return { end: atomEnd, payloadOffset: offset + headerSize };
    }

    if (
      type === 'moov' ||
      type === 'trak' ||
      type === 'mdia' ||
      type === 'minf'
    ) {
      const nested = findAtom(buffer, offset + headerSize, atomEnd, targetType);
      if (nested) return nested;
    }
    offset = atomEnd;
  }
  return null;
}
