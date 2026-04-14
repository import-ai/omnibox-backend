import { Base } from 'omniboxd/common/base.entity';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum NotificationStatus {
  UNREAD = 'unread',
  READ = 'read',
}

@Entity('notifications')
export class Notification extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column()
  title: string;

  @Column('text', { nullable: true })
  content: string | null;

  @Column('varchar', { length: 16, default: NotificationStatus.UNREAD })
  status: NotificationStatus;

  @Column('varchar', { length: 32 })
  actionType: string;

  @Column('jsonb', { default: {} })
  target: Record<string, any>;

  @Column('text', { array: true, default: '{}' })
  tags: string[];

  @Column('jsonb', { default: {} })
  attrs: Record<string, any>;

  @Column('timestamptz', { nullable: true })
  readAt: Date | null;
}
