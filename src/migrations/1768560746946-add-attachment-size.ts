import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddAttachmentSize1768560746946 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'resource_attachments',
      new TableColumn({
        name: 'attachment_size',
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
