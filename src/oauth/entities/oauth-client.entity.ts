import { Base } from 'omniboxd/common/base.entity';
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('oauth_clients')
export class OAuthClient extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { unique: true })
  clientId: string;

  @Column('varchar')
  clientSecret: string;

  @Column('varchar')
  name: string;

  @Column('text', { nullable: true })
  description: string;

  @Column('jsonb')
  redirectUris: string[];

  @Column('jsonb', { default: ['authorization_code', 'refresh_token'] })
  grants: string[];

  @Column('jsonb', { default: ['openid', 'profile', 'email'] })
  scopes: string[];

  @Column('boolean', { default: false })
  isConfidential: boolean;

  @Column('varchar', { nullable: true })
  logoUrl: string;

  @Column('varchar', { nullable: true })
  websiteUrl: string;

  @Column('varchar', { nullable: true })
  privacyPolicyUrl: string;

  @Column('varchar', { nullable: true })
  termsOfServiceUrl: string;

  @Column('boolean', { default: true })
  isActive: boolean;

  @Column('uuid', { name: 'owner_id' })
  ownerId: string;
}
