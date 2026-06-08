import { Base } from 'omniboxd/common/base.entity';
import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('oauth_pairwise_subjects')
@Unique(['userId', 'clientId'])
export class OAuthPairwiseSubject extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Index()
  @Column({ name: 'client_id' })
  clientId: string;

  @Column({ name: 'pairwise_subject', unique: true })
  pairwiseSubject: string;
}
