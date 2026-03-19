import { Expose, Transform } from 'class-transformer';
import { Resource } from 'omniboxd/resources/entities/resource.entity';

import { ResourceSummaryDto } from './resource-summary.dto';

export class TrashItemDto extends ResourceSummaryDto {
  @Expose({ name: 'deleted_at' })
  @Transform(({ value }) => value?.toISOString())
  deletedAt: Date;

  static fromEntity(resource: Resource, hasChildren: boolean): TrashItemDto {
    const dto = new TrashItemDto();
    Object.assign(dto, ResourceSummaryDto.fromEntity(resource, hasChildren));
    dto.deletedAt = resource.deletedAt!;
    return dto;
  }
}
