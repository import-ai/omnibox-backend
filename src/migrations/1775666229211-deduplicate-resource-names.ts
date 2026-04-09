import { MigrationInterface, QueryRunner } from 'typeorm';

export class DeduplicateResourceNames1775666229211 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Replace '/' with '_' in all resource names
    await queryRunner.query(`
      UPDATE resources SET name = REPLACE(name, '/', '_')
      WHERE name LIKE '%/%'
    `);

    // Step 2: Deduplicate names using ROW_NUMBER (case-insensitive)
    // For each group of (namespace_id, parent_id, LOWER(name)) with duplicates,
    // keep the oldest unchanged and append " (x)" suffix to the rest
    await queryRunner.query(`
      WITH ranked AS (
        SELECT id, name,
          ROW_NUMBER() OVER (
            PARTITION BY namespace_id, parent_id, LOWER(name)
            ORDER BY created_at ASC
          ) as rn
        FROM resources
        WHERE deleted_at IS NULL AND parent_id IS NOT NULL
      )
      UPDATE resources r SET name = d.name || ' (' || (d.rn - 1) || ')'
      FROM ranked d
      WHERE r.id = d.id AND d.rn > 1
    `);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/require-await
  public async down(queryRunner: QueryRunner): Promise<void> {
    throw new Error('Not supported.');
  }
}
