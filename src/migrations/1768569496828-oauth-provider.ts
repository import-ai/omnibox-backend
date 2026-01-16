import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { BaseColumns } from './base-columns';

export class OAuthProvider1768569496828 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // OAuth Clients table - stores registered OAuth applications (e.g., Flarum)
    const oauthClientsTable = new Table({
      name: 'oauth_clients',
      columns: [
        {
          name: 'id',
          type: 'uuid',
          isPrimary: true,
          default: 'gen_random_uuid()',
        },
        {
          name: 'client_id',
          type: 'character varying',
          length: '255',
          isNullable: false,
          isUnique: true,
        },
        {
          name: 'client_secret',
          type: 'character varying',
          length: '255',
          isNullable: false,
        },
        {
          name: 'name',
          type: 'character varying',
          length: '255',
          isNullable: false,
        },
        {
          name: 'redirect_uris',
          type: 'jsonb',
          isNullable: false,
          default: "'[]'",
        },
        {
          name: 'scopes',
          type: 'jsonb',
          isNullable: false,
          default: '\'["openid", "profile", "email"]\'',
        },
        {
          name: 'is_active',
          type: 'boolean',
          isNullable: false,
          default: true,
        },
        ...BaseColumns(),
      ],
    });
    await queryRunner.createTable(oauthClientsTable, true, true, true);

    // OAuth Authorization Codes table - temporary codes with 10min expiry
    const oauthAuthorizationCodesTable = new Table({
      name: 'oauth_authorization_codes',
      columns: [
        {
          name: 'id',
          type: 'uuid',
          isPrimary: true,
          default: 'gen_random_uuid()',
        },
        {
          name: 'code',
          type: 'character varying',
          length: '255',
          isNullable: false,
          isUnique: true,
        },
        {
          name: 'client_id',
          type: 'character varying',
          length: '255',
          isNullable: false,
        },
        {
          name: 'user_id',
          type: 'uuid',
          isNullable: false,
        },
        {
          name: 'redirect_uri',
          type: 'character varying',
          length: '2048',
          isNullable: false,
        },
        {
          name: 'scope',
          type: 'character varying',
          length: '255',
          isNullable: false,
        },
        {
          name: 'code_challenge',
          type: 'character varying',
          length: '255',
          isNullable: true,
        },
        {
          name: 'code_challenge_method',
          type: 'character varying',
          length: '10',
          isNullable: true,
        },
        {
          name: 'expires_at',
          type: 'timestamp with time zone',
          isNullable: false,
        },
        {
          name: 'used_at',
          type: 'timestamp with time zone',
          isNullable: true,
        },
        ...BaseColumns(),
      ],
      foreignKeys: [
        {
          columnNames: ['user_id'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
        },
      ],
      indices: [
        {
          columnNames: ['code'],
          isUnique: true,
        },
        {
          columnNames: ['client_id', 'user_id'],
        },
        {
          columnNames: ['expires_at'],
        },
      ],
    });
    await queryRunner.createTable(
      oauthAuthorizationCodesTable,
      true,
      true,
      true,
    );

    // OAuth Access Tokens table - access tokens with 1hr expiry
    const oauthAccessTokensTable = new Table({
      name: 'oauth_access_tokens',
      columns: [
        {
          name: 'id',
          type: 'uuid',
          isPrimary: true,
          default: 'gen_random_uuid()',
        },
        {
          name: 'token',
          type: 'character varying',
          length: '255',
          isNullable: false,
          isUnique: true,
        },
        {
          name: 'client_id',
          type: 'character varying',
          length: '255',
          isNullable: false,
        },
        {
          name: 'user_id',
          type: 'uuid',
          isNullable: false,
        },
        {
          name: 'scope',
          type: 'character varying',
          length: '255',
          isNullable: false,
        },
        {
          name: 'expires_at',
          type: 'timestamp with time zone',
          isNullable: false,
        },
        {
          name: 'revoked_at',
          type: 'timestamp with time zone',
          isNullable: true,
        },
        ...BaseColumns(),
      ],
      foreignKeys: [
        {
          columnNames: ['user_id'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
        },
      ],
      indices: [
        {
          columnNames: ['token'],
          isUnique: true,
        },
        {
          columnNames: ['client_id', 'user_id'],
        },
        {
          columnNames: ['expires_at'],
        },
      ],
    });
    await queryRunner.createTable(oauthAccessTokensTable, true, true, true);
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
