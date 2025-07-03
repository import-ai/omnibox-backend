import { Base } from 'src/common/base.entity';
import { User } from 'src/user/entities/user.entity';
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
@Index(['namespace', 'group', 'user'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class GroupUser extends Base {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Namespace, { nullable: false })
  @JoinColumn({ name: 'namespace_id' })
  namespace: Namespace;

  @ManyToOne(() => Group, { nullable: false })
  @JoinColumn({ name: 'group_id' })
  group: Group;

  @Column({ name: 'group_id', nullable: false })
  groupId: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
