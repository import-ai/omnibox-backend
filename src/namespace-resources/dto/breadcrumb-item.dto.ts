import { Expose } from 'class-transformer';
import { Resource } from 'omniboxd/resources/entities/resource.entity';

export class BreadcrumbItemDto {
  @Expose()
  id: string;

  @Expose()
  name: string;

  static fromEntity(resource: Resource): BreadcrumbItemDto {
    const dto = new BreadcrumbItemDto();
    dto.id = resource.id;
    dto.name = resource.name;
    return dto;
  }
}
