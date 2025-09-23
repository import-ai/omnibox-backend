import { Expose } from 'class-transformer';
import { ResourceMetaDto } from 'omniboxd/resources/dto/resource-meta.dto';

export class ChildrenMetaDto extends ResourceMetaDto {
  @Expose({ name: 'has_children' })
  hasChildren: boolean;

  constructor(resourceMeta: ResourceMetaDto, hasChildren: boolean) {
    super();
    Object.assign(this, resourceMeta);
    this.hasChildren = hasChildren;
  }
}
