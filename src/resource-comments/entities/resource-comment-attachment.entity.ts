import { Base } from 'omniboxd/common/base.entity';
import { User } from 'omniboxd/user/entities/user.entity';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { ResourceComment } from './resource-comment.entity';

@Entity('resource_comment_attachments')
@Index('idx_resource_comment_attachments_comment', ['commentId'])
@Index('idx_resource_comment_attachments_resource', [
  'namespaceId',
  'resourceId',
])
export class ResourceCommentAttachment extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  namespaceId: string;

  @Column('varchar')
  resourceId: string;

  @Column('uuid', { nullable: true })
  uploaderId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'uploader_id' })
  uploader?: User | null;

  @Column('uuid', { nullable: true })
  commentId: string | null;

  @ManyToOne(() => ResourceComment, (comment) => comment.attachments, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'comment_id' })
  comment?: ResourceComment | null;

  @Column('varchar')
  objectKey: string;

  @Column('varchar')
  name: string;

  @Column('varchar')
  mimetype: string;

  @Column('integer')
  size: number;
}
