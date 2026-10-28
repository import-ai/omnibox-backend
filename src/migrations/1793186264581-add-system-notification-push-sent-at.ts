import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSystemNotificationPushSentAt1793186264581 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "notifications" ADD COLUMN "jpush_sent_at" timestamptz',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "notifications" DROP COLUMN "jpush_sent_at"',
    );
  }
}
