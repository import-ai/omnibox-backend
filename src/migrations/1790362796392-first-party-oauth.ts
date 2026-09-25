import { MigrationInterface, QueryRunner } from 'typeorm';
export class FirstPartyOAuth1790362796392 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE oauth_clients ADD COLUMN is_first_party boolean NOT NULL DEFAULT false`,
    );
    await q.query(
      `CREATE TABLE oauth_authorization_codes (code_hash varchar(64) PRIMARY KEY, data jsonb NOT NULL, expires_at timestamptz NOT NULL)`,
    );
    await q.query(
      `CREATE INDEX oauth_authorization_codes_expiry ON oauth_authorization_codes (expires_at)`,
    );
    await q.query(`INSERT INTO oauth_clients (client_id, client_secret, name, redirect_uris, scopes, is_first_party)
      VALUES ('omnibox-desktop', '', 'OmniBox Desktop', '["omnibox://oauth/callback"]', '["openid", "profile", "email"]', true)`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `DELETE FROM oauth_clients WHERE client_id = 'omnibox-desktop' AND is_first_party = true`,
    );
    await q.query(`DROP TABLE oauth_authorization_codes`);
    await q.query(`ALTER TABLE oauth_clients DROP COLUMN is_first_party`);
  }
}
