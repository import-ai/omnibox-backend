import { Base } from 'src/common/base.entity';
import { User } from 'src/user/user.entity';
import {
  Column,
  Entity,
  OneToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('namespaces')
export class Namespace extends Base {
  @PrimaryGeneratedColumn()
  namespace_id: string;

  @Column({ length: 32, unique: true })
  name: string;

  @Column('jsonb', { nullable: true })
  collaborators: string[];

  @OneToOne(() => User)
  @JoinColumn({ name: 'owner_id' })
  user: User;
}
