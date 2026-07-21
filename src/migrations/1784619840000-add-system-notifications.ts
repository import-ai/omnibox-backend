import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableCheck,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class AddSystemNotifications1784619840000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('notifications', [
      new TableColumn({
        name: 'summary',
        type: 'character varying',
        length: '128',
        isNullable: true,
      }),
      new TableColumn({
        name: 'is_global',
        type: 'boolean',
        default: false,
      }),
      new TableColumn({
        name: 'dedup_key',
        type: 'uuid',
        isNullable: true,
        isUnique: true,
      }),
    ]);

    const notifications = await queryRunner.getTable('notifications');
    const receiverCheck = notifications?.checks.find(
      (check) => check.name === 'chk_notifications_user_or_namespace',
    );
    if (receiverCheck) {
      await queryRunner.dropCheckConstraint('notifications', receiverCheck);
    }
    await queryRunner.createCheckConstraint(
      'notifications',
      new TableCheck({
        name: 'chk_notifications_receiver',
        expression:
          '("is_global" = true AND "user_id" IS NULL AND "namespace_id" IS NULL) OR ("is_global" = false AND ("user_id" IS NOT NULL OR "namespace_id" IS NOT NULL))',
      }),
    );

    await queryRunner.createIndex(
      'notifications',
      new TableIndex({
        name: 'idx_notifications_global_created_at',
        columnNames: ['is_global', 'created_at'],
        where: 'deleted_at IS NULL',
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'notification_reads',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          { name: 'notification_id', type: 'uuid' },
          { name: 'user_id', type: 'uuid' },
          { name: 'read_at', type: 'timestamp with time zone' },
        ],
        uniques: [
          {
            name: 'uq_notification_reads_notification_user',
            columnNames: ['notification_id', 'user_id'],
          },
        ],
      }),
    );
    await queryRunner.createForeignKeys('notification_reads', [
      new TableForeignKey({
        columnNames: ['notification_id'],
        referencedTableName: 'notifications',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('notification_reads');
    await queryRunner.dropIndex(
      'notifications',
      'idx_notifications_global_created_at',
    );
    await queryRunner.dropCheckConstraint(
      'notifications',
      'chk_notifications_receiver',
    );
    await queryRunner.createCheckConstraint(
      'notifications',
      new TableCheck({
        name: 'chk_notifications_user_or_namespace',
        expression: '"user_id" IS NOT NULL OR "namespace_id" IS NOT NULL',
      }),
    );
    await queryRunner.dropColumns('notifications', [
      'dedup_key',
      'is_global',
      'summary',
    ]);
  }
}
