import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddManualSortUnspecifiedAt1786014524273 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'resources',
      new TableColumn({
        name: 'manual_sort_unspecified_at',
        type: 'timestamp with time zone',
        isNullable: true,
      }),
    );
    await queryRunner.query(
      `UPDATE resources
       SET manual_sort_unspecified_at = updated_at
       WHERE manual_sort_index IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('resources', 'manual_sort_unspecified_at');
  }
}
