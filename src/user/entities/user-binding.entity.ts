import { Base } from 'omniboxd/common/base.entity';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('user_bindings')
export class UserBinding extends Base {
  @PrimaryGeneratedColumn()
  id: string;

  @Column()
  userId: string;

  @Column()
  loginType: string;

  @Column()
  loginId: string;

  @Column('jsonb', { nullable: true })
  metadata: Record<string, any> | null;
}
