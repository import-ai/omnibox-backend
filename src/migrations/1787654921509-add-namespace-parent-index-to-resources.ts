import { MigrationInterface, QueryRunner } from 'typeorm';

const INDEX_NAME = 'idx_resources_namespace_parent_live';

export class AddNamespaceParentIndexToResources1787654921509 implements MigrationInterface {
  public readonly transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${INDEX_NAME}
       ON resources (namespace_id, parent_id)
       WHERE deleted_at IS NULL`,
    );
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
