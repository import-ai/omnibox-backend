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
  id: number;

  @Column({ length: 32, nullable: true })
  comment: string;

  @ManyToOne(() => User, (user) => user.apiKey)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => UserRole, (userRole) => userRole.apiKey)
  @JoinColumn({ name: 'role' })
  role: UserRole;
}
