import { Base } from 'omniboxd/common/base.entity';
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('oauth_clients')
export class OAuthClient extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', unique: true })
  clientId: string;

  @Column({ name: 'client_secret' })
  clientSecret: string;

  @Column()
  name: string;

  @Column('jsonb', { name: 'redirect_uris', default: [] })
  redirectUris: string[];

  @Column('jsonb', { default: ['openid', 'profile', 'email'] })
  scopes: string[];

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
