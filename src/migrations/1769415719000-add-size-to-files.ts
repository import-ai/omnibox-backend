import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddSizeToFiles1769415719000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'files',
      new TableColumn({
        name: 'size',
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
