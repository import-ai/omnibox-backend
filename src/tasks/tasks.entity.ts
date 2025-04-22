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
  id: number;

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

  @Column({ name: 'started_at', nullable: true })
  startedAt: Date;

  @Column({ name: 'ended_at', nullable: true })
  endedAt: Date;

  @Column({ name: 'canceled_at', nullable: true })
  canceledAt: Date;

  @Column({ name: 'concurrency_threshold', default: 1 })
  concurrencyThreshold: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Namespace)
  @JoinColumn({ name: 'namespace_id' })
  namespace: Namespace;
}
