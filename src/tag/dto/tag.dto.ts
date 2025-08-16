import { Tag } from '../tag.entity';

export class TagDto {
  id: string;
  name: string;

  static fromEntity(tag: Tag): TagDto {
    const dto = new TagDto();
    dto.id = tag.id;
    dto.name = tag.name;
    return dto;
  }
}
