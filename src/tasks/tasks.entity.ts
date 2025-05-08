import { User } from 'src/user/user.entity';
import { Base } from 'src/common/base.entity';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Namespace } from 'src/namespaces/entities/namespace.entity';

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
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: 5 })
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

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt: Date;

  @Column({ name: 'canceled_at', type: 'timestamptz', nullable: true })
  canceledAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Namespace)
  @JoinColumn({ name: 'namespace_id' })
  namespace: Namespace;
}
