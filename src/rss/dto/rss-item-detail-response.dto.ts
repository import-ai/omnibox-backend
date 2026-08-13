import { Resource } from 'omniboxd/resources/entities/resource.entity';

import { RssItemContentRef, RssItemResponseDto } from './rss-item-response.dto';

export class RssItemDetailResponseDto extends RssItemResponseDto {
  parsed_content: string | null;

  static fromData(
    item: Resource,
    content: RssItemContentRef,
    linkName: string | null,
  ): RssItemDetailResponseDto {
    const dto = Object.assign(
      new RssItemDetailResponseDto(),
      RssItemResponseDto.fromData(item, content, linkName),
    );
    // Only the wizard's markdown counts as parsed content, and it stays null
    // until the parse lands — forever for an item there is nothing to parse
    // (no link and no embedded content). Clients branch on that null to fall
    // back to the summary, so the item resource's body is not usable here: it
    // is seeded with the feed's own snippet, which would read as parsed
    // article markdown.
    dto.parsed_content = content.parsedContent;
    return dto;
  }
}
