import { Base } from 'omniboxd/common/base.entity';
import { Column, Entity, Unique } from 'typeorm';

@Entity('conversation_attachment_resources')
@Unique(['conversationAttachmentId', 'resourceId'])
export class ConversationAttachmentResource extends Base {
  @Column({ primary: true, type: 'uuid' })
  conversationAttachmentId: string;

  @Column({ primary: true, type: 'character varying' })
  resourceId: string;

  @Column({ type: 'character varying' })
  attachmentId: string;
}
