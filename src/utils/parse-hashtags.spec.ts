import { parseHashtags } from './parse-hashtags';

describe('parseHashtags', () => {
  test.each([
    // Basic hashtags
    ['#tag1', ['tag1']],
    ['foo bar#tag1 #tag2 baz #tag3', ['tag1', 'tag2', 'tag3']],
    ['#tag1 #tag2 #tag3', ['tag1', 'tag2', 'tag3']],

    // Chinese hashtags
    ['#标签', ['标签']],
    ['Hello #世界', ['世界']],
    ['#中文标签 #tag1', ['中文标签', 'tag1']],

    // Japanese hashtags
    ['#日本語', ['日本語']],
    ['テスト #タグ #tag', ['タグ', 'tag']],

    // Korean hashtags
    ['#한국어', ['한국어']],
    ['테스트 #태그', ['태그']],

    // Mixed Unicode
    ['#tag1 #标签 #日本語 #한국어', ['tag1', '标签', '日本語', '한국어']],
    ['Hello #world #世界 #tag1', ['world', '世界', 'tag1']],

    // Duplicates (should deduplicate)
    ['#tag1 #tag2 #tag1', ['tag1', 'tag2']],
    ['#标签 some text #标签', ['标签']],

    // Hashtags with numbers and underscores
    ['#tag123', ['tag123']],
    ['#tag_name', ['tag_name']],
    ['#tag-name', ['tag-name']],
    ['#123', ['123']],

    // Edge cases with whitespace
    ['  #tag1  #tag2  ', ['tag1', 'tag2']],
    ['#tag1\n#tag2', ['tag1', 'tag2']],
    ['#tag1\t#tag2', ['tag1', 'tag2']],

    // No hashtags
    ['no hashtags here', []],
    ['', []],
    ['just some text', []],

    // Adjacent hashtags (should separate)
    ['#tag1#tag2', ['tag1', 'tag2']],
    ['#tag1#tag2#tag3', ['tag1', 'tag2', 'tag3']],

    // Hashtags at different positions
    ['#start middle #middle end #end', ['start', 'middle', 'end']],
    ['#only', ['only']],
    ['start #middle', ['middle']],
    ['#end at the end', ['end']],

    // Punctuation splits tags (treated as delimiters)
    ['#tag1,#tag2', ['tag1', 'tag2']],
    ['#tag1.#tag2', ['tag1', 'tag2']],
    ['#tag1!#tag2', ['tag1', 'tag2']],
    ['#tag1?#tag2', ['tag1', 'tag2']],
    ['#tag1:#tag2', ['tag1', 'tag2']],
    ['#tag1;#tag2', ['tag1', 'tag2']],
    // Punctuation at end (stripped from tag)
    ['#tag1, some text', ['tag1']],
    ['#tag1. Some text', ['tag1']],
    ['#tag1! excited', ['tag1']],
    ['#tag1? question', ['tag1']],

    // Emojis (if they don't contain whitespace, they'll be included)
    ['#tag😀', ['tag😀']],
    ['#😀', ['😀']],
  ])('should parse "%s" to %j', (input, expected) => {
    expect(parseHashtags(input)).toEqual(expected);
  });

  test('should return empty array for null or undefined', () => {
    expect(parseHashtags(null as any)).toEqual([]);
    expect(parseHashtags(undefined as any)).toEqual([]);
  });

  test('should handle very long content with many hashtags', () => {
    const content = Array.from({ length: 100 }, (_, i) => `#tag${i}`).join(' ');
    const result = parseHashtags(content);
    expect(result).toHaveLength(100);
    expect(result).toContain('tag0');
    expect(result).toContain('tag99');
  });

  test('should deduplicate case-sensitive tags', () => {
    // Tags are case-sensitive, so these should be different
    const result = parseHashtags('#Tag1 #tag1 #TAG1');
    expect(result).toEqual(['Tag1', 'tag1', 'TAG1']);
  });
});
