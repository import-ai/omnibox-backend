import { Base } from 'src/common/base.entity';
import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { PermissionLevel } from '../permission-level.enum';

@Entity('group_permissions')
@Index(['namespaceId', 'resourceId', 'groupId'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class GroupPermission extends Base {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: PermissionLevel })
  level: PermissionLevel;

  @Column({ name: 'namespace_id' })
  namespaceId: string;

  @Column({ name: 'resource_id' })
  resourceId: string;

  @Column({ name: 'group_id' })
  groupId: string;
}
