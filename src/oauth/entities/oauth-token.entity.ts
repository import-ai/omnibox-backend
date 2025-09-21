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

@Entity('oauth_tokens')
export class OAuthToken extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  @Index()
  accessToken: string;

  @Column('text', { nullable: true })
  @Index()
  refreshToken: string;

  @Column('timestamp')
  accessTokenExpiresAt: Date;

  @Column('timestamp', { nullable: true })
  refreshTokenExpiresAt: Date;

  @Column('jsonb', { default: [] })
  scopes: string[];

  @Column('uuid')
  clientId: string;

  @Column('uuid')
  userId: string;

  @Column('varchar', { nullable: true })
  authorizationCodeUsed: string;

  @Column('boolean', { default: false })
  isRevoked: boolean;

  @ManyToOne(() => OAuthClient)
  @JoinColumn({ name: 'clientId', referencedColumnName: 'id' })
  client: OAuthClient;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;
}
