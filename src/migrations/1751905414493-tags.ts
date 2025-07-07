import { MigrationInterface, QueryRunner } from 'typeorm';

export class Tags1751905414493 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE tags
(
    "id"           CHARACTER VARYING(6) PRIMARY KEY,
    "name"         CHARACTER VARYING(20)    NOT NULL,
    "namespace_id" CHARACTER VARYING(6)     NOT NULL REFERENCES namespaces (id),
    "created_at"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updated_at"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "deleted_at"   TIMESTAMP WITH TIME ZONE
)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {}
}
