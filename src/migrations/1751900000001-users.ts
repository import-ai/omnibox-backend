import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { BaseColumns } from './base-columns';

export class Users1751900000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = new Table({
      name: 'users',
      columns: [
        {
          name: 'id',
          type: 'uuid',
          isPrimary: true,
          isGenerated: true,
          generationStrategy: 'uuid',
        },
        {
          name: 'username',
          type: 'character varying',
          isNullable: true,
        },
        {
          name: 'email',
          type: 'character varying',
          isNullable: false,
        },
        {
          name: 'password',
          type: 'character varying',
          isNullable: false,
        },
        ...BaseColumns(),
      ],
    });
    queryRunner.createTable(table, true);
  }

  down(queryRunner: QueryRunner): Promise<void> {
    throw new Error('Not supported.');
  }
}
