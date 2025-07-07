import { Base } from 'src/common/base.entity';
import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('users')
@Index('uniq_user_email', ['email'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Index('uniq_user_name', ['username'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
export class User extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    nullable: true,
    comment: '用户名',
  })
  username: string;

  @Column({
    comment: '绑定邮箱',
  })
  email: string;

  @Column({
    comment: '加密后的密码',
  })
  password: string;
}
