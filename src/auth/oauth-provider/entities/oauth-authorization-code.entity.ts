import { Base } from 'omniboxd/common/base.entity';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from 'omniboxd/user/entities/user.entity';

@Entity('oauth_authorization_codes')
export class OAuthAuthorizationCode extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column({ name: 'client_id' })
  clientId: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'redirect_uri' })
  redirectUri: string;

  @Column()
  scope: string;

  @Column({ name: 'code_challenge', type: 'varchar', nullable: true })
  codeChallenge: string | null;

  @Column({ name: 'code_challenge_method', type: 'varchar', nullable: true })
  codeChallengeMethod: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt: Date | null;
}
