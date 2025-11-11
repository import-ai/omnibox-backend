import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { BaseColumns } from './base-columns';

export class Files1761556143000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = new Table({
      name: 'files',
      columns: [
        {
          name: 'id',
          type: 'uuid',
          isPrimary: true,
          default: 'uuid_generate_v4()',
        },
        {
          name: 'namespace_id',
          type: 'character varying',
          isNullable: false,
        },
        {
          name: 'user_id',
          type: 'uuid',
          isNullable: false,
        },
        {
          name: 'name',
          type: 'character varying',
          isNullable: false,
        },
        {
          name: 'mimetype',
          type: 'character varying',
          isNullable: false,
        },
        ...BaseColumns(),
      ],
      foreignKeys: [
        {
          columnNames: ['namespace_id'],
          referencedTableName: 'namespaces',
          referencedColumnNames: ['id'],
        },
        {
          columnNames: ['user_id'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
        },
      ],
    });
    await queryRunner.createTable(table, true, true, true);
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
