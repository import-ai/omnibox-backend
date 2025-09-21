import { Base } from 'omniboxd/common/base.entity';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';

@Entity('oauth_authorization_codes')
export class OAuthAuthorizationCode extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { unique: true })
  @Index()
  code: string;

  @Column('timestamptz')
  expiresAt: Date;

  @Column('varchar')
  redirectUri: string;

  @Column('jsonb', { default: [] })
  scopes: string[];

  @Column('uuid', { name: 'client_id' })
  clientId: string;

  @Column('uuid', { name: 'user_id' })
  userId: string;

  @Column('varchar', { nullable: true })
  codeChallenge: string;

  @Column('varchar', { nullable: true })
  codeChallengeMethod: string;

  @Column('boolean', { default: false })
  isUsed: boolean;

}
