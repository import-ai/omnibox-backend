import { Base } from 'omniboxd/common/base.entity';
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('users')
export class User extends Base {
  @PrimaryGeneratedColumn()
  id: string;

  @Column()
  username: string;

  @Column('varchar', { nullable: true })
  email: string | null;

  @Column()
  password: string;
}
