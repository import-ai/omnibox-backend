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

    // OAuth Pairwise Subjects table - maps users to unique per-client identifiers
    const oauthPairwiseSubjectsTable = new Table({
      name: 'oauth_pairwise_subjects',
      columns: [
        {
          name: 'id',
          type: 'uuid',
          isPrimary: true,
          default: 'gen_random_uuid()',
        },
        {
          name: 'user_id',
          type: 'uuid',
          isNullable: false,
        },
        {
          name: 'client_id',
          type: 'character varying',
          length: '255',
          isNullable: false,
        },
        {
          name: 'pairwise_subject',
          type: 'character varying',
          length: '64',
          isNullable: false,
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
          columnNames: ['user_id', 'client_id'],
          isUnique: true,
        },
        {
          columnNames: ['pairwise_subject'],
          isUnique: true,
        },
        {
          columnNames: ['client_id'],
        },
      ],
    });
    await queryRunner.createTable(oauthPairwiseSubjectsTable, true, true, true);
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
