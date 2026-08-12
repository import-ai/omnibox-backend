import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class AddRetriedFromTaskIdToTasks1786412970105 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'tasks',
      new TableColumn({
        name: 'retried_from_task_id',
        type: 'uuid',
        isNullable: true,
      }),
    );

    await queryRunner.createForeignKey(
      'tasks',
      new TableForeignKey({
        columnNames: ['retried_from_task_id'],
        referencedTableName: 'tasks',
        referencedColumnNames: ['id'],
        // The pointer only means "this task replaced that one". If the replaced
        // row is ever deleted the statement should not fail: the successor is
        // still a valid task, it just no longer has a predecessor to hide.
        onDelete: 'SET NULL',
      }),
    );

    // Partial: only retries carry a value, which is a small minority of rows.
    // It keeps the foreign key's "is anything still pointing at me" check off a
    // sequential scan and serves the "find the retry of this task" lookup.
    await queryRunner.createIndex(
      'tasks',
      new TableIndex({
        columnNames: ['retried_from_task_id'],
        where: 'retried_from_task_id IS NOT NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('tasks', 'retried_from_task_id');
  }
}
