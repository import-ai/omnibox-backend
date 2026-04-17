import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPermanentDeletedAt1767441415360 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'resources',
      new TableColumn({
        name: 'permanent_deleted_at',
        type: 'timestamp with time zone',
        isNullable: true,
      }),
    );

    await queryRunner.query(`
      CREATE INDEX idx_resources_permanent_deleted_at
      ON resources (permanent_deleted_at)
      WHERE permanent_deleted_at IS NULL;
    `);

    // Ensure permanent_deleted_at can only be set when deleted_at is also set
    await queryRunner.query(`
      ALTER TABLE resources
      ADD CONSTRAINT chk_permanent_deleted_requires_deleted
      CHECK (permanent_deleted_at IS NULL OR deleted_at IS NOT NULL);
    `);
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
