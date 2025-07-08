import { Base } from 'src/common/base.entity';
import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('user_options')
export class UserOption extends Base {
  @PrimaryColumn({
    type: 'varchar',
    length: 20,
  })
  name: string;

  @Column({ type: 'text', nullable: false })
  value: string;

  @Column({ name: 'user_id', nullable: false })
  userId: string;
}
