import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { BaseColumns } from './base-columns';

async function createOAuthClientsTable(
  queryRunner: QueryRunner,
): Promise<void> {
  const table = new Table({
    name: 'oauth_clients',
    columns: [
      {
        name: 'id',
        type: 'uuid',
        isPrimary: true,
        default: 'uuid_generate_v4()',
      },
      {
        name: 'client_id',
        type: 'character varying',
        isUnique: true,
      },
      {
        name: 'client_secret',
        type: 'character varying',
      },
      {
        name: 'name',
        type: 'character varying',
      },
      {
        name: 'description',
        type: 'text',
        isNullable: true,
      },
      {
        name: 'redirect_uris',
        type: 'jsonb',
        default: "'[]'::jsonb",
      },
      {
        name: 'grants',
        type: 'jsonb',
        default: '\'["authorization_code", "refresh_token"]\'::jsonb',
      },
      {
        name: 'scopes',
        type: 'jsonb',
        default: '\'["openid", "profile", "email"]\'::jsonb',
      },
      {
        name: 'is_confidential',
        type: 'boolean',
        default: false,
      },
      {
        name: 'logo_url',
        type: 'character varying',
        isNullable: true,
      },
      {
        name: 'website_url',
        type: 'character varying',
        isNullable: true,
      },
      {
        name: 'privacy_policy_url',
        type: 'character varying',
        isNullable: true,
      },
      {
        name: 'terms_of_service_url',
        type: 'character varying',
        isNullable: true,
      },
      {
        name: 'is_active',
        type: 'boolean',
        default: true,
      },
      {
        name: 'owner_id',
        type: 'uuid',
      },
      ...BaseColumns(),
    ],
    foreignKeys: [
      {
        columnNames: ['owner_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      },
    ],
    indices: [
      {
        name: 'IDX_oauth_clients_client_id',
        columnNames: ['client_id'],
        isUnique: true,
      },
    ],
  });
  await queryRunner.createTable(table, true, true, true);
}

async function createOAuthTokensTable(queryRunner: QueryRunner): Promise<void> {
  const table = new Table({
    name: 'oauth_tokens',
    columns: [
      {
        name: 'id',
        type: 'uuid',
        isPrimary: true,
        default: 'uuid_generate_v4()',
      },
      {
        name: 'access_token',
        type: 'text',
      },
      {
        name: 'refresh_token',
        type: 'text',
        isNullable: true,
      },
      {
        name: 'access_token_expires_at',
        type: 'timestamp with time zone',
      },
      {
        name: 'refresh_token_expires_at',
        type: 'timestamp with time zone',
        isNullable: true,
      },
      {
        name: 'scopes',
        type: 'jsonb',
        default: "'[]'::jsonb",
      },
      {
        name: 'client_id',
        type: 'uuid',
      },
      {
        name: 'user_id',
        type: 'uuid',
      },
      {
        name: 'authorization_code_used',
        type: 'character varying',
        isNullable: true,
      },
      {
        name: 'is_revoked',
        type: 'boolean',
        default: false,
      },
      ...BaseColumns(),
    ],
    foreignKeys: [
      {
        columnNames: ['client_id'],
        referencedTableName: 'oauth_clients',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      },
      {
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      },
    ],
    indices: [
      {
        name: 'IDX_oauth_tokens_access_token',
        columnNames: ['access_token'],
      },
      {
        name: 'IDX_oauth_tokens_refresh_token',
        columnNames: ['refresh_token'],
      },
    ],
  });
  await queryRunner.createTable(table, true, true, true);
}

async function createOAuthAuthorizationCodesTable(
  queryRunner: QueryRunner,
): Promise<void> {
  const table = new Table({
    name: 'oauth_authorization_codes',
    columns: [
      {
        name: 'id',
        type: 'uuid',
        isPrimary: true,
        default: 'uuid_generate_v4()',
      },
      {
        name: 'code',
        type: 'character varying',
        isUnique: true,
      },
      {
        name: 'expires_at',
        type: 'timestamp with time zone',
      },
      {
        name: 'redirect_uri',
        type: 'character varying',
      },
      {
        name: 'scopes',
        type: 'jsonb',
        default: "'[]'::jsonb",
      },
      {
        name: 'client_id',
        type: 'uuid',
      },
      {
        name: 'user_id',
        type: 'uuid',
      },
      {
        name: 'code_challenge',
        type: 'character varying',
        isNullable: true,
      },
      {
        name: 'code_challenge_method',
        type: 'character varying',
        isNullable: true,
      },
      {
        name: 'is_used',
        type: 'boolean',
        default: false,
      },
      ...BaseColumns(),
    ],
    foreignKeys: [
      {
        columnNames: ['client_id'],
        referencedTableName: 'oauth_clients',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      },
      {
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      },
    ],
    indices: [
      {
        name: 'IDX_oauth_authorization_codes_code',
        columnNames: ['code'],
        isUnique: true,
      },
    ],
  });
  await queryRunner.createTable(table, true, true, true);
}

export class OAuth1758465344213 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await createOAuthClientsTable(queryRunner);
    await createOAuthTokensTable(queryRunner);
    await createOAuthAuthorizationCodesTable(queryRunner);
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
