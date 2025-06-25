export default function encodeFileName(val?: string) {
  if (!val) {
    return '';
  }
  // eslint-disable-next-line no-control-regex
  if (/[^\u0000-\u00ff]/.test(val)) {
    return val;
  }
  return Buffer.from(val, 'latin1').toString('utf8');
}
