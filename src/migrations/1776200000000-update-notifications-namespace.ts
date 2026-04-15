import {
  MigrationInterface,
  QueryRunner,
  TableCheck,
  TableColumn,
  TableForeignKey,
} from 'typeorm';

export class UpdateNotificationsNamespace1776200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.changeColumn(
      'notifications',
      'user_id',
      new TableColumn({
        name: 'user_id',
        type: 'uuid',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'notifications',
      new TableColumn({
        name: 'namespace_id',
        type: 'character varying',
        isNullable: true,
      }),
    );

    await queryRunner.createForeignKey(
      'notifications',
      new TableForeignKey({
        columnNames: ['namespace_id'],
        referencedTableName: 'namespaces',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createCheckConstraint(
      'notifications',
      new TableCheck({
        name: 'chk_notifications_user_or_namespace',
        expression: '"user_id" IS NOT NULL OR "namespace_id" IS NOT NULL',
      }),
    );
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
