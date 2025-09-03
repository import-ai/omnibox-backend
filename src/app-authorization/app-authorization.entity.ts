import { Base } from 'omniboxd/common/base.entity';
import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('app_authorizations')
@Unique(['userId', 'namespaceId', 'appId'])
export class AppAuthorization extends Base {
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

  @Column('jsonb')
  attrs: Record<string, any>;
}
