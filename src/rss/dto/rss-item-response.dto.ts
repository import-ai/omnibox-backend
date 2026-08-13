import { Resource } from 'omniboxd/resources/entities/resource.entity';

// The subset of the serialized feed item content we surface to clients.
interface ParsedContent {
  link?: unknown;
  contentSnippet?: unknown;
  pubDate?: unknown;
}

// The attrs an `rss_item` resource carries (written by the poller and the
// add-rss-item-resources migration).
interface RssItemAttrs {
  link_id?: unknown;
  guid?: unknown;
  // The FEED url; the item's own link is `article_url`.
  url?: unknown;
  article_url?: unknown;
  published_at?: unknown;
}

// The fetch/parse cache row (rss_item_contents) an item resource was built
// from, looked up by its (url, guid). Only the fields this DTO reads.
export interface RssItemContentRef {
  // The serialized feed item, as stored by the poller.
  content: string | null;
  // The wizard's markdown, still null while the article has not been parsed —
  // and forever for an item with nothing to parse. This is the only source of
  // `parsed_content`: the item resource's body is seeded with the feed snippet,
  // so reading it would report a snippet as parsed article text.
  parsedContent: string | null;
  // When we first saw this item, which is what `created_at` has always meant
  // here — the resource's own created_at is the publish date.
  createdAt: Date;
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
    item: Resource,
    content: RssItemContentRef | undefined,
    linkName: string | null,
  ): RssItemResponseDto {
    let parsed: ParsedContent = {};
    if (content?.content) {
      try {
        parsed = (JSON.parse(content.content) as ParsedContent) ?? {};
      } catch {
        parsed = {};
      }
    }
    const attrs = (item.attrs ?? {}) as RssItemAttrs;

    const dto = new RssItemResponseDto();
    dto.id = item.id;
    dto.link_id = asString(attrs.link_id) ?? '';
    dto.link_name = linkName;
    dto.title = item.name;
    // Prefer the article url carried in attrs; rows written before it existed
    // fall back to the link embedded in the stored feed item, which is where
    // this value always came from.
    dto.url = asString(attrs.article_url) ?? asString(parsed.link);
    dto.summary = asString(parsed.contentSnippet);
    // The publish date is denormalized into attrs; fall back to the date
    // embedded in the stored content when it is missing.
    dto.published_at = asString(attrs.published_at) ?? asString(parsed.pubDate);
    // Deliberately the content row's created_at, not the resource's: the
    // resource is created_at the publish date so the folder lists newest
    // first, whereas this field means "when we first saw the item". With no
    // cache row to read (only reachable if one is retired) the resource's
    // updated_at is the closest first-seen we still hold — its created_at is
    // the publish date, and reporting that here would silently erase the
    // distinction between the two fields.
    dto.created_at = (content?.createdAt ?? item.updatedAt).toISOString();
    return dto;
  }
}
