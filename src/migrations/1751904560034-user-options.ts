import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { BaseColumns } from './base-columns';

export class UserOptions1751904560034 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = new Table({
      name: 'user_options',
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
          name: 'name',
          type: 'character varying',
          isNullable: false,
        },
        {
          name: 'value',
          type: 'character varying',
          isNullable: false,
        },
        ...BaseColumns(),
      ],
      indices: [
        {
          columnNames: ['user_id', 'name'],
          isUnique: true,
          where: '"deleted_at" IS NULL',
        },
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/require-await
  public async down(queryRunner: QueryRunner): Promise<void> {
    throw new Error('Not supported.');
  }
}
