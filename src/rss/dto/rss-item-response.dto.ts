import { RssItem } from 'omniboxd/rss/entities/rss-item.entity';
import { RssItemContent } from 'omniboxd/rss/entities/rss-item-content.entity';

// The subset of the serialized feed item content we surface to clients.
interface ParsedContent {
  link?: unknown;
  contentSnippet?: unknown;
  pubDate?: unknown;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export class RssItemResponseDto {
  id: string;
  link_id: string;
  link_name: string | null;
  title: string;
  // The article url, published date and snippet come from the stored content.
  url: string | null;
  summary: string | null;
  published_at: string | null;
  created_at: string;

  static fromData(
    item: RssItem,
    content: RssItemContent | undefined,
    linkName: string | null,
  ): RssItemResponseDto {
    let parsed: ParsedContent = {};
    if (content) {
      try {
        parsed = (JSON.parse(content.content) as ParsedContent) ?? {};
      } catch {
        parsed = {};
      }
    }

    const dto = new RssItemResponseDto();
    dto.id = item.id;
    dto.link_id = item.linkId;
    dto.link_name = linkName;
    dto.title = item.title;
    dto.url = asString(parsed.link);
    dto.summary = asString(parsed.contentSnippet);
    dto.published_at = asString(parsed.pubDate);
    dto.created_at = item.createdAt.toISOString();
    return dto;
  }
}
