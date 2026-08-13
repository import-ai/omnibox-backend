import { Resource } from 'omniboxd/resources/entities/resource.entity';

import { RssItemContentRef, RssItemResponseDto } from './rss-item-response.dto';

export class RssItemDetailResponseDto extends RssItemResponseDto {
  parsed_content: string | null;

  static fromData(
    item: Resource,
    content: RssItemContentRef | undefined,
    linkName: string | null,
  ): RssItemDetailResponseDto {
    const dto = Object.assign(
      new RssItemDetailResponseDto(),
      RssItemResponseDto.fromData(item, content, linkName),
    );
    // The item resource's body: the wizard's markdown once it has landed, and
    // the feed's own summary until then.
    dto.parsed_content = item.content ?? null;
    return dto;
  }
}
