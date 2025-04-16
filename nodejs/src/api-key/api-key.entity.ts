import { Base } from 'src/common/base.entity';
import { User } from 'src/user/user.entity';
import { UserRole } from 'src/user-role/user-role.entity';
import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('api_keys')
export class APIKey extends Base {
  @PrimaryGeneratedColumn()
  api_key: string;

  @Column({ length: 32, nullable: true })
  comment: string;

  @OneToMany(() => UserRole, (userRole) => userRole.user_role_id)
  role: UserRole[];

  @ManyToOne(() => User, (user) => user.user_id)
  user: User[];
}
