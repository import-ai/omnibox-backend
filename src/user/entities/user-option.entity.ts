import { Base } from 'omnibox-backend/common/base.entity';
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('user_options')
export class UserOption extends Base {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: string;

  @Column()
  name: string;

  @Column()
  value: string;
}
