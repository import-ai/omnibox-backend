import { User } from 'src/user/user.entity';
import { Base } from 'src/common/base.entity';
import { Namespace } from 'src/namespaces/namespaces.entity';
import {
  Column,
  Entity,
  OneToOne,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('resources')
export class Resource extends Base {
  @PrimaryGeneratedColumn()
  resource_id: string;

  @Column({ nullable: true })
  name: string;

  @Column({ type: 'enum', enum: ['doc', 'link', 'file', 'folder'] })
  resource_type: string;

  @Column({ type: 'enum', enum: ['private', 'teamspace'] })
  space_type: string;

  @Column({ length: 22, nullable: true })
  parent_id: string;

  @Column('jsonb', { nullable: true })
  tags: string[];

  @Column({ type: 'text', nullable: true })
  content: string;

  @Column({ default: 0 })
  child_count: number;

  @Column('jsonb', { nullable: true })
  attrs: Record<string, any>;

  @ManyToOne(() => User, (user) => user.user_id)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToOne(() => Namespace, (namespace) => namespace.namespace_id)
  namespace: Namespace;
}
