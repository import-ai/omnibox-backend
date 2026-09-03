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

export enum ResourceCommentAnchorStatus {
  ACTIVE = 'active',
  ORPHANED = 'orphaned',
}

@Entity('resource_comment_threads')
@Index(
  'uq_resource_comment_threads_active_anchor',
  ['resourceId', 'contentHash', 'anchorFrom', 'anchorTo'],
  {
    unique: true,
    where: 'deleted_at IS NULL AND resolved_at IS NULL',
  },
)
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

  @Column('text')
  quotedText: string;

  @Column('integer')
  anchorFrom: number;

  @Column('integer')
  anchorTo: number;

  @Column('text', { default: '' })
  anchorPrefix: string;

  @Column('text', { default: '' })
  anchorSuffix: string;

  @Column('varchar', { length: 64 })
  contentHash: string;

  @Column('varchar', { default: ResourceCommentAnchorStatus.ACTIVE })
  anchorStatus: ResourceCommentAnchorStatus;

  @Column('timestamptz', { nullable: true })
  resolvedAt: Date | null;

  @Column('uuid', { nullable: true })
  resolvedById: string | null;

  @OneToMany(() => ResourceComment, (comment) => comment.thread)
  comments?: ResourceComment[];
}
