import { Base } from 'omniboxd/common/base.entity';
import { ConversationPreferences } from 'omniboxd/conversations/dto/conversation-preferences.dto';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('conversations')
export class Conversation extends Base {
  @PrimaryGeneratedColumn()
  id: string;

  @Column()
  namespaceId: string;

  @Column('varchar', { nullable: true })
  userId: string | null;

  @Column()
  title: string;

  @Column('varchar', { nullable: true })
  shareId: string | null;

  @Column('jsonb', { nullable: true })
  preferences: ConversationPreferences | null;
}
