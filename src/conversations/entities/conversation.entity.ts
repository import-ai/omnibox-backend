import { Base } from 'src/common/base.entity';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

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
}
