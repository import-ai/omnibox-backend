import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddMetadataToUserBindings1762847685000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'user_bindings',
      new TableColumn({
        name: 'metadata',
        type: 'jsonb',
        isNullable: true,
      }),
    );
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
