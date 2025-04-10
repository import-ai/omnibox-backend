import { Base } from 'src/common/base.entity';
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class User extends Base {
  @PrimaryGeneratedColumn({
    comment: '用户ID',
  })
  user_id: number;

  @Column({
    length: 32,
    unique: true,
    comment: '登录用户名',
  })
  username: string;

  @Column({
    length: 128,
    unique: true,
    nullable: true,
    comment: '绑定邮箱',
  })
  email: string;

  @Column({
    length: 128,
    comment: '加密后的密码',
  })
  password: string;

  // @OneToMany(() => APIKey, (apiKey) => apiKey.user)
  // apiKeys: APIKey[];

  // @OneToMany(() => UserRole, (role) => role.user)
  // roles: UserRole[];

  // @OneToMany(() => Resource, (resource) => resource.owner)
  // resources: Resource[];
}
