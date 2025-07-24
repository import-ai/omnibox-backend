import { Base } from 'omnibox-backend/common/base.entity';
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { ResourcePermission } from '../resource-permission.enum';

@Entity('group_permissions')
export class GroupPermission extends Base {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  namespaceId: string;

  @Column()
  groupId: string;

  @Column()
  resourceId: string;

  @Column('enum', { enum: ResourcePermission })
  permission: ResourcePermission;
}
