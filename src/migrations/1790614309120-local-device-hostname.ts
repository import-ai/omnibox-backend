import { MigrationInterface, QueryRunner } from 'typeorm';

export class LocalDeviceHostname1790614309120 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE local_devices ADD COLUMN hostname varchar',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE local_devices DROP COLUMN hostname');
  }
}
