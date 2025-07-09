import { MigrationInterface, QueryRunner } from 'typeorm';

export class PermissionLevel1751900000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
CREATE TYPE permission_level AS ENUM (
  'no_access',
  'can_view',
  'can_comment',
  'can_edit',
  'full_access'
)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    throw new Error('Not supported.');
  }
}
