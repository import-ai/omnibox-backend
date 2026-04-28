import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
} from 'typeorm';

export class BackfillSmartFolderOwnerScope1776853000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('smart_folder_configs');
    if (!table) {
      return;
    }

    const missingOwnerScope = !table.findColumnByName('owner_scope');
    if (missingOwnerScope) {
      await queryRunner.addColumn(
        'smart_folder_configs',
        new TableColumn({
          name: 'owner_scope',
          type: 'character varying',
          isNullable: false,
          default: "'private'",
        }),
      );

      await queryRunner.query(`
        UPDATE smart_folder_configs
        SET owner_scope = root_scope
        WHERE root_scope IN ('private', 'teamspace');
      `);
    }

    const oldIndex = table.indices.find(
      (index) => index.name === 'idx_smart_folder_configs_owner_root',
    );
    if (oldIndex) {
      await queryRunner.dropIndex('smart_folder_configs', oldIndex);
    }

    const refreshedTable = await queryRunner.getTable('smart_folder_configs');
    const hasOwnerScopeIndex = refreshedTable?.indices.some(
      (index) => index.name === 'idx_smart_folder_configs_owner_scope',
    );
    if (!hasOwnerScopeIndex) {
      await queryRunner.createIndex(
        'smart_folder_configs',
        new TableIndex({
          name: 'idx_smart_folder_configs_owner_scope',
          columnNames: ['namespace_id', 'owner_user_id', 'owner_scope'],
        }),
      );
    }
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
