import { Base } from 'omniboxd/common/base.entity';
import { User } from 'omniboxd/user/entities/user.entity';
import { OAuthClient } from './oauth-client.entity';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';

@Entity('oauth_authorization_codes')
export class OAuthAuthorizationCode extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { unique: true })
  @Index()
  code: string;

  @Column('timestamp')
  expiresAt: Date;

  @Column('varchar')
  redirectUri: string;

  @Column('jsonb', { default: [] })
  scopes: string[];

  @Column('uuid')
  clientId: string;

  @Column('uuid')
  userId: string;

  @Column('varchar', { nullable: true })
  codeChallenge: string;

  @Column('varchar', { nullable: true })
  codeChallengeMethod: string;

  @Column('boolean', { default: false })
  isUsed: boolean;

  @ManyToOne(() => OAuthClient)
  @JoinColumn({ name: 'clientId', referencedColumnName: 'id' })
  client: OAuthClient;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;
}
