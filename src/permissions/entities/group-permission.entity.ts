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
@Index(['namespace', 'resource', 'group'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class GroupPermission extends Base {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: PermissionLevel })
  level: PermissionLevel;

  @ManyToOne(() => Namespace, { nullable: false })
  @JoinColumn({ name: 'namespace_id' })
  namespace?: Namespace;

  @ManyToOne(() => Resource, { nullable: false })
  @JoinColumn({ name: 'resource_id' })
  resource?: Resource;

  @ManyToOne(() => Group, { nullable: false })
  @JoinColumn({ name: 'group_id' })
  group?: Group;
}
