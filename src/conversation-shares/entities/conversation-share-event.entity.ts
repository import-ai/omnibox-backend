import { Base } from 'omniboxd/common/base.entity';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { ConversationShare } from './conversation-share.entity';

export enum ConversationShareChannel {
  COPY_LINK = 'copy_link',
  WECHAT_SESSION = 'wechat_session',
  WECHAT_TIMELINE = 'wechat_timeline',
}

@Entity('conversation_share_events')
export class ConversationShareEvent extends Base {
  @PrimaryGeneratedColumn()
  id: string;

  @Column()
  shareId: string;

  @Column('enum', { enum: ConversationShareChannel })
  channel: ConversationShareChannel;

  @Column()
  result: string;

  @Column('varchar', { nullable: true })
  failureCode: string | null;

  @ManyToOne(() => ConversationShare, (share) => share.events, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'share_id' })
  share: ConversationShare;
}
