import { Base } from 'omniboxd/common/base.entity';
import {
  ResourceSortBy as ToolbarSortBy,
  ResourceSortOrder as ToolbarSortOrder,
} from 'omniboxd/resources/resource-sort.types';
import { Check, Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

export { ToolbarSortBy, ToolbarSortOrder };

@Entity('toolbar_preferences')
@Unique(['namespaceId', 'userId'])
@Check('"namespace_id" IS NOT NULL AND "user_id" IS NOT NULL')
export class ToolbarPreference extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  namespaceId: string;

  @Column('uuid')
  userId: string;

  @Column('enum', {
    enum: ToolbarSortBy,
    default: ToolbarSortBy.UPDATED_AT,
  })
  sortBy: ToolbarSortBy;

  @Column('enum', {
    enum: ToolbarSortOrder,
    default: ToolbarSortOrder.DESC,
  })
  sortOrder: ToolbarSortOrder;
}
