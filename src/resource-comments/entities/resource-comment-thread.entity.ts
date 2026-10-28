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

import { ResourceComment } from './resource-comment.entity';

export enum ResourceCommentThreadType {
  INLINE = 'inline',
  DOCUMENT = 'document',
}

export enum ResourceCommentAnchorStatus {
  ACTIVE = 'active',
  ORPHANED = 'orphaned',
}

@Entity('resource_comment_threads')
@Index('idx_resource_comment_threads_resource', ['namespaceId', 'resourceId'])
export class ResourceCommentThread extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  namespaceId: string;

  @Column('varchar')
  resourceId: string;

  @Column('uuid', { nullable: true })
  creatorId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'creator_id' })
  creator?: User | null;

  @Column('varchar', { default: ResourceCommentThreadType.INLINE })
  type: ResourceCommentThreadType;

  @Column('text')
  quotedText: string;

  @Column('integer', { nullable: true })
  anchorFrom: number | null;

  @Column('integer', { nullable: true })
  anchorTo: number | null;

  @Column('text', { nullable: true, default: '' })
  anchorPrefix: string | null;

  @Column('text', { nullable: true, default: '' })
  anchorSuffix: string | null;

  @Column('varchar', { length: 64, nullable: true })
  contentHash: string | null;

  @Column('varchar', {
    nullable: true,
    default: ResourceCommentAnchorStatus.ACTIVE,
  })
  anchorStatus: ResourceCommentAnchorStatus | null;

  @Column('timestamptz', { nullable: true })
  resolvedAt: Date | null;

  @Column('uuid', { nullable: true })
  resolvedById: string | null;

  @OneToMany(() => ResourceComment, (comment) => comment.thread)
  comments?: ResourceComment[];
}
