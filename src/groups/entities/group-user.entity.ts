import { Base } from 'src/common/base.entity';
import { Index, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('group_users')
@Index(['namespace', 'group', 'user'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class GroupUser extends Base {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'namespace_id' })
  namespaceId: string;

  @Column({ name: 'group_id', nullable: false })
  groupId: string;

  @Column({ name: 'user_id' })
  userId: string;
}
