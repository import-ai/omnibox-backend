import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { BaseColumns } from './base-columns';

export class UserPermissions1751900000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = new Table({
      name: 'user_permissions',
      columns: [
        {
          name: 'id',
          type: 'bigserial',
          isPrimary: true,
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
          name: 'resource_id',
          type: 'character varying',
          isNullable: false,
        },
        {
          name: 'level',
          type: 'permission_level',
          isNullable: false,
        },
        ...BaseColumns(),
      ],
      indices: [
        {
          columnNames: ['namespace_id', 'resource_id', 'user_id'],
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
          columnNames: ['user_id'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
        },
        {
          columnNames: ['resource_id'],
          referencedTableName: 'resources',
          referencedColumnNames: ['id'],
        }
      ]
    });
    await queryRunner.createTable(table, true, true, true);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    throw new Error('Not supported.');
  }
}
