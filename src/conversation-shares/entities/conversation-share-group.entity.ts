import { Base } from 'omniboxd/common/base.entity';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { ConversationShare } from './conversation-share.entity';

export interface ConversationShareQuestionImage {
  attachmentId: string;
  name: string;
}

export interface ConversationShareResourceImage {
  resourceId: string;
  attachmentId: string;
  name: string;
}

@Entity('conversation_share_groups')
export class ConversationShareGroup extends Base {
  @PrimaryGeneratedColumn()
  id: string;

  @Column()
  shareId: string;

  @Column()
  ordinal: number;

  @Column('text')
  questionContent: string;

  @Column('text')
  answerContent: string;

  @Column('jsonb', { default: () => "'[]'" })
  questionImages: ConversationShareQuestionImage[];

  @Column('jsonb', { default: () => "'[]'" })
  resourceImages: ConversationShareResourceImage[];

  @ManyToOne(() => ConversationShare, (share) => share.groups, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'share_id' })
  share: ConversationShare;
}
