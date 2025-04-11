import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

@Entity('tasks')
export class Task {
  @PrimaryGeneratedColumn('uuid')
  taskId: string;

  @Column({ nullable: false })
  namespaceId: string;

  @Column({ nullable: false })
  userId: string;

  @Column({ nullable: false })
  function: string;

  @Column({ type: 'json', nullable: false })
  input: Record<string, any>;

  @Column({ type: 'json', nullable: true })
  payload: Record<string, any>;

  @Column({ type: 'json', nullable: true })
  output: Record<string, any>;

  @Column({ type: 'json', nullable: true })
  exception: Record<string, any>;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  endedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  canceledAt: Date;

  @Column({ default: 1 })
  concurrencyThreshold: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}
