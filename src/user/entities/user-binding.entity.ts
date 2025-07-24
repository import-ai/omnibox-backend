import { Base } from 'omnibox-backend/common/base.entity';
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('user_bindings')
export class UserBinding extends Base {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: string;

  @Column()
  loginType: string;

  @Column()
  loginId: string;
}
