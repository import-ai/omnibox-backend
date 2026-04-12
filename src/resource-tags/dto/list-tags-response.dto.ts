import { TagWithCountDto } from './tag-with-count.dto';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

export class ListTagsResponseDto {
  @ValidateNested()
  @Type(() => TagWithCountDto)
  tags: TagWithCountDto[];
  total: number;

  static fromTags(tags: TagWithCountDto[], total: number): ListTagsResponseDto {
    const dto = new ListTagsResponseDto();
    dto.tags = tags;
    dto.total = total;
    return dto;
  }
}
