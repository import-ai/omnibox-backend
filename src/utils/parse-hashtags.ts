/**
 * Parses hashtags from text content
 * Supports Unicode characters including Chinese, Japanese, Korean, etc.
 * Punctuation marks are treated as tag delimiters.
 *
 * @param content - The text content to parse
 * @returns Array of unique tag names (without the # prefix)
 *
 * @example
 * parseHashtags("foo bar#tag1 #tag2 baz #tag3")
 * // Returns: ["tag1", "tag2", "tag3"]
 *
 * @example
 * parseHashtags("Hello #world #世界 #tag1,#tag2")
 * // Returns: ["world", "世界", "tag1", "tag2"]
 */
export function parseHashtags(content: string): string[] {
  if (!content) {
    return [];
  }

  // Match # followed by word characters, hyphens, underscores, and Unicode letters
  // Excludes whitespace, #, and common punctuation marks
  const hashtagRegex = /#([^\s#.,!?:;()[\]{}'"`]+)/g;
  const tags = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = hashtagRegex.exec(content)) !== null) {
    const tag = match[1];
    // Remove trailing punctuation that might have been captured
    const cleanTag = tag.replace(/[.,!?:;()[\]{}'"`-]+$/, '');
    if (cleanTag) {
      tags.add(cleanTag);
    }
  }

  return Array.from(tags);
}
