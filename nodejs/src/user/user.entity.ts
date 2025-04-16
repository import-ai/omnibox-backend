import { Base } from 'src/common/base.entity';
import { APIKey } from 'src/api-key/api-key.entity';
import { UserRole } from 'src/user-role/user-role.entity';
import {
  Entity,
  Column,
  OneToMany,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('users')
export class User extends Base {
  @PrimaryGeneratedColumn()
  user_id: number;

  @Column({
    length: 32,
    unique: true,
    comment: '用户名',
  })
  username: string;

  @Column({
    length: 128,
    unique: true,
    comment: '绑定邮箱',
  })
  email: string;

  @Column({
    length: 128,
    comment: '加密后的密码',
  })
  password: string;

  @OneToMany(() => APIKey, (apiKeys) => apiKeys.api_key)
  api_key: APIKey[];

  @ManyToOne(() => UserRole, (userRole) => userRole.user_role_id)
  @JoinColumn({ name: 'role' })
  role: UserRole;
}
