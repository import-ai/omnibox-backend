const CONTENT_SNIPPET_LENGTH = 100;

/**
 * The preview of a resource's body that a listing carries: images stripped, and
 * only the first hundred characters. Lists are about finding a resource, not
 * reading it — shipping whole bodies turned a page of feed articles into
 * hundreds of kilobytes.
 */
export function buildContentSnippet(content?: string | null): string {
  return (content || '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/<img[^>]*>/gi, '')
    .trim()
    .slice(0, CONTENT_SNIPPET_LENGTH);
}
