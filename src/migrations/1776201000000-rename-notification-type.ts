import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameNotificationType1776201000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasActionType = await queryRunner.hasColumn(
      'notifications',
      'action_type',
    );
    const hasNotificationType = await queryRunner.hasColumn(
      'notifications',
      'notification_type',
    );

    if (hasActionType && !hasNotificationType) {
      await queryRunner.renameColumn(
        'notifications',
        'action_type',
        'notification_type',
      );
    }
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
