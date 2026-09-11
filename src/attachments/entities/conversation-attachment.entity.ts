import { Base } from 'omniboxd/common/base.entity';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('conversation_attachments')
export class ConversationAttachment extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  namespaceId: string;

  @Column('uuid')
  conversationId: string;

  @Column('uuid')
  userId: string;

  @Column()
  objectKey: string;

  @Column()
  name: string;

  @Column()
  contentType: string;

  @Column('bigint')
  size: string;

  @Column('timestamptz')
  expiresAt: Date;

  @Column('timestamptz', { nullable: true })
  consumedAt: Date | null;
}
