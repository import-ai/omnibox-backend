import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserOptions1751904560034 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE user_options
(
    "name"       CHARACTER VARYING(20) PRIMARY KEY,
    "value"      TEXT                     NOT NULL,
    "user_id"    UUID                     NOT NULL REFERENCES users (id),
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "deleted_at" TIMESTAMP WITH TIME ZONE
)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {}
}
