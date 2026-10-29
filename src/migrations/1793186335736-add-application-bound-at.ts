import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Marks a binding completed through the bot's verified callback. Clients
 * create application rows without it, and login only trusts bound rows.
 */
export class AddApplicationBoundAt1793186335736 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'applications',
      new TableColumn({
        name: 'bound_at',
        type: 'timestamptz',
        isNullable: true,
      }),
    );
    // Only rows that went through the bot callback lost attrs.key; rows a
    // client created directly still carry it and must stay unbound.
    await queryRunner.query(
      `UPDATE "applications"
       SET "bound_at" = COALESCE("updated_at", now())
       WHERE "app_id" = 'wechat_oa_bot'
         AND "api_key_id" IS NOT NULL
         AND "attrs" ? 'primary_key'
         AND NOT ("attrs" ? 'key')`,
    );
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
