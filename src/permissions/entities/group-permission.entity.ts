import { Base } from 'omniboxd/common/base.entity';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { ResourcePermission } from '../resource-permission.enum';

@Entity('group_permissions')
export class GroupPermission extends Base {
  @PrimaryGeneratedColumn()
  id: string;

  @Column()
  namespaceId: string;

  @Column()
  groupId: string;

  @Column()
  resourceId: string;

  @Column('enum', { enum: ResourcePermission })
  permission: ResourcePermission;
}
