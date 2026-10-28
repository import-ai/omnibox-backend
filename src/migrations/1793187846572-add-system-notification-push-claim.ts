import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSystemNotificationPushClaim1793187846572 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "notifications" ADD COLUMN "jpush_claim_id" uuid',
    );
    await queryRunner.query(
      'ALTER TABLE "notifications" ADD COLUMN "jpush_claimed_at" timestamptz',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "notifications" DROP COLUMN "jpush_claimed_at"',
    );
    await queryRunner.query(
      'ALTER TABLE "notifications" DROP COLUMN "jpush_claim_id"',
    );
  }
}
