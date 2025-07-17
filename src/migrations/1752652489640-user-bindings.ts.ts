import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { BaseColumns } from './base-columns';

export class UserBindings1752652489640 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = new Table({
      name: 'user_bindings',
      columns: [
        {
          name: 'id',
          type: 'bigserial',
          isPrimary: true,
        },
        {
          name: 'user_id',
          type: 'uuid',
          isNullable: false,
        },
        {
          name: 'login_type',
          type: 'character varying',
          isNullable: false,
        },
        {
          name: 'login_id',
          type: 'character varying',
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
    });
    await queryRunner.createTable(table, true, true, true);
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
