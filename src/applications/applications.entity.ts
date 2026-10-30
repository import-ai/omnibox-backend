import { Base } from 'omniboxd/common/base.entity';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('applications')
@Index(['userId', 'namespaceId', 'appId'], {
  unique: true,
  where: '"deletedAt" IS NULL',
})
export class Applications extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  namespaceId: string;

  @Column()
  userId: string;

  @Column()
  appId: string;

  @Column({ type: 'uuid', nullable: true })
  apiKeyId: string | null;

  /** Set by the bot's verified callback; the login trusts only bound rows. */
  @Column({ type: 'timestamptz', nullable: true })
  boundAt: Date | null;

  @Column('jsonb')
  attrs: Record<string, any>;
}
