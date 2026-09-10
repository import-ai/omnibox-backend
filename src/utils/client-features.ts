import type { IncomingHttpHeaders } from 'node:http';

// Add feature thresholds here; never use client versions as authorization.
export const MINIMUM_APP_VERSIONS = {
  conversationImages: { android: '0.1.50', ios: '0.1.50' },
} as const;

export function supportsClientFeature(
  headers: IncomingHttpHeaders,
  feature: keyof typeof MINIMUM_APP_VERSIONS,
): boolean {
  const platform = headers['x-client-platform'];
  if (platform === 'web') return true;
  if (platform !== 'android' && platform !== 'ios') return false;

  const version = headers['x-client-version'];
  // Unknown/malformed/prerelease versions use the legacy representation.
  if (
    typeof version !== 'string' ||
    !/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(version)
  ) {
    return false;
  }
  const current = version.split('.').map(Number);
  const minimum = MINIMUM_APP_VERSIONS[feature][platform]
    .split('.')
    .map(Number);
  for (let index = 0; index < minimum.length; index++) {
    if (current[index] !== minimum[index])
      return current[index] > minimum[index];
  }
  return true;
}
