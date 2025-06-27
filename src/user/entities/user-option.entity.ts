import { Base } from 'src/common/base.entity';
import { User } from 'src/user/entities/user.entity';
import { Entity, Column, ManyToOne, JoinColumn, PrimaryColumn } from 'typeorm';

@Entity('user_option')
export class UserOption extends Base {
  @PrimaryColumn({
    type: 'varchar',
    length: 20,
  })
  name: string;

  @Column({ type: 'text' })
  value: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
