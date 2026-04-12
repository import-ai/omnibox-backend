import { TagDto } from 'omniboxd/tag/dto/tag.dto';
import { Expose } from 'class-transformer';
import { Tag } from 'omniboxd/tag/tag.entity';

export class TagWithCountDto extends TagDto {
  @Expose({ name: 'resource_cnt' })
  resourceCnt: number;

  static fromEntityWithCount(tag: Tag, resourceCnt: number): TagWithCountDto {
    const dto = new TagWithCountDto();
    dto.id = tag.id;
    dto.name = tag.name;
    dto.resourceCnt = resourceCnt;
    return dto;
  }
}
