import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

const oldIndexName = 'UQ_feature_previews_namespace_user_feature';
const newIndexName = 'UQ_feature_previews_user_feature';

export class UserScopedFeaturePreviews1784629544658 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY user_id, feature
            ORDER BY updated_at DESC, id DESC
          ) AS row_number
        FROM feature_previews
        WHERE deleted_at IS NULL
      )
      DELETE FROM feature_previews
      WHERE id IN (
        SELECT id FROM ranked WHERE row_number > 1
      )
    `);

    const table = await queryRunner.getTable('feature_previews');
    if (!table) {
      throw new Error('feature_previews table not found');
    }

    const oldIndex = table.indices.find((index) => index.name === oldIndexName);
    if (oldIndex) {
      await queryRunner.dropIndex(table, oldIndex);
    }

    const namespaceForeignKey = table.foreignKeys.find((foreignKey) =>
      foreignKey.columnNames.includes('namespace_id'),
    );
    if (namespaceForeignKey) {
      await queryRunner.dropForeignKey(table, namespaceForeignKey);
    }

    await queryRunner.dropColumn('feature_previews', 'namespace_id');
    await queryRunner.createIndex(
      'feature_previews',
      new TableIndex({
        name: newIndexName,
        columnNames: ['user_id', 'feature'],
        isUnique: true,
        where: '"deleted_at" IS NULL',
      }),
    );
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
