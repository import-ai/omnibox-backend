import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class MakeSizeNullable1769478367000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Make size column nullable in files table
    await queryRunner.changeColumn(
      'files',
      'size',
      new TableColumn({
        name: 'size',
        type: 'bigint',
        isNullable: true,
      }),
    );

    // Make attachment_size column nullable in resource_attachments table
    await queryRunner.changeColumn(
      'resource_attachments',
      'attachment_size',
      new TableColumn({
        name: 'attachment_size',
        type: 'bigint',
        isNullable: true,
      }),
    );
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
