export default function encodeFileName(val?: string) {
  if (!val) {
    return '';
  }

  const data = val.trim().replace(/\s+/g, '_');

  return encodeURIComponent(data);
}
