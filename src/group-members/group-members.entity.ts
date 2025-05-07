import { Base } from 'src/common/base.entity';
import { Group } from 'src/groups/groups.entity';
import { Namespace } from 'src/namespaces/namespaces.entity';
import { User } from 'src/user/user.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Column,
} from 'typeorm';

@Entity('group_members')
@Index(['namespace_id', 'group_id', 'user_id'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class GroupMember extends Base {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('uuid', { name: 'namespace_id' })
  namespaceId: string;

  @Column('uuid', { name: 'group_id' })
  groupId: string;

  @Column('uuid', { name: 'user_id' })
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
