import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { BaseColumns } from './base-columns';

export class Shares1753866547335 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = new Table({
      name: 'shares',
      columns: [
        {
          name: 'id',
          type: 'character varying',
          isPrimary: true,
        },
        {
          name: 'namespace_id',
          type: 'character varying',
          isNullable: false,
        },
        {
          name: 'resource_id',
          type: 'character varying',
          isNullable: false,
        },
        {
          name: 'require_authentication',
          type: 'boolean',
          isNullable: false,
        },
        {
          name: 'password',
          type: 'character varying',
          isNullable: true,
        },
        {
          name: 'expires_at',
          type: 'timestamp with time zone',
          isNullable: true,
        },
        ...BaseColumns(),
      ],
      indices: [
        {
          columnNames: ['namespace_id', 'resource_id'],
          isUnique: true,
          where: 'deleted_at IS NULL',
        },
      ],
      foreignKeys: [
        {
          columnNames: ['namespace_id'],
          referencedTableName: 'namespaces',
          referencedColumnNames: ['id'],
        },
        {
          columnNames: ['resource_id'],
          referencedTableName: 'resources',
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
