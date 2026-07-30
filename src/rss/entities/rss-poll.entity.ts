import { Base } from 'omniboxd/common/base.entity';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum RssPollStatus {
  POLLING = 'polling',
  SUCCEED = 'succeed',
  FAILED = 'failed',
}

@Entity('rss_polls')
@Index(['url', 'createdAt'])
export class RssPoll extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  url: string;

  @Column({ type: 'enum', enum: RssPollStatus, default: RssPollStatus.POLLING })
  status: RssPollStatus;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  contentIds: string[];

  @Column({ type: 'text', nullable: true })
  error: string | null;
}
