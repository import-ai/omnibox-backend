import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddContentSizeToResources1769415718000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add content_size column
    await queryRunner.addColumn(
      'resources',
      new TableColumn({
        name: 'content_size',
        type: 'bigint',
        isNullable: false,
        default: 0,
      }),
    );
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
