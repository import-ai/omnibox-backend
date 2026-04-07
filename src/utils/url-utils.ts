/**
 * Appends query parameters to a URL, handling existing query strings correctly
 */
export function appendQueryParams(
  baseUrl: string,
  params: Record<string, string>,
): string {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });
  return url.toString();
}

/**
 * Appends a single token parameter to a URL
 */
export function appendTokenToUrl(
  baseUrl: string,
  token: string,
  paramName: string = 'token',
): string {
  return appendQueryParams(baseUrl, { [paramName]: token });
}
