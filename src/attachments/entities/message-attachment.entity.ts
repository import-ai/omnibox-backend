import { Base } from 'omniboxd/common/base.entity';
import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('message_attachments')
@Unique(['messageId', 'attachmentId'])
export class MessageAttachment extends Base {
  @PrimaryGeneratedColumn()
  id: string;

  @Column('uuid')
  messageId: string;

  @Column('uuid')
  attachmentId: string;

  @Column()
  position: number;
}
