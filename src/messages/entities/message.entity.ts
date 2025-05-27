import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Conversation } from 'src/conversations/entities/conversation.entity';
import { User } from 'src/user/entities/user.entity';
import { Base } from 'src/common/base.entity';

@Entity('messages')
export class Message extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Conversation, (conversation) => conversation.messages)
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column('uuid', { name: 'parent_id', nullable: true })
  parentId?: string;

  @Column('jsonb', { nullable: false })
  message: Record<string, any>;

  @Column('jsonb', { nullable: true })
  attrs?: Record<string, any>;
}
