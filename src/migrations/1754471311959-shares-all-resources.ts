import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class SharesAllResources1754471311959 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('shares', 'all_resources')) {
      return;
    }
    await queryRunner.addColumn(
      'shares',
      new TableColumn({
        name: 'all_resources',
        type: 'boolean',
        isNullable: false,
      }),
    );
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
