import { Base } from 'src/common/base.entity';
import { Group } from 'src/groups/entities/group.entity';
import { Namespace } from 'src/namespaces/namespaces.entity';
import { Resource } from 'src/resources/resources.entity';
import { User } from 'src/user/user.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Column,
} from 'typeorm';

@Entity('permissions')
export class Permission extends Base {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('uuid', { name: 'namespace_id' })
  namespaceId: string;

  @Column('uuid', { name: 'resource_id' })
  resourceId: string;

  @Column('uuid', { name: 'group_id' })
  groupId: string;

  @Column('uuid', { name: 'user_id' })
  userId: string;

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
