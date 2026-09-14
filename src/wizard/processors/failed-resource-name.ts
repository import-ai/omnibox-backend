export function prefixFailedResourceName(name: string | undefined): string {
  const base = (name ?? '').replace(/^❌\s*/, '');
  return `❌ ${base}`;
}
