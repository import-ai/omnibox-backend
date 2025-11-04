export function isEmoji(char: string) {
  const code = char.codePointAt(0);

  if (!code) {
    return false;
  }

  return (
    (code >= 0x1f600 && code <= 0x1f64f) || // Emoticons
    (code >= 0x1f300 && code <= 0x1f5ff) || // Misc Symbols and Pictographs
    (code >= 0x1f680 && code <= 0x1f6ff) || // Transport and Map Symbols
    (code >= 0x1f700 && code <= 0x1f77f) || // Alchemical Symbols
    (code >= 0x1f780 && code <= 0x1f7ff) || // Geometric Shapes Extended
    (code >= 0x1f800 && code <= 0x1f8ff) || // Supplemental Arrows-C
    (code >= 0x1f900 && code <= 0x1f9ff) || // Supplemental Symbols and Pictographs
    (code >= 0x1fa00 && code <= 0x1fa6f) || // Chess Symbols
    (code >= 0x1fa70 && code <= 0x1faff) || // Symbols and Pictographs Extended-A
    (code >= 0x2600 && code <= 0x26ff) || // Miscellaneous Symbols
    (code >= 0x2700 && code <= 0x27bf) || // Dingbats
    (code >= 0xfe00 && code <= 0xfe0f) || // Variation Selectors
    (code >= 0x1f000 && code <= 0x1f02f) || // Mahjong Tiles
    (code >= 0x1f0a0 && code <= 0x1f0ff) // Playing Cards
  );
}

export function filterEmoji(data: string) {
  return Array.from(data)
    .filter((char) => !isEmoji(char))
    .join('')
    .trim();
}
