import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { BaseColumns } from './base-columns';

export class UserPermissions1751900000001 implements MigrationInterface {
  up(queryRunner: QueryRunner): Promise<void> {
    const table = new Table({
      name: 'user_permissions',
      columns: [...BaseColumns()],
    });
    queryRunner.createTable(table, true);
  }
  down(queryRunner: QueryRunner): Promise<void> {
    throw new Error('Not supported.');
  }
}
