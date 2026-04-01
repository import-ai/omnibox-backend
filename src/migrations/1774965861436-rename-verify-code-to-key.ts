import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameVerifyCodeToKey1774965861436 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Copy verify_code to key, then remove verify_code
    // Only affects rows where attrs contains verify_code
    await queryRunner.query(`
      UPDATE applications
      SET attrs = (attrs - 'verify_code') || jsonb_build_object('key', attrs->>'verify_code')
      WHERE attrs ? 'verify_code'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Copy key back to verify_code, then remove key
    // Only affects rows where attrs contains key
    await queryRunner.query(`
      UPDATE applications
      SET attrs = (attrs - 'key') || jsonb_build_object('verify_code', attrs->>'key')
      WHERE attrs ? 'key'
    `);
  }
}
