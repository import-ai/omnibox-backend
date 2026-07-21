import { Base } from 'omniboxd/common/base.entity';
import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum NotificationStatus {
  UNREAD = 'unread',
  READ = 'read',
}

@Entity('notifications')
@Check(
  '("is_global" = true AND "user_id" IS NULL AND "namespace_id" IS NULL) OR ("is_global" = false AND ("user_id" IS NOT NULL OR "namespace_id" IS NOT NULL))',
)
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

  @Column('boolean', { default: false })
  isGlobal: boolean;

  @Column('uuid', { nullable: true, unique: true })
  dedupKey: string | null;

  @Column('jsonb', { default: {} })
  target: Record<string, any>;

  @Column('text', { array: true, default: '{}' })
  tags: string[];

  @Column('jsonb', { default: {} })
  attrs: Record<string, any>;

  @Column('timestamptz', { nullable: true, name: 'read_at' })
  readedAt: Date | null;

  userRead?: NotificationRead;
}

@Entity('notification_reads')
@Index(['notificationId', 'userId'], { unique: true })
export class NotificationRead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  notificationId: string;

  @Column('uuid')
  userId: string;

  @Column('timestamptz')
  readAt: Date;
}
