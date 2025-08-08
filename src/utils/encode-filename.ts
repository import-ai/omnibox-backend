export default function encodeFileName(val?: string) {
  if (!val) {
    return '';
  }

  return Buffer.from(val, 'latin1').toString('utf-8');
}
