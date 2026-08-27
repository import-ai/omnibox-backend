import { Base } from 'omniboxd/common/base.entity';
import {
  ResourceSortBy,
  ResourceSortOrder,
  ResourceSortSpaceType,
} from 'omniboxd/resources/resource-sort';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('resource_sort_preferences')
export class ResourceSortPreference extends Base {
  @PrimaryGeneratedColumn()
  id: string;

  @Column('uuid')
  userId: string;

  @Column()
  namespaceId: string;

  @Column()
  spaceType: ResourceSortSpaceType;

  @Column()
  sortBy: ResourceSortBy;

  @Column()
  sortOrder: ResourceSortOrder;
}
