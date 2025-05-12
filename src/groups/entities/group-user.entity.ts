import { Base } from 'src/common/base.entity';
import { User } from 'src/user/user.entity';
import { Group } from './group.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Column,
} from 'typeorm';
import { Namespace } from 'src/namespaces/entities/namespace.entity';

@Entity('group_users')
@Index(['namespaceId', 'groupId', 'userId'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class GroupUser extends Base {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'namespace_id' })
  namespaceId: string;

  @Column({ name: 'group_id' })
  groupId: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => Namespace)
  @JoinColumn({ name: 'namespace_id' })
  namespace: Namespace;

  @ManyToOne(() => Group)
  @JoinColumn({ name: 'group_id' })
  group: Group;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
