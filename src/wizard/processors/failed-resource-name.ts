const FAILED_RESOURCE_NAME_PREFIXES = ['失败：', 'error:'];

export function prefixFailedResourceName(
  name: string | undefined,
  prefix: string,
): string {
  let base = name ?? '';
  for (const existing of FAILED_RESOURCE_NAME_PREFIXES) {
    if (base.toLowerCase().startsWith(existing.toLowerCase())) {
      base = base.slice(existing.length).replace(/^\s+/, '');
      break;
    }
  }
  return `${prefix}${base}`;
}
