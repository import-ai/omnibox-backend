import { Base } from 'omniboxd/common/base.entity';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import type { ExecutionStatus } from '../runtime-state';

@Entity('local_executions')
@Index(['userId', 'conversationId', 'toolCallId'], { unique: true })
@Index(['deviceId', 'status'])
export class LocalExecution extends Base {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid') userId: string;
  @Column('uuid') deviceId: string;
  @Column() namespaceId: string;
  @Column('uuid') conversationId: string;
  @Column() toolCallId: string;
  @Column('text') command: string;
  @Column('text') cwd: string;
  @Column() timeoutSeconds: number;
  @Column({ default: 'queued' }) status: ExecutionStatus;
  @Column({ default: 0 }) sequence: number;
  @Column({ default: 0 }) deliveryVersion: number;
  @Column({ type: 'timestamptz', nullable: true }) deliverAfter: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  approvalExpiresAt: Date | null;
  @Column({ type: 'jsonb', default: [] }) approvals: {
    decision: string;
    user_id: string;
    at: string;
  }[];
  @Column({ type: 'timestamptz', nullable: true }) approvedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) startedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) finishedAt: Date | null;
  @Column({ type: 'integer', nullable: true }) exitCode: number | null;
}

@Entity('local_execution_events')
@Index(['executionId', 'sequence'], { unique: true })
export class LocalExecutionEvent {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid') executionId: string;
  @Column() sequence: number;
  @Column() kind: string;
  @Column('text') data: string;
}
