import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Namespace } from 'src/namespaces/entities/namespace.entity';
import { User } from 'src/user/entities/user.entity';
import { Message } from 'src/messages/entities/message.entity';
import { Base } from 'src/common/base.entity';

@Entity('conversations')
export class Conversation extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  title?: string;

  @Column({ name: 'namespace_id' })
  namespaceId: string;

  @Column({ name: 'user_id' })
  userId: string;

  @OneToMany(() => Message, (message) => message.conversation)
  messages: Message[];
}
