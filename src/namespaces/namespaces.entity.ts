import { Base } from 'src/common/base.entity';
import { User } from 'src/user/user.entity';
import {
  Column,
  Entity,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('namespaces')
export class Namespace extends Base {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 32, unique: true })
  name: string;

  @Column('jsonb', { nullable: true })
  collaborators: string[];

  @ManyToOne(() => User, (user) => user.namespace)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
