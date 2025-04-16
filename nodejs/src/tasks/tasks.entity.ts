import { User } from 'src/user/user.entity';
import { Base } from 'src/common/base.entity';
import { Namespace } from 'src/namespaces/namespaces.entity';
import {
  // Index,
  Column,
  Entity,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('tasks')
// @Index('idx_task_ns_pri_s_e_c_time', [
//   'namespace_id',
//   'priority',
//   'started_at',
//   'ended_at',
//   'canceled_at',
//   'concurrency_threshold',
// ])
export class Task extends Base {
  @PrimaryGeneratedColumn()
  task_id: string;

  @Column({ default: 0 })
  priority: number;

  @Column({ type: 'text' })
  function: string;

  @Column('jsonb')
  input: Record<string, any>;

  @Column('jsonb', { nullable: true })
  payload: Record<string, any>;

  @Column('jsonb', { nullable: true })
  output: Record<string, any>;

  @Column('jsonb', { nullable: true })
  exception: Record<string, any>;

  @Column({ nullable: true })
  started_at: Date;

  @Column({ nullable: true })
  ended_at: Date;

  @Column({ nullable: true })
  canceled_at: Date;

  @Column({ default: 1 })
  concurrency_threshold: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Namespace)
  @JoinColumn({ name: 'namespace_id' })
  namespace: Namespace;
}
