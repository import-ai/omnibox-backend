import { Base } from 'omniboxd/common/base.entity';
import { User } from 'omniboxd/user/entities/user.entity';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

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

  @Column('json')
  redirectUris: string[];

  @Column('json', { default: ['authorization_code', 'refresh_token'] })
  grants: string[];

  @Column('json', { default: ['openid', 'profile', 'email'] })
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

  @Column('varchar')
  ownerId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'ownerId' })
  owner: User;
}