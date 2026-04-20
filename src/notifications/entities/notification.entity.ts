import { Base } from 'omniboxd/common/base.entity';
import { Check, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum NotificationStatus {
  UNREAD = 'unread',
  READ = 'read',
}

@Entity('notifications')
@Check('"user_id" IS NOT NULL OR "namespace_id" IS NOT NULL')
export class Notification extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { nullable: true })
  userId: string | null;

  @Column('varchar', { nullable: true })
  namespaceId: string | null;

  @Column()
  title: string;

  @Column('text', { nullable: true })
  content: string | null;

  @Column('enum', {
    enum: NotificationStatus,
    default: NotificationStatus.UNREAD,
  })
  status: NotificationStatus;

  @Column('varchar', { length: 32, name: 'notification_type' })
  notificationType: string;

  @Column('jsonb', { default: {} })
  target: Record<string, any>;

  @Column('text', { array: true, default: '{}' })
  tags: string[];

  @Column('jsonb', { default: {} })
  attrs: Record<string, any>;

  @Column('timestamptz', { nullable: true, name: 'read_at' })
  readedAt: Date | null;
}
