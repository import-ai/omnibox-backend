import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

const INDEX_NAME = 'idx_resources_namespace_parent_live';

export class AddNamespaceParentIndexToResources1787654921509 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createIndex(
      'resources',
      new TableIndex({
        name: INDEX_NAME,
        columnNames: ['namespace_id', 'parent_id'],
        where: 'deleted_at IS NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('resources', INDEX_NAME);
  }
}
