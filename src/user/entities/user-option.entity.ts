import { Base } from 'src/common/base.entity';
import { User } from 'src/user/entities/user.entity';
import {
  Index,
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('user_option')
@Index(['user', 'name'], { unique: true, where: 'deleted_at IS NULL' })
export class UserOption extends Base {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'varchar',
    length: 20,
  })
  name: string;

  @Column({ type: 'text' })
  value: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
