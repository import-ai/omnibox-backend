export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  maxRetries = 2,
): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fetch(url, options);
    } catch {
      // ignore the error
    }
  }
  return await fetch(url, options);
}
