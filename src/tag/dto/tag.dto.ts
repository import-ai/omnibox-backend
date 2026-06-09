import { ApiProperty } from '@nestjs/swagger';

import { Tag } from '../tag.entity';

export class TagDto {
  @ApiProperty({ description: 'Tag ID' })
  id: string;

  @ApiProperty({ description: 'Tag name' })
  name: string;

  static fromEntity(tag: Tag): TagDto {
    const dto = new TagDto();
    dto.id = tag.id;
    dto.name = tag.name;
    return dto;
  }
}
