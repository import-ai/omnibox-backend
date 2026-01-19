import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { BaseColumns } from './base-columns';

export class OAuthPairwiseSubjects1768812820004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = new Table({
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
    await queryRunner.createTable(table, true, true, true);
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
