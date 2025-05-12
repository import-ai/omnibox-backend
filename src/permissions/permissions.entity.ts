import { Base } from 'src/common/base.entity';
import { Group } from 'src/groups/entities/group.entity';
import { Namespace } from 'src/namespaces/entities/namespace.entity';
import { Resource } from 'src/resources/resources.entity';
import { User } from 'src/user/user.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Column,
  Index,
} from 'typeorm';
import { PermissionType } from './permission-type.enum';

@Entity('permissions')
@Index(['namespaceId', 'resourceId', 'userId'], {
  unique: true,
  where: 'user_id IS NOT NULL AND deleted_at IS NULL',
})
@Index(['namespaceId', 'resourceId', 'groupId'], {
  unique: true,
  where: 'group_id IS NOT NULL AND deleted_at IS NULL',
})
@Index(['namespaceId', 'resourceId'], {
  unique: true,
  where: 'user_id IS NULL AND group_id IS NULL AND deleted_at IS NULL',
})
export class Permission extends Base {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'namespace_id' })
  namespaceId: string;

  @Column({ name: 'resource_id' })
  resourceId: string;

  @Column({ name: 'group_id', nullable: true })
  groupId?: string;

  @Column({ name: 'user_id', nullable: true })
  userId?: string;

  @Column({ type: 'enum', enum: PermissionType })
  permissionType: PermissionType;

  @ManyToOne(() => Namespace)
  @JoinColumn({ name: 'namespace_id' })
  namespace: Namespace;

  @ManyToOne(() => Resource)
  @JoinColumn({ name: 'resource_id' })
  resource: Resource;

  @ManyToOne(() => Group)
  @JoinColumn({ name: 'group_id' })
  group: Group;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
