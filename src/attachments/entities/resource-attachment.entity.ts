import { Base } from 'omniboxd/common/base.entity';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('resource_attachments')
export class ResourceAttachment extends Base {
  @PrimaryGeneratedColumn()
  id: string;

  @Column()
  namespaceId: string;

  @Column()
  resourceId: string;

  @Column()
  attachmentId: string;

  @Column('bigint', { nullable: true })
  attachmentSize: string | null;
}
