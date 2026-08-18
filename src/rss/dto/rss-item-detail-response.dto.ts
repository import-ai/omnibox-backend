import { RssItem } from 'omniboxd/rss/entities/rss-item.entity';
import { RssItemContent } from 'omniboxd/rss/entities/rss-item-content.entity';

import { RssItemResponseDto } from './rss-item-response.dto';

export class RssItemDetailResponseDto extends RssItemResponseDto {
  parsed_content: string | null;

  static fromData(
    item: RssItem,
    content: RssItemContent,
    linkName: string | null,
  ): RssItemDetailResponseDto {
    const dto = Object.assign(
      new RssItemDetailResponseDto(),
      RssItemResponseDto.fromData(item, content, linkName),
    );
    dto.parsed_content = content.parsedContent;
    return dto;
  }
}
