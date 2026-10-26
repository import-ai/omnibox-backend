import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMemberDisplayNameSnapshot1793012728794 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "namespace_members" ADD COLUMN "display_name_snapshot" text',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "namespace_members" DROP COLUMN "display_name_snapshot"',
    );
  }
}
