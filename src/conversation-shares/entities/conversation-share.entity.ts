import { Base } from 'omniboxd/common/base.entity';
import generateId from 'omniboxd/utils/generate-id';
import {
  BeforeInsert,
  Column,
  Entity,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';

import { ConversationShareEvent } from './conversation-share-event.entity';
import { ConversationShareGroup } from './conversation-share-group.entity';

export enum ConversationShareStatus {
  ACTIVE = 'active',
  INVALID = 'invalid',
}

@Entity('conversation_shares')
export class ConversationShare extends Base {
  @PrimaryColumn()
  id: string;

  @BeforeInsert()
  generateId?() {
    this.id = generateId(12);
  }

  @Column()
  namespaceId: string;

  @Column('uuid')
  sourceConversationId: string;

  @Column('uuid')
  userId: string;

  @Column()
  title: string;

  @Column('text')
  summary: string;

  @Column('enum', {
    enum: ConversationShareStatus,
    default: ConversationShareStatus.ACTIVE,
  })
  status: ConversationShareStatus;

  @Column('timestamptz', { nullable: true })
  invalidatedAt: Date | null;

  @OneToMany(() => ConversationShareGroup, (group) => group.share, {
    cascade: true,
  })
  groups: ConversationShareGroup[];

  @OneToMany(() => ConversationShareEvent, (event) => event.share, {
    cascade: true,
  })
  events: ConversationShareEvent[];
}
