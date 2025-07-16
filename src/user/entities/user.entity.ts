import { Base } from 'src/common/base.entity';
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('users')
export class User extends Base {
  @PrimaryGeneratedColumn()
  id: string;

  @Column('varchar', { nullable: true })
  username: string | null;

  @Column()
  email: string;

  @Column()
  password: string;
}
