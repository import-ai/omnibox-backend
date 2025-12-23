import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddNamespaceIdIndexToResources1766053289000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createIndex(
      'resources',
      new TableIndex({
        columnNames: ['namespace_id'],
      }),
    );
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
