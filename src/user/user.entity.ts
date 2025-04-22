import { Base } from 'src/common/base.entity';
import { APIKey } from 'src/api-key/api-key.entity';
import { UserRole } from 'src/user-role/user-role.entity';
import { Namespace } from 'src/namespaces/namespaces.entity';
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
  id: number;

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

  @OneToMany(() => Namespace, (namespace) => namespace.user)
  namespace: Namespace;

  @OneToMany(() => APIKey, (apiKeys) => apiKeys.id)
  apiKey: APIKey[];

  @ManyToOne(() => UserRole, (userRole) => userRole.id)
  @JoinColumn({ name: 'role' })
  role: UserRole;
}
