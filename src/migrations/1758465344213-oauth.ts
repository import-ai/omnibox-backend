import { MigrationInterface, QueryRunner, Table, Index, ForeignKey } from 'typeorm';

export class OAuth1758465344213 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create oauth_clients table
    await queryRunner.createTable(
      new Table({
        name: 'oauth_clients',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'client_id',
            type: 'varchar',
            isUnique: true,
          },
          {
            name: 'client_secret',
            type: 'varchar',
          },
          {
            name: 'name',
            type: 'varchar',
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'redirect_uris',
            type: 'json',
          },
          {
            name: 'grants',
            type: 'json',
            default: "'{\"authorization_code\", \"refresh_token\"}'",
          },
          {
            name: 'scopes',
            type: 'json',
            default: "'{\"openid\", \"profile\", \"email\"}'",
          },
          {
            name: 'is_confidential',
            type: 'boolean',
            default: false,
          },
          {
            name: 'logo_url',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'website_url',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'privacy_policy_url',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'terms_of_service_url',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'owner_id',
            type: 'varchar',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'deleted_at',
            type: 'timestamptz',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Create oauth_tokens table
    await queryRunner.createTable(
      new Table({
        name: 'oauth_tokens',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
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
            type: 'timestamp',
          },
          {
            name: 'refresh_token_expires_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'scopes',
            type: 'json',
            default: "'[]'",
          },
          {
            name: 'client_id',
            type: 'varchar',
          },
          {
            name: 'user_id',
            type: 'varchar',
          },
          {
            name: 'authorization_code_used',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'is_revoked',
            type: 'boolean',
            default: false,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'deleted_at',
            type: 'timestamptz',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Create oauth_authorization_codes table
    await queryRunner.createTable(
      new Table({
        name: 'oauth_authorization_codes',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'code',
            type: 'varchar',
            isUnique: true,
          },
          {
            name: 'expires_at',
            type: 'timestamp',
          },
          {
            name: 'redirect_uri',
            type: 'varchar',
          },
          {
            name: 'scopes',
            type: 'json',
            default: "'[]'",
          },
          {
            name: 'client_id',
            type: 'varchar',
          },
          {
            name: 'user_id',
            type: 'varchar',
          },
          {
            name: 'code_challenge',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'code_challenge_method',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'is_used',
            type: 'boolean',
            default: false,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'deleted_at',
            type: 'timestamptz',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Create indexes
    await queryRunner.createIndex(
      'oauth_tokens',
      new Index('IDX_oauth_tokens_access_token', ['access_token']),
    );

    await queryRunner.createIndex(
      'oauth_tokens',
      new Index('IDX_oauth_tokens_refresh_token', ['refresh_token']),
    );

    await queryRunner.createIndex(
      'oauth_authorization_codes',
      new Index('IDX_oauth_authorization_codes_code', ['code']),
    );

    // Create foreign keys
    await queryRunner.createForeignKey(
      'oauth_clients',
      new ForeignKey({
        columnNames: ['owner_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'oauth_tokens',
      new ForeignKey({
        columnNames: ['client_id'],
        referencedTableName: 'oauth_clients',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'oauth_tokens',
      new ForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'oauth_authorization_codes',
      new ForeignKey({
        columnNames: ['client_id'],
        referencedTableName: 'oauth_clients',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'oauth_authorization_codes',
      new ForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('oauth_authorization_codes');
    await queryRunner.dropTable('oauth_tokens');
    await queryRunner.dropTable('oauth_clients');
  }
}