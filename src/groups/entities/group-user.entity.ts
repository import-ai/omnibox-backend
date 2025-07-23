import { Base } from 'omnibox-backend/common/base.entity';
import { Index, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('group_users')
export class GroupUser extends Base {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  namespaceId: string;

  @Column()
  groupId: string;

  @Column()
  userId: string;
}
