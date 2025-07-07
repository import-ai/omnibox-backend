import { Base } from 'src/common/base.entity';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

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

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'namespace_id' })
  namespaceId: string;
}
