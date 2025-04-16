import { Base } from 'src/common/base.entity';
import { User } from 'src/user/user.entity';
import { APIKey } from 'src/api-key/api-key.entity';
import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

@Entity('user_roles')
export class UserRole extends Base {
  @PrimaryGeneratedColumn()
  user_role_id: string;

  @Column({ length: 22 })
  target_id: string;

  @Column({ type: 'enum', enum: ['owner', 'admin', 'editor', 'viewer'] })
  role: string;

  @OneToMany(() => User, (user) => user.role)
  user: User[];

  @OneToMany(() => APIKey, (apiKeys) => apiKeys.role)
  api_keys: APIKey[];
}
