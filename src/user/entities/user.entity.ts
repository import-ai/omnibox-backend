import { Base } from 'omnibox-backend/common/base.entity';
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('users')
export class User extends Base {
  @PrimaryGeneratedColumn()
  id: string;

  @Column('varchar', { nullable: true })
  username: string | null;

  @Column('varchar', { nullable: true })
  email: string | null;

  @Column()
  password: string;
}
