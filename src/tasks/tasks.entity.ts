import { Base } from 'omniboxd/common/base.entity';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

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
}
