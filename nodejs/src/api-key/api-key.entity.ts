import { Base } from 'src/common/base.entity';
import { User } from 'src/user/user.entity';
import { UserRole } from 'src/user-role/user-role.entity';
import {
  Column,
  Entity,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('api_keys')
export class APIKey extends Base {
  @PrimaryGeneratedColumn()
  api_key: string;

  @Column({ length: 32, nullable: true })
  comment: string;

  @ManyToOne(() => User, (user) => user.apiKeys)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => UserRole)
  @JoinColumn({ name: 'role' })
  role: UserRole;
}
