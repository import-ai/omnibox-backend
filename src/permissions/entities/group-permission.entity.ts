import { Base } from 'src/common/base.entity';
import { Group } from 'src/groups/entities/group.entity';
import { Namespace } from 'src/namespaces/entities/namespace.entity';
import { Resource } from 'src/resources/resources.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Column,
  Index,
} from 'typeorm';
import { PermissionLevel } from '../permission-level.enum';

@Entity('group_permissions')
@Index(['namespaceId', 'resourceId', 'groupId'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class GroupPermission extends Base {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'namespace_id' })
  namespaceId: string;

  @Column({ name: 'resource_id' })
  resourceId: string;

  @Column({ name: 'group_id' })
  groupId: string;

  @Column({ type: 'enum', enum: PermissionLevel })
  level: PermissionLevel;

  @ManyToOne(() => Namespace)
  @JoinColumn({ name: 'namespace_id' })
  namespace?: Namespace;

  @ManyToOne(() => Resource)
  @JoinColumn({ name: 'resource_id' })
  resource?: Resource;

  @ManyToOne(() => Group)
  @JoinColumn({ name: 'group_id' })
  group?: Group;
}
