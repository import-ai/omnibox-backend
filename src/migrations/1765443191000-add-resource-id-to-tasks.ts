import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableForeignKey,
} from 'typeorm';

export class AddResourceIdToTasks1765443191000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'tasks',
      new TableColumn({
        name: 'resource_id',
        type: 'character varying',
        isNullable: true,
      }),
    );

    await queryRunner.createForeignKey(
      'tasks',
      new TableForeignKey({
        columnNames: ['resource_id'],
        referencedTableName: 'resources',
        referencedColumnNames: ['id'],
      }),
    );
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
