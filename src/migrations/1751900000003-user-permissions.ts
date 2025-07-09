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
        ...BaseColumns(),
      ],
    });
    await queryRunner.createTable(table, true);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    throw new Error('Not supported.');
  }
}
