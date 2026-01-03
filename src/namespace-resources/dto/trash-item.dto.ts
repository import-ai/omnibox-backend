import { Expose, Transform } from 'class-transformer';
import { Resource } from 'omniboxd/resources/entities/resource.entity';

import { SidebarChildDto } from './sidebar-child.dto';

export class TrashItemDto extends SidebarChildDto {
  @Expose({ name: 'deleted_at' })
  @Transform(({ value }) => value?.toISOString())
  deletedAt: Date;

  static fromEntity(resource: Resource, hasChildren: boolean): TrashItemDto {
    const dto = new TrashItemDto();
    Object.assign(dto, SidebarChildDto.fromEntity(resource, hasChildren));
    dto.deletedAt = resource.deletedAt!;
    return dto;
  }
}
