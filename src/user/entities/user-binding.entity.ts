import { Base } from 'src/common/base.entity';
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('user_bindings')
export class UserBinding extends Base {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'uuid',
    nullable: false,
    name: 'user_id',
  })
  userId: string;

  @Column({
    nullable: false,
    name: 'login_type',
  })
  loginType: string;

  @Column({
    nullable: false,
    name: 'login_id',
  })
  loginId: string;
}
