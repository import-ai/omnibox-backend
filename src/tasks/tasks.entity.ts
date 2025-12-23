import { Base } from 'omniboxd/common/base.entity';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  FINISHED = 'finished',
  ERROR = 'error',
  CANCELED = 'canceled',
  TIMEOUT = 'timeout',
}

@Entity('tasks')
export class Task extends Base {
  @PrimaryGeneratedColumn()
  id: string;

  @Column()
  namespaceId: string;

  @Column()
  userId: string;

  @Column({ default: 5 })
  priority: number;

  @Column()
  function: string;

  @Column('jsonb')
  input: Record<string, any>;

  @Column('jsonb', { nullable: true })
  payload: Record<string, any> | null;

  @Column('jsonb', { nullable: true })
  output: Record<string, any> | null;

  @Column('jsonb', { nullable: true })
  exception: Record<string, any> | null;

  @Column('timestamptz', { nullable: true })
  startedAt: Date | null;

  @Column('timestamptz', { nullable: true })
  endedAt: Date | null;

  @Column('timestamptz', { nullable: true })
  canceledAt: Date | null;

  @Column({ default: false })
  enqueued: boolean;

  @Column('varchar', { nullable: true })
  resourceId: string | null;

  @Column('enum', { enum: TaskStatus, default: TaskStatus.PENDING })
  status: TaskStatus;
}
