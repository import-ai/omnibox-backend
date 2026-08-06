import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddResourceSorting1785725807283 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('resources', [
      new TableColumn({
        name: 'manual_sort_index',
        type: 'bigint',
        isNullable: true,
      }),
      new TableColumn({
        name: 'manual_sort_initialized_at',
        type: 'timestamp with time zone',
        isNullable: true,
      }),
      new TableColumn({
        name: 'manual_sort_unspecified_at',
        type: 'timestamp with time zone',
        isNullable: true,
      }),
    ]);
    await queryRunner.query(
      `UPDATE resources
       SET manual_sort_unspecified_at = updated_at
       WHERE manual_sort_index IS NULL`,
    );
    await queryRunner.addColumns('shares', [
      new TableColumn({
        name: 'sort_by',
        type: 'character varying',
        isNullable: false,
        default: "'updated_at'",
      }),
      new TableColumn({
        name: 'sort_order',
        type: 'character varying',
        isNullable: false,
        default: "'desc'",
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('shares', ['sort_by', 'sort_order']);
    await queryRunner.dropColumns('resources', [
      'manual_sort_index',
      'manual_sort_initialized_at',
      'manual_sort_unspecified_at',
    ]);
  }
}
