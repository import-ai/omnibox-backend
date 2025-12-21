import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdminRole1766339893375 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if 'admin' value already exists in the enum
    const enumExists = await queryRunner.query(`
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'admin'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'namespace_role')
    `);

    if (enumExists.length === 0) {
      // Commit current transaction to allow ALTER TYPE
      await queryRunner.commitTransaction();

      // Add 'admin' value to the namespace_role enum
      await queryRunner.query(`
        ALTER TYPE namespace_role ADD VALUE 'admin'
      `);

      // Start a new transaction for the rest of the migration
      await queryRunner.startTransaction();
    }

    // For each namespace with multiple owners, keep oldest, demote others to admin
    await queryRunner.query(`
      WITH ranked_owners AS (
        SELECT
          id,
          namespace_id,
          user_id,
          ROW_NUMBER() OVER (
            PARTITION BY namespace_id
            ORDER BY created_at ASC
          ) as rn
        FROM namespace_members
        WHERE role = 'owner' AND deleted_at IS NULL
      ),
      owners_to_demote AS (
        SELECT id FROM ranked_owners WHERE rn > 1
      )
      UPDATE namespace_members
      SET role = 'admin'
      WHERE id IN (SELECT id FROM owners_to_demote)
    `);
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
