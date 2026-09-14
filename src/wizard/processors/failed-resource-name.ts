const FAILED_RESOURCE_NAME_PREFIX = '❌ ';
const FAILED_RESOURCE_NAME_MARKERS = ['❌', '失败：', 'error:'];

export function prefixFailedResourceName(name: string | undefined): string {
  let base = name ?? '';
  for (const existing of FAILED_RESOURCE_NAME_MARKERS) {
    if (base.toLowerCase().startsWith(existing.toLowerCase())) {
      base = base.slice(existing.length).replace(/^\s+/, '');
      break;
    }
  }
  return `${FAILED_RESOURCE_NAME_PREFIX}${base}`;
}
