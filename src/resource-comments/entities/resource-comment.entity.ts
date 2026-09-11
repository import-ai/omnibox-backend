import { Base } from 'omniboxd/common/base.entity';
import { User } from 'omniboxd/user/entities/user.entity';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { ResourceCommentAttachment } from './resource-comment-attachment.entity';
import { ResourceCommentThread } from './resource-comment-thread.entity';

@Entity('resource_comments')
@Index('idx_resource_comments_thread', ['threadId', 'createdAt'])
export class ResourceComment extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  threadId: string;

  @ManyToOne(() => ResourceCommentThread, (thread) => thread.comments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'thread_id' })
  thread?: ResourceCommentThread;

  @Column('uuid', { nullable: true })
  authorId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'author_id' })
  author?: User | null;

  @Column('text')
  content: string;

  @OneToMany(
    () => ResourceCommentAttachment,
    (attachment) => attachment.comment,
  )
  attachments?: ResourceCommentAttachment[];
}
