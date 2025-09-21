import { Base } from 'omniboxd/common/base.entity';
import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

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

  @Column('timestamptz')
  accessTokenExpiresAt: Date;

  @Column('timestamptz', { nullable: true })
  refreshTokenExpiresAt: Date;

  @Column('jsonb', { default: [] })
  scopes: string[];

  @Column('uuid', { name: 'client_id' })
  clientId: string;

  @Column('uuid', { name: 'user_id' })
  userId: string;

  @Column('varchar', { nullable: true })
  authorizationCodeUsed: string;

  @Column('boolean', { default: false })
  isRevoked: boolean;
}
